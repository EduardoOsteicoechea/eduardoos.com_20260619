// Backend API gateway — correlation IDs, internal token signing, public route proxying.
package main

import (
	"bytes"
	"context"
	"io"
	"log"
	"net/http"
	"strings"

	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type config struct {
	InternalSecret   string
	JWTSecret        string
	AuthenticatorURL string
	TelemetryURL     string
	TesterURL        string
	PaymentsURL      string
	S3URL            string
	Telemetry        *common.TelemetryClient
}

var publicPaths = []string{
	"/health",
	"/api/auth/login", "/api/auth/register", "/api/auth/verify-otp",
	"/api/logger", "/api/logger/logs", "/api/logger/analytics", "/api/logger/trace", "/api/logger/stream",
	"/api/tester", "/api/tester/runs", "/api/tester/report",
	"/api/payments/intents", "/api/payments/webhook/paypal", "/api/payments/status",
	"/api/media/upload", "/api/media/upload/multiple", "/api/media/objects", "/api/media/images", "/api/media/audio", "/api/media/file",
}

func isPublic(path string) bool {
	for _, p := range publicPaths {
		if path == p || strings.HasPrefix(path, p+"/") {
			return true
		}
	}
	return false
}

func main() {
	ctx := context.Background()
	cfg := config{
		InternalSecret:   common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret"),
		JWTSecret:        common.Env("JWT_SECRET", "dev-jwt-secret"),
		AuthenticatorURL: common.Env("AUTHENTICATOR_URL", "http://authenticator:3000"),
		TelemetryURL:     common.Env("TELEMETRY_URL", "http://telemetry:3000"),
		TesterURL:        common.Env("TESTER_URL", "http://tester:3000"),
		PaymentsURL:      common.Env("PAYMENTS_URL", "http://payments:3000"),
		S3URL:            common.Env("S3_URL", "http://s3:3000"),
	}
	cfg.Telemetry = common.NewTelemetryClient(cfg.TelemetryURL, cfg.InternalSecret)

	playlistStore, err := ddb.NewPlaylistStore(ctx)
	if err != nil {
		log.Fatalf("playlist store: %v", err)
	}
	log.Printf("playlist store backend=%s", playlistStore.BackendName())

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(correlationMiddleware)
	r.Use(authGate)

	r.Get("/health", common.HealthHandler("backend", nil))
	r.Post("/api/auth/register", cfg.proxyAuth("/register"))
	r.Post("/api/auth/login", cfg.proxyAuth("/login"))
	r.Post("/api/auth/verify-otp", cfg.proxyAuth("/verify-otp"))
	r.Post("/api/logger", cfg.proxyPost("/ingest", cfg.TelemetryURL, "logger.proxy"))
	r.Get("/api/logger/logs", cfg.proxyGetQuery("/logs", cfg.TelemetryURL))
	r.Get("/api/logger/analytics", cfg.proxyGet("/analytics", cfg.TelemetryURL))
	r.Get("/api/logger/trace/{id}", cfg.proxyGetPath("/trace", cfg.TelemetryURL, "id"))
	r.Get("/api/logger/stream", cfg.proxyStream(cfg.TelemetryURL+"/stream"))
	r.Post("/api/tester", cfg.proxyPost("/run", cfg.TesterURL, ""))
	r.Post("/api/tester/", cfg.proxyPost("/run", cfg.TesterURL, ""))
	r.Post("/api/tester/report", cfg.proxyPost("/report", cfg.TesterURL, "tester.report"))
	r.Get("/api/tester/runs", cfg.proxyGet("/runs", cfg.TesterURL))
	r.Get("/api/tester/runs/{runID}", cfg.proxyGetPath("/runs", cfg.TesterURL, "runID"))
	r.Post("/api/payments/intents", cfg.proxyPost("/intents", cfg.PaymentsURL, "payments.intent.proxy"))
	r.Get("/api/payments/status/{intentID}", cfg.proxyGetPath("/status", cfg.PaymentsURL, "intentID"))
	r.Post("/api/payments/webhook/paypal", cfg.proxyPayPalWebhook())
	r.Post("/api/media/upload", cfg.uploadMedia())
	r.Post("/api/media/upload/multiple", cfg.uploadMediaMultiple())
	r.Get("/api/media/objects", cfg.proxyGetQuery("/objects", cfg.S3URL))
	r.Get("/api/media/images", cfg.listMediaImages())
	r.Get("/api/media/audio", cfg.listMediaAudio())
	r.Get("/api/media/file/*", cfg.proxyMediaFile())
	registerPlaylistRoutes(r, cfg, playlistStore)

	log.Printf("backend listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func correlationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cid := r.Header.Get(common.CorrelationHeader)
		if cid == "" {
			cid = uuid.NewString()
		}
		r.Header.Set(common.CorrelationHeader, cid)
		next.ServeHTTP(w, r)
	})
}

func authGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublic(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		auth := strings.TrimSpace(r.Header.Get("Authorization"))
		if auth == "" {
			common.WriteError(w, http.StatusUnauthorized, "authorization required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (c config) proxyAuth(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url := strings.TrimRight(c.AuthenticatorURL, "/") + path
		c.signedProxy(w, r, http.MethodPost, url, "auth"+path)
	}
}

func (c config) proxyPost(downPath, base, event string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url := strings.TrimRight(base, "/") + downPath
		c.signedProxy(w, r, http.MethodPost, url, event)
	}
}

func (c config) proxyGet(downPath, base string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url := strings.TrimRight(base, "/") + downPath
		c.signedProxy(w, r, http.MethodGet, url, "")
	}
}

func (c config) proxyGetQuery(downPath, base string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		url := strings.TrimRight(base, "/") + downPath
		if q := r.URL.RawQuery; q != "" {
			url += "?" + q
		}
		c.signedProxy(w, r, http.MethodGet, url, "")
	}
}

func (c config) proxyGetPath(prefix, base, param string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, param)
		url := strings.TrimRight(base, "/") + prefix + "/" + id
		c.signedProxy(w, r, http.MethodGet, url, "")
	}
}

func (c config) proxyPayPalWebhook() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		body, _ := io.ReadAll(r.Body)
		url := strings.TrimRight(c.PaymentsURL, "/") + "/webhook/paypal"
		req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		req.Header.Set(common.CorrelationHeader, cid)
		ct := r.Header.Get("Content-Type")
		if ct == "" {
			ct = "application/x-www-form-urlencoded"
		}
		req.Header.Set("Content-Type", ct)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(out)
	}
}

func (c config) proxyStream(url string) http.HandlerFunc {
	client := &http.Client{Timeout: 0}
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		req, err := http.NewRequest(http.MethodGet, url, nil)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		resp, err := client.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		for k, vals := range resp.Header {
			for _, v := range vals {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		buf := make([]byte, 4096)
		flusher, _ := w.(http.Flusher)
		for {
			n, readErr := resp.Body.Read(buf)
			if n > 0 {
				_, _ = w.Write(buf[:n])
				if flusher != nil {
					flusher.Flush()
				}
			}
			if readErr != nil {
				break
			}
		}
	}
}

func (c config) signedProxy(w http.ResponseWriter, r *http.Request, method, url, event string) {
	cid := common.CorrelationFromRequest(r)
	if event != "" {
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", event, "started"), cid)
	}
	var body io.Reader
	if method == http.MethodPost {
		b, _ := io.ReadAll(r.Body)
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
	}
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
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(out)
}
