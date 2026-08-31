package payments

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Handler serves minimal payment intent + entitlement preview APIs.
type Handler struct {
	JWTSecret      string
	Store          *Store
	Users          auth.UserStore
	// HomescoolStudents is optional; when set, CheckAccess for service
	// "homescool" also allows linked students without a paid entitlement.
	HomescoolStudents HomescoolStudentChecker
	HostedButtonID    string
	CheckoutURL       string
	auth              *auth.Handler
}

// NewHandler builds a payments handler with memory store defaults.
func NewHandler(jwtSecret, hostedButtonID string) *Handler {
	if hostedButtonID == "" {
		hostedButtonID = "PLACEHOLDER_HOSTED_BUTTON"
	}
	return &Handler{
		JWTSecret:      jwtSecret,
		Store:          NewStore(),
		HostedButtonID: hostedButtonID,
		CheckoutURL:    httpx.Env("PAYPAL_CHECKOUT_URL", "https://www.paypal.com/cgi-bin/webscr"),
		auth:           &auth.Handler{JWTSecret: jwtSecret},
	}
}

// Routes mounts payment and entitlement preview endpoints.
// Intent create requires JWT (Next policy — tighter than parent gateway bypass).
// Status and entitlements preview stay public for post-checkout polling.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Post("/api/payments/intents", h.CreateIntent)
		r.Get("/api/subscriptions/entitlements", h.ListMyEntitlements)
		r.Get("/api/subscriptions/access/{serviceID}", h.CheckAccess)
	})
	r.Get("/api/payments/status/{intentID}", h.GetStatus)
	r.Get("/api/subscriptions/entitlements/preview", h.PreviewEntitlements)
	r.Get("/api/subscriptions/catalog", h.Catalog)
}

type createIntentBody struct {
	Email         string   `json:"email"`
	PlanID        string   `json:"plan_id"`
	Services      []string `json:"services"`
	BillingPeriod string   `json:"billing_period"`
}

// Catalog returns public billable services + monthly prices.
func (h *Handler) Catalog(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]any, 0, len(ServiceCatalog))
	for _, s := range ServiceCatalog {
		out = append(out, map[string]any{
			"id":          s.ID,
			"label":       s.Label,
			"description": s.Description,
			"monthly_usd": s.MonthlyUSD,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"services": out})
}

// CreateIntent records a pending PayPal intent for the authenticated user.
func (h *Handler) CreateIntent(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	var body createIntentBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	// Prefer JWT email; reject mismatches so intents cannot be forged for others.
	bodyEmail := auth.NormalizeEmail(body.Email)
	if bodyEmail != "" && bodyEmail != email {
		httpx.WriteError(w, http.StatusForbidden, "email does not match session")
		return
	}

	services := normalizeServices(body.Services)
	billing := strings.ToLower(strings.TrimSpace(body.BillingPeriod))
	if billing == "" {
		billing = "monthly"
	}
	if billing != "monthly" && billing != "yearly" {
		httpx.WriteError(w, http.StatusBadRequest, "billing_period must be monthly or yearly")
		return
	}

	planID := strings.TrimSpace(body.PlanID)
	productName := "Eduardo OS subscription"
	amount := "1.00"

	if len(services) > 0 {
		total := QuoteTotalUSD(services, billing)
		amount = FormatAmount(total)
		labels := make([]string, 0, len(services))
		for _, id := range services {
			labels = append(labels, ServiceLabel(id))
		}
		productName = "Eduardo OS: " + strings.Join(labels, " + ")
		planID = "subscription_custom_" + billing
	} else {
		if planID == "" {
			planID = "subscription_monthly_basic"
		}
		services = []string{"playlist"}
		billing = "monthly"
		productName = "Eduardo OS monthly Music"
		amount = FormatAmount(MonthlyPriceUSD("playlist"))
	}

	intent := Intent{
		IntentID:       uuid.NewString(),
		Email:          email,
		PlanID:         planID,
		ProductName:    productName,
		HostedButtonID: h.HostedButtonID,
		Currency:       "USD",
		Amount:         amount,
		Services:       services,
		BillingPeriod:  billing,
		Status:         "pending",
	}
	saved := h.Store.SaveIntent(intent)

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id":            saved.IntentID,
		"email":                saved.Email,
		"plan_id":              saved.PlanID,
		"product_name":         saved.ProductName,
		"hosted_button_id":     saved.HostedButtonID,
		"currency":             saved.Currency,
		"amount":               saved.Amount,
		"services":             saved.Services,
		"billing_period":       saved.BillingPeriod,
		"paypal_checkout_mode": "hosted",
		"paypal_checkout_url":  h.CheckoutURL,
		"created_at":           saved.CreatedAt,
		"correlation_id":       httpx.CorrelationFromRequest(r),
	})
}

