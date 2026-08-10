package gateway

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"eduardoos/pkg/common"
	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/s3store"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type epamHandlers struct {
	cfg   config
	store ddb.EpamStore
}

func newEpamHandlers(cfg config, store ddb.EpamStore) epamHandlers {
	return epamHandlers{cfg: cfg, store: store}
}

type saveEpamRequest struct {
	EpamID   string          `json:"epamId"`
	FileName string          `json:"fileName"`
	Document json.RawMessage `json:"document"`
}

type pamphletHeaderLite struct {
	Title         string `json:"title"`
	Series        string `json:"series"`
	SeriesChapter string `json:"series_chapter"`
	Author        string `json:"author"`
	Date          string `json:"date"`
}

type pamphletDocLite struct {
	Type   string             `json:"type"`
	ID     string             `json:"id"`
	Header pamphletHeaderLite `json:"header"`
}

func (h epamHandlers) listEpams() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.list", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.list", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		records, err := h.store.ListEpamsByUserID(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] epams.list store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.list", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeStoreError(err, "could not load epams"))
			return
		}
		if records == nil {
			records = []ddb.EpamRecord{}
		}

		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.list", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"count": len(records),
			"epams": records,
		})
	}
}

func (h epamHandlers) getEpam() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.get", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.get", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		epamID := strings.TrimSpace(chi.URLParam(r, "epamId"))
		if epamID == "" {
			common.WriteError(w, http.StatusBadRequest, "epamId required")
			return
		}

		rec, ok, err := h.store.GetEpam(r.Context(), email, epamID, cid)
		if err != nil {
			log.Printf("[correlation=%s] epams.get store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.get", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not load epam")
			return
		}
		if !ok {
			common.WriteError(w, http.StatusNotFound, "epam not found")
			return
		}

		body, err := h.cfg.fetchAbsoluteObject(r, cid, rec.S3Key)
		if err != nil {
			log.Printf("[correlation=%s] epams.get s3 error key=%s: %v", cid, rec.S3Key, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.get", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not load epam body")
			return
		}

		var document json.RawMessage
		if err := json.Unmarshal(body, &document); err != nil {
			common.WriteError(w, http.StatusInternalServerError, "stored epam is not valid JSON")
			return
		}

		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.get", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"meta":     rec,
			"document": document,
		})
	}
}

