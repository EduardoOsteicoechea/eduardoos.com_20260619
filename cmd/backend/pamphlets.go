package main

import (
	"bytes"
	"io"
	"net/http"
	"strings"

	"eduardoos/pkg/common"
)

func (c config) proxyPamphletGet(path string, event string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "started"), cid)
		}
		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		target := strings.TrimRight(c.DocumentsURL, "/") + path
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
		req.Header.Set("X-Pamphlet-User", email)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "success"), cid)
		}
		for k, vals := range resp.Header {
			if len(vals) > 0 {
				w.Header().Set(k, vals[0])
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(out)
	}
}

func (c config) proxyPamphletWrite(method, path, event string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "started"), cid)
		}
		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), c.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		body, _ := io.ReadAll(r.Body)
		target := strings.TrimRight(c.DocumentsURL, "/") + path
		req, err := http.NewRequest(method, target, bytes.NewReader(body))
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		req.Header.Set("X-Pamphlet-User", email)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		if event != "" {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "success"), cid)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(out)
	}
}

func registerPamphletGatewayRoutes(r interface {
	Get(string, http.HandlerFunc)
	Put(string, http.HandlerFunc)
	Post(string, http.HandlerFunc)
}, cfg config) {
	r.Get("/api/pamphlets/document", cfg.proxyPamphletGet("/pamphlet/document", "pamphlet.document.get"))
	r.Put("/api/pamphlets/document", cfg.proxyPamphletWrite(http.MethodPut, "/pamphlet/document", "pamphlet.document.put"))
	r.Post("/api/pamphlets/reset", cfg.proxyPamphletWrite(http.MethodPost, "/pamphlet/reset", "pamphlet.reset"))
	r.Get("/api/pamphlets/preview-sheets", cfg.proxyPamphletGet("/pamphlet/preview-sheets", "pamphlet.preview"))
	r.Get("/api/pamphlets/capacity", cfg.proxyPamphletGet("/pamphlet/capacity", "pamphlet.capacity"))
	r.Post("/api/pamphlets/content", cfg.proxyPamphletWrite(http.MethodPost, "/pamphlet/content", "pamphlet.content"))
	r.Post("/api/pamphlets/images", cfg.uploadPamphletImage())
	r.Get("/api/pamphlets/images/*", cfg.proxyPamphletImage())
}
