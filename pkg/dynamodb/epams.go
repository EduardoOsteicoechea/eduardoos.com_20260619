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

// EpamRecord is metadata for a cloud-stored .epam pamphlet (body lives in S3).
type EpamRecord struct {
	UserID            string `json:"userId" dynamodbav:"userId"`
	EpamID            string `json:"epamId" dynamodbav:"epamId"`
	FileName          string `json:"fileName" dynamodbav:"fileName"`
	Title             string `json:"title" dynamodbav:"title"`
	Series            string `json:"series" dynamodbav:"series"`
	SeriesChapter     string `json:"seriesChapter" dynamodbav:"seriesChapter"`
	Author            string `json:"author" dynamodbav:"author"`
	Date              string `json:"date" dynamodbav:"date"`
	S3Key             string `json:"s3Key" dynamodbav:"s3Key"`
	ContentSizeBytes  int64  `json:"contentSizeBytes" dynamodbav:"contentSizeBytes"`
	CreatedAt         string `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt         string `json:"updatedAt" dynamodbav:"updatedAt"`
	LastCorrelationID string `json:"lastCorrelationId,omitempty" dynamodbav:"lastCorrelationId,omitempty"`
}

// EpamStore persists pamphlet metadata keyed by userId + epamId.
type EpamStore interface {
	SaveEpam(ctx context.Context, record EpamRecord, correlationID string) (EpamRecord, error)
	GetEpam(ctx context.Context, userID, epamID, correlationID string) (EpamRecord, bool, error)
	ListEpamsByUserID(ctx context.Context, userID, correlationID string) ([]EpamRecord, error)
	DeleteEpam(ctx context.Context, userID, epamID, correlationID string) error
	BackendName() string
}

type memoryEpamStore struct {
	mu   sync.RWMutex
	byUser map[string]map[string]EpamRecord
}

func newMemoryEpamStore() *memoryEpamStore {
	return &memoryEpamStore{byUser: map[string]map[string]EpamRecord{}}
}

func (m *memoryEpamStore) BackendName() string { return "memory" }

func (m *memoryEpamStore) SaveEpam(_ context.Context, record EpamRecord, correlationID string) (EpamRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.EpamID == "" {
		record.EpamID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = EpamObjectKey(record.UserID, record.EpamID)
	}

	m.mu.Lock()
	if m.byUser[record.UserID] == nil {
		m.byUser[record.UserID] = map[string]EpamRecord{}
	}
	m.byUser[record.UserID][record.EpamID] = record
	m.mu.Unlock()
	return record, nil
}

func (m *memoryEpamStore) GetEpam(_ context.Context, userID, epamID, _ string) (EpamRecord, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return EpamRecord{}, false, nil
	}
	rec, ok := bucket[epamID]
	return rec, ok, nil
}

func (m *memoryEpamStore) ListEpamsByUserID(_ context.Context, userID, _ string) ([]EpamRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]EpamRecord, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

func (m *memoryEpamStore) DeleteEpam(_ context.Context, userID, epamID, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.byUser[userID] != nil {
		delete(m.byUser[userID], epamID)
	}
	return nil
}

type dynamoEpamStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoEpamStore) BackendName() string { return "dynamodb" }

func (d *dynamoEpamStore) SaveEpam(ctx context.Context, record EpamRecord, correlationID string) (EpamRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.EpamID == "" {
		record.EpamID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.S3Key == "" {
		record.S3Key = EpamObjectKey(record.UserID, record.EpamID)
	}

	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      epamItem(record),
	})
	if err != nil {
		return EpamRecord{}, err
	}
	log.Printf("[correlation=%s] dynamodb SaveEpam user=%s epam=%s", correlationID, record.UserID, record.EpamID)
	return record, nil
}

func (d *dynamoEpamStore) GetEpam(ctx context.Context, userID, epamID, correlationID string) (EpamRecord, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId": &types.AttributeValueMemberS{Value: userID},
			"epamId": &types.AttributeValueMemberS{Value: epamID},
		},
	})
	if err != nil {
		return EpamRecord{}, false, err
	}
	if out.Item == nil {
		return EpamRecord{}, false, nil
	}
	rec, ok := epamFromItem(out.Item)
	log.Printf("[correlation=%s] dynamodb GetEpam user=%s epam=%s found=%v", correlationID, userID, epamID, ok)
	return rec, ok, nil
}

func (d *dynamoEpamStore) ListEpamsByUserID(ctx context.Context, userID, correlationID string) ([]EpamRecord, error) {
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
	records := make([]EpamRecord, 0, len(out.Items))
	for _, row := range out.Items {
		if rec, ok := epamFromItem(row); ok {
			records = append(records, rec)
		}
	}
	log.Printf("[correlation=%s] dynamodb ListEpamsByUserID user=%s count=%d", correlationID, userID, len(records))
	return records, nil
}

func (d *dynamoEpamStore) DeleteEpam(ctx context.Context, userID, epamID, correlationID string) error {
	_, err := d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId": &types.AttributeValueMemberS{Value: userID},
			"epamId": &types.AttributeValueMemberS{Value: epamID},
		},
	})
	if err != nil {
		return err
	}
	log.Printf("[correlation=%s] dynamodb DeleteEpam user=%s epam=%s", correlationID, userID, epamID)
	return nil
}

// NewEpamStore returns a memory or DynamoDB-backed epam metadata store.
func NewEpamStore(ctx context.Context) (EpamStore, error) {
	mode := common.Env("EPAMS_BACKEND", "memory")
	table := common.Env("EPAMS_TABLE", "eduardoos_epams")
	if mode != "dynamodb" {
		return newMemoryEpamStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoEpamStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

// EpamObjectKey builds the absolute S3 object key for a cloud .epam body.
// Email local-part may include "@"; replace it so object keys stay URL-safe.
func EpamObjectKey(userID, epamID string) string {
	safeUser := strings.ReplaceAll(strings.TrimSpace(userID), "@", "_at_")
	safeUser = strings.ReplaceAll(safeUser, "/", "_")
	return fmt.Sprintf("media/epams/%s/%s.epam", safeUser, epamID)
}

func epamItem(r EpamRecord) map[string]types.AttributeValue {
	item := map[string]types.AttributeValue{
		"userId":           &types.AttributeValueMemberS{Value: r.UserID},
		"epamId":           &types.AttributeValueMemberS{Value: r.EpamID},
		"fileName":         &types.AttributeValueMemberS{Value: r.FileName},
		"title":            &types.AttributeValueMemberS{Value: r.Title},
		"series":           &types.AttributeValueMemberS{Value: r.Series},
		"seriesChapter":    &types.AttributeValueMemberS{Value: r.SeriesChapter},
		"author":           &types.AttributeValueMemberS{Value: r.Author},
		"date":             &types.AttributeValueMemberS{Value: r.Date},
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

func epamFromItem(item map[string]types.AttributeValue) (EpamRecord, bool) {
	r := EpamRecord{}
	if v, ok := item["userId"].(*types.AttributeValueMemberS); ok {
		r.UserID = v.Value
	}
	if v, ok := item["epamId"].(*types.AttributeValueMemberS); ok {
		r.EpamID = v.Value
	}
	if v, ok := item["fileName"].(*types.AttributeValueMemberS); ok {
		r.FileName = v.Value
	}
	if v, ok := item["title"].(*types.AttributeValueMemberS); ok {
		r.Title = v.Value
	}
	if v, ok := item["series"].(*types.AttributeValueMemberS); ok {
		r.Series = v.Value
	}
	if v, ok := item["seriesChapter"].(*types.AttributeValueMemberS); ok {
		r.SeriesChapter = v.Value
	}
	if v, ok := item["author"].(*types.AttributeValueMemberS); ok {
		r.Author = v.Value
	}
	if v, ok := item["date"].(*types.AttributeValueMemberS); ok {
		r.Date = v.Value
	}
	if v, ok := item["s3Key"].(*types.AttributeValueMemberS); ok {
		r.S3Key = v.Value
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
	return r, r.UserID != "" && r.EpamID != ""
}