func (h epamHandlers) saveEpam() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.save", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.save", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		body, _ := io.ReadAll(r.Body)
		var req saveEpamRequest
		if err := json.Unmarshal(body, &req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if len(req.Document) == 0 {
			common.WriteError(w, http.StatusBadRequest, "document required")
			return
		}

		var lite pamphletDocLite
		if err := json.Unmarshal(req.Document, &lite); err != nil {
			common.WriteError(w, http.StatusBadRequest, "document must be JSON object")
			return
		}
		if lite.Type != "pamphlet_single_sheet" {
			common.WriteError(w, http.StatusBadRequest, "document.type must be pamphlet_single_sheet")
			return
		}

		epamID := strings.TrimSpace(req.EpamID)
		if epamID == "" {
			epamID = strings.TrimSpace(lite.ID)
		}
		if existingID := strings.TrimSpace(chi.URLParam(r, "epamId")); existingID != "" {
			epamID = existingID
		}

		fileName := strings.TrimSpace(req.FileName)
		if fileName == "" {
			series := strings.TrimSpace(lite.Header.Series)
			if series == "" {
				series = "pamphlet"
			}
			chapter := strings.TrimSpace(lite.Header.SeriesChapter)
			if chapter == "" {
				chapter = "1"
			}
			fileName = series + "_ch" + chapter + ".epam"
		}
		if !strings.HasSuffix(strings.ToLower(fileName), ".epam") {
			fileName += ".epam"
		}

		// Ensure document carries stable id before upload.
		var docMap map[string]any
		if err := json.Unmarshal(req.Document, &docMap); err != nil {
			common.WriteError(w, http.StatusBadRequest, "document must be JSON object")
			return
		}
		if epamID == "" {
			epamID = uuid.NewString()
		}
		docMap["id"] = epamID
		docMap["ownerUserId"] = email
		normalized, err := json.Marshal(docMap)
		if err != nil {
			common.WriteError(w, http.StatusInternalServerError, "could not normalize document")
			return
		}

		createdAt := ""
		if existing, ok, getErr := h.store.GetEpam(r.Context(), email, epamID, cid); getErr == nil && ok {
			createdAt = existing.CreatedAt
		}

		s3Key := ddb.EpamObjectKey(email, epamID)
		if err := h.cfg.proxyAbsoluteUpload(r, cid, s3Key, filepath.Base(fileName), normalized); err != nil {
			log.Printf("[correlation=%s] epams.save s3 error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.save", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, humanizeProxyError(err))
			return
		}

		saved, err := h.store.SaveEpam(r.Context(), ddb.EpamRecord{
			UserID:           email,
			EpamID:           epamID,
			FileName:         fileName,
			Title:            strings.TrimSpace(lite.Header.Title),
			Series:           strings.TrimSpace(lite.Header.Series),
			SeriesChapter:    strings.TrimSpace(lite.Header.SeriesChapter),
			Author:           strings.TrimSpace(lite.Header.Author),
			Date:             strings.TrimSpace(lite.Header.Date),
			S3Key:            s3Key,
			ContentSizeBytes: int64(len(normalized)),
			CreatedAt:        createdAt,
		}, cid)
		if err != nil {
			log.Printf("[correlation=%s] epams.save store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.save", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeStoreError(err, "could not save epam metadata"))
			return
		}

		log.Printf("[correlation=%s] epams.save user=%s epam=%s bytes=%d", cid, email, saved.EpamID, saved.ContentSizeBytes)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.save", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"meta":     saved,
			"document": json.RawMessage(normalized),
		})
	}
}

func (h epamHandlers) deleteEpam() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.delete", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.delete", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		epamID := strings.TrimSpace(chi.URLParam(r, "epamId"))
		if epamID == "" {
			common.WriteError(w, http.StatusBadRequest, "epamId required")
			return
		}

		rec, ok, err := h.store.GetEpam(r.Context(), email, epamID, cid)
		if err != nil {
			common.WriteError(w, http.StatusInternalServerError, "could not load epam")
			return
		}
		if !ok {
			common.WriteError(w, http.StatusNotFound, "epam not found")
			return
		}

		if err := h.store.DeleteEpam(r.Context(), email, epamID, cid); err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.delete", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not delete epam")
			return
		}

		_ = rec // S3 object may remain; delete-object can be added later via s3 service.
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "epams.delete", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "epamId": epamID})
	}
}

func registerEpamRoutes(r chi.Router, cfg config, store ddb.EpamStore) {
	h := newEpamHandlers(cfg, store)
	r.Get("/api/epams", h.listEpams())
	r.Post("/api/epams", h.saveEpam())
	r.Get("/api/epams/{epamId}", h.getEpam())
	r.Put("/api/epams/{epamId}", h.saveEpam())
	r.Delete("/api/epams/{epamId}", h.deleteEpam())
}

func humanizeProxyError(err error) string {
	raw := strings.TrimSpace(err.Error())
	var payload struct {
		Message string `json:"message"`
	}
	if json.Unmarshal([]byte(raw), &payload) == nil && strings.TrimSpace(payload.Message) != "" {
		raw = payload.Message
	}
	return s3store.HumanizeAccessError(raw)
}

func humanizeStoreError(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "resourcenotfoundexception") || strings.Contains(lower, "requested resource not found") {
		return "DynamoDB table eduardoos_epams not found — create it with deploy/aws/create-epams-table.sh and attach IAM access"
	}
	if msg == "" {
		return fallback
	}
	return msg
}

func (c config) fetchAbsoluteObject(r *http.Request, cid, objectKey string) ([]byte, error) {
	target := strings.TrimRight(c.S3URL, "/") + "/absolute/" + s3store.EncodeRelativePath(objectKey)
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, proxyStatusError{status: resp.StatusCode, body: string(out)}
	}
	return out, nil
}