// GetStatus returns intent status for polling after PayPal checkout.
func (h *Handler) GetStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "intentID")
	rec, ok := h.Store.GetIntent(id)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "intent not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"intent_id":    rec.IntentID,
		"email":        rec.Email,
		"plan_id":      rec.PlanID,
		"product_name": rec.ProductName,
		"status":       rec.Status,
		"currency":     rec.Currency,
		"amount":       rec.Amount,
		"created_at":   rec.CreatedAt,
		"updated_at":   rec.UpdatedAt,
	})
}

// ListMyEntitlements returns entitlements for the JWT subject.
func (h *Handler) ListMyEntitlements(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	admin := h.isAdminUser(r, email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        email,
		"entitlements": h.Store.ListEntitlements(email),
		"is_admin":     admin,
	})
}

// CheckAccess reports whether the JWT user may use a given service.
// Platform admins (bootstrap email or stored role admin) always pass.
// Homescool exception: a user with at least one teacher→student link where
// they are the student is allowed without a paid entitlement (teachers still
// need a subscription — this flag only unlocks student/hub surfaces).
func (h *Handler) CheckAccess(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	serviceID := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "serviceID")))
	if !KnownService(serviceID) {
		httpx.WriteError(w, http.StatusBadRequest, "unknown service")
		return
	}
	admin := h.isAdminUser(r, email)
	ents := h.Store.ListEntitlements(email)
	hasEntitlement := HasServiceAccess(false, ents, serviceID)
	allowed := admin || hasEntitlement
	isHomescoolStudent := false
	isEvoiceAllowlisted := false
	if !allowed && serviceID == "homescool" && h.HomescoolStudents != nil {
		ok, err := h.HomescoolStudents.IsHomescoolStudent(r.Context(), email)
		if err != nil {
			log.Printf("[correlation=%s] payments.access homescool_student_check error: %v",
				httpx.CorrelationFromRequest(r), err)
		} else if ok {
			allowed = true
			isHomescoolStudent = true
		}
	}
	// Temporary eVoice allowlist (spec 044) until PayPal entitlements are used.
	if !allowed && serviceID == "evoice" && IsEvoiceAllowlisted(email) {
		allowed = true
		isEvoiceAllowlisted = true
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":                  email,
		"service_id":             serviceID,
		"allowed":                allowed,
		"is_admin":               admin,
		"has_entitlement":        hasEntitlement,
		"is_homescool_student":   isHomescoolStudent,
		"is_evoice_allowlisted":  isEvoiceAllowlisted,
	})
}

// isAdminUser resolves RBAC admin via bootstrap email allowlist or stored role.
func (h *Handler) isAdminUser(r *http.Request, email string) bool {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
			role = u.Role
		}
	}
	return auth.IsAdmin(email, role)
}

// PreviewEntitlements is a public preview by ?email= (parent parity).
func (h *Handler) PreviewEntitlements(w http.ResponseWriter, r *http.Request) {
	email := auth.NormalizeEmail(r.URL.Query().Get("email"))
	if email == "" || !strings.Contains(email, "@") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid email")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        email,
		"entitlements": h.Store.ListEntitlements(email),
	})
}

func normalizeServices(ids []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, raw := range ids {
		id := strings.ToLower(strings.TrimSpace(raw))
		if !KnownService(id) {
			continue
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}
