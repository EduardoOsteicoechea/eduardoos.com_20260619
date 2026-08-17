package greek

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// dynamoCatalog persists group cards in eduardoos_catalog (PK=APP, SK=greek-group:…).
type dynamoCatalog struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoCatalog) BackendName() string { return "dynamodb:" + d.table }

func groupSK(ownerEmail, slug string) string {
	return "greek-group:u:" + auth.NormalizeEmail(ownerEmail) + "|g:" + strings.TrimSpace(slug)
}

func groupSKPrefix(ownerEmail string) string {
	return "greek-group:u:" + auth.NormalizeEmail(ownerEmail) + "|g:"
}

func (d *dynamoCatalog) putJSON(ctx context.Context, sk string, value any) error {
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

func (d *dynamoCatalog) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
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

func (d *dynamoCatalog) Create(ctx context.Context, g Group) (Group, error) {
	g.OwnerEmail = auth.NormalizeEmail(g.OwnerEmail)
	g.Slug = strings.TrimSpace(g.Slug)
	if g.OwnerEmail == "" || g.Slug == "" {
		return Group{}, fmt.Errorf("owner and slug required")
	}
	sk := groupSK(g.OwnerEmail, g.Slug)
	var existing Group
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return Group{}, err
	}
	if ok {
		return Group{}, ErrDuplicate
	}
	if err := d.putJSON(ctx, sk, g); err != nil {
		return Group{}, err
	}
	return g, nil
}

func (d *dynamoCatalog) Get(ctx context.Context, ownerEmail, slug string) (Group, bool, error) {
	var g Group
	ok, err := d.getJSON(ctx, groupSK(ownerEmail, slug), &g)
	if err != nil || !ok {
		return Group{}, ok, err
	}
	return g, true, nil
}

func (d *dynamoCatalog) List(ctx context.Context, ownerEmail string) ([]Group, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: groupSKPrefix(ownerEmail)},
		},
	})
	if err != nil {
		return nil, err
	}
	groups := make([]Group, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var g Group
		if err := json.Unmarshal([]byte(data.Value), &g); err != nil {
			continue
		}
		groups = append(groups, g)
	}
	return groups, nil
}

func (d *dynamoCatalog) Update(ctx context.Context, g Group) (Group, error) {
	g.OwnerEmail = auth.NormalizeEmail(g.OwnerEmail)
	sk := groupSK(g.OwnerEmail, g.Slug)
	var existing Group
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return Group{}, err
	}
	if !ok {
		return Group{}, ErrNotFound
	}
	if err := d.putJSON(ctx, sk, g); err != nil {
		return Group{}, err
	}
	return g, nil
}

func (d *dynamoCatalog) Delete(ctx context.Context, ownerEmail, slug string) error {
	sk := groupSK(ownerEmail, slug)
	var existing Group
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	_, err = d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "APP"},
			"SK": &types.AttributeValueMemberS{Value: sk},
		},
	})
	return err
}

func newDynamoCatalog(ctx context.Context) (*dynamoCatalog, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	table := strings.TrimSpace(httpx.Env("GREEK_TABLE", ""))
	if table == "" {
		table = strings.TrimSpace(httpx.Env("HOMESCOOL_TABLE", "eduardoos_catalog"))
	}
	return &dynamoCatalog{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}
