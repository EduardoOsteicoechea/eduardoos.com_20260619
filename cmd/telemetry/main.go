// Telemetry — flight log ingestion, DynamoDB persistence, live SSE, and analytics.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"eduardoos/pkg/common"
	"eduardoos/pkg/obsstore"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	store := obsstore.NewLogStore(ctx)
	backend := common.Env("TELEMETRY_BACKEND", "memory")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("telemetry", map[string]any{"backend": backend}))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/ingest", ingest(store))
		r.Get("/logs", listLogs(store))
		r.Get("/analytics", analytics(store))
		r.Get("/trace/{correlationID}", trace(store))
		r.Get("/stream", stream(store))
	})

	log.Printf("telemetry listening on %s (backend=%s)", common.ListenAddr(), backend)
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func ingest(store obsstore.LogStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var entry common.FlightLogEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid log")
			return
		}
		if entry.Timestamp.IsZero() {
			entry.Timestamp = common.NewFlightLog("", "", "", "").Timestamp
		}
		if err := store.Ingest(r.Context(), entry); err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, map[string]bool{"ingested": true})
	}
}

func parseQuery(r *http.Request) obsstore.LogQuery {
	q := obsstore.LogQuery{Limit: 500}
	q.Service = r.URL.Query().Get("service")
	q.Status = r.URL.Query().Get("status")
	q.CorrelationID = r.URL.Query().Get("correlation_id")
	q.Event = r.URL.Query().Get("event")
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			q.Limit = n
		}
	}
	return q
}

func listLogs(store obsstore.LogStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := store.List(r.Context(), parseQuery(r))
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, out)
	}
}

func analytics(store obsstore.LogStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		out, err := store.Analytics(r.Context())
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, out)
	}
}

func trace(store obsstore.LogStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "correlationID")
		out, err := store.Trace(r.Context(), id)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, out)
	}
}

func stream(store obsstore.LogStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		obsstore.StreamLogs(w, r, store)
	}
}
