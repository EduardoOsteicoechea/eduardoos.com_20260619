package ereport

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"eduardoos.nex/internal/auth"
)

type captureMailer struct {
	to, subject, body string
	calls             int
}

func (m *captureMailer) SendPlainMail(to, subject, body string) error {
	m.calls++
	m.to = to
	m.subject = subject
	m.body = body
	return nil
}

func TestOrgCreateAndReportUnderOrg(t *testing.T) {
	h, r, users := testRouter(t)
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	tok := bearer(t, "owner@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs",
		bytes.NewBufferString(`{"name":"Acme QA"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create org status=%d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	org := created["org"].(map[string]any)
	orgID := org["id"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/reports",
		bytes.NewBufferString(`{"tema":"Sprint 1"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create report status=%d body=%s", rec.Code, rec.Body.String())
	}
	var rep map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &rep)
	meta := rep["meta"].(map[string]any)
	if meta["orgId"] != orgID {
		t.Fatalf("meta.orgId=%v want %s", meta["orgId"], orgID)
	}
	reportID := meta["id"].(string)

	req = httptest.NewRequest(http.MethodGet, "/api/ereport/orgs/"+orgID, nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get org status=%d", rec.Code)
	}
	var detail map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &detail)
	reports, _ := detail["reports"].([]any)
	if len(reports) != 1 {
		t.Fatalf("reports=%#v", reports)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/ereport/orgs/"+orgID+"/reports/"+reportID, nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get report status=%d body=%s", rec.Code, rec.Body.String())
	}
	_ = h
}

func TestOrgInviteAndReportInviteEdit(t *testing.T) {
	h, r, users := testRouter(t)
	mail := &captureMailer{}
	h.Mail = mail
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	tok := bearer(t, "owner@example.com")

	// Create org + report
	req := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs",
		bytes.NewBufferString(`{"name":"Org A"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var orgResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &orgResp)
	orgID := orgResp["org"].(map[string]any)["id"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/reports",
		bytes.NewBufferString(`{"tema":"R1"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var repResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &repResp)
	reportID := repResp["meta"].(map[string]any)["id"].(string)

	// Org-list invite
	req = httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/invites",
		bytes.NewBufferString(`{"email":"guest@example.com","durationHours":2}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("org invite status=%d body=%s", rec.Code, rec.Body.String())
	}
	var orgInv map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &orgInv)
	orgToken := orgInv["invite"].(map[string]any)["token"].(string)
	if mail.calls < 1 || mail.to != "guest@example.com" {
		t.Fatalf("mail not sent for org invite: %+v", mail)
	}

	// Public GET org invite → cards
	req = httptest.NewRequest(http.MethodGet, "/api/ereport/invite/"+orgToken, nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get org invite status=%d", rec.Code)
	}
	var orgGet map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &orgGet)
	if orgGet["valid"] != true {
		t.Fatalf("org invite valid=%v", orgGet["valid"])
	}
	cards, _ := orgGet["reports"].([]any)
	if len(cards) != 1 {
		t.Fatalf("org invite cards=%#v", cards)
	}

	// Edit via org invite
	payload := EmptyPayload()
	payload["reportNumber"] = "ORG-EDIT"
	body, _ := json.Marshal(map[string]any{"reportId": reportID, "payload": payload})
	req = httptest.NewRequest(http.MethodPut, "/api/ereport/invite/"+orgToken+"/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("put org invite status=%d body=%s", rec.Code, rec.Body.String())
	}

	// Report invite (1h)
	req = httptest.NewRequest(http.MethodPost,
		"/api/ereport/orgs/"+orgID+"/reports/"+reportID+"/invites",
		bytes.NewBufferString(`{"email":"editor@example.com"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("report invite status=%d body=%s", rec.Code, rec.Body.String())
	}
	var repInv map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &repInv)
	repToken := repInv["invite"].(map[string]any)["token"].(string)
	expiresAt := repInv["invite"].(map[string]any)["expiresAt"].(string)
	exp, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil {
		t.Fatal(err)
	}
	if d := exp.Sub(time.Now().UTC()); d < 50*time.Minute || d > 70*time.Minute {
		t.Fatalf("report invite duration not ~1h: %v", d)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/ereport/invite/"+repToken, nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get report invite status=%d", rec.Code)
	}
	var repGet map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &repGet)
	if _, ok := repGet["payload"]; !ok {
		t.Fatalf("report invite missing payload: %#v", repGet)
	}

	payload2 := EmptyPayload()
	payload2["reportNumber"] = "REP-EDIT"
	body2, _ := json.Marshal(map[string]any{"payload": payload2})
	req = httptest.NewRequest(http.MethodPut, "/api/ereport/invite/"+repToken+"/report", bytes.NewReader(body2))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("put report invite status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestInviteRejectExpired(t *testing.T) {
	h, r, users := testRouter(t)
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	tok := bearer(t, "owner@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs",
		bytes.NewBufferString(`{"name":"Org B"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var orgResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &orgResp)
	orgID := orgResp["org"].(map[string]any)["id"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/reports",
		bytes.NewBufferString(`{"tema":"R-exp"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	var repResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &repResp)
	reportID := repResp["meta"].(map[string]any)["id"].(string)

	// Seed an already-expired invite directly in object space.
	past := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
	token := "expired-token-001"
	inv := Invite{
		Token:     token,
		Scope:     InviteScopeReport,
		OwnerSafe: SafeEmailKey("owner@example.com"),
		OrgID:     orgID,
		ReportID:  reportID,
		Email:     "gone@example.com",
		ExpiresAt: past,
		CreatedAt: past,
		CanEdit:   true,
	}
	if err := h.Objects.PutJSON(t.Context(), InviteKey(token), inv, "test"); err != nil {
		t.Fatal(err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/ereport/invite/"+token, nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get expired status=%d", rec.Code)
	}
	var got map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got["valid"] != false || got["expired"] != true {
		t.Fatalf("expected expired invite: %#v", got)
	}

	payload := EmptyPayload()
	body, _ := json.Marshal(map[string]any{"payload": payload})
	req = httptest.NewRequest(http.MethodPut, "/api/ereport/invite/"+token+"/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("put expired want 403 got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestOrgKeys(t *testing.T) {
	email := "u@x.com"
	if got := OrgsIndexKey(email); got != "ereport/u_at_x.com/orgs.json" {
		t.Fatalf("OrgsIndexKey=%s", got)
	}
	if got := OrgReportKey(email, "o1", "r1"); got != "ereport/u_at_x.com/orgs/o1/reports/r1/report.ereport" {
		t.Fatalf("OrgReportKey=%s", got)
	}
	if got := InviteKey("tok"); got != "ereport/invites/tok.json" {
		t.Fatalf("InviteKey=%s", got)
	}
}
