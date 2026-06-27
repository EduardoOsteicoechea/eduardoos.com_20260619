package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

// playlistHandlers groups playlist routes with a DynamoDB-backed store.
type playlistHandlers struct {
	cfg   config
	store ddb.PlaylistStore
}

func newPlaylistHandlers(cfg config, store ddb.PlaylistStore) playlistHandlers {
	return playlistHandlers{cfg: cfg, store: store}
}

type savePlaylistRequest struct {
	PlaylistID string   `json:"playlistId"`
	Name       string   `json:"name"`
	TrackIDs   []string `json:"trackIds"`
}

// savePlaylist handles POST /api/playlists — upserts a playlist for the JWT subject.
func (h playlistHandlers) savePlaylist() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.save", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			log.Printf("[correlation=%s] playlists.save auth failed: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.save", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		body, _ := io.ReadAll(r.Body)
		var req savePlaylistRequest
		if err := json.Unmarshal(body, &req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			common.WriteError(w, http.StatusBadRequest, "name required")
			return
		}
		if req.TrackIDs == nil {
			req.TrackIDs = []string{}
		}

		saved, err := h.store.SavePlaylist(r.Context(), ddb.Playlist{
			UserID:     email,
			PlaylistID: strings.TrimSpace(req.PlaylistID),
			Name:       req.Name,
			TrackIDs:   req.TrackIDs,
		}, cid)
		if err != nil {
			log.Printf("[correlation=%s] playlists.save store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.save", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not save playlist")
			return
		}

		log.Printf("[correlation=%s] playlists.save user=%s playlist=%s tracks=%d", cid, email, saved.PlaylistID, len(saved.TrackIDs))
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.save", "success"), cid)
		common.WriteJSON(w, http.StatusOK, saved)
	}
}

// listPlaylists handles GET /api/playlists — returns all playlists for the JWT subject.
func (h playlistHandlers) listPlaylists() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.list", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			log.Printf("[correlation=%s] playlists.list auth failed: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.list", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		playlists, err := h.store.GetPlaylistsByUserID(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] playlists.list store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.list", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not load playlists")
			return
		}
		if playlists == nil {
			playlists = []ddb.Playlist{}
		}

		log.Printf("[correlation=%s] playlists.list user=%s count=%d", cid, email, len(playlists))
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "playlists.list", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"count":     len(playlists),
			"playlists": playlists,
		})
	}
}

// registerPlaylistRoutes mounts authenticated playlist endpoints on the gateway router.
func registerPlaylistRoutes(r chi.Router, cfg config, store ddb.PlaylistStore) {
	h := newPlaylistHandlers(cfg, store)
	r.Post("/api/playlists", h.savePlaylist())
	r.Get("/api/playlists", h.listPlaylists())
}
