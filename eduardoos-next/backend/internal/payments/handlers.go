package payments

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// Known subscription service catalog (parity with parent SubscriptionBuilder).
var serviceCatalog = map[string]string{
	"ai_agent": "AI Agent",
	"playlist": "Playlist",
	"pamphlet": "Pamphlet",
}

// Handler serves minimal payment intent + entitlement preview APIs.
type Handler struct {
	JWTSecret      string
	Store          *Store
	HostedButtonID string
	CheckoutURL    string
	auth           *auth.Handler
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
	})
	r.Get("/api/payments/status/{intentID}", h.GetStatus)
	r.Get("/api/subscriptions/entitlements/preview", h.PreviewEntitlements)
}

type createIntentBody struct {
	Email         string   `json:"email"`
	PlanID        string   `json:"plan_id"`
	Services      []string `json:"services"`
	BillingPeriod string   `json:"billing_period"`
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
		unit := 1.0
		if billing == "yearly" {
			unit = 10.0
		}
		total := unit * float64(len(services))
		amount = fmt.Sprintf("%.2f", total)
		labels := make([]string, 0, len(services))
		for _, id := range services {
			labels = append(labels, serviceCatalog[id])
		}
		productName = "Eduardo OS: " + strings.Join(labels, " + ")
		planID = "subscription_custom_" + billing
	} else {
		if planID == "" {
			planID = "subscription_monthly_basic"
		}
		services = []string{"playlist"}
		billing = "monthly"
		productName = "Eduardo OS monthly basic"
		amount = "1.00"
	}

	intent := Intent{
		IntentID:       uuid.NewString(),
		Email:           email,
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
		"email":                 saved.Email,
		"plan_id":              saved.PlanID,
		"product_name":         saved.ProductName,
		"hosted_button_id":    saved.HostedButtonID,
		"currency":             saved.Currency,
		"amount":               saved.Amount,
		"services":            saved.Services,
		"billing_period":      saved.BillingPeriod,
		"paypal_checkout_mode": "hosted",
		"paypal_checkout_url":  h.CheckoutURL,
		"created_at":           saved.CreatedAt,
		"correlation_id":      httpx.CorrelationFromRequest(r),
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
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":        email,
		"entitlements": h.Store.ListEntitlements(email),
	})
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
		if _, ok := serviceCatalog[id]; !ok {
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
