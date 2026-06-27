package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"

	"github.com/go-chi/chi/v5"
)

// pamphletHandlers serves pamphlet layout routes on the documents microservice.
type pamphletHandlers struct {
	store    pamphlet.DocumentStore
	registry pamphlet.RegistryStore
}

func newPamphletHandlers(store pamphlet.DocumentStore, registry pamphlet.RegistryStore) pamphletHandlers {
	return pamphletHandlers{store: store, registry: registry}
}

func (h pamphletHandlers) getDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		doc, err := h.store.Get(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, doc)
	}
}

func (h pamphletHandlers) putDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		body, _ := io.ReadAll(r.Body)
		var doc pamphlet.Document
		if err := json.Unmarshal(body, &doc); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid document json")
			return
		}
		if err := h.store.Put(r.Context(), userID, pamphletID, doc); err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (h pamphletHandlers) resetDocument() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		doc, err := h.store.Reset(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		cfg := pamphlet.LayoutConfigFromQuery(r.URL.Query())
		body, _ := io.ReadAll(r.Body)
		if len(body) > 0 {
			var req struct {
				Layout map[string]any `json:"layout"`
			}
			if err := json.Unmarshal(body, &req); err == nil && req.Layout != nil {
				cfg = layoutFromMap(req.Layout)
			}
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"status":   "ok",
			"document": doc,
			"html":     pamphlet.RenderPreviewSheets(cfg, doc),
			"capacity": pamphlet.ComputeCapacityTelemetry(cfg, doc),
		})
	}
}

func (h pamphletHandlers) previewSheets() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		doc, err := h.store.Get(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		cfg := pamphlet.LayoutConfigFromQuery(r.URL.Query())
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(pamphlet.RenderPreviewSheets(cfg, doc)))
	}
}

func (h pamphletHandlers) capacity() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		doc, err := h.store.Get(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		cfg := pamphlet.LayoutConfigFromQuery(r.URL.Query())
		common.WriteJSON(w, http.StatusOK, pamphlet.ComputeCapacityTelemetry(cfg, doc))
	}
}

func (h pamphletHandlers) mutateContent() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		cid := common.CorrelationFromRequest(r)
		doc, err := h.store.Get(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		body, _ := io.ReadAll(r.Body)
		var req contentMutationRequest
		if err := json.Unmarshal(body, &req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		log.Printf("[correlation=%s] pamphlet.mutate user=%s id=%s op=%s ref=%s", cid, userID, pamphletID, req.Op, req.Ref)
		cfg := pamphlet.DefaultLayoutConfig()
		if req.Layout != nil {
			cfg = layoutFromMap(req.Layout)
		}
		updated, err := applyContentMutation(&doc, req)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.store.Put(r.Context(), userID, pamphletID, doc); err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"status":   "ok",
			"document": updated,
			"html":     pamphlet.RenderPreviewSheets(cfg, doc),
			"capacity": pamphlet.ComputeCapacityTelemetry(cfg, doc),
		})
	}
}

func registerPamphletRoutes(r chi.Router, secret string, store pamphlet.DocumentStore, registry pamphlet.RegistryStore) {
	h := newPamphletHandlers(store, registry)
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Get("/pamphlet/document", h.getDocument())
		r.Put("/pamphlet/document", h.putDocument())
		r.Post("/pamphlet/reset", h.resetDocument())
		r.Get("/pamphlet/preview-sheets", h.previewSheets())
		r.Get("/pamphlet/capacity", h.capacity())
		r.Post("/pamphlet/content", h.mutateContent())
		r.Get("/pamphlet/registry", h.listRegistry())
		r.Get("/pamphlet/layout", h.getLayout())
		r.Post("/pamphlet/layout", h.saveLayout())
	})
}

func pamphletIDsFromRequest(r *http.Request) (userID, pamphletID string) {
	userID = userIDFromRequest(r)
	pamphletID = strings.TrimSpace(r.Header.Get("X-Pamphlet-Id"))
	if pamphletID == "" {
		pamphletID = pamphlet.DefaultPamphletID
	}
	return userID, pamphletID
}

// userIDFromRequest reads X-Pamphlet-User set by the gateway from JWT email.
func userIDFromRequest(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get("X-Pamphlet-User")); v != "" {
		return v
	}
	return "anonymous"
}

type contentMutationRequest struct {
	Op        string         `json:"op"`
	Ref       string         `json:"ref"`
	Value     string         `json:"value"`
	Text      string         `json:"text"`
	Image     string         `json:"image"`
	Field     string         `json:"field"`
	Start     int            `json:"start"`
	End       int            `json:"end"`
	ItemIndex *int           `json:"item_index"`
	Layout    map[string]any `json:"layout"`
	Content   map[string]any `json:"content"`
}

func layoutFromMap(m map[string]any) pamphlet.LayoutConfig {
	q := url.Values{}
	for k, v := range m {
		q.Set(k, stringify(v))
	}
	return pamphlet.LayoutConfigFromQuery(q)
}

func stringify(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strings.TrimRight(strings.TrimRight(jsonNumber(t), "0"), ".")
	default:
		b, _ := json.Marshal(t)
		return strings.Trim(string(b), `"`)
	}
}

func jsonNumber(f float64) string {
	b, _ := json.Marshal(f)
	return string(b)
}
