package dynamodb

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// IfcBimRecord links a signed-in user to an IFC object stored under S3 prefix ifcbim/.
type IfcBimRecord struct {
	UserID            string `json:"userId" dynamodbav:"userId"`
	ModelID           string `json:"modelId" dynamodbav:"modelId"`
	FileName          string `json:"fileName" dynamodbav:"fileName"`
	Title             string `json:"title" dynamodbav:"title"`
	S3Key             string `json:"s3Key" dynamodbav:"s3Key"`
	ContentType       string `json:"contentType" dynamodbav:"contentType"`
	ContentSizeBytes  int64  `json:"contentSizeBytes" dynamodbav:"contentSizeBytes"`
	CreatedAt         string `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt         string `json:"updatedAt" dynamodbav:"updatedAt"`
	LastCorrelationID string `json:"lastCorrelationId,omitempty" dynamodbav:"lastCorrelationId,omitempty"`
}

// IfcBimStore persists IFC model metadata keyed by userId + modelId.
type IfcBimStore interface {
	SaveModel(ctx context.Context, record IfcBimRecord, correlationID string) (IfcBimRecord, error)
	GetModel(ctx context.Context, userID, modelID, correlationID string) (IfcBimRecord, bool, error)
	ListModelsByUserID(ctx context.Context, userID, correlationID string) ([]IfcBimRecord, error)
	DeleteModel(ctx context.Context, userID, modelID, correlationID string) error
	BackendName() string
}

type memoryIfcBimStore struct {
	mu     sync.RWMutex
	byUser map[string]map[string]IfcBimRecord
}

func newMemoryIfcBimStore() *memoryIfcBimStore {
	return &memoryIfcBimStore{byUser: map[string]map[string]IfcBimRecord{}}
}

func (m *memoryIfcBimStore) BackendName() string { return "memory" }

func (m *memoryIfcBimStore) SaveModel(_ context.Context, record IfcBimRecord, correlationID string) (IfcBimRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.ModelID == "" {
		record.ModelID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = IfcBimObjectKey(record.UserID, record.ModelID)
	}

	m.mu.Lock()
	if m.byUser[record.UserID] == nil {
		m.byUser[record.UserID] = map[string]IfcBimRecord{}
	}
	m.byUser[record.UserID][record.ModelID] = record
	m.mu.Unlock()
	return record, nil
}

func (m *memoryIfcBimStore) GetModel(_ context.Context, userID, modelID, _ string) (IfcBimRecord, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return IfcBimRecord{}, false, nil
	}
	rec, ok := bucket[modelID]
	return rec, ok, nil
}

func (m *memoryIfcBimStore) ListModelsByUserID(_ context.Context, userID, _ string) ([]IfcBimRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]IfcBimRecord, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

func (m *memoryIfcBimStore) DeleteModel(_ context.Context, userID, modelID, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.byUser[userID] != nil {
		delete(m.byUser[userID], modelID)
	}
	return nil
}

type dynamoIfcBimStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoIfcBimStore) BackendName() string { return "dynamodb" }

func (d *dynamoIfcBimStore) SaveModel(ctx context.Context, record IfcBimRecord, correlationID string) (IfcBimRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.ModelID == "" {
		record.ModelID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = IfcBimObjectKey(record.UserID, record.ModelID)
	}

	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      ifcBimItem(record),
	})
	if err != nil {
		return IfcBimRecord{}, err
	}
	log.Printf("[correlation=%s] dynamodb SaveIfcBim user=%s model=%s", correlationID, record.UserID, record.ModelID)
	return record, nil
}

func (d *dynamoIfcBimStore) GetModel(ctx context.Context, userID, modelID, correlationID string) (IfcBimRecord, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":  &types.AttributeValueMemberS{Value: userID},
			"modelId": &types.AttributeValueMemberS{Value: modelID},
		},
	})
	if err != nil {
		return IfcBimRecord{}, false, err
	}
	if out.Item == nil {
		return IfcBimRecord{}, false, nil
	}
	rec, ok := ifcBimFromItem(out.Item)
	log.Printf("[correlation=%s] dynamodb GetIfcBim user=%s model=%s found=%v", correlationID, userID, modelID, ok)
	return rec, ok, nil
}

func (d *dynamoIfcBimStore) ListModelsByUserID(ctx context.Context, userID, correlationID string) ([]IfcBimRecord, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("userId = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return nil, err
	}
	records := make([]IfcBimRecord, 0, len(out.Items))
	for _, row := range out.Items {
		if rec, ok := ifcBimFromItem(row); ok {
			records = append(records, rec)
		}
	}
	log.Printf("[correlation=%s] dynamodb ListIfcBimByUserID user=%s count=%d", correlationID, userID, len(records))
	return records, nil
}

func (d *dynamoIfcBimStore) DeleteModel(ctx context.Context, userID, modelID, correlationID string) error {
	_, err := d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":  &types.AttributeValueMemberS{Value: userID},
			"modelId": &types.AttributeValueMemberS{Value: modelID},
		},
	})
	if err != nil {
		return err
	}
	log.Printf("[correlation=%s] dynamodb DeleteIfcBim user=%s model=%s", correlationID, userID, modelID)
	return nil
}

// NewIfcBimStore returns a memory or DynamoDB-backed IFC metadata store.
func NewIfcBimStore(ctx context.Context) (IfcBimStore, error) {
	mode := common.Env("IFCBIM_BACKEND", "memory")
	table := common.Env("IFCBIM_TABLE", "eduardoos_ifcbim")
	if mode != "dynamodb" {
		return newMemoryIfcBimStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoIfcBimStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

// IfcBimObjectKey is the absolute S3 object key under the ifcbim/ prefix.
func IfcBimObjectKey(userID, modelID string) string {
	safeUser := strings.ReplaceAll(strings.TrimSpace(userID), "@", "_at_")
	safeUser = strings.ReplaceAll(safeUser, "/", "_")
	return fmt.Sprintf("ifcbim/%s/%s.ifc", safeUser, modelID)
}

func ifcBimItem(r IfcBimRecord) map[string]types.AttributeValue {
	item := map[string]types.AttributeValue{
		"userId":           &types.AttributeValueMemberS{Value: r.UserID},
		"modelId":          &types.AttributeValueMemberS{Value: r.ModelID},
		"fileName":         &types.AttributeValueMemberS{Value: r.FileName},
		"title":            &types.AttributeValueMemberS{Value: r.Title},
		"s3Key":            &types.AttributeValueMemberS{Value: r.S3Key},
		"contentType":      &types.AttributeValueMemberS{Value: r.ContentType},
		"contentSizeBytes": &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", r.ContentSizeBytes)},
		"createdAt":        &types.AttributeValueMemberS{Value: r.CreatedAt},
		"updatedAt":        &types.AttributeValueMemberS{Value: r.UpdatedAt},
	}
	if r.LastCorrelationID != "" {
		item["lastCorrelationId"] = &types.AttributeValueMemberS{Value: r.LastCorrelationID}
	}
	return item
}

func ifcBimFromItem(item map[string]types.AttributeValue) (IfcBimRecord, bool) {
	r := IfcBimRecord{}
	if v, ok := item["userId"].(*types.AttributeValueMemberS); ok {
		r.UserID = v.Value
	}
	if v, ok := item["modelId"].(*types.AttributeValueMemberS); ok {
		r.ModelID = v.Value
	}
	if v, ok := item["fileName"].(*types.AttributeValueMemberS); ok {
		r.FileName = v.Value
	}
	if v, ok := item["title"].(*types.AttributeValueMemberS); ok {
		r.Title = v.Value
	}
	if v, ok := item["s3Key"].(*types.AttributeValueMemberS); ok {
		r.S3Key = v.Value
	}
	if v, ok := item["contentType"].(*types.AttributeValueMemberS); ok {
		r.ContentType = v.Value
	}
	if v, ok := item["contentSizeBytes"].(*types.AttributeValueMemberN); ok {
		var n int64
		_, _ = fmt.Sscanf(v.Value, "%d", &n)
		r.ContentSizeBytes = n
	}
	if v, ok := item["createdAt"].(*types.AttributeValueMemberS); ok {
		r.CreatedAt = v.Value
	}
	if v, ok := item["updatedAt"].(*types.AttributeValueMemberS); ok {
		r.UpdatedAt = v.Value
	}
	if v, ok := item["lastCorrelationId"].(*types.AttributeValueMemberS); ok {
		r.LastCorrelationID = v.Value
	}
	return r, r.UserID != "" && r.ModelID != ""
}
