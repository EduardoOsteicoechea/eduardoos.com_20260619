package church

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func seedUser(t *testing.T, store auth.UserStore, email, role string) {
	t.Helper()
	if err := store.PutUser(t.Context(), auth.User{
		Email:        email,
		PasswordHash: auth.HashPassword("password123"),
		Verified:     true,
		Role:         role,
	}); err != nil {
		t.Fatal(err)
	}
}

func testRouter(t *testing.T) (*Handler, chi.Router, auth.UserStore) {
	t.Helper()
	users := auth.NewMemoryStore()
	h := NewHandler("church-secret", users)
	r := chi.NewRouter()
	h.Routes(r)
	return h, r, users
}

func bearer(t *testing.T, email, role string) string {
	t.Helper()
	tok, err := auth.IssueJWTWithRole(email, role, "church-secret")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestKeysAndRoles(t *testing.T) {
	if got := SanitizeSlug("Iglesia Central!"); got != "iglesia-central" {
		t.Fatalf("SanitizeSlug=%s", got)
	}
	if !IsValidSlug("asambleas") || IsValidSlug("../x") {
		t.Fatal("slug validation")
	}
	if got := ChurchPrefix("asambleas", "central"); got != "church/asambleas/central" {
		t.Fatalf("ChurchPrefix=%s", got)
	}
	if NormalizeChurchRole("church-admin") != RoleChurchAdmin {
		t.Fatal("admin role")
	}
	if NormalizeChurchRole("member") != RoleChurchMember {
		t.Fatal("member role")
	}
	if CatalogSK("d1", "c1") != "church:d:d1|c:c1" {
		t.Fatal("catalog sk")
	}
}

func TestRegisterListDetailAndMemberFilter(t *testing.T) {
	h, r, users := testRouter(t)
	seedUser(t, users, "admin@example.com", auth.RoleAdmin)
	seedUser(t, users, "pastor@example.com", auth.RoleUser)
	seedUser(t, users, "member@example.com", auth.RoleUser)

	// Register as pastor.
	payload := map[string]any{
		"name":           "Iglesia Central",
		"denominationId": "asambleas",
		"churchId":       "central",
		"pastors":        []string{"Pastor Ana"},
		"network":        "Asambleas de Dios",
		"beliefsDocument": "Creemos en un solo Dios.",
		"sectorActivities": []map[string]string{
			{"sector": "juventud", "description": "Viernes"},
		},
		"members": []map[string]string{
			{"email": "member@example.com", "name": "Luis", "role": "church-member"},
		},
	}
	body, _ := json.Marshal(payload)
	reg := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	r.ServeHTTP(rw, reg)
	if rw.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", rw.Code, rw.Body.String())
	}

	// Restrict member to no activities yet — authorize empty means all; set authorized ids empty on member = all.
	// Add an activity as pastor.
	actBody, _ := json.Marshal(map[string]any{
		"title":     "Culto domingo",
		"sector":    "adoracion",
		"startDate": "2026-08-17",
		"endDate":   "2026-08-17",
		"authorizedEmails": []string{"member@example.com"},
	})
	actReq := httptest.NewRequest(http.MethodPost, "/api/church/asambleas/central/activities", bytes.NewReader(actBody))
	actReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	actReq.Header.Set("Content-Type", "application/json")
	actRW := httptest.NewRecorder()
	r.ServeHTTP(actRW, actReq)
	if actRW.Code != http.StatusCreated {
		t.Fatalf("create activity status=%d body=%s", actRW.Code, actRW.Body.String())
	}

	// List search.
	list := httptest.NewRequest(http.MethodGet, "/api/church?q=central", nil)
	list.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	listRW := httptest.NewRecorder()
	r.ServeHTTP(listRW, list)
	if listRW.Code != http.StatusOK || !strings.Contains(listRW.Body.String(), "Iglesia Central") {
		t.Fatalf("list status=%d body=%s", listRW.Code, listRW.Body.String())
	}

	// Member can get detail.
	get := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central", nil)
	get.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	getRW := httptest.NewRecorder()
	r.ServeHTTP(getRW, get)
	if getRW.Code != http.StatusOK {
		t.Fatalf("member get status=%d body=%s", getRW.Code, getRW.Body.String())
	}
	if !strings.Contains(getRW.Body.String(), "Culto domingo") {
		t.Fatalf("member should see authorized activity: %s", getRW.Body.String())
	}

	// Stranger denied.
	stranger := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central", nil)
	stranger.Header.Set("Authorization", "Bearer "+bearer(t, "other@example.com", auth.RoleUser))
	seedUser(t, users, "other@example.com", auth.RoleUser)
	strRW := httptest.NewRecorder()
	r.ServeHTTP(strRW, stranger)
	if strRW.Code != http.StatusForbidden {
		t.Fatalf("stranger status=%d", strRW.Code)
	}

	// Platform admin allowed.
	adminGet := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central", nil)
	adminGet.Header.Set("Authorization", "Bearer "+bearer(t, "admin@example.com", auth.RoleAdmin))
	adminRW := httptest.NewRecorder()
	r.ServeHTTP(adminRW, adminGet)
	if adminRW.Code != http.StatusOK {
		t.Fatalf("admin get status=%d", adminRW.Code)
	}

	// Overview for pastor.
	ov := httptest.NewRequest(http.MethodGet, "/api/church/overview", nil)
	ov.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	ovRW := httptest.NewRecorder()
	r.ServeHTTP(ovRW, ov)
	if ovRW.Code != http.StatusOK || !strings.Contains(ovRW.Body.String(), "church-admin") {
		t.Fatalf("overview status=%d body=%s", ovRW.Code, ovRW.Body.String())
	}

	// Activity feed.
	my := httptest.NewRequest(http.MethodGet, "/api/church/activity", nil)
	my.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	myRW := httptest.NewRecorder()
	r.ServeHTTP(myRW, my)
	if myRW.Code != http.StatusOK || !strings.Contains(myRW.Body.String(), "Culto domingo") {
		t.Fatalf("my activities status=%d body=%s", myRW.Code, myRW.Body.String())
	}

	// Text report.
	var actResp struct {
		Activity Activity `json:"activity"`
	}
	_ = json.Unmarshal(actRW.Body.Bytes(), &actResp)
	repBody, _ := json.Marshal(map[string]string{"text": "Se realizó el culto con éxito."})
	repURL := "/api/church/asambleas/central/activities/" + actResp.Activity.ID + "/report"
	repReq := httptest.NewRequest(http.MethodPost, repURL, bytes.NewReader(repBody))
	repReq.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	repReq.Header.Set("Content-Type", "application/json")
	repRW := httptest.NewRecorder()
	r.ServeHTTP(repRW, repReq)
	if repRW.Code != http.StatusCreated {
		t.Fatalf("report status=%d body=%s", repRW.Code, repRW.Body.String())
	}

	_ = h
}

func TestUnauthenticatedRejected(t *testing.T) {
	_, r, _ := testRouter(t)
	req := httptest.NewRequest(http.MethodGet, "/api/church", nil)
	rw := httptest.NewRecorder()
	r.ServeHTTP(rw, req)
	if rw.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rw.Code)
	}
}
