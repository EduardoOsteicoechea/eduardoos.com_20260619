package homescool

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func mustHomescoolJWT(t *testing.T, email, secret string) string {
	t.Helper()
	tok, err := auth.IssueJWT(email, secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestTeacherRoutesRequireHomescoolSubscription(t *testing.T) {
	secret := "homescool-entitlement-secret"
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email:        "teacher@example.com",
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleUser,
	})
	_ = users.PutUser(context.Background(), auth.User{
		Email:        "student@example.com",
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleUser,
	})
	_ = users.PutUser(context.Background(), auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         auth.RoleAdmin,
	})

	pay := payments.NewStore()
	h := NewHandler(secret, users)
	h.Entitlements = pay
	r := chi.NewRouter()
	h.Routes(r)

	teacherTok := mustHomescoolJWT(t, "teacher@example.com", secret)
	studentTok := mustHomescoolJWT(t, "student@example.com", secret)
	adminTok := mustHomescoolJWT(t, auth.AdminEmail, secret)

	// Teacher without sub cannot register students.
	reg := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		strings.NewReader(`{"studentEmail":"student@example.com"}`))
	reg.Header.Set("Authorization", "Bearer "+teacherTok)
	reg.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, reg)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("teacher without sub register status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Grant teacher entitlement → register succeeds.
	pay.PutEntitlements("teacher@example.com", payments.BuildEntitlements([]string{"homescool"}, "monthly", 1))
	reg2 := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		strings.NewReader(`{"studentEmail":"student@example.com"}`))
	reg2.Header.Set("Authorization", "Bearer "+teacherTok)
	reg2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, reg2)
	if rec2.Code != http.StatusCreated && rec2.Code != http.StatusOK {
		t.Fatalf("teacher with sub register status=%d body=%s", rec2.Code, rec2.Body.String())
	}

	// Linked student without sub can still list learning spaces.
	learn := httptest.NewRequest(http.MethodGet, "/api/homescool/learning", nil)
	learn.Header.Set("Authorization", "Bearer "+studentTok)
	rec3 := httptest.NewRecorder()
	r.ServeHTTP(rec3, learn)
	if rec3.Code != http.StatusOK {
		t.Fatalf("linked student learning status=%d body=%s", rec3.Code, rec3.Body.String())
	}
	var learnOut map[string]any
	if err := json.Unmarshal(rec3.Body.Bytes(), &learnOut); err != nil {
		t.Fatal(err)
	}
	links, _ := learnOut["links"].([]any)
	if len(links) < 1 {
		t.Fatalf("expected at least one learning link, got %#v", learnOut)
	}

	// Linked student cannot hit teacher roster without sub.
	list := httptest.NewRequest(http.MethodGet, "/api/homescool/students", nil)
	list.Header.Set("Authorization", "Bearer "+studentTok)
	rec4 := httptest.NewRecorder()
	r.ServeHTTP(rec4, list)
	if rec4.Code != http.StatusForbidden {
		t.Fatalf("student teacher-list status=%d want 403 body=%s", rec4.Code, rec4.Body.String())
	}

	// Admin bypasses teacher entitlement.
	adminList := httptest.NewRequest(http.MethodGet, "/api/homescool/students", nil)
	adminList.Header.Set("Authorization", "Bearer "+adminTok)
	rec5 := httptest.NewRecorder()
	r.ServeHTTP(rec5, adminList)
	if rec5.Code != http.StatusOK {
		t.Fatalf("admin list status=%d body=%s", rec5.Code, rec5.Body.String())
	}
}

func TestLinkStudentChecker(t *testing.T) {
	links := NewMemoryStore()
	_, err := links.Create(context.Background(), "teacher@example.com", "student@example.com")
	if err != nil {
		t.Fatal(err)
	}
	checker := LinkStudentChecker{Links: links}
	ok, err := checker.IsHomescoolStudent(context.Background(), "student@example.com")
	if err != nil || !ok {
		t.Fatalf("student linked ok=%v err=%v", ok, err)
	}
	ok, err = checker.IsHomescoolStudent(context.Background(), "stranger@example.com")
	if err != nil || ok {
		t.Fatalf("stranger ok=%v err=%v", ok, err)
	}
}
