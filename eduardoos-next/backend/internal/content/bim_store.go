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

// IfcBimRecord links a user to an IFC object under S3 prefix ifcbim/.
type IfcBimRecord struct {
	UserID            string `json:"userId"`
	ModelID           string `json:"modelId"`
	FileName          string `json:"fileName,omitempty"`
	Title             string `json:"title,omitempty"`
	Name              string `json:"name,omitempty"` // API alias used by Next create body
	S3Key             string `json:"s3Key,omitempty"`
	ContentType       string `json:"contentType,omitempty"`
	ContentSizeBytes  int64  `json:"contentSizeBytes,omitempty"`
	CreatedAt         string `json:"createdAt,omitempty"`
	UpdatedAt         string `json:"updatedAt"`
	LastCorrelationID string `json:"lastCorrelationId,omitempty"`
}

// BIMStore persists IFC model metadata; memory mode also keeps placeholder bytes.
type BIMStore interface {
	BackendName() string
	Save(ctx context.Context, record IfcBimRecord, file []byte, correlationID string) (IfcBimRecord, error)
	Get(ctx context.Context, userID, modelID, correlationID string) (IfcBimRecord, bool, error)
	ListByUser(ctx context.Context, userID, correlationID string) ([]IfcBimRecord, error)
	GetFile(ctx context.Context, userID, modelID string) ([]byte, bool, error)
}

type memoryBIMStore struct {
	mu     sync.RWMutex
	byUser map[string]map[string]IfcBimRecord
	files  map[string][]byte // key userID|modelID
}

func NewMemoryBIMStore() BIMStore {
	return &memoryBIMStore{
		byUser: map[string]map[string]IfcBimRecord{},
		files:  map[string][]byte{},
	}
}

func bimKey(userID, modelID string) string { return userID + "|" + modelID }

func (m *memoryBIMStore) BackendName() string { return "memory" }

func (m *memoryBIMStore) Save(_ context.Context, record IfcBimRecord, file []byte, correlationID string) (IfcBimRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.ModelID == "" {
		record.ModelID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.Title == "" {
		record.Title = record.Name
	}
	if record.S3Key == "" {
		record.S3Key = IfcBimObjectKey(record.UserID, record.ModelID)
	}
	if len(file) == 0 {
		file = []byte("ISO-10303-21;\n/* eduardoos-next memory placeholder IFC */\nEND-ISO-10303-21;\n")
	}
	record.ContentSizeBytes = int64(len(file))
	if record.ContentType == "" {
		record.ContentType = "application/octet-stream"
	}
	if record.FileName == "" {
		record.FileName = record.Name
	}
	m.mu.Lock()
	if m.byUser[record.UserID] == nil {
		m.byUser[record.UserID] = map[string]IfcBimRecord{}
	}
	m.byUser[record.UserID][record.ModelID] = record
	m.files[bimKey(record.UserID, record.ModelID)] = append([]byte(nil), file...)
	m.mu.Unlock()
	return record, nil
}

func (m *memoryBIMStore) Get(_ context.Context, userID, modelID, _ string) (IfcBimRecord, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return IfcBimRecord{}, false, nil
	}
	rec, ok := bucket[modelID]
	return rec, ok, nil
}

func (m *memoryBIMStore) ListByUser(_ context.Context, userID, _ string) ([]IfcBimRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]IfcBimRecord, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

func (m *memoryBIMStore) GetFile(_ context.Context, userID, modelID string) ([]byte, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, ok := m.files[bimKey(userID, modelID)]
	return b, ok, nil
}

type dynamoBIMStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoBIMStore) BackendName() string { return "dynamodb" }

func (d *dynamoBIMStore) Save(ctx context.Context, record IfcBimRecord, _ []byte, correlationID string) (IfcBimRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.ModelID == "" {
		record.ModelID = uuid.NewString()
	}
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.Title == "" {
		record.Title = record.Name
	}
	if record.ContentType == "" {
		record.ContentType = "application/octet-stream"
	}
	if record.S3Key == "" {
		record.S3Key = IfcBimObjectKey(record.UserID, record.ModelID)
	}
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      ifcBimItem(record),
	})
	return record, err
}

func (d *dynamoBIMStore) Get(ctx context.Context, userID, modelID, _ string) (IfcBimRecord, bool, error) {
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
	return rec, ok, nil
}

func (d *dynamoBIMStore) ListByUser(ctx context.Context, userID, _ string) ([]IfcBimRecord, error) {
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
	return records, nil
}

// GetFile in Dynamo mode returns a placeholder until S3 fetch is wired.
func (d *dynamoBIMStore) GetFile(_ context.Context, userID, modelID string) ([]byte, bool, error) {
	placeholder := []byte("ISO-10303-21;\n/* eduardoos-next dynamodb metadata mode; S3 fetch not wired yet */\n/* " +
		IfcBimObjectKey(userID, modelID) + " */\nEND-ISO-10303-21;\n")
	return placeholder, true, nil
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

// OpenBIMStore selects memory or DynamoDB from IFCBIM_BACKEND, then optionally
// wraps with S3 file storage when IFCBIM_S3_BUCKET (or S3_BUCKET) is set.
func OpenBIMStore(ctx context.Context) BIMStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("IFCBIM_BACKEND", "memory")))
	var base BIMStore
	if mode != "dynamodb" {
		log.Printf("ifcbim store backend=memory")
		base = NewMemoryBIMStore()
	} else {
		cfg, err := awsx.LoadConfig(ctx)
		if err != nil {
			log.Printf("ifcbim IFCBIM_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
			base = NewMemoryBIMStore()
		} else {
			table := httpx.Env("IFCBIM_TABLE", "eduardoos_ifcbim")
			log.Printf("ifcbim store backend=dynamodb table=%s", table)
			base = &dynamoBIMStore{client: dynamodb.NewFromConfig(cfg), table: table}
		}
	}
	return maybeWrapS3(ctx, base)
}
