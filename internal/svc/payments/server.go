// Payments — PayPal intents, status polling, and IPN webhook processing.
package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/authstore"
	"eduardoos/pkg/common"
	"eduardoos/pkg/subscriptions"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

const (
	statusPending   = "pending"
	statusCompleted = "completed"
	statusFailed    = "failed"
	statusCancelled = "cancelled"
)

type service struct {
	payments          ddb.PaymentStore
	entitlements      ddb.EntitlementStore
	secret            string
	authURL           string
	telemetry         *common.TelemetryClient
	paypalVerify      string
	paypalCheckoutURL string
	paypalBusiness    string
	buttonID          string
	planID            string
}

func Run(addr string) error {
	ctx := context.Background()
	secret := common.Env("INTERNAL_SERVICE_SECRET", "dev-internal-secret")
	paymentStore, err := ddb.NewPaymentStore(ctx)
	if err != nil {
		return err
	}
	entitlementStore, err := ddb.NewEntitlementStore(ctx)
	if err != nil {
		return err
	}
	svc := &service{
		payments:       paymentStore,
		entitlements:   entitlementStore,
		secret:         secret,
		authURL:        common.Env("AUTHENTICATOR_URL", "http://authenticator:3000"),
		telemetry:      common.NewTelemetryClient(common.Env("TELEMETRY_URL", "http://telemetry:3000"), secret),
		paypalVerify:    common.Env("PAYPAL_IPN_VERIFY_URL", "https://ipnpb.paypal.com/cgi-bin/webscr"),
		paypalCheckoutURL: common.Env("PAYPAL_CHECKOUT_URL", "https://www.paypal.com/cgi-bin/webscr"),
		paypalBusiness:  common.Env("PAYPAL_BUSINESS_EMAIL", ""),
		buttonID:       common.Env("PAYPAL_HOSTED_BUTTON_ID", "QEVGD66SG7LXN"),
		planID:         common.Env("PAYPAL_PLAN_ID", "subscription_monthly_basic"),
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Get("/health", common.HealthHandler("payments", map[string]any{
		"payments_backend":     paymentStore.BackendName(),
		"entitlements_backend": entitlementStore.BackendName(),
	}))
	r.Post("/webhook/paypal", svc.paypalIPN)
	r.Group(func(r chi.Router) {
		r.Use(common.InternalAuthMiddleware(secret))
		r.Post("/intents", svc.createIntent)
		r.Get("/status/{intentID}", svc.getStatus)
		r.Get("/by-user/{email}", svc.listByUser)
		r.Get("/entitlements/{email}", svc.getEntitlements)
	})

	log.Printf("payments listening on %s (payments_backend=%s entitlements_backend=%s)", addr, paymentStore.BackendName(), entitlementStore.BackendName())
	return http.ListenAndServe(addr, r)
}

func (s *service) createIntent(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	logs := []string{
		"createIntent: handler started",
		"createIntent: correlation_id=" + cid,
		"createIntent: payments_backend=" + s.payments.BackendName(),
	}

	var body struct {
		Email         string   `json:"email"`
		PlanID        string   `json:"plan_id"`
		Services      []string `json:"services"`
		BillingPeriod string   `json:"billing_period"`
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
	billingPeriod := strings.ToLower(strings.TrimSpace(body.BillingPeriod))
	serviceIDs := body.Services
	var productName string
	var expectedAmount string

	if len(serviceIDs) > 0 {
		if billingPeriod == "" {
			billingPeriod = subscriptions.BillingMonthly
		}
		serviceIDs, _ = subscriptions.NormalizeServiceIDs(serviceIDs)
		activeRecords, entErr := s.entitlements.GetEntitlements(r.Context(), normalizedEmail, cid)
		if entErr != nil {
			logs = append(logs, "createIntent: entitlement lookup failed", "createIntent: error="+entErr.Error())
			common.WriteErrorWithDebug(w, http.StatusBadGateway, "could not verify subscriptions", cid, logs)
			return
		}
		active := ddb.ActiveEntitlements(activeRecords, time.Now().UTC())
		activeIDs := make([]string, 0, len(active))
		for _, record := range active {
			activeIDs = append(activeIDs, record.ServiceID)
		}
		allowed, blocked, filterErr := subscriptions.FilterPurchasable(serviceIDs, activeIDs, billingPeriod)
		if filterErr != nil {
			logs = append(logs, "createIntent: all requested services already active", "createIntent: blocked="+strings.Join(blocked, ","))
			common.WriteErrorWithDebug(w, http.StatusConflict, filterErr.Error(), cid, logs)
			return
		}
		if len(blocked) > 0 {
			logs = append(logs, "createIntent: skipped already active services="+strings.Join(blocked, ","))
		}
		serviceIDs = allowed
		total, quotedName, quoteErr := subscriptions.Quote(serviceIDs, billingPeriod)
		if quoteErr != nil {
			logs = append(logs, "createIntent: quote failed", "createIntent: error="+quoteErr.Error())
			common.WriteErrorWithDebug(w, http.StatusBadRequest, quoteErr.Error(), cid, logs)
			return
		}
		productName = quotedName
		expectedAmount = fmt.Sprintf("%.2f", total)
		plan = "subscription_custom_" + billingPeriod
		logs = append(logs,
			"createIntent: services="+strings.Join(serviceIDs, ","),
			"createIntent: billing_period="+billingPeriod,
			"createIntent: expected_amount="+expectedAmount,
		)
	} else {
		if plan == "" {
			plan = s.planID
			logs = append(logs, "createIntent: plan_id empty, using default="+plan)
		}
		productName = ddb.ProductNameForPlan(plan)
		serviceIDs = []string{subscriptions.ServicePlaylist}
		billingPeriod = subscriptions.BillingMonthly
		expectedAmount = "1.00"
	}

	record := ddb.PaymentRecord{
		IntentID:       uuid.NewString(),
		UserEmail:      normalizedEmail,
		PlanID:         plan,
		ProductName:    productName,
		Services:       serviceIDs,
		BillingPeriod:  billingPeriod,
		Status:         statusPending,
		HostedButtonID: s.buttonID,
		Currency:       "USD",
		ExpectedAmount: expectedAmount,
	}
	saved, err := s.payments.SavePayment(r.Context(), record, cid)
	if err != nil {
		logs = append(logs, "createIntent: payment store save failed", "createIntent: save_error="+err.Error())
		log.Printf("[correlation=%s] createIntent save failed intent=%s err=%v", cid, record.IntentID, err)
		common.WriteErrorWithDebug(w, http.StatusBadGateway, "could not save payment record", cid, logs)
		return
	}
	logs = append(logs,
		"createIntent: payment record persisted intent_id="+saved.IntentID,
		"createIntent: product_name="+saved.ProductName,
		"createIntent: created_at="+saved.CreatedAt,
	)

	log.Printf("[correlation=%s] createIntent success intent=%s email=%s plan=%s product=%s amount=%s",
		cid, saved.IntentID, normalizedEmail, plan, saved.ProductName, saved.ExpectedAmount)
	checkoutMode := "hosted"
	if strings.TrimSpace(s.paypalBusiness) != "" {
		checkoutMode = "xclick"
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id": saved.IntentID, "email": saved.UserEmail, "plan_id": saved.PlanID,
		"product_name": saved.ProductName, "hosted_button_id": saved.HostedButtonID,
		"currency": saved.Currency, "created_at": saved.CreatedAt,
		"services": saved.Services, "billing_period": saved.BillingPeriod,
		"amount": saved.ExpectedAmount, "paypal_checkout_mode": checkoutMode,
		"paypal_checkout_url": s.paypalCheckoutURL,
		"paypal_business": s.paypalBusiness,
		"correlation_id": cid, "debug_logs": logs,
	})
}

func (s *service) getStatus(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	id := chi.URLParam(r, "intentID")
	record, ok, err := s.payments.GetPaymentByIntentID(r.Context(), id, cid)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		common.WriteError(w, http.StatusNotFound, "intent not found")
		return
	}
	common.WriteJSON(w, http.StatusOK, paymentResponse(record))
}

