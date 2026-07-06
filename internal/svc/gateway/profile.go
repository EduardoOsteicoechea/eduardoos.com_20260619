package gateway

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/profile"
	"eduardoos/pkg/s3store"
)

func (c config) getUserProfile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		target := strings.TrimRight(c.AuthenticatorURL, "/") + "/profile"
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		req.Header.Set("X-User-Email", email)

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

		var stored struct {
			Email           string `json:"email"`
			ProfileImageKey string `json:"profileImageKey"`
		}
		if err := json.Unmarshal(body, &stored); err != nil {
			common.WriteError(w, http.StatusBadGateway, "invalid profile response")
			return
		}
		imageURL := ""
		if key := strings.TrimSpace(stored.ProfileImageKey); key != "" {
			imageURL = profile.GatewayMediaFilePath(profile.NormalizeImageObjectKey(key))
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"email":           stored.Email,
			"profileImageKey": stored.ProfileImageKey,
			"profileImageUrl": imageURL,
		})
	}
}

func (c config) uploadProfileImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "auth.profile.image.upload", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid multipart form")
			return
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
		filename := profile.ImageFilenameFromUpload(header.Filename)
		objectKey := profile.ImageObjectKey(email, filename)
		if err := c.proxyAbsoluteUpload(r, cid, objectKey, filepath.Base(filename), data); err != nil {
			common.WriteError(w, http.StatusBadGateway, s3store.HumanizeAccessError(err.Error()))
			return
		}

		raw, _ := json.Marshal(map[string]string{"profileImageKey": objectKey})
		target := strings.TrimRight(c.AuthenticatorURL, "/") + "/profile"
		req, err := http.NewRequest(http.MethodPut, target, bytes.NewReader(raw))
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		req.Header.Set("X-User-Email", email)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			log.Printf("[correlation=%s] auth.profile.image.upload profile save status=%d body=%s", cid, resp.StatusCode, truncateForLog(string(out), 240))
			common.WriteError(w, http.StatusBadGateway, "profile update failed")
			return
		}

		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "auth.profile.image.upload", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"status":          "ok",
			"profileImageKey": objectKey,
			"profileImageUrl": profile.GatewayMediaFilePath(objectKey),
		})
	}
}
