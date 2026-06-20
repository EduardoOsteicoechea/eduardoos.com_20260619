package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/s3store"

	"github.com/go-chi/chi/v5"
)

func (c config) uploadMedia() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "media.upload", "started"), cid)
		c.proxyMultipartUpload(w, r, cid, "/upload/multipart", "media.upload")
	}
}

func (c config) uploadMediaMultiple() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "media.upload.multiple", "started"), cid)
		c.proxyMultipartUpload(w, r, cid, "/upload/multiple", "media.upload.multiple")
	}
}

func (c config) proxyMultipartUpload(w http.ResponseWriter, r *http.Request, cid, downPath, event string) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for key, vals := range r.MultipartForm.Value {
		for _, val := range vals {
			_ = writer.WriteField(key, val)
		}
	}
	for field, headers := range r.MultipartForm.File {
		for _, header := range headers {
			part, err := writer.CreateFormFile(field, header.Filename)
			if err != nil {
				common.WriteError(w, http.StatusBadGateway, err.Error())
				return
			}
			src, err := header.Open()
			if err != nil {
				common.WriteError(w, http.StatusBadGateway, err.Error())
				return
			}
			_, _ = io.Copy(part, src)
			_ = src.Close()
		}
	}
	_ = writer.Close()

	target := strings.TrimRight(c.S3URL, "/") + downPath
	req, err := http.NewRequest(http.MethodPost, target, body)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		}
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "error"), cid)
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(out)
		return
	}
	if event != "" {
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "success"), cid)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
}

func (c config) listMediaImages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		target := strings.TrimRight(c.S3URL, "/") + "/images"
		if q := r.URL.RawQuery; q != "" {
			target += "?" + q
		}
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			w.WriteHeader(resp.StatusCode)
			_, _ = w.Write(body)
			return
		}

		var payload struct {
			Bucket  string              `json:"bucket"`
			Backend string              `json:"backend"`
			Count   int                 `json:"count"`
			Images  []s3store.ImageItem `json:"images"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			common.WriteError(w, http.StatusBadGateway, "invalid s3 response")
			return
		}

		type galleryImage struct {
			s3store.ImageItem
			URL   string `json:"url"`
			S3URL string `json:"s3_url"`
		}
		region := common.Env("AWS_REGION", "us-east-1")
		images := make([]galleryImage, 0, len(payload.Images))
		for _, img := range payload.Images {
			rel := s3store.RelativeKey(common.Env("S3_PREFIX", "media"), img.Key)
			if rel == "" {
				rel = img.Name
			}
			images = append(images, galleryImage{
				ImageItem: img,
				URL:       "/api/media/file/" + url.PathEscape(rel),
				S3URL:     s3store.S3ObjectURL(payload.Backend, payload.Bucket, region, img.Key),
			})
		}

		common.WriteJSON(w, http.StatusOK, map[string]any{
			"bucket":  payload.Bucket,
			"backend": payload.Backend,
			"count":   len(images),
			"images":  images,
		})
	}
}

func (c config) proxyMediaFile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		suffix := chi.URLParam(r, "*")
		if suffix == "" {
			common.WriteError(w, http.StatusBadRequest, "file key required")
			return
		}
		target := strings.TrimRight(c.S3URL, "/") + "/file/" + suffix
		c.signedProxy(w, r, http.MethodGet, target, "")
	}
}
