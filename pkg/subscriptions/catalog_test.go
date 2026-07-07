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

func TestQuoteYearly(t *testing.T) {
	total, _, err := Quote([]string{ServicePamphlet}, BillingYearly)
	if err != nil {
		t.Fatal(err)
	}
	if total != 10 {
		t.Fatalf("total = %v", total)
	}
}

func TestExtendEntitlementEndStacksRenewal(t *testing.T) {
	now := time.Date(2026, 7, 7, 12, 0, 0, 0, time.UTC)
	currentEnd := now.AddDate(0, 0, 15)
	end, err := ExtendEntitlementEnd(currentEnd, now, BillingMonthly)
	if err != nil {
		t.Fatal(err)
	}
	want := currentEnd.AddDate(0, 1, 0)
	if !end.Equal(want) {
		t.Fatalf("end = %v want %v", end, want)
	}
}
