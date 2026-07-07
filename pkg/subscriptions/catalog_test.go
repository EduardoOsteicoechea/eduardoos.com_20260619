package subscriptions

import (
	"testing"
	"time"
)

func TestQuoteMonthly(t *testing.T) {
	total, name, err := Quote([]string{ServiceAIAgent, ServicePlaylist}, BillingMonthly)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("total = %v", total)
	}
	if name != "AI Agent + Playlist (Monthly)" {
		t.Fatalf("name = %q", name)
	}
}

func TestFilterPurchasable(t *testing.T) {
	allowed, blocked, err := FilterPurchasable(
		[]string{ServiceAIAgent, ServicePlaylist},
		[]string{ServicePlaylist},
		BillingMonthly,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(allowed) != 1 || allowed[0] != ServiceAIAgent {
		t.Fatalf("allowed = %v", allowed)
	}
	if len(blocked) != 1 || blocked[0] != ServicePlaylist {
		t.Fatalf("blocked = %v", blocked)
	}
}

func TestFilterPurchasableAllBlocked(t *testing.T) {
	_, _, err := FilterPurchasable([]string{ServicePamphlet}, []string{ServicePamphlet}, BillingMonthly)
	if err == nil {
		t.Fatal("expected error when all services are active")
	}
}

func TestFilterPurchasableYearlyAllowsActive(t *testing.T) {
	allowed, blocked, err := FilterPurchasable(
		[]string{ServiceAIAgent, ServicePlaylist},
		[]string{ServiceAIAgent, ServicePlaylist, ServicePamphlet},
		BillingYearly,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(blocked) != 0 {
		t.Fatalf("blocked = %v", blocked)
	}
	if len(allowed) != 2 {
		t.Fatalf("allowed = %v", allowed)
	}
}

func TestExtendEntitlementEndStacksOnActive(t *testing.T) {
	currentEnd := time.Date(2026, 8, 7, 12, 0, 0, 0, time.UTC)
	paidAt := time.Date(2026, 7, 7, 12, 0, 0, 0, time.UTC)
	extended, err := ExtendEntitlementEnd(currentEnd, paidAt, BillingYearly)
	if err != nil {
		t.Fatal(err)
	}
	want := currentEnd.AddDate(1, 0, 0)
	if !extended.Equal(want) {
		t.Fatalf("extended = %v want %v", extended, want)
	}
}
