package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/pamphlet"
	"eduardoos/pkg/s3store"

	"github.com/go-chi/chi/v5"
)

func (c config) uploadPamphletImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "pamphlet.image.upload", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
		}
		ref := strings.TrimSpace(r.FormValue("ref"))
		if ref == "" {
			common.WriteError(w, http.StatusBadRequest, "ref required")
			return
		}
		var layout map[string]any
		if raw := strings.TrimSpace(r.FormValue("layout")); raw != "" {
			_ = json.Unmarshal([]byte(raw), &layout)
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, "file required")
			return
		}
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			common.WriteError(w, http.StatusBadRequest, "read file failed")
			return
		}
		ext := filepath.Ext(header.Filename)
		if ext == "" {
			ext = ".png"
		}
		filename := pamphlet.ContentImageFilenameFromRef(ref, ext)
		objectKey := pamphlet.ContentImageObjectKey(email, pamphlet.DefaultPamphletID, filename)
		if err := c.proxyAbsoluteUpload(r, cid, objectKey, header.Filename, data); err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}

		imageURL := pamphlet.GatewayImagePath(objectKey)
		mutationBody := map[string]any{
			"op":    "update_image",
			"ref":   ref,
			"value": objectKey,
			"image": imageURL,
		}
		if layout != nil {
			mutationBody["layout"] = layout
		}
		out, status, err := c.proxyPamphletMutation(email, cid, mutationBody)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		if status >= 400 {
			w.WriteHeader(status)
			_, _ = w.Write(out)
			return
		}
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "pamphlet.image.upload", "success"), cid)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(out)
	}
}

func (c config) proxyPamphletImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		suffix := chi.URLParam(r, "*")
		if suffix == "" {
			common.WriteError(w, http.StatusBadRequest, "image key required")
			return
		}
		target := strings.TrimRight(c.S3URL, "/") + "/absolute/" + s3store.EncodeRelativePath(suffix)
		c.signedProxy(w, r, http.MethodGet, target, "")
	}
}

func (c config) proxyAbsoluteUpload(r *http.Request, cid, objectKey, filename string, data []byte) error {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("absolute_key", objectKey)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return err
	}
	if _, err := part.Write(data); err != nil {
		return err
	}
	_ = writer.Close()

	target := strings.TrimRight(c.S3URL, "/") + "/absolute/multipart"
	req, err := http.NewRequest(http.MethodPost, target, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		out, _ := io.ReadAll(resp.Body)
		return proxyStatusError{status: resp.StatusCode, body: string(out)}
	}
	return nil
}

func (c config) proxyPamphletMutation(email, cid string, body map[string]any) ([]byte, int, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, 0, err
	}
	target := strings.TrimRight(c.DocumentsURL, "/") + "/pamphlet/content"
	req, err := http.NewRequest(http.MethodPost, target, bytes.NewReader(raw))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	req.Header.Set("X-Pamphlet-User", email)
	req.Header.Set("X-Pamphlet-Id", pamphlet.DefaultPamphletID)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return out, resp.StatusCode, nil
}

type proxyStatusError struct {
	status int
	body   string
}

func (e proxyStatusError) Error() string {
	if e.body != "" {
		return e.body
	}
	return http.StatusText(e.status)
}
