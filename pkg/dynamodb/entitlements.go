package dynamodb

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"eduardoos/pkg/common"
	"eduardoos/pkg/subscriptions"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type EntitlementRecord struct {
	UserEmail     string `json:"userEmail" dynamodbav:"userEmail"`
	ServiceID     string `json:"serviceId" dynamodbav:"serviceId"`
	ServiceLabel  string `json:"serviceLabel" dynamodbav:"serviceLabel"`
	BillingPeriod string `json:"billingPeriod" dynamodbav:"billingPeriod"`
	ValidFrom     string `json:"validFrom" dynamodbav:"validFrom"`
	ValidUntil    string `json:"validUntil" dynamodbav:"validUntil"`
	LastIntentID  string `json:"lastIntentId" dynamodbav:"lastIntentId"`
	UpdatedAt     string `json:"updatedAt" dynamodbav:"updatedAt"`
}

type EntitlementStore interface {
	GrantServices(ctx context.Context, userEmail string, serviceIDs []string, billingPeriod, intentID string, paidAt time.Time, correlationID string) ([]EntitlementRecord, error)
	GetEntitlements(ctx context.Context, userEmail, correlationID string) ([]EntitlementRecord, error)
	HasActiveService(ctx context.Context, userEmail, serviceID string, at time.Time) (bool, error)
	BackendName() string
}

type memoryEntitlementStore struct {
	mu    sync.RWMutex
	items map[string]map[string]EntitlementRecord
}

func newMemoryEntitlementStore() *memoryEntitlementStore {
	return &memoryEntitlementStore{items: map[string]map[string]EntitlementRecord{}}
}

func (m *memoryEntitlementStore) BackendName() string { return "memory" }

func (m *memoryEntitlementStore) GrantServices(_ context.Context, userEmail string, serviceIDs []string, billingPeriod, intentID string, paidAt time.Time, correlationID string) ([]EntitlementRecord, error) {
	ids, err := subscriptions.NormalizeServiceIDs(serviceIDs)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	out := make([]EntitlementRecord, 0, len(ids))
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.items[userEmail] == nil {
		m.items[userEmail] = map[string]EntitlementRecord{}
	}
	for _, serviceID := range ids {
		current := m.items[userEmail][serviceID]
		var currentEnd time.Time
		if current.ValidUntil != "" {
			currentEnd, _ = time.Parse(time.RFC3339, current.ValidUntil)
		}
		validUntil, err := subscriptions.ExtendEntitlementEnd(currentEnd, paidAt, billingPeriod)
		if err != nil {
			return nil, err
		}
		validFrom := paidAt.UTC().Format(time.RFC3339)
		if current.ValidFrom != "" && currentEnd.After(paidAt.UTC()) {
			validFrom = current.ValidFrom
		}
		record := EntitlementRecord{
			UserEmail:     userEmail,
			ServiceID:     serviceID,
			ServiceLabel:  subscriptions.LabelForService(serviceID),
			BillingPeriod: billingPeriod,
			ValidFrom:     validFrom,
			ValidUntil:    validUntil.UTC().Format(time.RFC3339),
			LastIntentID:  intentID,
			UpdatedAt:     now.Format(time.RFC3339),
		}
		m.items[userEmail][serviceID] = record
		out = append(out, record)
	}
	log.Printf("[correlation=%s] memory GrantServices user=%s services=%v", correlationID, userEmail, ids)
	return out, nil
}

func (m *memoryEntitlementStore) GetEntitlements(_ context.Context, userEmail, _ string) ([]EntitlementRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.items[userEmail]
	out := make([]EntitlementRecord, 0, len(bucket))
	for _, record := range bucket {
		out = append(out, record)
	}
	return out, nil
}

func (m *memoryEntitlementStore) HasActiveService(_ context.Context, userEmail, serviceID string, at time.Time) (bool, error) {
	m.mu.RLock()
	record, ok := m.items[userEmail][serviceID]
	m.mu.RUnlock()
	if !ok {
		return false, nil
	}
	validUntil, err := time.Parse(time.RFC3339, record.ValidUntil)
	if err != nil {
		return false, nil
	}
	return validUntil.After(at.UTC()), nil
}

type dynamoEntitlementStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoEntitlementStore) BackendName() string { return "dynamodb" }

