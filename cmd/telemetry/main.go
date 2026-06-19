// Telemetry — flight log ingestion, analytics, and distributed trace queries.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type logQuery struct {
	Service        string
	Status         string
	CorrelationID  string
	Event          string
	Limit          int
}

type logAnalytics struct {
	Total               int                        `json:"total"`
	UniqueCorrelations  int                        `json:"uniqueCorrelations"`
	ByService           map[string]int             `json:"byService"`
	ByStatus            map[string]int             `json:"byStatus"`
	ByEvent             map[string]int             `json:"byEvent"`
	ErrorRatePercent    float64                    `json:"errorRatePercent"`
	RecentErrors        []common.FlightLogEntry    `json:"recentErrors"`
}

type store struct {
	mu   sync.RWMutex
	logs []common.FlightLogEntry
}

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	st := &store{logs: []common.FlightLogEntry{}}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("telemetry", nil))
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/ingest", st.ingest)
		r.Get("/logs", st.listLogs)
		r.Get("/analytics", st.analytics)
		r.Get("/trace/{correlationID}", st.trace)
	})

	log.Printf("telemetry listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func (s *store) ingest(w http.ResponseWriter, r *http.Request) {
	var entry common.FlightLogEntry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid log")
		return
	}
	s.mu.Lock()
	s.logs = append(s.logs, entry)
	s.mu.Unlock()
	common.WriteJSON(w, http.StatusOK, map[string]bool{"ingested": true})
}

func parseQuery(r *http.Request) logQuery {
	q := logQuery{Limit: 500}
	q.Service = r.URL.Query().Get("service")
	q.Status = r.URL.Query().Get("status")
	q.CorrelationID = r.URL.Query().Get("correlation_id")
	q.Event = r.URL.Query().Get("event")
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			q.Limit = n
		}
	}
	if q.Limit > 2000 {
		q.Limit = 2000
	}
	return q
}

func (q logQuery) matches(e common.FlightLogEntry) bool {
	if q.Service != "" && !strings.EqualFold(e.Service, q.Service) {
		return false
	}
	if q.Status != "" && !strings.EqualFold(e.Status, q.Status) {
		return false
	}
	if q.CorrelationID != "" && !strings.Contains(e.CorrelationID, q.CorrelationID) {
		return false
	}
	if q.Event != "" && !strings.Contains(strings.ToLower(e.Event), strings.ToLower(q.Event)) {
		return false
	}
	return true
}

func (s *store) listLogs(w http.ResponseWriter, r *http.Request) {
	q := parseQuery(r)
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []common.FlightLogEntry
	for i := len(s.logs) - 1; i >= 0; i-- {
		if q.matches(s.logs[i]) {
			out = append(out, s.logs[i])
			if len(out) >= q.Limit {
				break
			}
		}
	}
	common.WriteJSON(w, http.StatusOK, out)
}

func (s *store) analytics(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	byService := map[string]int{}
	byStatus := map[string]int{}
	byEvent := map[string]int{}
	corrs := map[string]struct{}{}
	errors := 0
	var recent []common.FlightLogEntry
	for _, e := range s.logs {
		byService[e.Service]++
		byStatus[e.Status]++
		byEvent[e.Event]++
		corrs[e.CorrelationID] = struct{}{}
		if strings.EqualFold(e.Status, "error") {
			errors++
			if len(recent) < 10 {
				recent = append(recent, e)
			}
		}
	}
	total := len(s.logs)
	rate := 0.0
	if total > 0 {
		rate = float64(errors) / float64(total) * 100
	}
	common.WriteJSON(w, http.StatusOK, logAnalytics{
		Total: total, UniqueCorrelations: len(corrs),
		ByService: byService, ByStatus: byStatus, ByEvent: byEvent,
		ErrorRatePercent: rate, RecentErrors: recent,
	})
}

func (s *store) trace(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "correlationID")
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []common.FlightLogEntry
	for _, e := range s.logs {
		if e.CorrelationID == id {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	common.WriteJSON(w, http.StatusOK, out)
}
