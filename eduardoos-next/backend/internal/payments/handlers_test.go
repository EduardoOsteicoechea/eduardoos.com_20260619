package payments

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestCreateIntentRequiresJWTAndReturnsHostedButton(t *testing.T) {
	secret := "pay-test-secret"
	token, err := auth.IssueJWT("buyer@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, "TEST_BUTTON_ID")
	r := chi.NewRouter()
	h.Routes(r)

	body := `{"email":"buyer@example.com","services":["playlist","pamphlet"],"billing_period":"monthly"}`
	req := httptest.NewRequest(http.MethodPost, "/api/payments/intents", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["intent_id"] == "" || resp["hosted_button_id"] != "TEST_BUTTON_ID" {
		t.Fatalf("unexpected intent response: %#v", resp)
	}
	if resp["amount"] != "2.00" {
		t.Fatalf("amount=%v want 2.00", resp["amount"])
	}
	if resp["paypal_checkout_mode"] != "hosted" {
		t.Fatalf("mode=%v", resp["paypal_checkout_mode"])
	}

	intentID, _ := resp["intent_id"].(string)
	statusReq := httptest.NewRequest(http.MethodGet, "/api/payments/status/"+intentID, nil)
	statusRec := httptest.NewRecorder()
	r.ServeHTTP(statusRec, statusReq)
	if statusRec.Code != http.StatusOK {
		t.Fatalf("status poll=%d body=%s", statusRec.Code, statusRec.Body.String())
	}
	var status map[string]any
	if err := json.Unmarshal(statusRec.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status["status"] != "pending" {
		t.Fatalf("expected pending, got %#v", status)
	}
}

func TestCreateIntentRejectsWithoutJWT(t *testing.T) {
	h := NewHandler("secret", "BTN")
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodPost, "/api/payments/intents",
		bytes.NewBufferString(`{"email":"x@example.com","plan_id":"subscription_monthly_basic"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want 401", rec.Code)
	}
}

func TestEntitlementsPreviewAndMine(t *testing.T) {
	secret := "ent-secret"
	token, err := auth.IssueJWT("member@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret, "BTN")
	h.Store.PutEntitlements("member@example.com", []Entitlement{{
		ServiceID:     "playlist",
		ServiceLabel:  "Playlist",
		BillingPeriod: "monthly",
		ValidFrom:     time.Now().UTC().Format(time.RFC3339),
		ValidUntil:    time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
	}})
	r := chi.NewRouter()
	h.Routes(r)

	preview := httptest.NewRequest(http.MethodGet, "/api/subscriptions/entitlements/preview?email=member@example.com", nil)
	previewRec := httptest.NewRecorder()
	r.ServeHTTP(previewRec, preview)
	if previewRec.Code != http.StatusOK {
		t.Fatalf("preview status=%d body=%s", previewRec.Code, previewRec.Body.String())
	}

	mine := httptest.NewRequest(http.MethodGet, "/api/subscriptions/entitlements", nil)
	mine.Header.Set("Authorization", "Bearer "+token)
	mineRec := httptest.NewRecorder()
	r.ServeHTTP(mineRec, mine)
	if mineRec.Code != http.StatusOK {
		t.Fatalf("mine status=%d body=%s", mineRec.Code, mineRec.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(mineRec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	ents, ok := out["entitlements"].([]any)
	if !ok || len(ents) != 1 {
		t.Fatalf("entitlements=%#v", out["entitlements"])
	}
}
