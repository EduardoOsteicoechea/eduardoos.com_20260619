package dynamodb

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type pamphletRegistryStore struct {
	client *dynamodb.Client
	table  string
	mem    pamphlet.RegistryStore
}

// NewPamphletRegistryStore selects memory or DynamoDB registry persistence.
func NewPamphletRegistryStore(ctx context.Context) (pamphlet.RegistryStore, error) {
	mode := common.Env("PAMPHLETS_BACKEND", "memory")
	if mode != "dynamodb" {
		return pamphlet.NewMemoryRegistryStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &pamphletRegistryStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  common.Env("PAMPHLET_REGISTRY_TABLE", "eduardoos_pamphlet_registry"),
		mem:    pamphlet.NewMemoryRegistryStore(),
	}, nil
}

func (d *pamphletRegistryStore) BackendName() string { return "dynamodb" }

func (d *pamphletRegistryStore) List(ctx context.Context, userID, sortBy string) ([]pamphlet.RegistryEntry, error) {
	userID = strings.TrimSpace(userID)
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("userId = :u"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":u": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return d.mem.List(ctx, userID, sortBy)
	}
	entries := make([]pamphlet.RegistryEntry, 0, len(out.Items))
	for _, item := range out.Items {
		entry, ok := registryItemToEntry(item)
		if ok {
			entries = append(entries, entry)
		}
	}
	if len(entries) == 0 {
		return d.mem.List(ctx, userID, sortBy)
	}
	sortRegistryEntries(entries, sortBy)
	return entries, nil
}

func (d *pamphletRegistryStore) GetLayout(ctx context.Context, userID, pamphletID string) (pamphlet.LayoutFields, bool, error) {
	userID, pamphletID = strings.TrimSpace(userID), strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = pamphlet.DefaultPamphletID
	}
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":     &types.AttributeValueMemberS{Value: userID},
			"pamphletId": &types.AttributeValueMemberS{Value: pamphletID},
		},
	})
	if err != nil || out.Item == nil {
		return d.mem.GetLayout(ctx, userID, pamphletID)
	}
	entry, ok := registryItemToEntry(out.Item)
	if !ok {
		return pamphlet.DefaultLayoutFields(), false, nil
	}
	return entry.Layout, true, nil
}

func (d *pamphletRegistryStore) SaveLayout(ctx context.Context, userID, pamphletID, title string, layout pamphlet.LayoutFields) error {
	userID, pamphletID = strings.TrimSpace(userID), strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = pamphlet.DefaultPamphletID
	}
	if title == "" {
		title = pamphletID
	}
	layoutRaw, _ := json.Marshal(layout)
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item: map[string]types.AttributeValue{
			"userId":     &types.AttributeValueMemberS{Value: userID},
			"pamphletId": &types.AttributeValueMemberS{Value: pamphletID},
			"title":      &types.AttributeValueMemberS{Value: title},
			"updatedAt":  &types.AttributeValueMemberS{Value: time.Now().UTC().Format(time.RFC3339)},
			"layout":     &types.AttributeValueMemberS{Value: string(layoutRaw)},
		},
	})
	if err != nil {
		return d.mem.SaveLayout(ctx, userID, pamphletID, title, layout)
	}
	return nil
}

func registryItemToEntry(item map[string]types.AttributeValue) (pamphlet.RegistryEntry, bool) {
	var entry pamphlet.RegistryEntry
	if id, ok := item["pamphletId"].(*types.AttributeValueMemberS); ok {
		entry.PamphletID = id.Value
	}
	if t, ok := item["title"].(*types.AttributeValueMemberS); ok {
		entry.Title = t.Value
	}
	if u, ok := item["updatedAt"].(*types.AttributeValueMemberS); ok {
		if parsed, err := time.Parse(time.RFC3339, u.Value); err == nil {
			entry.UpdatedAt = parsed
		}
	}
	if l, ok := item["layout"].(*types.AttributeValueMemberS); ok {
		_ = json.Unmarshal([]byte(l.Value), &entry.Layout)
	}
	return entry, entry.PamphletID != ""
}

func sortRegistryEntries(entries []pamphlet.RegistryEntry, sortBy string) {
	switch strings.ToLower(sortBy) {
	case "date", "updated", "updatedat":
		for i := 0; i < len(entries); i++ {
			for j := i + 1; j < len(entries); j++ {
				if entries[j].UpdatedAt.After(entries[i].UpdatedAt) {
					entries[i], entries[j] = entries[j], entries[i]
				}
			}
		}
	default:
		for i := 0; i < len(entries); i++ {
			for j := i + 1; j < len(entries); j++ {
				if strings.ToLower(entries[j].Title) < strings.ToLower(entries[i].Title) {
					entries[i], entries[j] = entries[j], entries[i]
				}
			}
		}
	}
}
