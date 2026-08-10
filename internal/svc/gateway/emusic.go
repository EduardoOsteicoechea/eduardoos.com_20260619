package gateway

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path"
	"regexp"
	"strings"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

var emusicSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func registerEmusicRoutes(r chi.Router, cfg config) {
	r.Get("/api/emusic/{slug}", cfg.getEmusic())
	r.Put("/api/emusic/{slug}", cfg.putEmusic())
}

func emusicObjectKey(slug string) string {
	return fmt.Sprintf("media/emusic_files/%s.emusic", slug)
}

func sanitizeEmusicSlug(raw string) (string, error) {
	slug := strings.ToLower(strings.TrimSpace(raw))
	slug = strings.TrimSuffix(slug, ".emusic")
	if !emusicSlugPattern.MatchString(slug) {
		return "", fmt.Errorf("invalid emusic slug")
	}
	if len(slug) > 180 {
		return "", fmt.Errorf("emusic slug too long")
	}
	return slug, nil
}

func (c config) getEmusic() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "emusic.get", "started"), cid)

		slug, err := sanitizeEmusicSlug(chi.URLParam(r, "slug"))
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		body, err := c.fetchAbsoluteObject(r, cid, emusicObjectKey(slug))
		if err != nil {
			log.Printf("[correlation=%s] emusic.get miss slug=%s: %v", cid, slug, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "emusic.get", "error"), cid)
			common.WriteError(w, http.StatusNotFound, "emusic not found")
			return
		}

		var document json.RawMessage
		if err := json.Unmarshal(body, &document); err != nil {
			common.WriteError(w, http.StatusInternalServerError, "stored emusic is not valid JSON")
			return
		}

		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "emusic.get", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"slug":     slug,
			"s3Key":    emusicObjectKey(slug),
			"document": document,
		})
	}
}

func (c config) putEmusic() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email, cid, ok := c.requireAPSAdmin(w, r, "emusic.put")
		if !ok {
			return
		}

		slug, err := sanitizeEmusicSlug(chi.URLParam(r, "slug"))
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}

		var req struct {
			Document json.RawMessage `json:"document"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if len(req.Document) == 0 {
			common.WriteError(w, http.StatusBadRequest, "document required")
			return
		}

		var probe struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(req.Document, &probe); err != nil || probe.Type != "emusic" {
			common.WriteError(w, http.StatusBadRequest, "document.type must be emusic")
			return
		}

		var normalized any
		if err := json.Unmarshal(req.Document, &normalized); err != nil {
			common.WriteError(w, http.StatusBadRequest, "document must be JSON object")
			return
		}
		payload, err := json.MarshalIndent(normalized, "", "  ")
		if err != nil {
			common.WriteError(w, http.StatusInternalServerError, "could not normalize document")
			return
		}
		payload = append(payload, '\n')

		fileName := slug + ".emusic"
		s3Key := emusicObjectKey(slug)
		if err := c.proxyAbsoluteUpload(r, cid, s3Key, path.Base(fileName), payload); err != nil {
			log.Printf("[correlation=%s] emusic.put s3 error user=%s slug=%s: %v", cid, email, slug, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "emusic.put", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, humanizeProxyError(err))
			return
		}

		log.Printf("[correlation=%s] emusic.put user=%s slug=%s bytes=%d key=%s", cid, email, slug, len(payload), s3Key)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "emusic.put", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"slug":     slug,
			"s3Key":    s3Key,
			"document": json.RawMessage(payload),
		})
	}
}
