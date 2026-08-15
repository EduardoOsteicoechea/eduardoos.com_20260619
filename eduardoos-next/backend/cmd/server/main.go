package main

import (
	"context"
	"log"
	"net/http"

	"eduardoos.nex/internal/aps"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/content"
	"eduardoos.nex/internal/health"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// main boots the Eduardo OS Next monolith on ADDR (default :3001).
// Store backends are selected via DATABASE_BACKEND / EPAMS_BACKEND / IFCBIM_BACKEND
// (memory default). DynamoDB mode falls back to memory when AWS creds are missing.
func main() {
	ctx := context.Background()
	addr := httpx.Env("ADDR", ":3001")
	jwtSecret := httpx.Env("JWT_SECRET", "dev-jwt-secret")

	userStore := auth.OpenUserStore(ctx)
	epamStore := content.OpenEpamStore(ctx)
	bimStore := content.OpenBIMStore(ctx)

	authHandler := &auth.Handler{
		Store:     userStore,
		JWTSecret: jwtSecret,
	}
	contentHandler := content.NewHandler(jwtSecret, epamStore, bimStore)
	apsHandler := &aps.Handler{
		JWTSecret: jwtSecret,
		Client:    aps.NewClient(aps.LoadConfig()),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httpx.CorrelationMiddleware)

	r.Get("/health", health.Handler("eduardoos-next"))

	authHandler.Routes(r)
	contentHandler.Routes(r)
	apsHandler.Routes(r)

	log.Printf("eduardoos-next backend listening on %s (prod tree uses :3000)", addr)
	log.Printf("stores: auth=%s epams=%s ifcbim=%s", userStore.BackendName(), epamStore.BackendName(), bimStore.BackendName())
	log.Fatal(http.ListenAndServe(addr, r))
}
