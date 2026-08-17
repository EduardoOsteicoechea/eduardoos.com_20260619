package homescool

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
	"github.com/google/uuid"
)

// dynamoLinkStore persists teacher→student links in DynamoDB using the same
// single-table KV shape as production catalog/users (PK=APP, SK=…, data=JSON).
//
// Default table is eduardoos_catalog (generic app KV already in IAM). Keys:
//
//	homescool-link:t:{teacher}|s:{student}           — primary pair row
//	homescool-by-student:s:{student}|t:{teacher}     — student-side index row
type dynamoLinkStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoLinkStore) BackendName() string { return "dynamodb:" + d.table }

func teacherLinkSK(teacherEmail, studentEmail string) string {
	return "homescool-link:t:" + auth.NormalizeEmail(teacherEmail) + "|s:" + auth.NormalizeEmail(studentEmail)
}

func studentLinkSK(studentEmail, teacherEmail string) string {
	return "homescool-by-student:s:" + auth.NormalizeEmail(studentEmail) + "|t:" + auth.NormalizeEmail(teacherEmail)
}

func teacherLinkPrefix(teacherEmail string) string {
	return "homescool-link:t:" + auth.NormalizeEmail(teacherEmail) + "|s:"
}

func studentLinkPrefix(studentEmail string) string {
	return "homescool-by-student:s:" + auth.NormalizeEmail(studentEmail) + "|t:"
}

func (d *dynamoLinkStore) putJSON(ctx context.Context, sk string, value any) error {
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

func (d *dynamoLinkStore) getJSON(ctx context.Context, sk string, dest any) (bool, error) {
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

func (d *dynamoLinkStore) queryPrefix(ctx context.Context, skPrefix string) ([]Link, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :sk)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk": &types.AttributeValueMemberS{Value: "APP"},
			":sk": &types.AttributeValueMemberS{Value: skPrefix},
		},
	})
	if err != nil {
		return nil, err
	}
	links := make([]Link, 0, len(out.Items))
	for _, item := range out.Items {
		data, ok := item["data"].(*types.AttributeValueMemberS)
		if !ok || data.Value == "" {
			continue
		}
		var link Link
		if err := json.Unmarshal([]byte(data.Value), &link); err != nil {
			continue
		}
		links = append(links, cloneLink(link))
	}
	return links, nil
}

// Create inserts a durable pair or returns ErrDuplicate when it already exists.
func (d *dynamoLinkStore) Create(ctx context.Context, teacherEmail, studentEmail string) (Link, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	studentEmail = auth.NormalizeEmail(studentEmail)
	if teacherEmail == "" || studentEmail == "" {
		return Link{}, fmt.Errorf("teacher and student emails required")
	}
	if teacherEmail == studentEmail {
		return Link{}, fmt.Errorf("cannot register yourself as a student")
	}

	if existing, ok, err := d.GetByTeacherAndStudent(ctx, teacherEmail, studentEmail); err != nil {
		return Link{}, err
	} else if ok {
		return existing, ErrDuplicate
	}

	link := Link{
		ID:           uuid.NewString(),
		TeacherEmail: teacherEmail,
		StudentEmail: studentEmail,
		StudentSlug:  StudentSlug(studentEmail),
		S3Prefix:     RelationshipPrefix(teacherEmail, studentEmail),
		Folders:      append([]string(nil), FolderNames...),
		CreatedAt:    auth.NowRFC3339(),
	}
	if err := d.putJSON(ctx, teacherLinkSK(teacherEmail, studentEmail), link); err != nil {
		return Link{}, err
	}
	if err := d.putJSON(ctx, studentLinkSK(studentEmail, teacherEmail), link); err != nil {
		return Link{}, err
	}
	return cloneLink(link), nil
}

func (d *dynamoLinkStore) GetByTeacherAndStudent(ctx context.Context, teacherEmail, studentEmail string) (Link, bool, error) {
	var link Link
	ok, err := d.getJSON(ctx, teacherLinkSK(teacherEmail, studentEmail), &link)
	if err != nil || !ok {
		return Link{}, ok, err
	}
	return cloneLink(link), true, nil
}

func (d *dynamoLinkStore) GetByTeacherAndSlug(ctx context.Context, teacherEmail, studentSlug string) (Link, bool, error) {
	studentSlug = strings.Trim(strings.TrimSpace(studentSlug), "/")
	items, err := d.ListByTeacher(ctx, teacherEmail)
	if err != nil {
		return Link{}, false, err
	}
	for _, link := range items {
		if link.StudentSlug == studentSlug {
			return cloneLink(link), true, nil
		}
	}
	return Link{}, false, nil
}

func (d *dynamoLinkStore) ListByTeacher(ctx context.Context, teacherEmail string) ([]Link, error) {
	return d.queryPrefix(ctx, teacherLinkPrefix(teacherEmail))
}

func (d *dynamoLinkStore) ListByStudent(ctx context.Context, studentEmail string) ([]Link, error) {
	return d.queryPrefix(ctx, studentLinkPrefix(studentEmail))
}

func newDynamoLinkStore(ctx context.Context) (*dynamoLinkStore, error) {
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		return nil, err
	}
	prefix := httpx.Env("DYNAMODB_TABLE_PREFIX", "eduardoos")
	// Prefer catalog (generic KV already provisioned + IAM) over inventing a new table.
	table := httpx.Env("HOMESCOOL_TABLE", prefix+"_catalog")
	if table == "" {
		return nil, fmt.Errorf("HOMESCOOL_TABLE is empty")
	}
	return &dynamoLinkStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}
