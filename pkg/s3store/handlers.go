package s3store

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

// Server exposes HTTP handlers for the s3 microservice.
type Server struct {
	Store  MediaStore
	Prefix string
}

// BatchUploadResult summarizes a multi-file upload request.
type BatchUploadResult struct {
	Count    int             `json:"count"`
	Uploaded []UploadResult  `json:"uploaded"`
	Failed   []UploadFailure `json:"failed"`
}

// UploadFailure describes one rejected file in a batch.
type UploadFailure struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

// RegisterRoutes mounts upload/list/get routes on r (caller adds auth middleware).
func (s *Server) RegisterRoutes(r chi.Router) {
	r.Post("/upload", s.handleUploadJSON)
	r.Post("/upload/multipart", s.handleUploadMultipart)
	r.Post("/upload/multiple", s.handleUploadMultiple)
	r.Get("/objects", s.handleList)
	r.Get("/images", s.handleListImages)
	r.Get("/file/*", s.handleGetFile)
}

func (s *Server) putValidated(w http.ResponseWriter, r *http.Request, filename string, data []byte) {
	key, ct, err := PrepareUpload(filename, data)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := s.Store.Put(r.Context(), key, ct, data)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	common.WriteJSON(w, http.StatusOK, result)
}

func (s *Server) handleUploadJSON(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Key        string `json:"key"`
		BodyBase64 string `json:"body_base64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid body")
		return
	}
	data, err := base64.StdEncoding.DecodeString(body.BodyBase64)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid base64")
		return
	}
	name := body.Key
	if name == "" {
		name = "upload.bin"
	}
	s.putValidated(w, r, name, data)
}

func (s *Server) handleUploadMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	key := r.FormValue("key")
	file, header, err := r.FormFile("file")
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	if key == "" {
		key = header.Filename
	}
	data, err := io.ReadAll(file)
	if err != nil {
		common.WriteError(w, http.StatusBadRequest, "read file failed")
		return
	}
	s.putValidated(w, r, key, data)
}

func (s *Server) handleUploadMultiple(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	headers := collectUploadFiles(r.MultipartForm)
	if len(headers) == 0 {
		common.WriteError(w, http.StatusBadRequest, "at least one file required")
		return
	}
	out := BatchUploadResult{Uploaded: []UploadResult{}, Failed: []UploadFailure{}}
	for _, header := range headers {
		file, err := header.Open()
		if err != nil {
			out.Failed = append(out.Failed, UploadFailure{Name: header.Filename, Error: err.Error()})
			continue
		}
		data, readErr := io.ReadAll(file)
		_ = file.Close()
		if readErr != nil {
			out.Failed = append(out.Failed, UploadFailure{Name: header.Filename, Error: readErr.Error()})
			continue
		}
		key, ct, prepErr := PrepareUpload(header.Filename, data)
		if prepErr != nil {
			out.Failed = append(out.Failed, UploadFailure{Name: header.Filename, Error: prepErr.Error()})
			continue
		}
		result, putErr := s.Store.Put(r.Context(), key, ct, data)
		if putErr != nil {
			out.Failed = append(out.Failed, UploadFailure{Name: header.Filename, Error: putErr.Error()})
			continue
		}
		out.Uploaded = append(out.Uploaded, result)
	}
	out.Count = len(out.Uploaded)
	common.WriteJSON(w, http.StatusOK, out)
}

func collectUploadFiles(form *multipart.Form) []*multipart.FileHeader {
	if form == nil {
		return nil
	}
	if files := form.File["files"]; len(files) > 0 {
		return files
	}
	return form.File["file"]
}

func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")
	items, err := s.Store.List(r.Context(), prefix)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if items == nil {
		items = []ObjectMeta{}
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{"objects": items})
}

func (s *Server) handleListImages(w http.ResponseWriter, r *http.Request) {
	prefix := r.URL.Query().Get("prefix")
	items, err := s.Store.List(r.Context(), prefix)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	images := ToImageItems(items)
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"bucket":  s.Store.BucketName(),
		"backend": s.Store.BackendName(),
		"count":   len(images),
		"images":  images,
	})
}

func (s *Server) handleGetFile(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "*")
	if key == "" {
		common.WriteError(w, http.StatusBadRequest, "key required")
		return
	}
	data, ct, err := s.Store.Get(r.Context(), key)
	if err != nil {
		common.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if ct == "" || ct == "application/octet-stream" {
		ct = ContentTypeFromKey(key)
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
