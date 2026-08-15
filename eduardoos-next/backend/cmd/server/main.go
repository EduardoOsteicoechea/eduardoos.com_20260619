package main

import (
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
// Routes mirror production gateway surfaces for auth, content, and APS admin
// while staying isolated under eduardoos-next (never touches parent prod ports).
func main() {
	addr := httpx.Env("ADDR", ":3001")
	jwtSecret := httpx.Env("JWT_SECRET", "dev-jwt-secret")

	authHandler := &auth.Handler{
		Store:     auth.NewMemoryStore(),
		JWTSecret: jwtSecret,
	}
	contentHandler := content.NewHandler(jwtSecret)
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
	log.Fatal(http.ListenAndServe(addr, r))
}