func (s *service) listByUser(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	email := authstore.NormalizeEmail(chi.URLParam(r, "email"))
	if !strings.Contains(email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	records, err := s.payments.GetPaymentsByUserEmail(r.Context(), email, cid)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	out := make([]map[string]any, 0, len(records))
	for _, record := range records {
		out = append(out, paymentResponse(record))
	}
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"email":    email,
		"payments": out,
	})
}

func (s *service) getEntitlements(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
	email := authstore.NormalizeEmail(chi.URLParam(r, "email"))
	if !strings.Contains(email, "@") {
		common.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	records, err := s.entitlements.GetEntitlements(r.Context(), email, cid)
	if err != nil {
		common.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	active := ddb.ActiveEntitlements(records, time.Now().UTC())
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        email,
		"entitlements": entitlementResponses(active),
		"all":          entitlementResponses(records),
	})
}

func entitlementResponses(records []ddb.EntitlementRecord) []map[string]any {
	out := make([]map[string]any, 0, len(records))
	for _, record := range records {
		out = append(out, map[string]any{
			"service_id":     record.ServiceID,
			"service_label":  record.ServiceLabel,
			"billing_period": record.BillingPeriod,
			"valid_from":     record.ValidFrom,
			"valid_until":    record.ValidUntil,
			"last_intent_id": record.LastIntentID,
		})
	}
	return out
}

