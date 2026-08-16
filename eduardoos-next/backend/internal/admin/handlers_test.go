package admin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestListUsersAdminOnlyAndGrantEntitlements(t *testing.T) {
	secret := "admin-secret"
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	_ = store.PutUser(nil, auth.User{
		Email:        "member@example.com",
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleUser,
		CreatedAt:    auth.NowRFC3339(),
	})

	pay := payments.NewStore()
	h := NewHandler(secret, store, pay)
	r := chi.NewRouter()
	h.Routes(r)

	memberToken, err := auth.IssueJWT("member@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	denied := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	denied.Header.Set("Authorization", "Bearer "+memberToken)
	deniedRec := httptest.NewRecorder()
	r.ServeHTTP(deniedRec, denied)
	if deniedRec.Code != http.StatusForbidden {
		t.Fatalf("member status=%d want 403", deniedRec.Code)
	}

	adminToken, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	list := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	list.Header.Set("Authorization", "Bearer "+adminToken)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, list)
	if listRec.Code != http.StatusOK {
		t.Fatalf("admin list status=%d body=%s", listRec.Code, listRec.Body.String())
	}
	var listed map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if int(listed["count"].(float64)) < 2 {
		t.Fatalf("count=%v", listed["count"])
	}

	grantBody := `{"services":["debate","playlist"],"billing_period":"monthly","months":1}`
	grant := httptest.NewRequest(http.MethodPut, "/api/admin/users/member@example.com/entitlements",
		bytes.NewBufferString(grantBody))
	grant.Header.Set("Authorization", "Bearer "+adminToken)
	grant.Header.Set("Content-Type", "application/json")
	grantRec := httptest.NewRecorder()
	r.ServeHTTP(grantRec, grant)
	if grantRec.Code != http.StatusOK {
		t.Fatalf("grant status=%d body=%s", grantRec.Code, grantRec.Body.String())
	}
	ents := pay.ListEntitlements("member@example.com")
	if len(ents) != 2 {
		t.Fatalf("ents=%d want 2", len(ents))
	}
}

// failingUserStore returns an error from ListUsers (simulates Dynamo failure).
type failingUserStore struct {
	inner auth.UserStore
}

func (f *failingUserStore) BackendName() string { return "failing-test" }

func (f *failingUserStore) GetUser(ctx context.Context, email string) (auth.User, bool, error) {
	return f.inner.GetUser(ctx, email)
}

func (f *failingUserStore) PutUser(ctx context.Context, user auth.User) error {
	return f.inner.PutUser(ctx, user)
}

func (f *failingUserStore) ListUsers(context.Context) ([]auth.User, error) {
	return nil, errors.New("dynamo query failed")
}

func (f *failingUserStore) GetOTP(ctx context.Context, email string) (string, bool, error) {
	return f.inner.GetOTP(ctx, email)
}

func (f *failingUserStore) PutOTP(ctx context.Context, email, otp string) error {
	return f.inner.PutOTP(ctx, email, otp)
}

func (f *failingUserStore) DeleteOTP(ctx context.Context, email string) error {
	return f.inner.DeleteOTP(ctx, email)
}

func (f *failingUserStore) GetResetOTP(ctx context.Context, email string) (string, bool, error) {
	return f.inner.GetResetOTP(ctx, email)
}

func (f *failingUserStore) PutResetOTP(ctx context.Context, email, otp string) error {
	return f.inner.PutResetOTP(ctx, email, otp)
}

func (f *failingUserStore) DeleteResetOTP(ctx context.Context, email string) error {
	return f.inner.DeleteResetOTP(ctx, email)
}

func TestListUsersStoreErrorReturnsJSONNotPanic(t *testing.T) {
	secret := "admin-secret"
	base := auth.NewMemoryStore()
	_ = base.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	store := &failingUserStore{inner: base}
	h := NewHandler(secret, store, payments.NewStore())
	r := chi.NewRouter()
	h.Routes(r)

	adminToken, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status=%d want 502 body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["error"] == "" {
		t.Fatalf("expected JSON error, body=%s", rec.Body.String())
	}
}

func TestListUsersNilPaymentsDoesNotPanic(t *testing.T) {
	secret := "admin-secret"
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	h := NewHandler(secret, store, nil)
	r := chi.NewRouter()
	h.Routes(r)

	adminToken, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var listed map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	users, ok := listed["users"].([]any)
	if !ok || len(users) < 1 {
		t.Fatalf("users=%v", listed["users"])
	}
}
