package subscriptions

import "testing"

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
	_, _, err := FilterPurchasable([]string{ServicePamphlet}, []string{ServicePamphlet})
	if err == nil {
		t.Fatal("expected error when all services are active")
	}
}