func paymentResponse(record ddb.PaymentRecord) map[string]any {
	resp := map[string]any{
		"intent_id":    record.IntentID,
		"email":        record.UserEmail,
		"plan_id":      record.PlanID,
		"product_name": record.ProductName,
		"status":       record.Status,
		"currency":     record.Currency,
		"created_at":   record.CreatedAt,
		"updated_at":   record.UpdatedAt,
	}
	if record.Amount != "" {
		resp["amount"] = record.Amount
	}
	if record.PayPalTxnID != "" {
		resp["paypal_txn_id"] = record.PayPalTxnID
	}
	if record.PaidAt != "" {
		resp["paid_at"] = record.PaidAt
	}
	if len(record.Services) > 0 {
		resp["services"] = record.Services
	}
	if record.BillingPeriod != "" {
		resp["billing_period"] = record.BillingPeriod
	}
	if record.ExpectedAmount != "" {
		resp["expected_amount"] = record.ExpectedAmount
	}
	return resp
}

func (s *service) paypalIPN(w http.ResponseWriter, r *http.Request) {
	cid := common.CorrelationFromRequest(r)
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
	intentID := strings.TrimSpace(vals.Get("custom"))
	if intentID == "" {
		common.WriteError(w, http.StatusBadRequest, "missing intent id")
		return
	}

	status := mapPayPalStatus(vals.Get("payment_status"))
	record, ok, err := s.payments.GetPaymentByIntentID(r.Context(), intentID, cid)
	if err != nil {
		log.Printf("[correlation=%s] paypalIPN load failed intent=%s err=%v", cid, intentID, err)
		common.WriteError(w, http.StatusBadGateway, "payment lookup failed")
		return
	}
	if !ok {
		log.Printf("[correlation=%s] paypalIPN intent not found intent=%s", cid, intentID)
		common.WriteError(w, http.StatusNotFound, "intent not found")
		return
	}

	record.Status = status
	if txn := strings.TrimSpace(vals.Get("txn_id")); txn != "" {
		record.PayPalTxnID = txn
	}
	if amount := strings.TrimSpace(vals.Get("mc_gross")); amount != "" {
		record.Amount = amount
	}
	if currency := strings.TrimSpace(vals.Get("mc_currency")); currency != "" {
		record.Currency = currency
	}
	if status == statusCompleted {
		if paymentDate := strings.TrimSpace(vals.Get("payment_date")); paymentDate != "" {
			record.PaidAt = paymentDate
		} else {
			record.PaidAt = time.Now().UTC().Format(time.RFC3339)
		}
	}

	saved, err := s.payments.SavePayment(r.Context(), record, cid)
	if err != nil {
		log.Printf("[correlation=%s] paypalIPN save failed intent=%s err=%v", cid, intentID, err)
		common.WriteError(w, http.StatusBadGateway, "payment update failed")
		return
	}

	var granted []ddb.EntitlementRecord
	if saved.Status == statusCompleted && len(saved.Services) > 0 {
		paidAt := time.Now().UTC()
		if saved.PaidAt != "" {
			if parsed, parseErr := time.Parse(time.RFC3339, saved.PaidAt); parseErr == nil {
				paidAt = parsed.UTC()
			}
		}
		granted, err = s.entitlements.GrantServices(r.Context(), saved.UserEmail, saved.Services, saved.BillingPeriod, saved.IntentID, paidAt, cid)
		if err != nil {
			log.Printf("[correlation=%s] paypalIPN entitlement grant failed intent=%s err=%v", cid, intentID, err)
		}
	}

	log.Printf("[correlation=%s] paypalIPN updated intent=%s user=%s product=%s status=%s amount=%s paid_at=%s granted=%d",
		cid, saved.IntentID, saved.UserEmail, saved.ProductName, saved.Status, saved.Amount, saved.PaidAt, len(granted))
	common.WriteJSON(w, http.StatusOK, map[string]any{
		"ack": true, "intent_id": saved.IntentID, "status": saved.Status,
		"user_email": saved.UserEmail, "product_name": saved.ProductName,
		"amount": saved.Amount, "paid_at": saved.PaidAt,
		"entitlements_granted": len(granted),
	})
}

func mapPayPalStatus(raw string) string {
	switch raw {
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
