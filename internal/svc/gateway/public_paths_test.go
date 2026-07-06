package gateway

import "testing"

func TestIsPublicPaymentRoutes(t *testing.T) {
	public := []string{
		"/api/payments/intents",
		"/api/payments/status/intent-123",
		"/api/payments/webhook/paypal",
	}
	for _, path := range public {
		if !isPublic(path) {
			t.Fatalf("expected public path %q", path)
		}
	}
	if isPublic("/api/payments/private") {
		t.Fatal("unexpected public path /api/payments/private")
	}
}
