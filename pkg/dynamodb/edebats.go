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

// EdebatRecord is metadata for a cloud-stored .edebat debate (body lives in S3).
type EdebatRecord struct {
	UserID            string `json:"userId" dynamodbav:"userId"`
	DebateID          string `json:"debateId" dynamodbav:"debateId"`
	Title             string `json:"title" dynamodbav:"title"`
	Topic             string `json:"topic" dynamodbav:"topic"`
	RoundsTotal       int    `json:"roundsTotal" dynamodbav:"roundsTotal"`
	RoundsCompleted   int    `json:"roundsCompleted" dynamodbav:"roundsCompleted"`
	S3Key             string `json:"s3Key" dynamodbav:"s3Key"`
	ContentSizeBytes  int64  `json:"contentSizeBytes" dynamodbav:"contentSizeBytes"`
	CreatedAt         string `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt         string `json:"updatedAt" dynamodbav:"updatedAt"`
	LastCorrelationID string `json:"lastCorrelationId,omitempty" dynamodbav:"lastCorrelationId,omitempty"`
}

// EdebatStore persists debate metadata keyed by userId + debateId.
type EdebatStore interface {
	SaveEdebat(ctx context.Context, record EdebatRecord, correlationID string) (EdebatRecord, error)
	GetEdebat(ctx context.Context, userID, debateID, correlationID string) (EdebatRecord, bool, error)
	ListEdebatsByUserID(ctx context.Context, userID, correlationID string) ([]EdebatRecord, error)
	BackendName() string
}

type memoryEdebatStore struct {
	mu     sync.RWMutex
	byUser map[string]map[string]EdebatRecord
}

func newMemoryEdebatStore() *memoryEdebatStore {
	return &memoryEdebatStore{byUser: map[string]map[string]EdebatRecord{}}
}

func (m *memoryEdebatStore) BackendName() string { return "memory" }

func (m *memoryEdebatStore) SaveEdebat(_ context.Context, record EdebatRecord, correlationID string) (EdebatRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.DebateID == "" {
		record.DebateID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = EdebatObjectKey(record.UserID, record.DebateID)
	}
	m.mu.Lock()
	if m.byUser[record.UserID] == nil {
		m.byUser[record.UserID] = map[string]EdebatRecord{}
	}
	m.byUser[record.UserID][record.DebateID] = record
	m.mu.Unlock()
	return record, nil
}

func (m *memoryEdebatStore) GetEdebat(_ context.Context, userID, debateID, _ string) (EdebatRecord, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return EdebatRecord{}, false, nil
	}
	rec, ok := bucket[debateID]
	return rec, ok, nil
}

func (m *memoryEdebatStore) ListEdebatsByUserID(_ context.Context, userID, _ string) ([]EdebatRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]EdebatRecord, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

type dynamoEdebatStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoEdebatStore) BackendName() string { return "dynamodb" }

func (d *dynamoEdebatStore) SaveEdebat(ctx context.Context, record EdebatRecord, correlationID string) (EdebatRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.DebateID == "" {
		record.DebateID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = EdebatObjectKey(record.UserID, record.DebateID)
	}
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      edebatItem(record),
	})
	if err != nil {
		return EdebatRecord{}, err
	}
	log.Printf("[correlation=%s] dynamodb SaveEdebat user=%s debate=%s", correlationID, record.UserID, record.DebateID)
	return record, nil
}

func (d *dynamoEdebatStore) GetEdebat(ctx context.Context, userID, debateID, correlationID string) (EdebatRecord, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":   &types.AttributeValueMemberS{Value: userID},
			"debateId": &types.AttributeValueMemberS{Value: debateID},
		},
	})
	if err != nil {
		return EdebatRecord{}, false, err
	}
	if out.Item == nil {
		return EdebatRecord{}, false, nil
	}
	rec, ok := edebatFromItem(out.Item)
	log.Printf("[correlation=%s] dynamodb GetEdebat user=%s debate=%s found=%v", correlationID, userID, debateID, ok)
	return rec, ok, nil
}

func (d *dynamoEdebatStore) ListEdebatsByUserID(ctx context.Context, userID, correlationID string) ([]EdebatRecord, error) {
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
	records := make([]EdebatRecord, 0, len(out.Items))
	for _, row := range out.Items {
		if rec, ok := edebatFromItem(row); ok {
			records = append(records, rec)
		}
	}
	log.Printf("[correlation=%s] dynamodb ListEdebatsByUserID user=%s count=%d", correlationID, userID, len(records))
	return records, nil
}

// NewEdebatStore returns a memory or DynamoDB-backed edebat metadata store.
func NewEdebatStore(ctx context.Context) (EdebatStore, error) {
	mode := common.Env("EDEBATS_BACKEND", "memory")
	table := common.Env("EDEBATS_TABLE", "eduardoos_edebats")
	if mode != "dynamodb" {
		return newMemoryEdebatStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoEdebatStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

// EdebatObjectKey builds the absolute S3 object key for a .edebat body.
func EdebatObjectKey(userID, debateID string) string {
	safeUser := strings.ReplaceAll(strings.TrimSpace(userID), "@", "_at_")
	safeUser = strings.ReplaceAll(safeUser, "/", "_")
	return fmt.Sprintf("media/edebats/%s/%s.edebat", safeUser, debateID)
}

func edebatItem(r EdebatRecord) map[string]types.AttributeValue {
	item := map[string]types.AttributeValue{
		"userId":           &types.AttributeValueMemberS{Value: r.UserID},
		"debateId":         &types.AttributeValueMemberS{Value: r.DebateID},
		"title":            &types.AttributeValueMemberS{Value: r.Title},
		"topic":            &types.AttributeValueMemberS{Value: r.Topic},
		"roundsTotal":      &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", r.RoundsTotal)},
		"roundsCompleted":  &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", r.RoundsCompleted)},
		"s3Key":            &types.AttributeValueMemberS{Value: r.S3Key},
		"contentSizeBytes": &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", r.ContentSizeBytes)},
		"createdAt":        &types.AttributeValueMemberS{Value: r.CreatedAt},
		"updatedAt":        &types.AttributeValueMemberS{Value: r.UpdatedAt},
	}
	if r.LastCorrelationID != "" {
		item["lastCorrelationId"] = &types.AttributeValueMemberS{Value: r.LastCorrelationID}
	}
	return item
}

func edebatFromItem(item map[string]types.AttributeValue) (EdebatRecord, bool) {
	r := EdebatRecord{}
	if v, ok := item["userId"].(*types.AttributeValueMemberS); ok {
		r.UserID = v.Value
	}
	if v, ok := item["debateId"].(*types.AttributeValueMemberS); ok {
		r.DebateID = v.Value
	}
	if v, ok := item["title"].(*types.AttributeValueMemberS); ok {
		r.Title = v.Value
	}
	if v, ok := item["topic"].(*types.AttributeValueMemberS); ok {
		r.Topic = v.Value
	}
	if v, ok := item["roundsTotal"].(*types.AttributeValueMemberN); ok {
		_, _ = fmt.Sscanf(v.Value, "%d", &r.RoundsTotal)
	}
	if v, ok := item["roundsCompleted"].(*types.AttributeValueMemberN); ok {
		_, _ = fmt.Sscanf(v.Value, "%d", &r.RoundsCompleted)
	}
	if v, ok := item["s3Key"].(*types.AttributeValueMemberS); ok {
		r.S3Key = v.Value
	}
	if v, ok := item["contentSizeBytes"].(*types.AttributeValueMemberN); ok {
		_, _ = fmt.Sscanf(v.Value, "%d", &r.ContentSizeBytes)
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
	return r, r.UserID != "" && r.DebateID != ""
}
