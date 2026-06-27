package dynamodb

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type pamphletDynamoStore struct {
	client       *dynamodb.Client
	headersTable string
	footersTable string
	contentsTable string
}

// NewPamphletDocumentStore selects memory or DynamoDB pamphlet persistence.
func NewPamphletDocumentStore(ctx context.Context) (pamphlet.DocumentStore, error) {
	mode := common.Env("PAMPHLETS_BACKEND", "memory")
	if mode != "dynamodb" {
		return pamphlet.NewMemoryStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &pamphletDynamoStore{
		client:        dynamodb.NewFromConfig(cfg),
		headersTable:  common.Env("PAMPHLET_HEADERS_TABLE", "eduardoos_pamphlet_headers"),
		footersTable:  common.Env("PAMPHLET_FOOTERS_TABLE", "eduardoos_pamphlet_footers"),
		contentsTable: common.Env("PAMPHLET_CONTENTS_TABLE", "eduardoos_pamphlet_contents"),
	}, nil
}

func (d *pamphletDynamoStore) BackendName() string { return "dynamodb" }

func (d *pamphletDynamoStore) keys(userID, pamphletID string) (string, string, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return "", "", fmt.Errorf("user id required")
	}
	pamphletID = strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = pamphlet.DefaultPamphletID
	}
	return userID, pamphletID, nil
}

func (d *pamphletDynamoStore) Get(ctx context.Context, userID, pamphletID string) (pamphlet.Document, error) {
	userID, pamphletID, err := d.keys(userID, pamphletID)
	if err != nil {
		return pamphlet.Document{}, err
	}
	header, hasHeader, err := d.getHeader(ctx, userID, pamphletID)
	if err != nil {
		return pamphlet.Document{}, err
	}
	footer, hasFooter, err := d.getFooter(ctx, userID, pamphletID)
	if err != nil {
		return pamphlet.Document{}, err
	}
	content, hasContent, err := d.getContent(ctx, userID, pamphletID)
	if err != nil {
		return pamphlet.Document{}, err
	}
	if hasHeader && hasFooter && hasContent {
		return pamphlet.Document{Header: header, Footer: footer, Content: content}, nil
	}
	doc := pamphlet.DefaultDocument()
	if err := d.Put(ctx, userID, pamphletID, doc); err != nil {
		return pamphlet.Document{}, err
	}
	log.Printf("pamphlet dynamodb seeded defaults user=%s pamphlet=%s", userID, pamphletID)
	return doc, nil
}

func (d *pamphletDynamoStore) Put(ctx context.Context, userID, pamphletID string, doc pamphlet.Document) error {
	userID, pamphletID, err := d.keys(userID, pamphletID)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := d.putHeader(ctx, userID, pamphletID, doc.Header, now); err != nil {
		return err
	}
	if err := d.putFooter(ctx, userID, pamphletID, doc.Footer, now); err != nil {
		return err
	}
	return d.putContent(ctx, userID, pamphletID, doc.Content, now)
}

func (d *pamphletDynamoStore) Reset(ctx context.Context, userID, pamphletID string) (pamphlet.Document, error) {
	doc := pamphlet.DefaultDocument()
	if err := d.Put(ctx, userID, pamphletID, doc); err != nil {
		return pamphlet.Document{}, err
	}
	return doc, nil
}

func (d *pamphletDynamoStore) getHeader(ctx context.Context, userID, pamphletID string) (pamphlet.HeaderPayload, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.headersTable),
		Key: map[string]types.AttributeValue{
			"userId":     &types.AttributeValueMemberS{Value: userID},
			"pamphletId": &types.AttributeValueMemberS{Value: pamphletID},
		},
	})
	if err != nil {
		return pamphlet.HeaderPayload{}, false, err
	}
	if out.Item == nil {
		return pamphlet.HeaderPayload{}, false, nil
	}
	return headerFromItem(out.Item)
}

func (d *pamphletDynamoStore) getFooter(ctx context.Context, userID, pamphletID string) (pamphlet.FooterPayload, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.footersTable),
		Key: map[string]types.AttributeValue{
			"userId":     &types.AttributeValueMemberS{Value: userID},
			"pamphletId": &types.AttributeValueMemberS{Value: pamphletID},
		},
	})
	if err != nil {
		return pamphlet.FooterPayload{}, false, err
	}
	if out.Item == nil {
		return pamphlet.FooterPayload{}, false, nil
	}
	return footerFromItem(out.Item)
}

func (d *pamphletDynamoStore) getContent(ctx context.Context, userID, pamphletID string) (pamphlet.ContentPayload, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.contentsTable),
		Key: map[string]types.AttributeValue{
			"userId":     &types.AttributeValueMemberS{Value: userID},
			"pamphletId": &types.AttributeValueMemberS{Value: pamphletID},
		},
	})
	if err != nil {
		return pamphlet.ContentPayload{}, false, err
	}
	if out.Item == nil {
		return pamphlet.ContentPayload{}, false, nil
	}
	return contentFromItem(out.Item)
}

