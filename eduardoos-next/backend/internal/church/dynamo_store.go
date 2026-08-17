package church

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// dynamoCatalog persists church cards in eduardoos_catalog.
type dynamoCatalog struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoCatalog) BackendName() string { return "dynamodb:" + d.table }

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

func (d *dynamoCatalog) Create(ctx context.Context, c ChurchCard) (ChurchCard, error) {
	c.OwnerEmail = auth.NormalizeEmail(c.OwnerEmail)
	c.DenominationID = strings.TrimSpace(c.DenominationID)
	c.ChurchID = strings.TrimSpace(c.ChurchID)
	if c.DenominationID == "" || c.ChurchID == "" {
		return ChurchCard{}, fmt.Errorf("denominationId and churchId required")
	}
	sk := CatalogSK(c.DenominationID, c.ChurchID)
	var existing ChurchCard
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return ChurchCard{}, err
	}
	if ok {
		return ChurchCard{}, ErrDuplicate
	}
	if err := d.putJSON(ctx, sk, c); err != nil {
		return ChurchCard{}, err
	}
	return c, nil
}

func (d *dynamoCatalog) Get(ctx context.Context, denomID, churchID string) (ChurchCard, bool, error) {
	var c ChurchCard
	ok, err := d.getJSON(ctx, CatalogSK(denomID, churchID), &c)
	if err != nil || !ok {
		return ChurchCard{}, ok, err
	}
	return c, true, nil
}

func (d *dynamoCatalog) List(ctx context.Context, query string) ([]ChurchCard, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: CatalogSKPrefix()},
		},
	})
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	cards := make([]ChurchCard, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var c ChurchCard
		if err := json.Unmarshal([]byte(data.Value), &c); err != nil {
			continue
		}
		if q == "" || churchMatchesQuery(c, q) {
			cards = append(cards, c)
		}
	}
	return cards, nil
}

func (d *dynamoCatalog) Update(ctx context.Context, c ChurchCard) (ChurchCard, error) {
	sk := CatalogSK(c.DenominationID, c.ChurchID)
	var existing ChurchCard
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return ChurchCard{}, err
	}
	if !ok {
		return ChurchCard{}, ErrNotFound
	}
	if err := d.putJSON(ctx, sk, c); err != nil {
		return ChurchCard{}, err
	}
	return c, nil
}

func (d *dynamoCatalog) Delete(ctx context.Context, denomID, churchID string) error {
	sk := CatalogSK(denomID, churchID)
	var existing ChurchCard
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
	table := strings.TrimSpace(httpx.Env("CHURCH_TABLE", ""))
	if table == "" {
		table = strings.TrimSpace(httpx.Env("HOMESCOOL_TABLE", "eduardoos_catalog"))
	}
	return &dynamoCatalog{client: dynamodb.NewFromConfig(cfg), table: table}, nil
}

// dynamoMemberships persists membership rows in the same catalog table.
type dynamoMemberships struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoMemberships) BackendName() string { return "dynamodb:" + d.table }

