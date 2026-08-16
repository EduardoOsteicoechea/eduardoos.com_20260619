package payments

import "testing"

func TestQuoteTotalUSDDebateAndBundle(t *testing.T) {
	if got := QuoteTotalUSD([]string{"debate"}, "monthly"); got != 3 {
		t.Fatalf("debate monthly=%v want 3", got)
	}
	if got := QuoteTotalUSD([]string{"playlist", "pamphlet"}, "monthly"); got != 2 {
		t.Fatalf("two dollar services=%v want 2", got)
	}
	if got := QuoteTotalUSD([]string{"debate", "playlist"}, "monthly"); got != 4 {
		t.Fatalf("debate+music=%v want 4", got)
	}
	if got := QuoteTotalUSD([]string{"playlist"}, "yearly"); got != 10 {
		t.Fatalf("playlist yearly=%v want 10", got)
	}
}

func TestHasServiceAccessAdminBypass(t *testing.T) {
	if !HasServiceAccess(true, nil, "debate") {
		t.Fatal("admin should access debate without entitlements")
	}
	if HasServiceAccess(false, nil, "debate") {
		t.Fatal("non-admin without entitlements must be denied")
	}
}
