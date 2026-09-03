package apikeys

import (
	"encoding/json"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

// Handler serves JWT key CRUD and exposes middleware for /api/v1/*.
type Handler struct {
	Keys         Store
	Users        auth.UserStore
	Entitlements *payments.Store
	Limiter      *RateLimiter
	auth         *auth.Handler
}

// NewHandler wires defaults (memory store; caller may replace Keys via OpenStore).
func NewHandler(jwtSecret string, users auth.UserStore, keys Store, ents *payments.Store) *Handler {
	if keys == nil {
		keys = NewMemoryStore()
	}
	return &Handler{
		Keys:         keys,
		Users:        users,
		Entitlements: ents,
		Limiter:      NewRateLimiter(DefaultRateLimit),
		auth:         &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts JWT-protected /api/apikeys CRUD.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireManageAccess)
		pr.Get("/api/apikeys", h.ListKeys)
		pr.Post("/api/apikeys", h.CreateKey)
		pr.Delete("/api/apikeys/{id}", h.RevokeKey)
	})
}

// MountV1 wraps /api/v1 product routes with API-key auth + rate limit.
// register is called with a router that already has RequireAPIKey + RateLimit.
func (h *Handler) MountV1(r chi.Router, register func(chi.Router)) {
	r.Group(func(vr chi.Router) {
		vr.Use(h.RequireAPIKey)
		vr.Use(h.RateLimitMiddleware)
		register(vr)
	})
}

func (h *Handler) requireManageAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		if h.isAdmin(r, email) {
			next.ServeHTTP(w, r)
			return
		}
		if h.Entitlements == nil {
			httpx.WriteError(w, http.StatusForbidden, "api subscription required")
			return
		}
		if !payments.HasServiceAccess(false, h.Entitlements.ListEntitlements(email), "api") {
			httpx.WriteError(w, http.StatusForbidden, "api subscription required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ListKeys returns metadata for the caller's keys (no secrets).
func (h *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	recs, err := h.Keys.ListByOwner(r.Context(), email)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not list api keys")
		return
	}
	out := make([]PublicView, 0, len(recs))
	for _, rec := range recs {
		out = append(out, rec.ToPublic())
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"keys": out})
}

// CreateKey issues a new secret (returned once) with a required label.
func (h *Handler) CreateKey(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	secret, err := GenerateSecret()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not generate api key")
		return
	}
	rec, err := NewRecord(email, body.Label, secret)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.Keys.Create(r.Context(), rec); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save api key")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"key":    secret,
		"record": rec.ToPublic(),
	})
}

// RevokeKey soft-revokes a key owned by the caller.
func (h *Handler) RevokeKey(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	rec, ok, err := h.Keys.Revoke(r.Context(), email, id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not revoke api key")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "api key not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"record": rec.ToPublic()})
}