func (d *pamphletDynamoStore) putHeader(ctx context.Context, userID, pamphletID string, header pamphlet.HeaderPayload, updatedAt string) error {
	item := map[string]types.AttributeValue{
		"userId":        &types.AttributeValueMemberS{Value: userID},
		"pamphletId":    &types.AttributeValueMemberS{Value: pamphletID},
		"heading":       &types.AttributeValueMemberS{Value: header.Heading},
		"subheading":    &types.AttributeValueMemberS{Value: header.Subheading},
		"author":        &types.AttributeValueMemberS{Value: header.Author},
		"date":          &types.AttributeValueMemberS{Value: header.Date},
		"image":         &types.AttributeValueMemberS{Value: header.Image},
		"category":      &types.AttributeValueMemberS{Value: header.Category},
		"text":          &types.AttributeValueMemberS{Value: header.Text},
		"createdAt":     &types.AttributeValueMemberS{Value: updatedAt},
		"updatedAt":     &types.AttributeValueMemberS{Value: updatedAt},
		"schemaVersion": &types.AttributeValueMemberN{Value: "1"},
	}
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.headersTable),
		Item:      item,
	})
	return err
}

func (d *pamphletDynamoStore) putFooter(ctx context.Context, userID, pamphletID string, footer pamphlet.FooterPayload, updatedAt string) error {
	contactsJSON, _ := json.Marshal(footer.ContactItems)
	addressJSON, _ := json.Marshal(footer.AddressData)
	item := map[string]types.AttributeValue{
		"userId":       &types.AttributeValueMemberS{Value: userID},
		"pamphletId":   &types.AttributeValueMemberS{Value: pamphletID},
		"heading":      &types.AttributeValueMemberS{Value: footer.Heading},
		"text":         &types.AttributeValueMemberS{Value: footer.Text},
		"contactItems": &types.AttributeValueMemberS{Value: string(contactsJSON)},
		"addressData":  &types.AttributeValueMemberS{Value: string(addressJSON)},
		"updatedAt":    &types.AttributeValueMemberS{Value: updatedAt},
		"schemaVersion": &types.AttributeValueMemberN{Value: "1"},
	}
	item["createdAt"] = &types.AttributeValueMemberS{Value: updatedAt}
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.footersTable),
		Item:      item,
	})
	return err
}

func (d *pamphletDynamoStore) putContent(ctx context.Context, userID, pamphletID string, content pamphlet.ContentPayload, updatedAt string) error {
	ideasJSON, err := json.Marshal(content.Ideas)
	if err != nil {
		return err
	}
	item := map[string]types.AttributeValue{
		"userId":        &types.AttributeValueMemberS{Value: userID},
		"pamphletId":    &types.AttributeValueMemberS{Value: pamphletID},
		"ideas":         &types.AttributeValueMemberS{Value: string(ideasJSON)},
		"ideaCount":     &types.AttributeValueMemberN{Value: fmt.Sprintf("%d", len(content.Ideas))},
		"updatedAt":     &types.AttributeValueMemberS{Value: updatedAt},
		"schemaVersion": &types.AttributeValueMemberN{Value: "1"},
	}
	item["createdAt"] = &types.AttributeValueMemberS{Value: updatedAt}
	_, err = d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.contentsTable),
		Item:      item,
	})
	return err
}

func headerFromItem(item map[string]types.AttributeValue) (pamphlet.HeaderPayload, bool, error) {
	h := pamphlet.HeaderPayload{
		Heading:    attrS(item, "heading"),
		Subheading: attrS(item, "subheading"),
		Author:     attrS(item, "author"),
		Date:       attrS(item, "date"),
		Image:      attrS(item, "image"),
		Category:   attrS(item, "category"),
		Text:       attrS(item, "text"),
	}
	return h, true, nil
}

func footerFromItem(item map[string]types.AttributeValue) (pamphlet.FooterPayload, bool, error) {
	f := pamphlet.FooterPayload{
		Heading: attrS(item, "heading"),
		Text:    attrS(item, "text"),
	}
	if raw := attrS(item, "contactItems"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &f.ContactItems)
	}
	if raw := attrS(item, "addressData"); raw != "" {
		_ = json.Unmarshal([]byte(raw), &f.AddressData)
	}
	return f, true, nil
}

func contentFromItem(item map[string]types.AttributeValue) (pamphlet.ContentPayload, bool, error) {
	c := pamphlet.ContentPayload{}
	raw := attrS(item, "ideas")
	if raw == "" {
		return c, true, nil
	}
	if err := json.Unmarshal([]byte(raw), &c.Ideas); err != nil {
		return pamphlet.ContentPayload{}, false, err
	}
	return c, true, nil
}

func attrS(item map[string]types.AttributeValue, key string) string {
	if v, ok := item[key].(*types.AttributeValueMemberS); ok {
		return v.Value
	}
	return ""
}
