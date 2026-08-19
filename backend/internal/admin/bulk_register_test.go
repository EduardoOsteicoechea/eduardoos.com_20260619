package admin

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestBulkRegisterAdminOnlyCreatesAndReportsFailures(t *testing.T) {
	secret := "admin-bulk-secret"
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	_ = store.PutUser(nil, auth.User{
		Email:        "already@example.com",
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleUser,
		CreatedAt:    auth.NowRFC3339(),
	})

	authH := &auth.Handler{Store: store, JWTSecret: secret}
	h := NewHandler(secret, store, payments.NewStore())
	h.UseAuth(authH)
	r := chi.NewRouter()
	h.Routes(r)

	memberToken, err := auth.IssueJWT("already@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	deniedBody := `[{"name":"X","email":"x@example.com","password":"password12"}]`
	denied := httptest.NewRequest(http.MethodPost, "/api/admin/users/bulk-register",
		bytes.NewBufferString(deniedBody))
	denied.Header.Set("Authorization", "Bearer "+memberToken)
	denied.Header.Set("Content-Type", "application/json")
	deniedRec := httptest.NewRecorder()
	r.ServeHTTP(deniedRec, denied)
	if deniedRec.Code != http.StatusForbidden {
		t.Fatalf("member status=%d want 403", deniedRec.Code)
	}

	adminToken, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	// Mixed batch: Spanish aliases, duplicate existing, weak password, batch dup.
	payload := `[
		{"nombre":"Ana","correo":"ana@example.com","contrasena":"password12"},
		{"name":"Bob","email":"already@example.com","password":"password12"},
		{"name":"Weak","email":"weak@example.com","password":"short"},
		{"name":"Dup1","email":"dup@example.com","password":"password12"},
		{"name":"Dup2","email":"dup@example.com","password":"password12"},
		{"name":"","email":"not-an-email","password":"password12"}
	]`
	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/bulk-register",
		bytes.NewBufferString(payload))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("bulk status=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Created int `json:"created"`
		Failed  int `json:"failed"`
		Results []struct {
			Email  string `json:"email"`
			Status string `json:"status"`
			Reason string `json:"reason"`
			Name   string `json:"name"`
		} `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Created != 2 {
		t.Fatalf("created=%d want 2 body=%s", resp.Created, rec.Body.String())
	}
	if resp.Failed != 4 {
		t.Fatalf("failed=%d want 4 body=%s", resp.Failed, rec.Body.String())
	}

	u, ok, err := store.GetUser(nil, "ana@example.com")
	if err != nil || !ok {
		t.Fatalf("ana missing ok=%v err=%v", ok, err)
	}
	if u.Verified {
		t.Fatal("ana should be unverified pending OTP")
	}
	if u.Name != "Ana" {
		t.Fatalf("name=%q want Ana", u.Name)
	}
	if otp, otpOK, _ := store.GetOTP(nil, "ana@example.com"); !otpOK || len(otp) != 6 {
		t.Fatalf("otp missing or wrong len ok=%v otp=%q", otpOK, otp)
	}
	if !auth.CheckPassword("password12", u.PasswordHash) {
		t.Fatal("password hash mismatch")
	}

	dup, dupOK, _ := store.GetUser(nil, "dup@example.com")
	if !dupOK || dup.Name != "Dup1" {
		t.Fatalf("dup user=%+v ok=%v", dup, dupOK)
	}

	// Reasons present for failures; never echo passwords in response body.
	body := rec.Body.String()
	if strings.Contains(body, "password12") || strings.Contains(body, `"password"`) {
		t.Fatalf("response must not include passwords: %s", body)
	}
	reasons := map[string]string{}
	for _, row := range resp.Results {
		if row.Status == "failed" {
			reasons[row.Email] = row.Reason
		}
	}
	if reasons["already@example.com"] != "account already exists" {
		t.Fatalf("dup reason=%q", reasons["already@example.com"])
	}
	if reasons["weak@example.com"] != "password too short" {
		t.Fatalf("weak reason=%q", reasons["weak@example.com"])
	}
	if reasons["dup@example.com"] != "duplicate email in batch" {
		t.Fatalf("batch dup reason=%q", reasons["dup@example.com"])
	}
}

func TestBulkRegisterAcceptsWrappedUsersObject(t *testing.T) {
	secret := "admin-bulk-wrap"
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	authH := &auth.Handler{Store: store, JWTSecret: secret}
	h := NewHandler(secret, store, payments.NewStore())
	h.UseAuth(authH)
	r := chi.NewRouter()
	h.Routes(r)

	adminToken, err := auth.IssueJWT(auth.AdminEmail, secret)
	if err != nil {
		t.Fatal(err)
	}
	body := `{"users":[{"name":"Cara","email":"cara@example.com","password":"password12"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/bulk-register",
		bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if _, ok, err := store.GetUser(nil, "cara@example.com"); err != nil || !ok {
		t.Fatalf("cara missing ok=%v err=%v", ok, err)
	}
}
