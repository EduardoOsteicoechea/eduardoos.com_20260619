package gateway

import (
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

const ifcBimMaxUpload = 128 << 20

type bimHandlers struct {
	cfg   config
	store ddb.IfcBimStore
}

func newBimHandlers(cfg config, store ddb.IfcBimStore) bimHandlers {
	return bimHandlers{cfg: cfg, store: store}
}

func (h bimHandlers) listModels() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.list", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.list", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		records, err := h.store.ListModelsByUserID(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] bim.list store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.list", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeIfcBimStoreError(err))
			return
		}
		if records == nil {
			records = []ddb.IfcBimRecord{}
		}

		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.list", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"count":  len(records),
			"models": records,
		})
	}
}

func (h bimHandlers) getFile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.file", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.file", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		modelID := strings.TrimSpace(chi.URLParam(r, "modelId"))
		if modelID == "" {
			common.WriteError(w, http.StatusBadRequest, "modelId required")
			return
		}

		rec, ok, err := h.store.GetModel(r.Context(), email, modelID, cid)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.file", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not load model")
			return
		}
		if !ok {
			common.WriteError(w, http.StatusNotFound, "model not found")
			return
		}

		body, err := h.cfg.fetchAbsoluteObject(r, cid, rec.S3Key)
		if err != nil {
			log.Printf("[correlation=%s] bim.file s3 error key=%s: %v", cid, rec.S3Key, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.file", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "could not load IFC body")
			return
		}

		ct := rec.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Content-Disposition", common.ContentDispositionAttachment(rec.FileName))
		w.Header().Set(common.CorrelationHeader, cid)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.file", "success"), cid)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}

func (h bimHandlers) uploadModel() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.upload", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.upload", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		if err := r.ParseMultipartForm(ifcBimMaxUpload); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, "file required")
			return
		}
		defer file.Close()

		fileName := strings.TrimSpace(header.Filename)
		if fileName == "" {
			fileName = "model.ifc"
		}
		ext := strings.ToLower(filepath.Ext(fileName))
		if ext != ".ifc" && ext != ".ifczip" {
			common.WriteError(w, http.StatusBadRequest, "only .ifc or .ifczip files are accepted")
			return
		}

		data, err := io.ReadAll(io.LimitReader(file, ifcBimMaxUpload+1))
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, "could not read file")
			return
		}
		if len(data) == 0 {
			common.WriteError(w, http.StatusBadRequest, "empty file")
			return
		}
		if len(data) > ifcBimMaxUpload {
			common.WriteError(w, http.StatusRequestEntityTooLarge, "IFC exceeds 128 MiB")
			return
		}

		title := strings.TrimSpace(r.FormValue("title"))
		if title == "" {
			title = strings.TrimSuffix(fileName, filepath.Ext(fileName))
		}

		modelID := uuid.NewString()
		s3Key := ddb.IfcBimObjectKey(email, modelID)
		contentType := header.Header.Get("Content-Type")
		if contentType == "" || contentType == "application/octet-stream" {
			contentType = "application/x-step"
		}

		if err := h.cfg.proxyAbsoluteUpload(r, cid, s3Key, filepath.Base(fileName), data); err != nil {
			log.Printf("[correlation=%s] bim.upload s3 error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.upload", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, humanizeProxyError(err))
			return
		}

		saved, err := h.store.SaveModel(r.Context(), ddb.IfcBimRecord{
			UserID:           email,
			ModelID:          modelID,
			FileName:         fileName,
			Title:            title,
			S3Key:            s3Key,
			ContentType:      contentType,
			ContentSizeBytes: int64(len(data)),
		}, cid)
		if err != nil {
			log.Printf("[correlation=%s] bim.upload store error: %v", cid, err)
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.upload", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, humanizeIfcBimStoreError(err))
			return
		}

		log.Printf("[correlation=%s] bim.upload user=%s model=%s bytes=%d", cid, email, saved.ModelID, saved.ContentSizeBytes)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.upload", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"model": saved})
	}
}

func (h bimHandlers) deleteModel() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.delete", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.delete", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		modelID := strings.TrimSpace(chi.URLParam(r, "modelId"))
		if modelID == "" {
			common.WriteError(w, http.StatusBadRequest, "modelId required")
			return
		}

		_, ok, err := h.store.GetModel(r.Context(), email, modelID, cid)
		if err != nil {
			common.WriteError(w, http.StatusInternalServerError, "could not load model")
			return
		}
		if !ok {
			common.WriteError(w, http.StatusNotFound, "model not found")
			return
		}

		if err := h.store.DeleteModel(r.Context(), email, modelID, cid); err != nil {
			h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.delete", "error"), cid)
			common.WriteError(w, http.StatusInternalServerError, "could not delete model")
			return
		}

		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "bim.delete", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"deleted": true, "modelId": modelID})
	}
}

func registerBimRoutes(r chi.Router, cfg config, store ddb.IfcBimStore) {
	h := newBimHandlers(cfg, store)
	r.Get("/api/bim/models", h.listModels())
	r.Post("/api/bim/models", h.uploadModel())
	r.Get("/api/bim/models/{modelId}/file", h.getFile())
	r.Delete("/api/bim/models/{modelId}", h.deleteModel())
}

func humanizeIfcBimStoreError(err error) string {
	if err == nil {
		return "could not save IFC metadata"
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	if strings.Contains(lower, "resourcenotfoundexception") || strings.Contains(lower, "requested resource not found") {
		return "DynamoDB table eduardoos_ifcbim not found — create it with deploy/aws/create-ifcbim-table.sh and attach IAM access"
	}
	if msg == "" {
		return "could not save IFC metadata"
	}
	return s3store.HumanizeAccessError(msg)
}