func (d *dynamoEntitlementStore) GrantServices(ctx context.Context, userEmail string, serviceIDs []string, billingPeriod, intentID string, paidAt time.Time, correlationID string) ([]EntitlementRecord, error) {
	ids, err := subscriptions.NormalizeServiceIDs(serviceIDs)
	if err != nil {
		return nil, err
	}
	existing, err := d.GetEntitlements(ctx, userEmail, correlationID)
	if err != nil {
		return nil, err
	}
	byService := map[string]EntitlementRecord{}
	for _, record := range existing {
		byService[record.ServiceID] = record
	}

	now := time.Now().UTC()
	out := make([]EntitlementRecord, 0, len(ids))
	for _, serviceID := range ids {
		current := byService[serviceID]
		var currentEnd time.Time
		if current.ValidUntil != "" {
			currentEnd, _ = time.Parse(time.RFC3339, current.ValidUntil)
		}
		validUntil, err := subscriptions.ExtendEntitlementEnd(currentEnd, paidAt, billingPeriod)
		if err != nil {
			return nil, err
		}
		validFrom := paidAt.UTC().Format(time.RFC3339)
		if current.ValidFrom != "" && currentEnd.After(paidAt.UTC()) {
			validFrom = current.ValidFrom
		}
		record := EntitlementRecord{
			UserEmail:     userEmail,
			ServiceID:     serviceID,
			ServiceLabel:  subscriptions.LabelForService(serviceID),
			BillingPeriod: billingPeriod,
			ValidFrom:     validFrom,
			ValidUntil:    validUntil.UTC().Format(time.RFC3339),
			LastIntentID:  intentID,
			UpdatedAt:     now.Format(time.RFC3339),
		}
		_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String(d.table),
			Item:      entitlementItem(record),
		})
		if err != nil {
			return nil, err
		}
		out = append(out, record)
	}
	log.Printf("[correlation=%s] dynamodb GrantServices user=%s services=%v", correlationID, userEmail, ids)
	return out, nil
}

func (d *dynamoEntitlementStore) GetEntitlements(ctx context.Context, userEmail, correlationID string) ([]EntitlementRecord, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("userEmail = :email"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": &types.AttributeValueMemberS{Value: userEmail},
		},
	})
	if err != nil {
		return nil, err
	}
	records := make([]EntitlementRecord, 0, len(out.Items))
	for _, row := range out.Items {
		if record, ok := entitlementFromItem(row); ok {
			records = append(records, record)
		}
	}
	log.Printf("[correlation=%s] dynamodb GetEntitlements user=%s count=%d", correlationID, userEmail, len(records))
	return records, nil
}

func (d *dynamoEntitlementStore) HasActiveService(ctx context.Context, userEmail, serviceID string, at time.Time) (bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userEmail": &types.AttributeValueMemberS{Value: userEmail},
			"serviceId": &types.AttributeValueMemberS{Value: serviceID},
		},
	})
	if err != nil || out.Item == nil {
		return false, err
	}
	record, ok := entitlementFromItem(out.Item)
	if !ok {
		return false, nil
	}
	validUntil, err := time.Parse(time.RFC3339, record.ValidUntil)
	if err != nil {
		return false, nil
	}
	return validUntil.After(at.UTC()), nil
}

func NewEntitlementStore(ctx context.Context) (EntitlementStore, error) {
	mode := common.Env("ENTITLEMENTS_BACKEND", common.Env("PAYMENTS_BACKEND", "memory"))
	table := common.Env("ENTITLEMENTS_TABLE", "eduardoos_entitlements")
	if mode != "dynamodb" {
		return newMemoryEntitlementStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoEntitlementStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

func entitlementItem(record EntitlementRecord) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"userEmail":     &types.AttributeValueMemberS{Value: record.UserEmail},
		"serviceId":     &types.AttributeValueMemberS{Value: record.ServiceID},
		"serviceLabel":  &types.AttributeValueMemberS{Value: record.ServiceLabel},
		"billingPeriod": &types.AttributeValueMemberS{Value: record.BillingPeriod},
		"validFrom":     &types.AttributeValueMemberS{Value: record.ValidFrom},
		"validUntil":    &types.AttributeValueMemberS{Value: record.ValidUntil},
		"lastIntentId":  &types.AttributeValueMemberS{Value: record.LastIntentID},
		"updatedAt":     &types.AttributeValueMemberS{Value: record.UpdatedAt},
	}
}

func entitlementFromItem(item map[string]types.AttributeValue) (EntitlementRecord, bool) {
	record := EntitlementRecord{}
	if v, ok := item["userEmail"].(*types.AttributeValueMemberS); ok {
		record.UserEmail = v.Value
	}
	if v, ok := item["serviceId"].(*types.AttributeValueMemberS); ok {
		record.ServiceID = v.Value
	}
	if v, ok := item["serviceLabel"].(*types.AttributeValueMemberS); ok {
		record.ServiceLabel = v.Value
	}
	if v, ok := item["billingPeriod"].(*types.AttributeValueMemberS); ok {
		record.BillingPeriod = v.Value
	}
	if v, ok := item["validFrom"].(*types.AttributeValueMemberS); ok {
		record.ValidFrom = v.Value
	}
	if v, ok := item["validUntil"].(*types.AttributeValueMemberS); ok {
		record.ValidUntil = v.Value
	}
	if v, ok := item["lastIntentId"].(*types.AttributeValueMemberS); ok {
		record.LastIntentID = v.Value
	}
	if v, ok := item["updatedAt"].(*types.AttributeValueMemberS); ok {
		record.UpdatedAt = v.Value
	}
	return record, record.UserEmail != "" && record.ServiceID != ""
}

func ActiveEntitlements(records []EntitlementRecord, at time.Time) []EntitlementRecord {
	out := make([]EntitlementRecord, 0, len(records))
	now := at.UTC()
	for _, record := range records {
		validUntil, err := time.Parse(time.RFC3339, record.ValidUntil)
		if err != nil {
			continue
		}
		if validUntil.After(now) {
			out = append(out, record)
		}
	}
	return out
}
