package payments

import "testing"

func TestQuoteTotalUSDBundle(t *testing.T) {
	if got := QuoteTotalUSD([]string{"homescool"}, "monthly"); got != 1 {
		t.Fatalf("homescool monthly=%v want 1", got)
	}
	if got := QuoteTotalUSD([]string{"playlist", "pamphlet"}, "monthly"); got != 2 {
		t.Fatalf("two dollar services=%v want 2", got)
	}
	if got := QuoteTotalUSD([]string{"homescool", "playlist"}, "monthly"); got != 2 {
		t.Fatalf("homescool+music=%v want 2", got)
	}
	if got := QuoteTotalUSD([]string{"playlist"}, "yearly"); got != 10 {
		t.Fatalf("playlist yearly=%v want 10", got)
	}
}

func TestHasServiceAccessAdminBypass(t *testing.T) {
	if !HasServiceAccess(true, nil, "pamphlet") {
		t.Fatal("admin should access pamphlet without entitlements")
	}
	if !HasServiceAccess(true, nil, "homescool") {
		t.Fatal("admin should access homescool without entitlements")
	}
	if HasServiceAccess(false, nil, "pamphlet") {
		t.Fatal("non-admin without entitlements must be denied")
	}
	if HasServiceAccess(false, nil, "homescool") {
		t.Fatal("non-admin without entitlements must be denied homescool")
	}
}

func TestPamphletInCatalog(t *testing.T) {
	if !KnownService("pamphlet") {
		t.Fatal("pamphlet must be a known service")
	}
	if got := MonthlyPriceUSD("pamphlet"); got != 1 {
		t.Fatalf("pamphlet monthly=%v want 1", got)
	}
	if !HasServiceAccess(true, nil, "pamphlet") {
		t.Fatal("admin should access pamphlet")
	}
}

func TestChurchManagementInCatalog(t *testing.T) {
	if !KnownService("church-management") {
		t.Fatal("church-management must be a known service")
	}
	if got := MonthlyPriceUSD("church-management"); got != 1 {
		t.Fatalf("church-management monthly=%v want 1", got)
	}
	if !HasServiceAccess(true, nil, "church-management") {
		t.Fatal("admin should access church-management")
	}
	if HasServiceAccess(false, nil, "church-management") {
		t.Fatal("non-admin without entitlement must be denied")
	}
}

func TestEvoiceCatalogAndAllowlist(t *testing.T) {
	if !KnownService("evoice") {
		t.Fatal("evoice must be a known service")
	}
	if got := MonthlyPriceUSD("evoice"); got != 1 {
		t.Fatalf("evoice monthly=%v want 1", got)
	}
	if !IsEvoiceAllowlisted("eliasosteic@gmail.com") {
		t.Fatal("eliasosteic must be allowlisted")
	}
	if !IsEvoiceAllowlisted("Laleskavf.2una@gmail.com") {
		t.Fatal("laleskavf must be allowlisted (case-insensitive)")
	}
	if IsEvoiceAllowlisted("stranger@example.com") {
		t.Fatal("stranger must not be allowlisted")
	}
}
