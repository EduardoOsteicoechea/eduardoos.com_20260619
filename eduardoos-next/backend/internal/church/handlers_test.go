package church

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
	h.Entitlements = payments.NewStore()
	r := chi.NewRouter()
	h.Routes(r)
	return h, r, users
}

func grantRegisterAccess(t *testing.T, h *Handler, email string) {
	t.Helper()
	_, err := h.Authorizations.Put(t.Context(), AuthorizationRequest{
		Email:       email,
		Status:      AuthStatusApproved,
		RequestedAt: nowAuthRFC3339(),
		DecidedAt:   nowAuthRFC3339(),
		DecidedBy:   "admin@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	h.Entitlements.PutEntitlements(email, payments.BuildEntitlements(
		[]string{"church-management"}, "monthly", 1,
	))
}

func seedDenomGroup(t *testing.T, h *Handler, id, name string) {
	t.Helper()
	_, err := h.Groups.Create(t.Context(), DenominationGroup{
		ID: id, Name: name, CreatedAt: nowRFC3339(), UpdatedAt: nowRFC3339(),
	})
	if err != nil {
		t.Fatal(err)
	}
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
	grantRegisterAccess(t, h, "pastor@example.com")
	seedDenomGroup(t, h, "asambleas", "Asambleas de Dios")

	// Register as pastor with leaders + church card + member assignment.
	payload := map[string]any{
		"denominationId": "asambleas",
		"leaders": []map[string]any{
			{
				"firstName": "Ana", "lastName": "García",
				"phone": "+58 412 1234567", "email": "ana@example.com",
				"roles": []string{"elder-bishop-pastor"},
			},
		},
		"churches": []map[string]any{
			{
				"name": "Iglesia Central", "churchId": "central",
				"openedAt": "2019-03-01", "address": "Calle 1",
				"leadership": []string{"Ana García"},
			},
		},
		"beliefsDocument": "Creemos en un solo Dios.",
		"sectorActivities": []map[string]string{
			{"sector": "juventud", "description": "Viernes"},
		},
		"members": []map[string]string{
			{
				"email": "member@example.com", "firstName": "Luis",
				"role": "church-member", "churchId": "central",
			},
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

func TestRegisterRequiresApprovalAndSubscription(t *testing.T) {
	h, r, users := testRouter(t)
	seedUser(t, users, "pastor@example.com", auth.RoleUser)
	seedDenomGroup(t, h, "local", "Local")

	payload := map[string]any{
		"name": "Iglesia Norte", "denominationId": "local", "churchId": "norte",
	}
	body, _ := json.Marshal(payload)

	// No request yet → forbidden.
	reg := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	r.ServeHTTP(rw, reg)
	if rw.Code != http.StatusForbidden {
		t.Fatalf("unapproved register status=%d body=%s", rw.Code, rw.Body.String())
	}

	// Request authorization.
	reqAuth := httptest.NewRequest(http.MethodPost, "/api/church/authorization/request", nil)
	reqAuth.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reqRW := httptest.NewRecorder()
	r.ServeHTTP(reqRW, reqAuth)
	if reqRW.Code != http.StatusCreated {
		t.Fatalf("request status=%d body=%s", reqRW.Code, reqRW.Body.String())
	}

	// Still pending → forbidden.
	reg2 := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg2.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg2.Header.Set("Content-Type", "application/json")
	rw2 := httptest.NewRecorder()
	r.ServeHTTP(rw2, reg2)
	if rw2.Code != http.StatusForbidden {
		t.Fatalf("pending register status=%d", rw2.Code)
	}

	// Approve but no entitlement → still forbidden.
	_, err := h.Authorizations.Put(t.Context(), AuthorizationRequest{
		Email: "pastor@example.com", Status: AuthStatusApproved,
		RequestedAt: nowAuthRFC3339(), DecidedAt: nowAuthRFC3339(),
	})
	if err != nil {
		t.Fatal(err)
	}
	reg3 := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg3.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg3.Header.Set("Content-Type", "application/json")
	rw3 := httptest.NewRecorder()
	r.ServeHTTP(rw3, reg3)
	if rw3.Code != http.StatusForbidden || !strings.Contains(rw3.Body.String(), "subscribe") {
		t.Fatalf("approved-no-sub status=%d body=%s", rw3.Code, rw3.Body.String())
	}

	// Entitlement unlocks register.
	h.Entitlements.PutEntitlements("pastor@example.com", payments.BuildEntitlements(
		[]string{"church-management"}, "monthly", 1,
	))
	reg4 := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg4.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg4.Header.Set("Content-Type", "application/json")
	rw4 := httptest.NewRecorder()
	r.ServeHTTP(rw4, reg4)
	if rw4.Code != http.StatusCreated {
		t.Fatalf("approved+sub register status=%d body=%s", rw4.Code, rw4.Body.String())
	}

	// Platform admin bypasses without auth row / entitlement.
	seedUser(t, users, "admin@example.com", auth.RoleAdmin)
	adminBody, _ := json.Marshal(map[string]any{
		"name": "Admin Church", "denominationId": "local", "churchId": "admin-chapel",
	})
	regAdmin := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(adminBody))
	regAdmin.Header.Set("Authorization", "Bearer "+bearer(t, "admin@example.com", auth.RoleAdmin))
	regAdmin.Header.Set("Content-Type", "application/json")
	rwAdmin := httptest.NewRecorder()
	r.ServeHTTP(rwAdmin, regAdmin)
	if rwAdmin.Code != http.StatusCreated {
		t.Fatalf("admin register status=%d body=%s", rwAdmin.Code, rwAdmin.Body.String())
	}
}

func TestGroupsAdminOnlyAndRegisterRequiresCatalog(t *testing.T) {
	h, r, users := testRouter(t)
	seedUser(t, users, "admin@example.com", auth.RoleAdmin)
	seedUser(t, users, "pastor@example.com", auth.RoleUser)
	grantRegisterAccess(t, h, "pastor@example.com")

	// Non-admin cannot create group.
	body, _ := json.Marshal(map[string]string{"name": "Asambleas", "id": "asambleas"})
	req := httptest.NewRequest(http.MethodPost, "/api/church/groups", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	req.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	r.ServeHTTP(rw, req)
	if rw.Code != http.StatusForbidden {
		t.Fatalf("non-admin create group status=%d", rw.Code)
	}

	// Admin creates group.
	req = httptest.NewRequest(http.MethodPost, "/api/church/groups", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearer(t, "admin@example.com", auth.RoleAdmin))
	req.Header.Set("Content-Type", "application/json")
	rw = httptest.NewRecorder()
	r.ServeHTTP(rw, req)
	if rw.Code != http.StatusCreated {
		t.Fatalf("admin create group status=%d body=%s", rw.Code, rw.Body.String())
	}

	// Register without catalog denom fails.
	regBody, _ := json.Marshal(map[string]any{
		"name": "X", "denominationId": "missing", "churchId": "x",
	})
	reg := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(regBody))
	reg.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg.Header.Set("Content-Type", "application/json")
	regRW := httptest.NewRecorder()
	r.ServeHTTP(regRW, reg)
	if regRW.Code != http.StatusBadRequest {
		t.Fatalf("missing group register status=%d body=%s", regRW.Code, regRW.Body.String())
	}

	// Multi-church register with member assignment.
	multi, _ := json.Marshal(map[string]any{
		"denominationId": "asambleas",
		"leaders": []map[string]any{
			{"firstName": "Ana", "lastName": "Ruiz", "roles": []string{"evangelist"}},
			{"firstName": "Luis", "lastName": "Díaz", "roles": []string{"ministry-leader"}},
		},
		"churches": []map[string]any{
			{"name": "Norte", "churchId": "norte", "openedAt": "2020-01-01", "address": "A", "leadership": []string{"Ana Ruiz"}},
			{"name": "Sur", "churchId": "sur", "openedAt": "2021-01-01", "address": "B", "leadership": []string{"Luis Díaz"}},
		},
		"members": []map[string]string{
			{"email": "member@example.com", "firstName": "M", "churchId": "sur", "role": "church-member"},
		},
	})
	seedUser(t, users, "member@example.com", auth.RoleUser)
	reg2 := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(multi))
	reg2.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg2.Header.Set("Content-Type", "application/json")
	reg2RW := httptest.NewRecorder()
	r.ServeHTTP(reg2RW, reg2)
	if reg2RW.Code != http.StatusCreated {
		t.Fatalf("multi register status=%d body=%s", reg2RW.Code, reg2RW.Body.String())
	}
	if !strings.Contains(reg2RW.Body.String(), `"churchId":"norte"`) || !strings.Contains(reg2RW.Body.String(), `"churchId":"sur"`) {
		t.Fatalf("expected both churches: %s", reg2RW.Body.String())
	}

	// Member only on sur.
	get := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/sur", nil)
	get.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	getRW := httptest.NewRecorder()
	r.ServeHTTP(getRW, get)
	if getRW.Code != http.StatusOK {
		t.Fatalf("member sur status=%d", getRW.Code)
	}
	getNorte := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/norte", nil)
	getNorte.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	norteRW := httptest.NewRecorder()
	r.ServeHTTP(norteRW, getNorte)
	if norteRW.Code != http.StatusForbidden {
		t.Fatalf("member norte should be forbidden status=%d", norteRW.Code)
	}

	_ = h
}

func TestAuthRequestSK(t *testing.T) {
	if AuthRequestSK("Pastor@Example.com") != "church-auth:u:pastor@example.com" {
		t.Fatal("auth sk")
	}
	if GroupSK("asambleas") != "church-group:g:asambleas" {
		t.Fatal("group sk")
	}
	if GroupMetaKey("asambleas") != "church/groups/asambleas/group.json" {
		t.Fatal("group meta key")
	}
	if LeaderSK("ana-garcia") != "church-leader:l:ana-garcia" {
		t.Fatal("leader sk")
	}
	if LeaderMetaKey("ana-garcia") != "church/leaders/ana-garcia/leader.json" {
		t.Fatal("leader meta key")
	}
	if !IsValidLeaderRole(LeaderRoleEvangelist) {
		t.Fatal("leader role")
	}
}

func TestNormalizeLeadersLegacyAndStructured(t *testing.T) {
	legacy := normalizeLeaders([]Leader{
		{Name: "Pastor Ana", Roles: []string{"elder-bishop-pastor", "bogus"}},
	})
	if len(legacy) != 1 || legacy[0].Name != "Pastor Ana" || len(legacy[0].Roles) != 1 {
		t.Fatalf("legacy: %+v", legacy)
	}

	structured := normalizeLeaders([]Leader{
		{
			FirstName: "Luis", LastName: "Pérez",
			Phone: "+58 414 0000000", Email: "Luis@Example.com",
			Roles: []string{"evangelist"},
		},
	})
	if len(structured) != 1 {
		t.Fatalf("structured len=%d", len(structured))
	}
	got := structured[0]
	if got.Name != "Luis Pérez" || got.FirstName != "Luis" || got.LastName != "Pérez" {
		t.Fatalf("display: %+v", got)
	}
	if got.Email != "luis@example.com" || got.Phone == "" {
		t.Fatalf("contact: %+v", got)
	}

	incomplete := normalizeLeaders([]Leader{
		{FirstName: "Solo", Roles: []string{"evangelist"}},
	})
	if len(incomplete) != 0 {
		t.Fatalf("expected incomplete dropped: %+v", incomplete)
	}

	if err := validateLeaderContacts([]Leader{{Email: "not-an-email"}}); err == nil {
		t.Fatal("expected invalid email error")
	}
	if err := validateLeaderContacts([]Leader{{Phone: "abc"}}); err == nil {
		t.Fatal("expected invalid phone error")
	}
	if err := validateLeaderContacts([]Leader{{Phone: "+58 412 1234567", Email: "ok@ex.com"}}); err != nil {
		t.Fatalf("valid contacts: %v", err)
	}
}

func TestLeadersCatalogAndBeliefsRegister(t *testing.T) {
	h, r, users := testRouter(t)
	seedUser(t, users, "admin@example.com", auth.RoleAdmin)
	seedUser(t, users, "pastor@example.com", auth.RoleUser)
	seedUser(t, users, "member@example.com", auth.RoleUser)
	grantRegisterAccess(t, h, "pastor@example.com")
	seedDenomGroup(t, h, "asambleas", "Asambleas de Dios")

	// Member without register gate cannot create leaders.
	denyBody, _ := json.Marshal(map[string]any{
		"firstName": "X", "lastName": "Y", "roles": []string{"evangelist"},
	})
	deny := httptest.NewRequest(http.MethodPost, "/api/church/leaders", bytes.NewReader(denyBody))
	deny.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	deny.Header.Set("Content-Type", "application/json")
	denyRW := httptest.NewRecorder()
	r.ServeHTTP(denyRW, deny)
	if denyRW.Code != http.StatusForbidden {
		t.Fatalf("member create leader status=%d", denyRW.Code)
	}

	// Pastor creates leader in catalog.
	leadBody, _ := json.Marshal(map[string]any{
		"firstName": "Ana", "lastName": "Garcia",
		"phone": "+58 412 1234567", "email": "ana@example.com",
		"roles": []string{"elder-bishop-pastor"},
	})
	leadReq := httptest.NewRequest(http.MethodPost, "/api/church/leaders", bytes.NewReader(leadBody))
	leadReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	leadReq.Header.Set("Content-Type", "application/json")
	leadRW := httptest.NewRecorder()
	r.ServeHTTP(leadRW, leadReq)
	if leadRW.Code != http.StatusCreated {
		t.Fatalf("create leader status=%d body=%s", leadRW.Code, leadRW.Body.String())
	}
	if !strings.Contains(leadRW.Body.String(), `"id":"ana-garcia"`) {
		t.Fatalf("expected leader id slug: %s", leadRW.Body.String())
	}

	// Admin associates leader with network.
	netBody, _ := json.Marshal(map[string]any{
		"firstName": "Ana", "lastName": "Garcia",
		"roles": []string{"elder-bishop-pastor"},
		"networkIds": []string{"asambleas"}, "setNetworks": true,
	})
	netReq := httptest.NewRequest(http.MethodPut, "/api/church/leaders/ana-garcia", bytes.NewReader(netBody))
	netReq.Header.Set("Authorization", "Bearer "+bearer(t, "admin@example.com", auth.RoleAdmin))
	netReq.Header.Set("Content-Type", "application/json")
	netRW := httptest.NewRecorder()
	r.ServeHTTP(netRW, netReq)
	if netRW.Code != http.StatusOK || !strings.Contains(netRW.Body.String(), "asambleas") {
		t.Fatalf("admin network assoc status=%d body=%s", netRW.Code, netRW.Body.String())
	}

	// Register church with leader id + structured beliefs.
	regBody, _ := json.Marshal(map[string]any{
		"denominationId": "asambleas",
		"churches": []map[string]any{
			{
				"name": "Central", "churchId": "central",
				"leadership": []string{"ana-garcia"},
			},
		},
		"beliefs": []map[string]any{
			{
				"heading":  "Dios",
				"keyTexts": []string{"Gn 1:1", "Jn 1:1"},
				"body":     "Creemos en un solo Dios.",
			},
			{
				"heading":  "Iglesia",
				"keyTexts": []string{"Mt 16:18"},
				"body":     "El cuerpo de Cristo.",
			},
		},
	})
	reg := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(regBody))
	reg.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg.Header.Set("Content-Type", "application/json")
	regRW := httptest.NewRecorder()
	r.ServeHTTP(regRW, reg)
	if regRW.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regRW.Code, regRW.Body.String())
	}
	if !strings.Contains(regRW.Body.String(), `"leaderIds":["ana-garcia"]`) {
		t.Fatalf("expected leaderIds: %s", regRW.Body.String())
	}
	if !strings.Contains(regRW.Body.String(), `"heading":"Dios"`) {
		t.Fatalf("expected beliefs: %s", regRW.Body.String())
	}

	// Pastor associates leader with the registered church (churchIds).
	chBody, _ := json.Marshal(map[string]any{
		"firstName": "Ana", "lastName": "Garcia",
		"roles": []string{"elder-bishop-pastor"},
		"churchIds": []string{"asambleas/central"}, "setChurches": true,
	})
	chReq := httptest.NewRequest(http.MethodPut, "/api/church/leaders/ana-garcia", bytes.NewReader(chBody))
	chReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	chReq.Header.Set("Content-Type", "application/json")
	chRW := httptest.NewRecorder()
	r.ServeHTTP(chRW, chReq)
	if chRW.Code != http.StatusOK || !strings.Contains(chRW.Body.String(), "asambleas/central") {
		t.Fatalf("church assoc status=%d body=%s", chRW.Code, chRW.Body.String())
	}
	// Network association must survive church-only update (pastor cannot clear networks).
	if !strings.Contains(chRW.Body.String(), `"networkIds":["asambleas"]`) {
		t.Fatalf("expected networks preserved: %s", chRW.Body.String())
	}

	get := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central", nil)
	get.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	getRW := httptest.NewRecorder()
	r.ServeHTTP(getRW, get)
	if getRW.Code != http.StatusOK {
		t.Fatalf("get status=%d", getRW.Code)
	}
	if !strings.Contains(getRW.Body.String(), "Ana Garcia") || !strings.Contains(getRW.Body.String(), "keyTexts") {
		t.Fatalf("detail missing leaders/beliefs: %s", getRW.Body.String())
	}
}

func TestNormalizeBeliefsAndLegacyBlob(t *testing.T) {
	list := normalizeBeliefs([]Belief{
		{Heading: " A ", KeyTexts: []string{"", " Jn 3:16 "}, Body: " texto "},
		{Heading: "", KeyTexts: nil, Body: ""},
	})
	if len(list) != 1 || list[0].Heading != "A" || len(list[0].KeyTexts) != 1 {
		t.Fatalf("normalize: %+v", list)
	}
	doc := ChurchDoc{BeliefsDocument: "Legacy creed"}
	ensured := ensureBeliefs(doc)
	if len(ensured) != 1 || ensured[0].Body != "Legacy creed" {
		t.Fatalf("legacy migrate: %+v", ensured)
	}
}
