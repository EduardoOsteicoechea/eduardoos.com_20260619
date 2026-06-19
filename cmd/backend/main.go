// Backend API gateway — correlation IDs, internal token signing, public route proxying.
package main

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type config struct {
	InternalSecret   string
	AuthenticatorURL string
	TelemetryURL     string
	TesterURL        string
	PaymentsURL      string
	Telemetry        *common.TelemetryClient
}

var publicPaths = []string{
	"/health",
	"/api/auth/login", "/api/auth/register", "/api/auth/verify-otp",
	"/api/logger", "/api/logger/logs", "/api/logger/analytics", "/api/logger/trace",
	"/api/tester", "/api/tester/runs",
	"/api/payments/intents", "/api/payments/webhook/paypal", "/api/payments/status",
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
	cfg := config{
		InternalSecret:   common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret"),
		AuthenticatorURL: common.Env("AUTHENTICATOR_URL", "http://authenticator:3000"),
		TelemetryURL:     common.Env("TELEMETRY_URL", "http://telemetry:3000"),
		TesterURL:        common.Env("TESTER_URL", "http://tester:3000"),
		PaymentsURL:      common.Env("PAYMENTS_URL", "http://payments:3000"),
	}
	cfg.Telemetry = common.NewTelemetryClient(cfg.TelemetryURL, cfg.InternalSecret)

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
	r.Post("/api/tester", cfg.proxyPost("/run", cfg.TesterURL, ""))
	r.Post("/api/tester/", cfg.proxyPost("/run", cfg.TesterURL, ""))
	r.Get("/api/tester/runs", cfg.proxyGet("/runs", cfg.TesterURL))
	r.Get("/api/tester/runs/{runID}", cfg.proxyGetPath("/runs", cfg.TesterURL, "runID"))
	r.Post("/api/payments/intents", cfg.proxyPost("/intents", cfg.PaymentsURL, "payments.intent.proxy"))
	r.Get("/api/payments/status/{intentID}", cfg.proxyGetPath("/status", cfg.PaymentsURL, "intentID"))
	r.Post("/api/payments/webhook/paypal", cfg.proxyPayPalWebhook())

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
		if isPublic(r.URL.Path) || r.Header.Get("Authorization") != "" {
			next.ServeHTTP(w, r)
			return
		}
		common.WriteError(w, http.StatusUnauthorized, "authorization required")
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
