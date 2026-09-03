package apikeys

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Dynamo SK layout (eduardoos_catalog, PK=APP):
//
//	apikey:{id}                         — primary record
//	apikey-hash:{sha256}                — hash → id lookup row {id}
//	apikey-by-owner:{email}|{id}        — owner list index (same Record JSON)
type dynamoStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoStore) BackendName() string { return "dynamodb:" + d.table }

func keySK(id string) string { return "apikey:" + strings.TrimSpace(id) }

func hashSK(hash string) string { return "apikey-hash:" + strings.TrimSpace(hash) }

func ownerSK(email, id string) string {
	return "apikey-by-owner:" + auth.NormalizeEmail(email) + "|" + strings.TrimSpace(id)
}

func ownerPrefix(email string) string {
	return "apikey-by-owner:" + auth.NormalizeEmail(email) + "|"
}

func (d *dynamoStore) putJSON(ctx context.Context, sk string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item: map[string]types.AttributeValue{
			"PK":   &types.AttributeValueMemberS{Value: "APP"},
			"SK":   &types.AttributeValueMemberS{Value: sk},
			"data": &types.AttributeValueMemberS{Value: string(raw)},
		},
	})
	return err
}

func (d *dynamoStore) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "APP"},
			"SK": &types.AttributeValueMemberS{Value: sk},
		},
	})
	if err != nil {
		return false, err
	}
	if out.Item == nil {
		return false, nil
	}
	data, ok := out.Item["data"].(*types.AttributeValueMemberS)
	if !ok || data.Value == "" {
		return false, nil
	}
	if err := json.Unmarshal([]byte(data.Value), dest); err != nil {
		return false, err
	}
	return true, nil
}

func (d *dynamoStore) deleteItem(ctx context.Context, sk string) error {
	_, err := d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "APP"},
			"SK": &types.AttributeValueMemberS{Value: sk},
		},
	})
	return err
}

type hashLookup struct {
	ID string `json:"id"`
}

func (d *dynamoStore) Create(ctx context.Context, rec Record) error {
	rec.OwnerEmail = auth.NormalizeEmail(rec.OwnerEmail)
	if err := d.putJSON(ctx, keySK(rec.ID), rec); err != nil {
		return err
	}
	if err := d.putJSON(ctx, hashSK(rec.Hash), hashLookup{ID: rec.ID}); err != nil {
		return err
	}
	return d.putJSON(ctx, ownerSK(rec.OwnerEmail, rec.ID), rec)
}

func (d *dynamoStore) GetByHash(ctx context.Context, hash string) (Record, bool, error) {
	var look hashLookup
	ok, err := d.getJSON(ctx, hashSK(hash), &look)
	if err != nil || !ok || look.ID == "" {
		return Record{}, ok, err
	}
	return d.GetByID(ctx, look.ID)
}

func (d *dynamoStore) GetByID(ctx context.Context, id string) (Record, bool, error) {
	var rec Record
	ok, err := d.getJSON(ctx, keySK(id), &rec)
	return rec, ok, err
}

func (d *dynamoStore) ListByOwner(ctx context.Context, ownerEmail string) ([]Record, error) {
	prefix := ownerPrefix(ownerEmail)
	outQ, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: prefix},
		},
	})
	if err != nil {
		return nil, err
	}
	out := make([]Record, 0, len(outQ.Items))
	for _, item := range outQ.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var rec Record
		if err := json.Unmarshal([]byte(data.Value), &rec); err != nil {
			continue
		}
		out = append(out, rec)
	}
	return out, nil
}

func (d *dynamoStore) Revoke(ctx context.Context, ownerEmail, id string) (Record, bool, error) {
	rec, ok, err := d.GetByID(ctx, id)
	if err != nil || !ok {
		return Record{}, ok, err
	}
	if !strings.EqualFold(rec.OwnerEmail, auth.NormalizeEmail(ownerEmail)) {
		return Record{}, false, nil
	}
	if rec.RevokedAt == "" {
		rec.RevokedAt = auth.NowRFC3339()
		if err := d.putJSON(ctx, keySK(rec.ID), rec); err != nil {
			return Record{}, false, err
		}
		_ = d.putJSON(ctx, ownerSK(rec.OwnerEmail, rec.ID), rec)
	}
	return rec, true, nil
}

func (d *dynamoStore) TouchLastUsed(ctx context.Context, id string, at string) error {
	rec, ok, err := d.GetByID(ctx, id)
	if err != nil || !ok {
		return err
	}
	rec.LastUsedAt = at
	if err := d.putJSON(ctx, keySK(rec.ID), rec); err != nil {
		return err
	}
	return d.putJSON(ctx, ownerSK(rec.OwnerEmail, rec.ID), rec)
}

func newDynamoStore(ctx context.Context) (*dynamoStore, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	prefix := httpx.Env("DYNAMODB_TABLE_PREFIX", "eduardoos")
	table := httpx.Env("APIKEYS_TABLE", prefix+"_catalog")
	if table == "" {
		return nil, fmt.Errorf("APIKEYS_TABLE is empty")
	}
	return &dynamoStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

// OpenStore selects memory or DynamoDB from DATABASE_BACKEND / APIKEYS_BACKEND.
func OpenStore(ctx context.Context) Store {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("APIKEYS_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("apikeys store backend=memory")
		return NewMemoryStore()
	}
	store, err := newDynamoStore(ctx)
	if err != nil {
		log.Printf("apikeys DATABASE_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
		return NewMemoryStore()
	}
	log.Printf("apikeys store backend=dynamodb table=%s", store.table)
	return store
}
