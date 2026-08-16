package payments

import (
	"fmt"
	"strings"
	"time"
)

// Catalog entry for billable subscription services.
type ServiceInfo struct {
	ID             string
	Label          string
	Description    string
	MonthlyUSD     float64
}

// ServiceCatalog is the billable product list (admin always bypasses entitlements).
var ServiceCatalog = []ServiceInfo{
	{ID: "playlist", Label: "Music", Description: "Worship playlist builder and lyrics.", MonthlyUSD: 1},
	{ID: "pamphlet", Label: "Pamphlet", Description: "Cloud pamphlet editor and print export.", MonthlyUSD: 1},
	{ID: "debate", Label: "Debate App", Description: "Structured debate workspace.", MonthlyUSD: 3},
	{ID: "homescool", Label: "Homescool", Description: "Homescool learning surface.", MonthlyUSD: 1},
	{ID: "videos", Label: "Videos", Description: "Media gallery / videos library.", MonthlyUSD: 1},
	{ID: "instrumentalist", Label: "Instrumentalist", Description: "Self-evaluate ideas with weighted belief trees and formal-logic analysis.", MonthlyUSD: 3},
}

var serviceByID map[string]ServiceInfo

func init() {
	serviceByID = make(map[string]ServiceInfo, len(ServiceCatalog))
	for _, s := range ServiceCatalog {
		serviceByID[s.ID] = s
	}
}

// ServiceLabel returns a human label for a known service id.
func ServiceLabel(id string) string {
	if s, ok := serviceByID[id]; ok {
		return s.Label
	}
	return id
}

// KnownService reports whether id is in the catalog.
func KnownService(id string) bool {
	_, ok := serviceByID[strings.ToLower(strings.TrimSpace(id))]
	return ok
}

// MonthlyPriceUSD returns the monthly price for a service (0 if unknown).
func MonthlyPriceUSD(id string) float64 {
	if s, ok := serviceByID[strings.ToLower(strings.TrimSpace(id))]; ok {
		return s.MonthlyUSD
	}
	return 0
}

// QuoteTotalUSD sums selected services for monthly or yearly (10× monthly).
func QuoteTotalUSD(serviceIDs []string, billingPeriod string) float64 {
	billing := strings.ToLower(strings.TrimSpace(billingPeriod))
	total := 0.0
	for _, id := range serviceIDs {
		total += MonthlyPriceUSD(id)
	}
	if billing == "yearly" {
		total *= 10
	}
	return total
}

// FormatAmount formats a USD total as "1.00".
func FormatAmount(total float64) string {
	return fmt.Sprintf("%.2f", total)
}

// EntitlementActive reports whether an entitlement row is still valid.
func EntitlementActive(e Entitlement, now time.Time) bool {
	if e.ValidUntil == "" {
		return true
	}
	until, err := time.Parse(time.RFC3339, e.ValidUntil)
	if err != nil {
		return true
	}
	return !now.After(until)
}

// HasServiceAccess is true for admin or an active entitlement for serviceID.
func HasServiceAccess(isAdmin bool, ents []Entitlement, serviceID string) bool {
	if isAdmin {
		return true
	}
	id := strings.ToLower(strings.TrimSpace(serviceID))
	now := time.Now().UTC()
	for _, e := range ents {
		if strings.EqualFold(e.ServiceID, id) && EntitlementActive(e, now) {
			return true
		}
	}
	return false
}

// BuildEntitlements creates entitlement rows for service IDs lasting months.
func BuildEntitlements(serviceIDs []string, billingPeriod string, months int) []Entitlement {
	if months < 1 {
		months = 1
	}
	billing := strings.ToLower(strings.TrimSpace(billingPeriod))
	if billing == "" {
		billing = "monthly"
	}
	now := time.Now().UTC()
	until := now.AddDate(0, months, 0)
	if billing == "yearly" {
		until = now.AddDate(1, 0, 0)
	}
	out := make([]Entitlement, 0, len(serviceIDs))
	for _, id := range serviceIDs {
		id = strings.ToLower(strings.TrimSpace(id))
		if !KnownService(id) {
			continue
		}
		out = append(out, Entitlement{
			ServiceID:     id,
			ServiceLabel:  ServiceLabel(id),
			BillingPeriod: billing,
			ValidFrom:     now.Format(time.RFC3339),
			ValidUntil:    until.Format(time.RFC3339),
		})
	}
	return out
}
