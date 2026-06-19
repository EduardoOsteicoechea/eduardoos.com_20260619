package obsstore

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"eduardoos/pkg/common"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

type dynamoLogStore struct {
	client *dynamodb.Client
	table  string
	hub    *Hub
}

type dynamoTestStore struct {
	client *dynamodb.Client
	table  string
}

func NewDynamoClients(ctx context.Context, prefix string) (*dynamodb.Client, string, string) {
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		panic(fmt.Sprintf("aws config: %v", err))
	}
	client := dynamodb.NewFromConfig(cfg)
	return client, prefix + "_flight_logs", prefix + "_test_runs"
}

func NewDynamoLogStore(client *dynamodb.Client, table string) LogStore {
	return &dynamoLogStore{client: client, table: table, hub: NewHub()}
}

func NewDynamoTestStore(client *dynamodb.Client, table string) TestStore {
	return &dynamoTestStore{client: client, table: table}
}

func logSK(t time.Time) string {
	return fmt.Sprintf("%020d#%s", t.UnixMilli(), uuid.NewString())
}

func (d *dynamoLogStore) Ingest(ctx context.Context, entry common.FlightLogEntry) error {
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now().UTC()
	}
	meta := "{}"
	if entry.Metadata != nil {
		b, _ := json.Marshal(entry.Metadata)
		meta = string(b)
	}
	expires := entry.Timestamp.Add(LogTTL).Unix()
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item: map[string]types.AttributeValue{
			"PK":            &types.AttributeValueMemberS{Value: "LOG"},
			"SK":            &types.AttributeValueMemberS{Value: logSK(entry.Timestamp)},
			"correlationId": &types.AttributeValueMemberS{Value: entry.CorrelationID},
			"service":       &types.AttributeValueMemberS{Value: entry.Service},
			"status":        &types.AttributeValueMemberS{Value: entry.Status},
			"event":         &types.AttributeValueMemberS{Value: entry.Event},
			"timestamp":     &types.AttributeValueMemberS{Value: entry.Timestamp.UTC().Format(time.RFC3339Nano)},
			"metadata":      &types.AttributeValueMemberS{Value: meta},
			"expiresAt":     &types.AttributeValueMemberN{Value: strconv.FormatInt(expires, 10)},
		},
	})
	if err != nil {
		return err
	}
	d.hub.Publish(entry)
	return nil
}

func itemToLog(item map[string]types.AttributeValue) (common.FlightLogEntry, error) {
	var e common.FlightLogEntry
	if v, ok := item["correlationId"].(*types.AttributeValueMemberS); ok {
		e.CorrelationID = v.Value
	}
	if v, ok := item["service"].(*types.AttributeValueMemberS); ok {
		e.Service = v.Value
	}
	if v, ok := item["status"].(*types.AttributeValueMemberS); ok {
		e.Status = v.Value
	}
	if v, ok := item["event"].(*types.AttributeValueMemberS); ok {
		e.Event = v.Value
	}
	if v, ok := item["timestamp"].(*types.AttributeValueMemberS); ok {
		t, err := time.Parse(time.RFC3339Nano, v.Value)
		if err != nil {
			t, _ = time.Parse(time.RFC3339, v.Value)
		}
		e.Timestamp = t
	}
	if v, ok := item["metadata"].(*types.AttributeValueMemberS); ok && v.Value != "" && v.Value != "{}" {
		_ = json.Unmarshal([]byte(v.Value), &e.Metadata)
	}
	return e, nil
}

func (d *dynamoLogStore) List(ctx context.Context, q LogQuery) ([]common.FlightLogEntry, error) {
	limit := q.normalizedLimit()
	fetch := limit * 4
	if fetch > 5000 {
		fetch = 5000
	}
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "LOG"},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(int32(fetch)),
	})
	if err != nil {
		return nil, err
	}
	var entries []common.FlightLogEntry
	for _, item := range out.Items {
		e, err := itemToLog(item)
		if err != nil {
			continue
		}
		if q.matches(e) {
			entries = append(entries, e)
			if len(entries) >= limit {
				break
			}
		}
	}
	return entries, nil
}

func (d *dynamoLogStore) Analytics(ctx context.Context) (LogAnalytics, error) {
	logs, err := d.List(ctx, LogQuery{Limit: 5000})
	if err != nil {
		return LogAnalytics{}, err
	}
	return computeAnalytics(logs), nil
}

func (d *dynamoLogStore) Trace(ctx context.Context, correlationID string) ([]common.FlightLogEntry, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		IndexName:              aws.String("correlation-index"),
		KeyConditionExpression: aws.String("correlationId = :cid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cid": &types.AttributeValueMemberS{Value: correlationID},
		},
	})
	if err != nil {
		return nil, err
	}
	var entries []common.FlightLogEntry
	for _, item := range out.Items {
		e, err := itemToLog(item)
		if err == nil {
			entries = append(entries, e)
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Timestamp.Before(entries[j].Timestamp) })
	return entries, nil
}

func (d *dynamoLogStore) Subscribe(ctx context.Context) <-chan common.FlightLogEntry {
	return d.hub.Subscribe(ctx)
}

func runSK(t time.Time, runID string) string {
	return fmt.Sprintf("%020d#%s", t.UnixMilli(), runID)
}

