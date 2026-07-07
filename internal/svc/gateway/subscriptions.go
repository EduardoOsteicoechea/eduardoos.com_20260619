package gateway

import (
	"log"
	"net/http"
	"time"

	ddb "eduardoos/pkg/dynamodb"
	"eduardoos/pkg/common"

	"github.com/go-chi/chi/v5"
)

type subscriptionHandlers struct {
	cfg           config
	entitlements  ddb.EntitlementStore
}

func newSubscriptionHandlers(cfg config, store ddb.EntitlementStore) subscriptionHandlers {
	return subscriptionHandlers{cfg: cfg, entitlements: store}
}

// listEntitlements handles GET /api/subscriptions/entitlements for the signed-in user.
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
}
