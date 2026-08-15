package aps

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// Handler exposes /api/aps/* routes that require JWT + admin email.
type Handler struct {
	JWTSecret string
	Client    *Client
}

// Routes mounts APS admin routes. Callers should wrap with auth if desired;
// each handler also enforces JWT + IsAdminEmail for defense in depth.
func (h *Handler) Routes(r chi.Router) {
	r.Post("/api/aps/trigger-workitem", h.TriggerWorkItem)
	r.Get("/api/aps/workitems/{id}", h.GetWorkItem)
	r.Get("/api/aps/registry", h.Registry)
	r.Get("/api/aps/hubs", h.ListHubs)
	r.Get("/api/aps/hubs/{hubId}/projects", h.ListProjects)
	r.Get("/api/aps/projects/{projectId}/contents", h.ListContents)
}

func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) (email string, ok bool) {
	email, err := auth.EmailFromBearer(r.Header.Get("Authorization"), h.JWTSecret)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	if !IsAdminEmail(email) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return "", false
	}
	return email, true
}

func (h *Handler) ensureClient() error {
	if h.Client == nil {
		h.Client = NewClient(LoadConfig())
	}
	return h.Client.Cfg.Validate()
}

// TriggerWorkItem submits a Design Automation workitem.
// When APS credentials are missing it returns 503 with a clear message.
// Full S3 presign can be added later; this stub creates a minimal workitem
// payload using the configured activity id when creds are present.
func (h *Handler) TriggerWorkItem(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	var body struct {
		ActivityID string `json:"activityId,omitempty"`
	}
	raw, _ := io.ReadAll(r.Body)
	if len(strings.TrimSpace(string(raw))) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	activityID := strings.TrimSpace(body.ActivityID)
	if activityID == "" {
		activityID = h.Client.Cfg.ActivityID
	}
	// Minimal DA workitem; production adds S3 GET/PUT arguments. Stub keeps
	// the route callable so admin UI and tests can exercise auth + config gates.
	payload := map[string]any{
		"activityId": activityID,
		"arguments":  map[string]any{},
	}
	result, err := h.Client.CreateWorkItem(payload)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	id, _ := result["id"].(string)
	httpx.WriteJSON(w, http.StatusAccepted, map[string]any{
		"message":       "APS WorkItem submitted; poll GET /api/aps/workitems/{id}",
		"correlationId": cid,
		"workItemId":    id,
		"workItem":      result,
	})
}

func (h *Handler) GetWorkItem(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "work item id required")
		return
	}
	status, err := h.Client.GetWorkItemStatus(id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	st, _ := status["status"].(string)
	done := strings.EqualFold(st, "success") || strings.EqualFold(st, "failed") || strings.EqualFold(st, "cancelled")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"workItemId":     id,
		"status":         st,
		"done":           done,
		"workItemStatus": status,
	})
}

func (h *Handler) Registry(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	bundles, err := h.Client.ListAppBundles()
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "appbundles: "+err.Error())
		return
	}
	activities, err := h.Client.ListActivities()
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "activities: "+err.Error())
		return
	}
	engines, err := h.Client.ListEngines()
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "engines: "+err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"appbundles": bundles,
		"activities": activities,
		"engines":    engines,
	})
}

func (h *Handler) ListHubs(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	hubs, err := h.Client.ListHubs()
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, hubs)
}

func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	hubID := chi.URLParam(r, "hubId")
	projects, err := h.Client.ListProjects(hubID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, projects)
}

func (h *Handler) ListContents(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if err := h.ensureClient(); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	projectID := chi.URLParam(r, "projectId")
	folderID := strings.TrimSpace(r.URL.Query().Get("folderId"))
	if folderID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "folderId query required")
		return
	}
	contents, err := h.Client.ListFolderContents(projectID, folderID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, contents)
}
