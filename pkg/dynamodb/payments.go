package dynamodb

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type PaymentRecord struct {
	IntentID          string   `json:"intentId" dynamodbav:"intentId"`
	UserEmail         string   `json:"userEmail" dynamodbav:"userEmail"`
	PlanID            string   `json:"planId" dynamodbav:"planId"`
	ProductName       string   `json:"productName" dynamodbav:"productName"`
	Services          []string `json:"services,omitempty" dynamodbav:"services,omitempty"`
	BillingPeriod     string   `json:"billingPeriod,omitempty" dynamodbav:"billingPeriod,omitempty"`
	Status            string   `json:"status" dynamodbav:"status"`
	Currency          string   `json:"currency" dynamodbav:"currency"`
	Amount            string   `json:"amount,omitempty" dynamodbav:"amount,omitempty"`
	ExpectedAmount    string   `json:"expectedAmount,omitempty" dynamodbav:"expectedAmount,omitempty"`
	PayPalTxnID       string   `json:"paypalTxnId,omitempty" dynamodbav:"paypalTxnId,omitempty"`
	HostedButtonID    string   `json:"hostedButtonId,omitempty" dynamodbav:"hostedButtonId,omitempty"`
	CreatedAt         string   `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt         string   `json:"updatedAt" dynamodbav:"updatedAt"`
	PaidAt            string   `json:"paidAt,omitempty" dynamodbav:"paidAt,omitempty"`
	LastCorrelationID string   `json:"lastCorrelationId,omitempty" dynamodbav:"lastCorrelationId,omitempty"`
}

func ProductNameForPlan(planID string) string {
	switch planID {
	case "subscription_monthly_basic":
		return "Monthly Basic Subscription"
	default:
		return planID
	}
}

type PaymentStore interface {
	SavePayment(ctx context.Context, record PaymentRecord, correlationID string) (PaymentRecord, error)
	GetPaymentByIntentID(ctx context.Context, intentID, correlationID string) (PaymentRecord, bool, error)
	GetPaymentsByUserEmail(ctx context.Context, userEmail, correlationID string) ([]PaymentRecord, error)
	BackendName() string
}

type memoryPaymentStore struct {
	mu       sync.RWMutex
	byIntent map[string]PaymentRecord
}

func newMemoryPaymentStore() *memoryPaymentStore {
	return &memoryPaymentStore{byIntent: map[string]PaymentRecord{}}
}

func (m *memoryPaymentStore) BackendName() string { return "memory" }

func (m *memoryPaymentStore) SavePayment(_ context.Context, record PaymentRecord, correlationID string) (PaymentRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.ProductName == "" {
		record.ProductName = ProductNameForPlan(record.PlanID)
	}

	m.mu.Lock()
	m.byIntent[record.IntentID] = record
	m.mu.Unlock()
	return record, nil
}

func (m *memoryPaymentStore) GetPaymentByIntentID(_ context.Context, intentID, _ string) (PaymentRecord, bool, error) {
	m.mu.RLock()
	record, ok := m.byIntent[intentID]
	m.mu.RUnlock()
	return record, ok, nil
}

func (m *memoryPaymentStore) GetPaymentsByUserEmail(_ context.Context, userEmail, _ string) ([]PaymentRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]PaymentRecord, 0)
	for _, record := range m.byIntent {
		if record.UserEmail == userEmail {
			out = append(out, record)
		}
	}
	return out, nil
}

type dynamoPaymentStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoPaymentStore) BackendName() string { return "dynamodb" }

func (d *dynamoPaymentStore) SavePayment(ctx context.Context, record PaymentRecord, correlationID string) (PaymentRecord, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if record.CreatedAt == "" {
		record.CreatedAt = now
	}
	record.UpdatedAt = now
	record.LastCorrelationID = correlationID
	if record.ProductName == "" {
		record.ProductName = ProductNameForPlan(record.PlanID)
	}

	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      paymentItem(record),
	})
	if err != nil {
		return PaymentRecord{}, err
	}
	log.Printf("[correlation=%s] dynamodb SavePayment intent=%s user=%s plan=%s status=%s",
		correlationID, record.IntentID, record.UserEmail, record.PlanID, record.Status)
	return record, nil
}

func (d *dynamoPaymentStore) GetPaymentByIntentID(ctx context.Context, intentID, correlationID string) (PaymentRecord, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"intentId": &types.AttributeValueMemberS{Value: intentID},
		},
	})
	if err != nil || out.Item == nil {
		return PaymentRecord{}, false, err
	}
	record, ok := paymentFromItem(out.Item)
	if !ok {
		return PaymentRecord{}, false, nil
	}
	log.Printf("[correlation=%s] dynamodb GetPaymentByIntentID intent=%s status=%s", correlationID, intentID, record.Status)
	return record, true, nil
}

func (d *dynamoPaymentStore) GetPaymentsByUserEmail(ctx context.Context, userEmail, correlationID string) ([]PaymentRecord, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		IndexName:              aws.String("userEmail-createdAt-index"),
		KeyConditionExpression: aws.String("userEmail = :email"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":email": &types.AttributeValueMemberS{Value: userEmail},
		},
		ScanIndexForward: aws.Bool(false),
	})
	if err != nil {
		return nil, err
	}
	records := make([]PaymentRecord, 0, len(out.Items))
	for _, row := range out.Items {
		if record, ok := paymentFromItem(row); ok {
			records = append(records, record)
		}
	}
	log.Printf("[correlation=%s] dynamodb GetPaymentsByUserEmail user=%s count=%d", correlationID, userEmail, len(records))
	return records, nil
}

func NewPaymentStore(ctx context.Context) (PaymentStore, error) {
	mode := common.Env("PAYMENTS_BACKEND", "memory")
	table := common.Env("PAYMENTS_TABLE", "eduardoos_payments")
	if mode != "dynamodb" {
		return newMemoryPaymentStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoPaymentStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

func paymentItem(record PaymentRecord) map[string]types.AttributeValue {
	item := map[string]types.AttributeValue{
		"intentId":    &types.AttributeValueMemberS{Value: record.IntentID},
		"userEmail":   &types.AttributeValueMemberS{Value: record.UserEmail},
		"planId":      &types.AttributeValueMemberS{Value: record.PlanID},
		"productName": &types.AttributeValueMemberS{Value: record.ProductName},
		"status":      &types.AttributeValueMemberS{Value: record.Status},
		"currency":    &types.AttributeValueMemberS{Value: record.Currency},
		"createdAt":   &types.AttributeValueMemberS{Value: record.CreatedAt},
		"updatedAt":   &types.AttributeValueMemberS{Value: record.UpdatedAt},
	}
	if record.ExpectedAmount != "" {
		item["expectedAmount"] = &types.AttributeValueMemberS{Value: record.ExpectedAmount}
	}
	if len(record.Services) > 0 {
		values := make([]types.AttributeValue, 0, len(record.Services))
		for _, svc := range record.Services {
			values = append(values, &types.AttributeValueMemberS{Value: svc})
		}
		item["services"] = &types.AttributeValueMemberL{Value: values}
	}
	if record.BillingPeriod != "" {
		item["billingPeriod"] = &types.AttributeValueMemberS{Value: record.BillingPeriod}
	}
	if record.Amount != "" {
		item["amount"] = &types.AttributeValueMemberS{Value: record.Amount}
	}
	if record.PayPalTxnID != "" {
		item["paypalTxnId"] = &types.AttributeValueMemberS{Value: record.PayPalTxnID}
	}
	if record.HostedButtonID != "" {
		item["hostedButtonId"] = &types.AttributeValueMemberS{Value: record.HostedButtonID}
	}
	if record.PaidAt != "" {
		item["paidAt"] = &types.AttributeValueMemberS{Value: record.PaidAt}
	}
	if record.LastCorrelationID != "" {
		item["lastCorrelationId"] = &types.AttributeValueMemberS{Value: record.LastCorrelationID}
	}
	return item
}

func paymentFromItem(item map[string]types.AttributeValue) (PaymentRecord, bool) {
	record := PaymentRecord{}
	if v, ok := item["intentId"].(*types.AttributeValueMemberS); ok {
		record.IntentID = v.Value
	}
	if v, ok := item["userEmail"].(*types.AttributeValueMemberS); ok {
		record.UserEmail = v.Value
	}
	if v, ok := item["planId"].(*types.AttributeValueMemberS); ok {
		record.PlanID = v.Value
	}
	if v, ok := item["productName"].(*types.AttributeValueMemberS); ok {
		record.ProductName = v.Value
	}
	if v, ok := item["status"].(*types.AttributeValueMemberS); ok {
		record.Status = v.Value
	}
	if v, ok := item["currency"].(*types.AttributeValueMemberS); ok {
		record.Currency = v.Value
	}
	if v, ok := item["amount"].(*types.AttributeValueMemberS); ok {
		record.Amount = v.Value
	}
	if v, ok := item["expectedAmount"].(*types.AttributeValueMemberS); ok {
		record.ExpectedAmount = v.Value
	}
	if v, ok := item["billingPeriod"].(*types.AttributeValueMemberS); ok {
		record.BillingPeriod = v.Value
	}
	if v, ok := item["services"].(*types.AttributeValueMemberL); ok {
		for _, av := range v.Value {
			if s, ok := av.(*types.AttributeValueMemberS); ok {
				record.Services = append(record.Services, s.Value)
			}
		}
	}
	if v, ok := item["paypalTxnId"].(*types.AttributeValueMemberS); ok {
		record.PayPalTxnID = v.Value
	}
	if v, ok := item["hostedButtonId"].(*types.AttributeValueMemberS); ok {
		record.HostedButtonID = v.Value
	}
	if v, ok := item["createdAt"].(*types.AttributeValueMemberS); ok {
		record.CreatedAt = v.Value
	}
	if v, ok := item["updatedAt"].(*types.AttributeValueMemberS); ok {
		record.UpdatedAt = v.Value
	}
	if v, ok := item["paidAt"].(*types.AttributeValueMemberS); ok {
		record.PaidAt = v.Value
	}
	if v, ok := item["lastCorrelationId"].(*types.AttributeValueMemberS); ok {
		record.LastCorrelationID = v.Value
	}
	return record, record.IntentID != ""
}
