package admin

import (
	"bytes"
	"encoding/json"
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