func (d *dynamoTestStore) SaveRun(ctx context.Context, run TestRun) error {
	steps, _ := json.Marshal(run.Steps)
	expires := run.StartedAt.Add(LogTTL).Unix()
	item := map[string]types.AttributeValue{
		"PK":            &types.AttributeValueMemberS{Value: "RUN"},
		"SK":            &types.AttributeValueMemberS{Value: runSK(run.StartedAt, run.RunID)},
		"runId":         &types.AttributeValueMemberS{Value: run.RunID},
		"script":        &types.AttributeValueMemberS{Value: run.Script},
		"correlationId": &types.AttributeValueMemberS{Value: run.CorrelationID},
		"passed":        &types.AttributeValueMemberBOOL{Value: run.Passed},
		"steps":         &types.AttributeValueMemberS{Value: string(steps)},
		"startedAt":     &types.AttributeValueMemberS{Value: run.StartedAt.UTC().Format(time.RFC3339Nano)},
		"finishedAt":    &types.AttributeValueMemberS{Value: run.FinishedAt.UTC().Format(time.RFC3339Nano)},
		"durationMs":    &types.AttributeValueMemberN{Value: strconv.FormatInt(run.DurationMs, 10)},
		"expiresAt":     &types.AttributeValueMemberN{Value: strconv.FormatInt(expires, 10)},
	}
	if run.Source != "" {
		item["source"] = &types.AttributeValueMemberS{Value: run.Source}
	}
	if run.BuildID != "" {
		item["buildId"] = &types.AttributeValueMemberS{Value: run.BuildID}
	}
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(d.table), Item: item})
	return err
}

func itemToRun(item map[string]types.AttributeValue) (TestRun, error) {
	var run TestRun
	if v, ok := item["runId"].(*types.AttributeValueMemberS); ok {
		run.RunID = v.Value
	}
	if v, ok := item["script"].(*types.AttributeValueMemberS); ok {
		run.Script = v.Value
	}
	if v, ok := item["correlationId"].(*types.AttributeValueMemberS); ok {
		run.CorrelationID = v.Value
	}
	if v, ok := item["passed"].(*types.AttributeValueMemberBOOL); ok {
		run.Passed = v.Value
	}
	if v, ok := item["steps"].(*types.AttributeValueMemberS); ok {
		_ = json.Unmarshal([]byte(v.Value), &run.Steps)
	}
	if v, ok := item["startedAt"].(*types.AttributeValueMemberS); ok {
		run.StartedAt, _ = time.Parse(time.RFC3339Nano, v.Value)
	}
	if v, ok := item["finishedAt"].(*types.AttributeValueMemberS); ok {
		run.FinishedAt, _ = time.Parse(time.RFC3339Nano, v.Value)
	}
	if v, ok := item["durationMs"].(*types.AttributeValueMemberN); ok {
		run.DurationMs, _ = strconv.ParseInt(v.Value, 10, 64)
	}
	if v, ok := item["source"].(*types.AttributeValueMemberS); ok {
		run.Source = v.Value
	}
	if v, ok := item["buildId"].(*types.AttributeValueMemberS); ok {
		run.BuildID = v.Value
	}
	return run, nil
}

func (d *dynamoTestStore) ListRuns(ctx context.Context, limit int) ([]TestRun, error) {
	if limit <= 0 {
		limit = 500
	}
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "RUN"},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(int32(limit)),
	})
	if err != nil {
		return nil, err
	}
	var runs []TestRun
	for _, item := range out.Items {
		run, err := itemToRun(item)
		if err == nil && run.RunID != "" {
			runs = append(runs, run)
		}
	}
	if runs == nil {
		runs = []TestRun{}
	}
	return runs, nil
}

func (d *dynamoTestStore) GetRun(ctx context.Context, runID string) (TestRun, bool, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		IndexName:              aws.String("runId-index"),
		KeyConditionExpression: aws.String("runId = :rid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":rid": &types.AttributeValueMemberS{Value: runID},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return TestRun{}, false, err
	}
	if len(out.Items) == 0 {
		return TestRun{}, false, nil
	}
	run, err := itemToRun(out.Items[0])
	if err != nil || strings.TrimSpace(run.RunID) == "" {
		return TestRun{}, false, err
	}
	return run, true, nil
}

// NewLogStore picks DynamoDB on EC2 or memory locally.
func NewLogStore(ctx context.Context) LogStore {
	if common.Env("TELEMETRY_BACKEND", "memory") == "dynamodb" {
		client, logsTable, _ := NewDynamoClients(ctx, common.Env("DYNAMODB_TABLE_PREFIX", "eduardoos"))
		return NewDynamoLogStore(client, logsTable)
	}
	return NewMemoryLogStore()
}

// NewTestStore picks DynamoDB on EC2 or memory locally.
func NewTestStore(ctx context.Context) TestStore {
	if common.Env("TESTER_BACKEND", "memory") == "dynamodb" {
		client, _, runsTable := NewDynamoClients(ctx, common.Env("DYNAMODB_TABLE_PREFIX", "eduardoos"))
		return NewDynamoTestStore(client, runsTable)
	}
	return NewMemoryTestStore()
}
