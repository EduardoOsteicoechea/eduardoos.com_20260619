package main

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"
)

type saveBundleRequest struct {
	Title    string                `json:"title"`
	Layout   pamphlet.LayoutFields `json:"layout"`
	Document pamphlet.Document     `json:"document"`
}

type saveBundleResponse struct {
	Status     string   `json:"status"`
	PamphletID string   `json:"pamphletId"`
	Logs       []string `json:"logs"`
	IdeaCount  int      `json:"ideaCount"`
	SubideaCount int    `json:"subideaCount"`
}

func (h pamphletHandlers) saveBundle() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		trace := pamphlet.NewSaveLog()
		cid := common.CorrelationFromRequest(r)
		userID, pamphletID := pamphletIDsFromRequest(r)
		if q := strings.TrimSpace(r.URL.Query().Get("pamphletId")); q != "" {
			pamphletID = q
		}
		trace.Line("1. save bundle request received correlation=%s user=%s pamphletId=%s", cid, userID, pamphletID)

		body, err := io.ReadAll(r.Body)
		if err != nil {
			trace.Line("2. ERROR failed reading request body: %v", err)
			common.WriteJSON(w, http.StatusBadRequest, saveBundleResponse{Status: "error", PamphletID: pamphletID, Logs: trace.Lines})
			return
		}
		trace.Line("2. request body read bytes=%d", len(body))

		var req saveBundleRequest
		if err := json.Unmarshal(body, &req); err != nil {
			trace.Line("3. ERROR invalid json body: %v", err)
			common.WriteJSON(w, http.StatusBadRequest, saveBundleResponse{Status: "error", PamphletID: pamphletID, Logs: trace.Lines})
			return
		}
		trace.Line("3. json decoded title=%q", strings.TrimSpace(req.Title))

		subideaCount := 0
		for _, idea := range req.Document.Content.Ideas {
			subideaCount += len(idea.Subideas)
		}
		trace.Line("4. payload summary ideas=%d subideas=%d heading=%q", len(req.Document.Content.Ideas), subideaCount, req.Document.Header.Heading)

		if strings.TrimSpace(userID) == "" || userID == "anonymous" {
			trace.Line("5. ERROR missing authenticated user id")
			common.WriteJSON(w, http.StatusUnauthorized, saveBundleResponse{Status: "error", PamphletID: pamphletID, Logs: trace.Lines})
			return
		}
		trace.Line("5. authenticated user confirmed")

		if err := h.store.Put(r.Context(), userID, pamphletID, req.Document); err != nil {
			trace.Line("6. ERROR document store put failed: %v", err)
			common.WriteJSON(w, http.StatusBadRequest, saveBundleResponse{Status: "error", PamphletID: pamphletID, Logs: trace.Lines})
			return
		}
		trace.Line("6. document persisted to store backend=%T", h.store)

		title := strings.TrimSpace(req.Title)
		if title == "" {
			title = pamphletID
		}
		trace.Line("7. saving registry layout title=%q", title)
		if err := h.registry.SaveLayout(r.Context(), userID, pamphletID, title, req.Layout); err != nil {
			trace.Line("8. ERROR registry SaveLayout failed: %v", err)
			common.WriteJSON(w, http.StatusBadGateway, saveBundleResponse{Status: "error", PamphletID: pamphletID, Logs: trace.Lines})
			return
		}
		trace.Line("8. registry layout saved")

		trace.Line("9. save bundle completed successfully")
		common.WriteJSON(w, http.StatusOK, saveBundleResponse{
			Status:       "ok",
			PamphletID:   pamphletID,
			Logs:         trace.Lines,
			IdeaCount:    len(req.Document.Content.Ideas),
			SubideaCount: subideaCount,
		})
	}
}
