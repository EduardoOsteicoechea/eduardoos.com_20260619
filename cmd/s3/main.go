// S3 — object storage with stub (local) or AWS S3 (EC2) backends.
package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/common"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type objectStore struct {
	backend string
	bucket  string
	prefix  string
	client  *s3.Client
}

func newStore(ctx context.Context) *objectStore {
	st := &objectStore{
		bucket: common.Env("S3_BUCKET", "eduardoos20260607"),
		prefix: common.Env("S3_PREFIX", "media"),
	}
	if common.Env("S3_BACKEND", "stub") == "aws" {
		region := common.Env("AWS_REGION", "us-east-1")
		cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
		if err != nil {
			log.Fatalf("aws config: %v", err)
		}
		st.backend = "aws"
		st.client = s3.NewFromConfig(cfg)
	} else {
		st.backend = "stub"
	}
	return st
}

func (o *objectStore) objectKey(key string) string {
	key = strings.TrimPrefix(key, "/")
	if o.prefix == "" {
		return key
	}
	return strings.TrimSuffix(o.prefix, "/") + "/" + key
}

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	store := newStore(ctx)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("s3", map[string]any{"backend": store.backend, "bucket": store.bucket}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/upload", func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				Key          string `json:"key"`
				ContentType  string `json:"content_type"`
				BodyBase64   string `json:"body_base64"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				common.WriteError(w, http.StatusBadRequest, "invalid body")
				return
			}
			objectKey := store.objectKey(body.Key)
			if store.backend == "aws" && body.BodyBase64 != "" {
				data, err := base64.StdEncoding.DecodeString(body.BodyBase64)
				if err != nil {
					common.WriteError(w, http.StatusBadRequest, "invalid base64")
					return
				}
				_, err = store.client.PutObject(r.Context(), &s3.PutObjectInput{
					Bucket:      &store.bucket,
					Key:         &objectKey,
					Body:        bytes.NewReader(data),
					ContentType: &body.ContentType,
				})
				if err != nil {
					common.WriteError(w, http.StatusBadGateway, err.Error())
					return
				}
			}
			common.WriteJSON(w, http.StatusOK, map[string]any{
				"bucket": store.bucket, "key": objectKey,
				"content_type": body.ContentType, "stored": true,
			})
		})
	})

	log.Printf("s3 listening on %s (backend=%s)", common.ListenAddr(), store.backend)
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}
