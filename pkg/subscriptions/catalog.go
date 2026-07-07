// Package subscriptions defines sellable services, pricing, and entitlement helpers.
package subscriptions

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	BillingMonthly = "monthly"
	BillingYearly  = "yearly"

	ServiceAIAgent  = "ai_agent"
	ServicePlaylist = "playlist"
	ServicePamphlet = "pamphlet"
)

// Service describes a subscription feature users can purchase.
type Service struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// Catalog lists all purchasable services in display order.
var Catalog = []Service{
	{ID: ServiceAIAgent, Label: "AI Agent", Description: "Conversational assistant and automation tools."},
	{ID: ServicePlaylist, Label: "Playlist", Description: "Cloud worship playlist builder and storage."},
	{ID: ServicePamphlet, Label: "Pamphlet", Description: "Pamphlet generator, cloud sync, and exports."},
}

// PricePerServiceUSD returns the unit price for one service in the given billing period.
func PricePerServiceUSD(period string) (float64, error) {
	switch strings.ToLower(strings.TrimSpace(period)) {
	case BillingMonthly:
		return 1.0, nil
	case BillingYearly:
		return 10.0, nil
	default:
		return 0, fmt.Errorf("unsupported billing period %q", period)
	}
}

// NormalizeServiceIDs deduplicates and validates service identifiers.
func NormalizeServiceIDs(ids []string) ([]string, error) {
	allowed := map[string]string{}
	for _, svc := range Catalog {
		allowed[svc.ID] = svc.ID
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, raw := range ids {
		id := strings.ToLower(strings.TrimSpace(raw))
		if id == "" {
			continue
		}
		canonical, ok := allowed[id]
		if !ok {
			return nil, fmt.Errorf("unknown service %q", raw)
		}
		if seen[canonical] {
			continue
		}
		seen[canonical] = true
		out = append(out, canonical)
	}
	sort.Strings(out)
	if len(out) == 0 {
		return nil, fmt.Errorf("select at least one service")
	}
	return out, nil
}

// Quote calculates the checkout total for the selected services.
func Quote(serviceIDs []string, billingPeriod string) (total float64, productName string, err error) {
	ids, err := NormalizeServiceIDs(serviceIDs)
	if err != nil {
		return 0, "", err
	}
	unit, err := PricePerServiceUSD(billingPeriod)
	if err != nil {
		return 0, "", err
	}
	total = unit * float64(len(ids))
	labels := make([]string, 0, len(ids))
	for _, svc := range Catalog {
		for _, id := range ids {
			if svc.ID == id {
				labels = append(labels, svc.Label)
			}
		}
	}
	periodLabel := "Monthly"
	if billingPeriod == BillingYearly {
		periodLabel = "Yearly"
	}
	productName = fmt.Sprintf("%s (%s)", strings.Join(labels, " + "), periodLabel)
	return total, productName, nil
}

// EntitlementEnd calculates when access should expire from a payment completion time.
func EntitlementEnd(from time.Time, billingPeriod string) (time.Time, error) {
	switch strings.ToLower(strings.TrimSpace(billingPeriod)) {
	case BillingMonthly:
		return from.AddDate(0, 1, 0), nil
	case BillingYearly:
		return from.AddDate(1, 0, 0), nil
	default:
		return time.Time{}, fmt.Errorf("unsupported billing period %q", billingPeriod)
	}
}

// ExtendEntitlementEnd stacks renewal on top of an active entitlement when applicable.
func ExtendEntitlementEnd(currentEnd time.Time, paidAt time.Time, billingPeriod string) (time.Time, error) {
	base := paidAt.UTC()
	if currentEnd.After(base) {
		base = currentEnd.UTC()
	}
	return EntitlementEnd(base, billingPeriod)
}

// LabelForService returns the display label for a service id.
func LabelForService(id string) string {
	for _, svc := range Catalog {
		if svc.ID == id {
			return svc.Label
		}
	}
	return id
}

// FilterPurchasable removes services that cannot be purchased again for the billing period.
// Monthly renewals are blocked while a service is still active; yearly checkout extends
// active entitlements by one year from the current expiry.
func FilterPurchasable(requested, active []string, billingPeriod string) (allowed []string, blocked []string, err error) {
	normalized, err := NormalizeServiceIDs(requested)
	if err != nil {
		return nil, nil, err
	}
	if strings.ToLower(strings.TrimSpace(billingPeriod)) == BillingYearly {
		return normalized, nil, nil
	}
	activeSet := map[string]bool{}
	for _, id := range active {
		activeSet[id] = true
	}
	for _, id := range normalized {
		if activeSet[id] {
			blocked = append(blocked, id)
			continue
		}
		allowed = append(allowed, id)
	}
	if len(allowed) == 0 {
		return nil, blocked, fmt.Errorf("already subscribed to the selected services")
	}
	return allowed, blocked, nil
}
