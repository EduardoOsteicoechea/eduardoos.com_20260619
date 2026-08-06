package gateway

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"eduardoos/pkg/authstore"
	"eduardoos/pkg/common"
	ddb "eduardoos/pkg/dynamodb"

	"github.com/go-chi/chi/v5"
)

type subscriptionHandlers struct {
	cfg          config
	entitlements ddb.EntitlementStore
}

func newSubscriptionHandlers(cfg config, store ddb.EntitlementStore) subscriptionHandlers {
	return subscriptionHandlers{cfg: cfg, entitlements: store}
}

func (h subscriptionHandlers) listEntitlements() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "subscriptions.entitlements", "started"), cid)

		email, err := common.UserEmailFromBearer(r.Header.Get("Authorization"), h.cfg.JWTSecret)
		if err != nil {
			common.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}

		records, err := h.entitlements.GetEntitlements(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] subscriptions.entitlements store error: %v", cid, err)
			common.WriteError(w, http.StatusInternalServerError, "could not load entitlements")
			return
		}
		active := ddb.ActiveEntitlements(records, time.Now().UTC())
		h.cfg.Telemetry.Emit(common.NewFlightLog(cid, "backend", "subscriptions.entitlements", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"email":        email,
			"entitlements": mapEntitlements(active),
		})
	}
}

func (h subscriptionHandlers) previewEntitlements() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		email := authstore.NormalizeEmail(r.URL.Query().Get("email"))
		if !strings.Contains(email, "@") {
			common.WriteError(w, http.StatusBadRequest, "invalid email")
			return
		}
		if !h.cfg.userVerified(r.Context(), cid, email) {
			common.WriteJSON(w, http.StatusOK, map[string]any{
				"email":        email,
				"entitlements": []map[string]any{},
			})
			return
		}

		records, err := h.entitlements.GetEntitlements(r.Context(), email, cid)
		if err != nil {
			log.Printf("[correlation=%s] subscriptions.preview store error: %v", cid, err)
			common.WriteError(w, http.StatusInternalServerError, "could not load entitlements")
			return
		}
		active := ddb.ActiveEntitlements(records, time.Now().UTC())
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"email":        email,
			"entitlements": mapEntitlements(active),
		})
	}
}

func (c config) userVerified(ctx context.Context, cid, email string) bool {
	payload, _ := json.Marshal(map[string]string{"email": email})
	url := strings.TrimRight(c.AuthenticatorURL, "/") + "/user-exists"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Verified bool `json:"verified"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return false
	}
	return out.Verified
}

func mapEntitlements(records []ddb.EntitlementRecord) []map[string]any {
	out := make([]map[string]any, 0, len(records))
	for _, record := range records {
		out = append(out, map[string]any{
			"service_id":     record.ServiceID,
			"service_label":  record.ServiceLabel,
			"billing_period": record.BillingPeriod,
			"valid_from":     record.ValidFrom,
			"valid_until":    record.ValidUntil,
		})
	}
	return out
}

func registerSubscriptionRoutes(r chi.Router, cfg config, store ddb.EntitlementStore) {
	h := newSubscriptionHandlers(cfg, store)
	r.Get("/api/subscriptions/entitlements", h.listEntitlements())
	r.Get("/api/subscriptions/entitlements/preview", h.previewEntitlements())
}
