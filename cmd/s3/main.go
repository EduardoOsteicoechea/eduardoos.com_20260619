// S3 — media object storage (stub locally, AWS S3 on EC2).
package main

import (
	"context"
	"log"
	"net/http"

	"eduardoos/pkg/common"
	"eduardoos/pkg/s3store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	cfg := s3store.Config{
		Backend:     common.Env("S3_BACKEND", "stub"),
		Bucket:      common.Env("S3_BUCKET", "eduardoos20260607"),
		Prefix:      common.Env("S3_PREFIX", "media"),
		Region:      common.Env("AWS_REGION", "us-east-1"),
		StubDataDir: common.Env("S3_STUB_DATA_DIR", ""),
	}
	store, err := s3store.NewStore(ctx, cfg)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	srv := &s3store.Server{Store: store, Prefix: cfg.Prefix}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("s3", map[string]any{
		"backend": store.BackendName(),
		"bucket":  store.BucketName(),
	}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		srv.RegisterRoutes(r)
	})

	log.Printf("s3 listening on %s (backend=%s bucket=%s)", common.ListenAddr(), store.BackendName(), store.BucketName())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}
