package content

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// EpamRecord is production-shaped pamphlet metadata (body lives in S3 later).
type EpamRecord struct {
	UserID            string `json:"userId"`
	EpamID            string `json:"epamId"`
	FileName          string `json:"fileName,omitempty"`
	Title             string `json:"title"`
	Series            string `json:"series,omitempty"`
	SeriesChapter     string `json:"seriesChapter,omitempty"`
	Author            string `json:"author,omitempty"`
	Date              string `json:"date,omitempty"`
	S3Key             string `json:"s3Key,omitempty"`
	ContentSizeBytes  int64  `json:"contentSizeBytes,omitempty"`
	CreatedAt         string `json:"createdAt,omitempty"`
	UpdatedAt         string `json:"updatedAt"`
	LastCorrelationID string `json:"lastCorrelationId,omitempty"`
	// Body is memory-only convenience; Dynamo metadata does not store it.
	Body map[string]any `json:"body,omitempty"`
}

// EpamStore persists epam metadata keyed by userId + epamId.
type EpamStore interface {
	BackendName() string
	Save(ctx context.Context, record EpamRecord, correlationID string) (EpamRecord, error)
	Get(ctx context.Context, userID, epamID, correlationID string) (EpamRecord, bool, error)
	ListByUser(ctx context.Context, userID, correlationID string) ([]EpamRecord, error)
}

type memoryEpamStore struct {
	mu     sync.RWMutex
	byUser map[string]map[string]EpamRecord
}

func NewMemoryEpamStore() EpamStore {
	return &memoryEpamStore{byUser: map[string]map[string]EpamRecord{}}
}

func (m *memoryEpamStore) BackendName() string { return "memory" }

func (m *memoryEpamStore) Save(_ context.Context, record EpamRecord, correlationID string) (EpamRecord, error) {
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

func (m *memoryEpamStore) Get(_ context.Context, userID, epamID, _ string) (EpamRecord, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return EpamRecord{}, false, nil
	}
	rec, ok := bucket[epamID]
	return rec, ok, nil
}

func (m *memoryEpamStore) ListByUser(_ context.Context, userID, _ string) ([]EpamRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]EpamRecord, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

type dynamoEpamStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoEpamStore) BackendName() string { return "dynamodb" }

func (d *dynamoEpamStore) Save(ctx context.Context, record EpamRecord, correlationID string) (EpamRecord, error) {
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
	return record, err
}

func (d *dynamoEpamStore) Get(ctx context.Context, userID, epamID, _ string) (EpamRecord, bool, error) {
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
	return rec, ok, nil
}

func (d *dynamoEpamStore) ListByUser(ctx context.Context, userID, _ string) ([]EpamRecord, error) {
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
	return records, nil
}

// EpamObjectKey builds the absolute S3 object key for a cloud .epam body.
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

// OpenEpamStore selects memory or DynamoDB from EPAMS_BACKEND, then optionally
// wraps S3 for pamphlet JSON bodies (required for cloud open to return a document).
func OpenEpamStore(ctx context.Context) EpamStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("EPAMS_BACKEND", "memory")))
	var base EpamStore
	if mode != "dynamodb" {
		log.Printf("epams store backend=memory")
		base = NewMemoryEpamStore()
	} else {
		cfg, err := awsx.LoadConfig(ctx)
		if err != nil {
			log.Printf("epams EPAMS_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
			base = NewMemoryEpamStore()
		} else {
			table := httpx.Env("EPAMS_TABLE", "eduardoos_epams")
			log.Printf("epams store backend=dynamodb table=%s", table)
			base = &dynamoEpamStore{client: dynamodb.NewFromConfig(cfg), table: table}
		}
	}
	return maybeWrapEpamS3(ctx, base)
}
