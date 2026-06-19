// Payments — PayPal intents, status polling, and IPN webhook processing.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type paymentStatus string

const (
	statusPending   paymentStatus = "pending"
	statusCompleted paymentStatus = "completed"
	statusFailed    paymentStatus = "failed"
	statusCancelled paymentStatus = "cancelled"
)

type paymentIntent struct {
	IntentID       string        `json:"intent_id"`
	UserEmail      string        `json:"user_email"`
	PlanID         string        `json:"plan_id"`
	HostedButtonID string        `json:"hosted_button_id"`
	Currency       string        `json:"currency"`
	Status         paymentStatus `json:"status"`
	PayPalTxnID    *string       `json:"paypal_txn_id"`
	CreatedAt      time.Time     `json:"created_at"`
	UpdatedAt      time.Time     `json:"updated_at"`
}

type service struct {
	mu           sync.RWMutex
	cache        map[string]paymentIntent
	secret       string
	databaseURL  string
	authURL      string
	telemetry    *common.TelemetryClient
	paypalVerify string
	buttonID     string
	planID       string
}

func main() {
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	svc := &service{
		cache:        map[string]paymentIntent{},
		secret:       secret,
		databaseURL:  common.Env("DATABASE_URL", "http://database:3000"),
		authURL:      common.Env("AUTHENTICATOR_URL", "http://authenticator:3000"),
		telemetry:    common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
		paypalVerify: common.Env("PAYPAL_IPN_VERIFY_URL", "https://ipnpb.paypal.com/cgi-bin/webscr"),
		buttonID:     common.Env("PAYPAL_HOSTED_BUTTON_ID", "QEVGD66SG7LXN"),
		planID:       common.Env("PAYPAL_PLAN_ID", "subscription_monthly_basic"),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("payments", nil))
	r.Post("/webhook/paypal", svc.paypalIPN)
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/intents", svc.createIntent)
		r.Get("/status/{intentID}", svc.getStatus)
	})

	log.Printf("payments listening on %s", common.ListenAddr())
	log.Fatal(http.ListenAndServe(common.ListenAddr(), r))
}

func (s *service) createIntent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email  string `json:"email"`
		PlanID string `json:"plan_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.Email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	if !s.userVerified(r, body.Email) {
		common.WriteError(w, http.StatusUnauthorized, "user not verified")
		return
	}
	plan := body.PlanID
	if plan == "" {
		plan = s.planID
	}
	now := time.Now().UTC()
	intent := paymentIntent{
		IntentID: uuid.NewString(), UserEmail: body.Email, PlanID: plan,
		HostedButtonID: s.buttonID, Currency: "USD", Status: statusPending,
		CreatedAt: now, UpdatedAt: now,
	}
	s.mu.Lock()
	s.cache[intent.IntentID] = intent
	s.mu.Unlock()
	_ = s.saveIntent(r, intent)
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id": intent.IntentID, "email": intent.UserEmail, "plan_id": intent.PlanID,
		"hosted_button_id": intent.HostedButtonID, "currency": intent.Currency,
	})
}

func (s *service) getStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "intentID")
	s.mu.RLock()
	intent, ok := s.cache[id]
	s.mu.RUnlock()
	if !ok {
		if loaded, found := s.loadIntent(r, id); found {
			intent, ok = loaded, true
		}
	}
	if !ok {
		common.WriteError(w, http.StatusNotFound, "intent not found")
		return
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id": intent.IntentID, "email": intent.UserEmail, "plan_id": intent.PlanID,
		"status": intent.Status, "paypal_txn_id": intent.PayPalTxnID,
	})
}

func (s *service) paypalIPN(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	verifyBody := "cmd=_notify-validate&" + string(body)
	resp, err := http.Post(s.paypalVerify, "application/x-www-form-urlencoded", strings.NewReader(verifyBody))
	if err != nil || resp.StatusCode != http.StatusOK {
		common.WriteError(w, http.StatusBadGateway, "paypal verify failed")
		return
	}
	out, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if !strings.Contains(string(out), "VERIFIED") {
		common.WriteError(w, http.StatusBadRequest, "ipn not verified")
		return
	}
	vals, _ := url.ParseQuery(string(body))
	intentID := vals.Get("custom")
	status := mapPayPalStatus(vals.Get("payment_status"))
	s.mu.Lock()
	intent, ok := s.cache[intentID]
	if ok {
		intent.Status = status
		now := time.Now().UTC()
		intent.UpdatedAt = now
		if txn := vals.Get("txn_id"); txn != "" {
			intent.PayPalTxnID = &txn
		}
		s.cache[intentID] = intent
	}
	s.mu.Unlock()
	if ok {
		_ = s.saveIntent(r, intent)
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"ack": true, "intent_id": intentID, "status": status, "user_email": intent.UserEmail,
	})
}

func mapPayPalStatus(s string) paymentStatus {
	switch s {
	case "Completed", "Processed":
		return statusCompleted
	case "Denied", "Failed":
		return statusFailed
	case "Refunded", "Reversed":
		return statusCancelled
	default:
		return statusPending
	}
}

func (s *service) userVerified(r *http.Request, email string) bool {
	cid := common.CorrelationFromRequest(r)
	payload, _ := json.Marshal(map[string]string{"email": email})
	req, _ := http.NewRequest(http.MethodPost, strings.TrimRight(s.authURL, "/")+"/user-exists", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(s.secret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var out struct {
		Verified bool `json:"verified"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out.Verified
}

func (s *service) saveIntent(r *http.Request, intent paymentIntent) error {
	cid := common.CorrelationFromRequest(r)
	key := "payment:" + intent.IntentID
	payload, _ := json.Marshal(map[string]any{"key": key, "value": intent})
	req, _ := http.NewRequest(http.MethodPost, strings.TrimRight(s.databaseURL, "/")+"/put", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(s.secret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	return nil
}

func (s *service) loadIntent(r *http.Request, intentID string) (paymentIntent, bool) {
	cid := common.CorrelationFromRequest(r)
	key := "payment:" + intentID
	payload, _ := json.Marshal(map[string]string{"key": key})
	req, _ := http.NewRequest(http.MethodPost, strings.TrimRight(s.databaseURL, "/")+"/get", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(s.secret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return paymentIntent{}, false
	}
	defer resp.Body.Close()
	var out struct {
		Value *paymentIntent `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil || out.Value == nil {
		return paymentIntent{}, false
	}
	return *out.Value, true
}
