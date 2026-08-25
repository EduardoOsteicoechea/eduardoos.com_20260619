// Package apswebhook receives public APS webhook POSTs and fans them out to
// admin-only list + SSE stream endpoints for the product-tests monitor UI.
package apswebhook

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxEvents = 100
const maxBodyBytes = 2 << 20 // 2 MiB

// Event is one ingested webhook payload shown on the admin monitor.
type Event struct {
	ID            string            `json:"id"`
	ReceivedAt    time.Time         `json:"receivedAt"`
	CorrelationID string            `json:"correlationId"`
	ContentType   string            `json:"contentType"`
	RemoteAddr    string            `json:"remoteAddr"`
	Method        string            `json:"method"`
	Path          string            `json:"path"`
	Query         string            `json:"query,omitempty"`
	Headers       map[string]string `json:"headers"`
	Body          json.RawMessage   `json:"body,omitempty"`
	BodyText      string            `json:"bodyText,omitempty"`
}

// Handler serves public ingest + admin list/stream.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	Secret    string // optional shared secret (APS_WEBHOOK_SECRET)
	auth      *auth.Handler

	mu     sync.Mutex
	events []Event
	subs   map[chan Event]struct{}
}

// NewHandler builds an APS webhook handler. secret may be empty (open ingest).
func NewHandler(jwtSecret string, users auth.UserStore, secret string) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Secret:    strings.TrimSpace(secret),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
		events:    make([]Event, 0, maxEvents),
		subs:      make(map[chan Event]struct{}),
	}
}

// Routes mounts public POST ingest and JWT+admin list/stream.
func (h *Handler) Routes(r chi.Router) {
	r.Post("/api/aps/webhooks", h.Ingest)
	r.Get("/api/aps/webhooks", h.IngestProbe)

	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Use(h.requireAdmin)
		r.Get("/api/admin/aps/webhook-events", h.List)
		r.Get("/api/admin/aps/webhook-events/stream", h.Stream)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
				role = u.Role
			}
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) checkSecret(r *http.Request) bool {
	if h.Secret == "" {
		return true
	}
	got := strings.TrimSpace(r.Header.Get("X-Aps-Webhook-Secret"))
	if got == "" {
		got = strings.TrimSpace(r.URL.Query().Get("secret"))
	}
	return got != "" && got == h.Secret
}

// IngestProbe lets operators verify the public URL (and optional secret) with GET.
func (h *Handler) IngestProbe(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] aps.webhook.probe method=GET remote=%s", cid, r.RemoteAddr)
	if !h.checkSecret(r) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid webhook secret")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "APS webhook ingest ready; POST JSON payloads to this path",
		"path":    "/api/aps/webhooks",
	})
}

// Ingest stores a webhook payload and notifies SSE subscribers.
func (h *Handler) Ingest(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	log.Printf("[correlation=%s] aps.webhook.ingest begin remote=%s contentLength=%d contentType=%q",
		cid, r.RemoteAddr, r.ContentLength, r.Header.Get("Content-Type"))

	if !h.checkSecret(r) {
		log.Printf("[correlation=%s] aps.webhook.ingest unauthorized secret", cid)
		httpx.WriteError(w, http.StatusUnauthorized, "invalid webhook secret")
		return
	}

	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
	if err != nil {
		log.Printf("[correlation=%s] aps.webhook.ingest read_failed err=%v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, "could not read body")
		return
	}
	if len(raw) > maxBodyBytes {
		log.Printf("[correlation=%s] aps.webhook.ingest body_too_large bytes=%d", cid, len(raw))
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "body too large")
		return
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		log.Printf("[correlation=%s] aps.webhook.ingest empty_body", cid)
		httpx.WriteError(w, http.StatusBadRequest, "body must be non-empty JSON")
		return
	}

	ev := Event{
		ID:            uuid.NewString(),
		ReceivedAt:    time.Now().UTC(),
		CorrelationID: cid,
		ContentType:   r.Header.Get("Content-Type"),
		RemoteAddr:    r.RemoteAddr,
		Method:        r.Method,
		Path:          r.URL.Path,
		Query:         r.URL.RawQuery,
		Headers:       selectHeaders(r),
	}
	if json.Valid(raw) {
		ev.Body = append(json.RawMessage(nil), raw...)
	} else {
		ev.BodyText = trimmed
	}

	h.push(ev)
	log.Printf("[correlation=%s] aps.webhook.ingest ok id=%s bodyBytes=%d subscribers=%d",
		cid, ev.ID, len(raw), h.subscriberCount())

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"id":            ev.ID,
		"correlationId": cid,
	})
}

// List returns recent events newest-first.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	items := h.snapshot()
	log.Printf("[correlation=%s] aps.webhook.list user=%s count=%d", cid, email, len(items))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"events": items,
		"count":  len(items),
	})
}

// Stream is an admin SSE feed of new events (plus an initial "ready" ping).
func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := h.subscribe()
	defer h.unsubscribe(ch)
	log.Printf("[correlation=%s] aps.webhook.stream open user=%s", cid, email)

	writeSSE(w, flusher, "ready", map[string]any{
		"ok":            true,
		"correlationId": cid,
	})

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			log.Printf("[correlation=%s] aps.webhook.stream close user=%s", cid, email)
			return
		case <-heartbeat.C:
			writeSSE(w, flusher, "ping", map[string]string{"t": time.Now().UTC().Format(time.RFC3339Nano)})
		case ev, open := <-ch:
			if !open {
				return
			}
			writeSSE(w, flusher, "event", ev)
		}
	}
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, event string, payload any) {
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_, _ = w.Write([]byte("event: " + event + "\n"))
	_, _ = w.Write([]byte("data: "))
	_, _ = w.Write(b)
	_, _ = w.Write([]byte("\n\n"))
	flusher.Flush()
}

func selectHeaders(r *http.Request) map[string]string {
	keys := []string{
		"Content-Type",
		"User-Agent",
		"X-Request-Id",
		"X-Adsk-Signature",
		"X-Adsk-Delivery-Id",
		"X-Adsk-Event-Type",
		"X-Correlation-ID",
	}
	out := make(map[string]string, len(keys))
	for _, k := range keys {
		if v := r.Header.Get(k); v != "" {
			out[k] = v
		}
	}
	return out
}

func (h *Handler) push(ev Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.events = append(h.events, ev)
	if len(h.events) > maxEvents {
		h.events = h.events[len(h.events)-maxEvents:]
	}
	for ch := range h.subs {
		select {
		case ch <- ev:
		default:
			// Slow subscriber: drop this event for them (list still has it).
		}
	}
}

func (h *Handler) snapshot() []Event {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := len(h.events)
	out := make([]Event, n)
	for i := 0; i < n; i++ {
		out[i] = h.events[n-1-i]
	}
	return out
}

func (h *Handler) subscribe() chan Event {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Handler) unsubscribe(ch chan Event) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
	close(ch)
}

func (h *Handler) subscriberCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.subs)
}

// SecretFromEnv reads APS_WEBHOOK_SECRET (may be empty).
func SecretFromEnv() string {
	return strings.TrimSpace(os.Getenv("APS_WEBHOOK_SECRET"))
}
