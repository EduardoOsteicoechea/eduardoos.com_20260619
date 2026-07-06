// Payments — PayPal intents, status polling, and IPN webhook processing.
package payments

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"eduardoos/pkg/authstore"
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

func Run(addr string) error {
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

	log.Printf("payments listening on %s", addr)
	return http.ListenAndServe(addr, r)
}

func (s *service) createIntent(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	logs := []string{
		"createIntent: handler started",
		"createIntent: correlation_id=" + cid,
	}

	var body struct {
		Email  string `json:"email"`
		PlanID string `json:"plan_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		logs = append(logs, "createIntent: failed to decode JSON body", "createIntent: error="+err.Error())
		log.Printf("[correlation=%s] createIntent decode failed: %v", cid, err)
		common.WriteErrorWithDebug(w, http.StatusBadRequest, "invalid request body", cid, logs)
		return
	}

	rawEmail := strings.TrimSpace(body.Email)
	normalizedEmail := authstore.NormalizeEmail(rawEmail)
	logs = append(logs,
		"createIntent: raw_email="+rawEmail,
		"createIntent: normalized_email="+normalizedEmail,
		"createIntent: plan_id="+strings.TrimSpace(body.PlanID),
	)

	if !strings.Contains(normalizedEmail, "@") {
		logs = append(logs, "createIntent: rejected invalid email after normalization")
		log.Printf("[correlation=%s] createIntent invalid email raw=%q normalized=%q", cid, rawEmail, normalizedEmail)
		common.WriteErrorWithDebug(w, http.StatusBadRequest, "invalid email", cid, logs)
		return
	}

	verify := s.checkUserVerified(r, normalizedEmail)
	logs = append(logs, verify.logs...)
	if !verify.verified {
		log.Printf("[correlation=%s] createIntent user not verified email=%s logs=%v", cid, normalizedEmail, logs)
		common.WriteErrorWithDebug(w, http.StatusUnauthorized, "user not verified", cid, logs)
		return
	}

	plan := strings.TrimSpace(body.PlanID)
	if plan == "" {
		plan = s.planID
		logs = append(logs, "createIntent: plan_id empty, using default="+plan)
	}
	now := time.Now().UTC()
	intent := paymentIntent{
		IntentID: uuid.NewString(), UserEmail: normalizedEmail, PlanID: plan,
		HostedButtonID: s.buttonID, Currency: "USD", Status: statusPending,
		CreatedAt: now, UpdatedAt: now,
	}
	s.mu.Lock()
	s.cache[intent.IntentID] = intent
	s.mu.Unlock()

	if err := s.saveIntent(r, intent); err != nil {
		logs = append(logs, "createIntent: intent created in memory but database save failed", "createIntent: save_error="+err.Error())
		log.Printf("[correlation=%s] createIntent save failed intent=%s err=%v", cid, intent.IntentID, err)
	} else {
		logs = append(logs, "createIntent: intent persisted intent_id="+intent.IntentID)
	}

	log.Printf("[correlation=%s] createIntent success intent=%s email=%s plan=%s", cid, intent.IntentID, normalizedEmail, plan)
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id": intent.IntentID, "email": intent.UserEmail, "plan_id": intent.PlanID,
		"hosted_button_id": intent.HostedButtonID, "currency": intent.Currency,
		"correlation_id": cid, "debug_logs": logs,
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

type userVerifyResult struct {
	verified bool
	logs     []string
}

func (s *service) checkUserVerified(r *http.Request, email string) userVerifyResult {
	cid := common.CorrelationFromRequest(r)
	logs := []string{
		"checkUserVerified: starting lookup",
		"checkUserVerified: email=" + email,
	}

	target := strings.TrimRight(s.authURL, "/") + "/user-exists"
	logs = append(logs, "checkUserVerified: authenticator_url="+target)

	payload, err := json.Marshal(map[string]string{"email": email})
	if err != nil {
		logs = append(logs, "checkUserVerified: failed to marshal request body", "checkUserVerified: error="+err.Error())
		return userVerifyResult{verified: false, logs: logs}
	}

	req, err := http.NewRequest(http.MethodPost, target, bytes.NewReader(payload))
	if err != nil {
		logs = append(logs, "checkUserVerified: failed to build request", "checkUserVerified: error="+err.Error())
		return userVerifyResult{verified: false, logs: logs}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(s.secret, cid))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logs = append(logs,
			"checkUserVerified: authenticator request failed",
			"checkUserVerified: error="+err.Error(),
		)
		log.Printf("[correlation=%s] checkUserVerified request failed email=%s err=%v", cid, email, err)
		return userVerifyResult{verified: false, logs: logs}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	logs = append(logs,
		"checkUserVerified: authenticator_status="+fmt.Sprintf("%d", resp.StatusCode),
		"checkUserVerified: authenticator_body="+truncateBody(string(body), 240),
	)

	var out struct {
		Exists   bool `json:"exists"`
		Verified bool `json:"verified"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		logs = append(logs, "checkUserVerified: failed to decode authenticator response", "checkUserVerified: error="+err.Error())
		return userVerifyResult{verified: false, logs: logs}
	}

	logs = append(logs,
		"checkUserVerified: exists="+fmt.Sprintf("%t", out.Exists),
		"checkUserVerified: verified="+fmt.Sprintf("%t", out.Verified),
	)
	if !out.Exists {
		logs = append(logs, "checkUserVerified: user record not found for normalized email")
	}
	if out.Exists && !out.Verified {
		logs = append(logs, "checkUserVerified: user exists but email is not verified")
	}

	return userVerifyResult{verified: out.Verified, logs: logs}
}

func truncateBody(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
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
