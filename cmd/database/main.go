// Database — key-value storage with in-memory or DynamoDB backends.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"eduardoos/pkg/common"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type kvBackend interface {
	put(ctx context.Context, key string, value json.RawMessage) error
	get(ctx context.Context, key string) (json.RawMessage, bool, error)
	name() string
}

type memoryBackend struct {
	mu    sync.RWMutex
	store map[string]json.RawMessage
}

func (m *memoryBackend) put(_ context.Context, key string, value json.RawMessage) error {
	m.mu.Lock()
	m.store[key] = value
	m.mu.Unlock()
	return nil
}

func (m *memoryBackend) get(_ context.Context, key string) (json.RawMessage, bool, error) {
	m.mu.RLock()
	v, ok := m.store[key]
	m.mu.RUnlock()
	return v, ok, nil
}

func (m *memoryBackend) name() string { return "memory" }

type dynamoBackend struct {
	client *dynamodb.Client
	prefix string
}

func tableForKey(prefix, key string) string {
	suffix := "catalog"
	switch {
	case strings.HasPrefix(key, "user:"):
		suffix = "users"
	case strings.HasPrefix(key, "post:"):
		suffix = "posts"
	case strings.HasPrefix(key, "refresh:"):
		suffix = "refresh_tokens"
	}
	return prefix + "_" + suffix
}

func (d *dynamoBackend) put(ctx context.Context, key string, value json.RawMessage) error {
	table := tableForKey(d.prefix, key)
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(table),
		Item: map[string]types.AttributeValue{
			"PK":   &types.AttributeValueMemberS{Value: "APP"},
			"SK":   &types.AttributeValueMemberS{Value: key},
			"data": &types.AttributeValueMemberS{Value: string(value)},
		},
	})
	return err
}

func (d *dynamoBackend) get(ctx context.Context, key string) (json.RawMessage, bool, error) {
	table := tableForKey(d.prefix, key)
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "APP"},
			"SK": &types.AttributeValueMemberS{Value: key},
		},
	})
	if err != nil || out.Item == nil {
		return nil, false, err
	}
	if data, ok := out.Item["data"].(*types.AttributeValueMemberS); ok {
		return json.RawMessage(data.Value), true, nil
	}
	return nil, false, nil
}

func (d *dynamoBackend) name() string { return "dynamodb" }

func newBackend(ctx context.Context) kvBackend {
	mode := common.Env("DATABASE_BACKEND", "memory")
	if mode != "dynamodb" {
		return &memoryBackend{store: map[string]json.RawMessage{}}
	}
	region := common.Env("AWS_REGION", "us-east-1")
	prefix := common.Env("DYNAMODB_TABLE_PREFIX", "eduardoos")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	return &dynamoBackend{client: dynamodb.NewFromConfig(cfg), prefix: prefix}
}

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	backend := newBackend(ctx)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("database", map[string]any{"backend": backend.name()}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/put", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Key   string          `json:"key"`
				Value json.RawMessage `json:"value"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				common.WriteError(w, http.StatusBadRequest, "invalid body")
				return
			}
			if err := backend.put(r.Context(), body.Key, body.Value); err != nil {
				common.WriteError(w, http.StatusBadGateway, err.Error())
				return
			}
			common.WriteJSON(w, http.StatusOK, map[string]string{"stored": body.Key})
		})
		r.Post("/get", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Key string `json:"key"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				common.WriteError(w, http.StatusBadRequest, "key required")
				return
			}
			val, ok, err := backend.get(r.Context(), body.Key)
			if err != nil {
				common.WriteError(w, http.StatusBadGateway, err.Error())
				return
			}
			var parsed any
			if ok {
				_ = json.Unmarshal(val, &parsed)
			}
			common.WriteJSON(w, http.StatusOK, map[string]any{"key": body.Key, "value": parsed})
		})
	})

	log.Printf("database listening on %s (backend=%s)", common.ListenAddr(), backend.name())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}
