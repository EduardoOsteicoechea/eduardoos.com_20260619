package ereport

import (
	"context"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Snapshot is one historical payload captured before an API overwrite (or restore).
type Snapshot struct {
	ID        string         `json:"id"`
	CreatedAt string         `json:"createdAt"`
	Source    string         `json:"source"` // "api" | "restore"
	KeyPrefix string         `json:"keyPrefix,omitempty"`
	Tema      string         `json:"tema"`
	Payload   map[string]any `json:"payload"`
}

// HistoryIndex lists snapshot metadata newest-first.
type HistoryIndex struct {
	Items []HistoryCard `json:"items"`
}

// HistoryCard is a lightweight history row (no full payload).
type HistoryCard struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt"`
	Source    string `json:"source"`
	KeyPrefix string `json:"keyPrefix,omitempty"`
	Tema      string `json:"tema"`
}

func (h *Handler) loadHistoryIndex(ctx context.Context, ownerEmail, reportID, cid string) (HistoryIndex, error) {
	var idx HistoryIndex
	ok, err := h.Objects.GetJSON(ctx, HistoryIndexKey(ownerEmail, reportID), &idx, cid)
	if err != nil {
		return HistoryIndex{}, err
	}
	if !ok || idx.Items == nil {
		idx.Items = []HistoryCard{}
	}
	return idx, nil
}

func (h *Handler) saveHistoryIndex(ctx context.Context, ownerEmail, reportID string, idx HistoryIndex, cid string) error {
	if idx.Items == nil {
		idx.Items = []HistoryCard{}
	}
	return h.Objects.PutJSON(ctx, HistoryIndexKey(ownerEmail, reportID), idx, cid)
}

// saveSnapshotBeforeReplace persists the current payload as history, prunes to MaxHistorySnapshots.
func (h *Handler) saveSnapshotBeforeReplace(
	ctx context.Context,
	ownerEmail, reportID, tema, source, keyPrefix string,
	payload map[string]any,
	cid string,
) (string, error) {
	if payload == nil {
		return "", nil
	}
	id := uuid.NewString()
	snap := Snapshot{
		ID:        id,
		CreatedAt: nowRFC3339(),
		Source:    source,
		KeyPrefix: keyPrefix,
		Tema:      tema,
		Payload:   payload,
	}
	if err := h.Objects.PutJSON(ctx, HistorySnapshotKey(ownerEmail, reportID, id), snap, cid); err != nil {
		return "", err
	}
	idx, err := h.loadHistoryIndex(ctx, ownerEmail, reportID, cid)
	if err != nil {
		return "", err
	}
	idx.Items = append([]HistoryCard{{
		ID:        snap.ID,
		CreatedAt: snap.CreatedAt,
		Source:    snap.Source,
		KeyPrefix: snap.KeyPrefix,
		Tema:      snap.Tema,
	}}, idx.Items...)
	// Prune oldest beyond retention.
	for len(idx.Items) > MaxHistorySnapshots {
		old := idx.Items[len(idx.Items)-1]
		idx.Items = idx.Items[:len(idx.Items)-1]
		_ = h.Objects.DeleteKey(ctx, HistorySnapshotKey(ownerEmail, reportID, old.ID), cid)
	}
	if err := h.saveHistoryIndex(ctx, ownerEmail, reportID, idx, cid); err != nil {
		return "", err
	}
	return id, nil
}

// ListHistory returns snapshot cards for the report owner/admin (JWT).
func (h *Handler) ListHistory(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	meta, _, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	idx, err := h.loadHistoryIndex(r.Context(), meta.OwnerEmail, reportID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load history")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": idx.Items})
}

// GetHistorySnapshot returns one full snapshot (JWT owner/admin).
func (h *Handler) GetHistorySnapshot(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	snapshotID := chi.URLParam(r, "snapshotId")
	meta, _, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var snap Snapshot
	ok, err := h.Objects.GetJSON(r.Context(), HistorySnapshotKey(meta.OwnerEmail, reportID, snapshotID), &snap, cid)
	if err != nil || !ok || snap.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "snapshot not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"snapshot": snap})
}

// RestoreHistorySnapshot writes a snapshot payload back as current (JWT owner/admin).
// Snapshots the live version first with source=restore.
func (h *Handler) RestoreHistorySnapshot(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	ownerSafe := chi.URLParam(r, "ownerSafe")
	reportID := chi.URLParam(r, "reportId")
	snapshotID := chi.URLParam(r, "snapshotId")
	meta, current, err := h.loadReportBySafe(r, ownerSafe, reportID, cid)
	if err != nil || meta.ID == "" {
		httpx.WriteError(w, http.StatusNotFound, "report not found")
		return
	}
	if !h.isOwner(r, meta, caller) {
		httpx.WriteError(w, http.StatusForbidden, "not allowed")
		return
	}
	var snap Snapshot
	ok, err := h.Objects.GetJSON(r.Context(), HistorySnapshotKey(meta.OwnerEmail, reportID, snapshotID), &snap, cid)
	if err != nil || !ok || snap.Payload == nil {
		httpx.WriteError(w, http.StatusNotFound, "snapshot not found")
		return
	}
	if current != nil {
		_, _ = h.saveSnapshotBeforeReplace(r.Context(), meta.OwnerEmail, reportID, meta.Tema, "restore", "", current, cid)
	}
	payload := snap.Payload
	now := nowRFC3339()
	if n, ok := payload["reportNumber"].(string); ok {
		meta.ReportNumber = n
	}
	if d, ok := payload["reportDate"].(string); ok {
		meta.ReportDate = d
	}
	if strings.TrimSpace(snap.Tema) != "" {
		meta.Tema = snap.Tema
	}
	meta.UpdatedAt = now
	if err := h.Objects.PutJSON(r.Context(), MetaKey(meta.OwnerEmail, reportID), meta, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save meta")
		return
	}
	if err := h.Objects.PutJSON(r.Context(), ReportKey(meta.OwnerEmail, reportID), payload, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save report")
		return
	}
	lib, _ := h.loadLibrary(r, meta.OwnerEmail, cid)
	for i := range lib.Reports {
		if lib.Reports[i].ID == reportID {
			lib.Reports[i].Tema = meta.Tema
			lib.Reports[i].ReportNumber = meta.ReportNumber
			lib.Reports[i].UpdatedAt = now
		}
	}
	_ = h.saveLibrary(r, meta.OwnerEmail, lib, cid)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meta": meta, "payload": payload})
}