func (d *dynamoMemberships) putJSON(ctx context.Context, sk string, value any) error {
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

func (d *dynamoMemberships) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
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

func (d *dynamoMemberships) Upsert(ctx context.Context, mem Membership) (Membership, error) {
	mem.Email = auth.NormalizeEmail(mem.Email)
	mem.DenominationID = strings.TrimSpace(mem.DenominationID)
	mem.ChurchID = strings.TrimSpace(mem.ChurchID)
	mem.Role = NormalizeChurchRole(mem.Role)
	if mem.Email == "" || mem.DenominationID == "" || mem.ChurchID == "" {
		return Membership{}, fmt.Errorf("email, denominationId, churchId required")
	}
	sk := MembershipSK(mem.Email, mem.DenominationID, mem.ChurchID)
	var existing Membership
	ok, err := d.getJSON(ctx, sk, &existing)
	if err != nil {
		return Membership{}, err
	}
	if ok && mem.CreatedAt == "" {
		mem.CreatedAt = existing.CreatedAt
	}
	if err := d.putJSON(ctx, sk, mem); err != nil {
		return Membership{}, err
	}
	return mem, nil
}

func (d *dynamoMemberships) Get(ctx context.Context, email, denomID, churchID string) (Membership, bool, error) {
	var mem Membership
	ok, err := d.getJSON(ctx, MembershipSK(email, denomID, churchID), &mem)
	if err != nil || !ok {
		return Membership{}, ok, err
	}
	return mem, true, nil
}

func (d *dynamoMemberships) ListByUser(ctx context.Context, email string) ([]Membership, error) {
	email = auth.NormalizeEmail(email)
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: MembershipSKPrefixForUser(email)},
		},
	})
	if err != nil {
		return nil, err
	}
	list := make([]Membership, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var mem Membership
		if err := json.Unmarshal([]byte(data.Value), &mem); err != nil {
			continue
		}
		list = append(list, mem)
	}
	return list, nil
}

func (d *dynamoMemberships) Delete(ctx context.Context, email, denomID, churchID string) error {
	sk := MembershipSK(email, denomID, churchID)
	var existing Membership
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

func newDynamoMemberships(ctx context.Context) (*dynamoMemberships, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	table := strings.TrimSpace(httpx.Env("CHURCH_TABLE", ""))
	if table == "" {
		table = strings.TrimSpace(httpx.Env("HOMESCOOL_TABLE", "eduardoos_catalog"))
	}
	return &dynamoMemberships{client: dynamodb.NewFromConfig(cfg), table: table}, nil
}

// dynamoAuthorizations persists church-management approval requests
// (SK church-auth:u:{email}) in the same catalog table.
type dynamoAuthorizations struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoAuthorizations) BackendName() string { return "dynamodb:" + d.table }

func (d *dynamoAuthorizations) putJSON(ctx context.Context, sk string, value any) error {
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

func (d *dynamoAuthorizations) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
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

func (d *dynamoAuthorizations) Get(ctx context.Context, email string) (AuthorizationRequest, bool, error) {
	var req AuthorizationRequest
	ok, err := d.getJSON(ctx, AuthRequestSK(email), &req)
	if err != nil || !ok {
		return AuthorizationRequest{}, ok, err
	}
	return req, true, nil
}

func (d *dynamoAuthorizations) Put(ctx context.Context, req AuthorizationRequest) (AuthorizationRequest, error) {
	req.Email = auth.NormalizeEmail(req.Email)
	req.Status = NormalizeAuthStatus(req.Status)
	if req.Email == "" || req.Status == "" {
		return AuthorizationRequest{}, fmt.Errorf("email and status required")
	}
	if err := d.putJSON(ctx, AuthRequestSK(req.Email), req); err != nil {
		return AuthorizationRequest{}, err
	}
	return req, nil
}

func (d *dynamoAuthorizations) List(ctx context.Context, statusFilter string) ([]AuthorizationRequest, error) {
	want := NormalizeAuthStatus(statusFilter)
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: AuthRequestSKPrefix()},
		},
	})
	if err != nil {
		return nil, err
	}
	list := make([]AuthorizationRequest, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var req AuthorizationRequest
		if err := json.Unmarshal([]byte(data.Value), &req); err != nil {
			continue
		}
		if want != "" && req.Status != want {
			continue
		}
		list = append(list, req)
	}
	sort.Slice(list, func(i, j int) bool {
		return list[i].RequestedAt > list[j].RequestedAt
	})
	return list, nil
}

func newDynamoAuthorizations(ctx context.Context) (*dynamoAuthorizations, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	table := strings.TrimSpace(httpx.Env("CHURCH_TABLE", ""))
	if table == "" {
		table = strings.TrimSpace(httpx.Env("HOMESCOOL_TABLE", "eduardoos_catalog"))
	}
	return &dynamoAuthorizations{client: dynamodb.NewFromConfig(cfg), table: table}, nil
}
