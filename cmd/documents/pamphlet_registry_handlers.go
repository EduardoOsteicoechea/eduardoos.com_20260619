package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"
)

func (h pamphletHandlers) listRegistry() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := pamphletIDsFromRequest(r)
		sortBy := r.URL.Query().Get("sort")
		if sortBy == "" {
			sortBy = "alpha"
		}
		entries, err := h.registry.List(r.Context(), userID, sortBy)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		if entries == nil {
			entries = []pamphlet.RegistryEntry{}
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{"pamphlets": entries})
	}
}

func (h pamphletHandlers) getLayout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		if q := strings.TrimSpace(r.URL.Query().Get("pamphletId")); q != "" {
			pamphletID = q
		}
		layout, ok, err := h.registry.GetLayout(r.Context(), userID, pamphletID)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		if !ok {
			layout = pamphlet.DefaultLayoutFields()
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{"layout": layout, "pamphletId": pamphletID})
	}
}

func (h pamphletHandlers) saveLayout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, pamphletID := pamphletIDsFromRequest(r)
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Title  string                `json:"title"`
			Layout pamphlet.LayoutFields `json:"layout"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if err := h.registry.SaveLayout(r.Context(), userID, pamphletID, req.Title, req.Layout); err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		common.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
