package auth

import (
	"context"
	"encoding/json"
	"fmt"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// Dynamo keys match production database service: PK=APP, SK=user:|otp:|otp-reset:
// Table default: eduardoos_users (DYNAMODB_TABLE_PREFIX + "_users" or USERS_TABLE).

type dynamoUserStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoUserStore) BackendName() string { return "dynamodb" }

func userKey(email string) string     { return "user:" + NormalizeEmail(email) }
func otpKey(email string) string      { return "otp:" + NormalizeEmail(email) }
func resetOtpKey(email string) string { return "otp-reset:" + NormalizeEmail(email) }

func (d *dynamoUserStore) putJSON(ctx context.Context, sk string, value any) error {
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

func (d *dynamoUserStore) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
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

func (d *dynamoUserStore) GetUser(ctx context.Context, email string) (User, bool, error) {
	var u User
	ok, err := d.getJSON(ctx, userKey(email), &u)
	if ok {
		u.Email = NormalizeEmail(u.Email)
		u.Role = ResolveRole(u.Email, u.Role)
	}
	return u, ok, err
}

func (d *dynamoUserStore) PutUser(ctx context.Context, user User) error {
	user.Email = NormalizeEmail(user.Email)
	user.Role = ResolveRole(user.Email, user.Role)
	if user.CreatedAt == "" {
		// Preserve existing CreatedAt when updating password/profile.
		if existing, ok, err := d.GetUser(ctx, user.Email); err == nil && ok && existing.CreatedAt != "" {
			user.CreatedAt = existing.CreatedAt
		} else {
			user.CreatedAt = NowRFC3339()
		}
	}
	return d.putJSON(ctx, userKey(user.Email), user)
}

// ListUsers queries PK=APP with SK prefix user: (production key shape).
func (d *dynamoUserStore) ListUsers(ctx context.Context) ([]User, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: "user:"},
		},
	})
	if err != nil {
		return nil, err
	}
	users := make([]User, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var u User
		if err := json.Unmarshal([]byte(data.Value), &u); err != nil {
			continue
		}
		u.Email = NormalizeEmail(u.Email)
		u.Role = ResolveRole(u.Email, u.Role)
		users = append(users, u)
	}
	return users, nil
}

func (d *dynamoUserStore) GetOTP(ctx context.Context, email string) (string, bool, error) {
	var otp string
	ok, err := d.getJSON(ctx, otpKey(email), &otp)
	if err != nil || !ok || otp == "" {
		return "", false, err
	}
	return otp, true, nil
}

func (d *dynamoUserStore) PutOTP(ctx context.Context, email, otp string) error {
	return d.putJSON(ctx, otpKey(email), otp)
}

func (d *dynamoUserStore) DeleteOTP(ctx context.Context, email string) error {
	return d.putJSON(ctx, otpKey(email), "")
}

func (d *dynamoUserStore) GetResetOTP(ctx context.Context, email string) (string, bool, error) {
	var otp string
	ok, err := d.getJSON(ctx, resetOtpKey(email), &otp)
	if err != nil || !ok || otp == "" {
		return "", false, err
	}
	return otp, true, nil
}

func (d *dynamoUserStore) PutResetOTP(ctx context.Context, email, otp string) error {
	return d.putJSON(ctx, resetOtpKey(email), otp)
}

func (d *dynamoUserStore) DeleteResetOTP(ctx context.Context, email string) error {
	return d.putJSON(ctx, resetOtpKey(email), "")
}

func newDynamoUserStore(ctx context.Context) (*dynamoUserStore, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	prefix := httpx.Env("DYNAMODB_TABLE_PREFIX", "eduardoos")
	table := httpx.Env("USERS_TABLE", prefix+"_users")
	if table == "" {
		return nil, fmt.Errorf("USERS_TABLE is empty")
	}
	return &dynamoUserStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

