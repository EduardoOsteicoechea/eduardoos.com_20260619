package gateway

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

func registerDocumentsRoutes(r chi.Router, cfg config) {
	r.Post("/api/documents/pamphlet/pdf", cfg.generatePamphletPDF())
}

func (c config) generatePamphletPDF() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "documents.pamphlet.pdf", "started"), cid)

		if _, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret); err != nil {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "documents.pamphlet.pdf", "error"), cid)
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		if strings.TrimSpace(c.DocumentsURL) == "" {
			common.WriteError(w, http.StatusServiceUnavailable, "DOCUMENTS_URL is not configured")
			return
		}

		body, _ := io.ReadAll(r.Body)
		target := strings.TrimRight(c.DocumentsURL, "/") + "/pamphlet"
		req, err := http.NewRequest(http.MethodPost, target, bytes.NewReader(body))
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, "documents service unavailable")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("[correlation=%s] documents.pamphlet.pdf upstream error: %v", cid, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "documents.pamphlet.pdf", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, "documents service unavailable")
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "documents.pamphlet.pdf", "error"), cid)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			_, _ = w.Write(out)
			return
		}

		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "documents.pamphlet.pdf", "success"), cid)
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			w.Header().Set("Content-Type", ct)
		} else {
			w.Header().Set("Content-Type", "application/pdf")
		}
		if cd := resp.Header.Get("Content-Disposition"); cd != "" {
			w.Header().Set("Content-Disposition", cd)
		} else {
			w.Header().Set("Content-Disposition", common.ContentDispositionAttachment("panfleto.pdf"))
		}
		w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(out)
	}
}
