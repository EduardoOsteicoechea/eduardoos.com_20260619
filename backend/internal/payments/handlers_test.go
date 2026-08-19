package payments

import (
	"bytes"
	"context"
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

func TestCheckAccessAdminBypassHomescoolAndDebate(t *testing.T) {
	secret := "access-secret"
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleAdmin,
	})
	_ = users.PutUser(context.Background(), auth.User{
		Email:        "role-admin@example.com",
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleAdmin,
	})
	_ = users.PutUser(context.Background(), auth.User{
		Email:        "member@example.com",
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleUser,
	})

	h := NewHandler(secret, "BTN")
	h.Users = users
	r := chi.NewRouter()
	h.Routes(r)

	cases := []struct {
		name    string
		email   string
		service string
		wantOK  bool
	}{
		{"bootstrap admin homescool", auth.AdminEmail, "homescool", true},
		{"bootstrap admin debate", auth.AdminEmail, "debate", true},
		{"role admin homescool", "role-admin@example.com", "homescool", true},
		{"role admin debate", "role-admin@example.com", "debate", true},
		{"member denied homescool", "member@example.com", "homescool", false},
		{"member denied debate", "member@example.com", "debate", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			token, err := auth.IssueJWTWithRole(tc.email, "", secret)
			if err != nil {
				t.Fatal(err)
			}
			// Re-resolve stored role for non-bootstrap admins.
			if u, ok, _ := users.GetUser(context.Background(), tc.email); ok {
				token, err = auth.IssueJWTWithRole(tc.email, u.Role, secret)
				if err != nil {
					t.Fatal(err)
				}
			}
			req := httptest.NewRequest(http.MethodGet, "/api/subscriptions/access/"+tc.service, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
			}
			var out map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
				t.Fatal(err)
			}
			allowed, _ := out["allowed"].(bool)
			if allowed != tc.wantOK {
				t.Fatalf("allowed=%v want %v (is_admin=%v)", allowed, tc.wantOK, out["is_admin"])
			}
			if tc.wantOK && out["is_admin"] != true {
				t.Fatalf("expected is_admin true for allowed admin case, got %#v", out)
			}
		})
	}
}

// stubHomescoolStudents implements HomescoolStudentChecker for access tests.
type stubHomescoolStudents map[string]bool

func (s stubHomescoolStudents) IsHomescoolStudent(_ context.Context, email string) (bool, error) {
	return s[auth.NormalizeEmail(email)], nil
}

func TestCheckAccessHomescoolLinkedStudentBypass(t *testing.T) {
	secret := "access-student-secret"
	users := auth.NewMemoryStore()
	for _, email := range []string{
		"linked-student@example.com",
		"teacher-no-sub@example.com",
		"stranger@example.com",
		auth.AdminEmail,
	} {
		role := auth.RoleUser
		if auth.IsAdminEmail(email) {
			role = auth.RoleAdmin
		}
		_ = users.PutUser(context.Background(), auth.User{
			Email:        email,
			PasswordHash: auth.HashPassword("password123"),
			Verified:     true,
			Role:         role,
		})
	}

	h := NewHandler(secret, "BTN")
	h.Users = users
	h.HomescoolStudents = stubHomescoolStudents{
		"linked-student@example.com": true,
	}
	r := chi.NewRouter()
	h.Routes(r)

	access := func(t *testing.T, email, service string) map[string]any {
		t.Helper()
		u, ok, _ := users.GetUser(context.Background(), email)
		role := auth.RoleUser
		if ok {
			role = u.Role
		}
		token, err := auth.IssueJWTWithRole(email, role, secret)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/api/subscriptions/access/"+service, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		var out map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	t.Run("linked student allowed without entitlement", func(t *testing.T) {
		out := access(t, "linked-student@example.com", "homescool")
		if out["allowed"] != true {
			t.Fatalf("allowed=%v want true", out["allowed"])
		}
		if out["is_homescool_student"] != true {
			t.Fatalf("is_homescool_student=%v want true", out["is_homescool_student"])
		}
		if out["has_entitlement"] != false {
			t.Fatalf("has_entitlement=%v want false", out["has_entitlement"])
		}
		if out["is_admin"] != false {
			t.Fatalf("is_admin=%v want false", out["is_admin"])
		}
	})

	t.Run("non-linked user denied without entitlement", func(t *testing.T) {
		out := access(t, "stranger@example.com", "homescool")
		if out["allowed"] != false {
			t.Fatalf("allowed=%v want false", out["allowed"])
		}
		if out["is_homescool_student"] != false {
			t.Fatalf("is_homescool_student=%v want false", out["is_homescool_student"])
		}
	})

	t.Run("teacher without sub denied (not a linked student)", func(t *testing.T) {
		out := access(t, "teacher-no-sub@example.com", "homescool")
		if out["allowed"] != false {
			t.Fatalf("allowed=%v want false", out["allowed"])
		}
	})

	t.Run("admin allowed without entitlement or student link", func(t *testing.T) {
		out := access(t, auth.AdminEmail, "homescool")
		if out["allowed"] != true {
			t.Fatalf("allowed=%v want true", out["allowed"])
		}
		if out["is_admin"] != true {
			t.Fatalf("is_admin=%v want true", out["is_admin"])
		}
	})

	t.Run("linked student still denied for other services", func(t *testing.T) {
		out := access(t, "linked-student@example.com", "debate")
		if out["allowed"] != false {
			t.Fatalf("debate allowed=%v want false", out["allowed"])
		}
	})
}
