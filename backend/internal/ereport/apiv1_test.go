package ereport

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/apikeys"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestV1PostRequiresConfirmOverwriteAndSnapshots(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	ents := payments.NewStore()
	ents.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"api", "ereport"}, "monthly", 1))

	eh := NewHandler("ereport-secret", users)
	eh.Entitlements = ents
	keys := apikeys.NewMemoryStore()
	ah := apikeys.NewHandler("ereport-secret", users, keys, ents)

	r := chi.NewRouter()
	eh.Routes(r)
	ah.Routes(r)
	ah.MountV1(r, func(vr chi.Router) {
		vr.Use(ah.RequireProductAccess("ereport"))
		eh.RoutesV1(vr)
	})

	ownerTok := bearer(t, "owner@example.com")
	req := httptest.NewRequest(http.MethodPost, "/api/ereport/reports",
		bytes.NewBufferString(`{"tema":"API target"}`))
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", rec.Code, rec.Body.String())
	}
	var created map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	meta := created["meta"].(map[string]any)
	id := meta["id"].(string)
	ownerSafe := meta["ownerSafe"].(string)

	// Create API key via JWT
	ck := httptest.NewRequest(http.MethodPost, "/api/apikeys", bytes.NewBufferString(`{"label":"bot"}`))
	ck.Header.Set("Authorization", "Bearer "+ownerTok)
	ckRec := httptest.NewRecorder()
	r.ServeHTTP(ckRec, ck)
	if ckRec.Code != http.StatusCreated {
		t.Fatalf("apikey create=%d %s", ckRec.Code, ckRec.Body.String())
	}
	var keyOut struct {
		Key string `json:"key"`
	}
	_ = json.Unmarshal(ckRec.Body.Bytes(), &keyOut)

	// Step 1 — access
	acc := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/access", nil)
	acc.Header.Set("Authorization", "Bearer "+keyOut.Key)
	accRec := httptest.NewRecorder()
	r.ServeHTTP(accRec, acc)
	if accRec.Code != http.StatusOK {
		t.Fatalf("access=%d %s", accRec.Code, accRec.Body.String())
	}
	var accOut map[string]any
	_ = json.Unmarshal(accRec.Body.Bytes(), &accOut)
	if accOut["allowed"] != true || accOut["ownerSafe"] != ownerSafe {
		t.Fatalf("access body=%#v", accOut)
	}

	// Step 2 — library now returns orgs + legacyReports
	lib := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/library", nil)
	lib.Header.Set("Authorization", "Bearer "+keyOut.Key)
	libRec := httptest.NewRecorder()
	r.ServeHTTP(libRec, lib)
	if libRec.Code != http.StatusOK {
		t.Fatalf("library=%d %s", libRec.Code, libRec.Body.String())
	}
	var libOut struct {
		Orgs          []OrgCard    `json:"orgs"`
		LegacyReports []ReportCard `json:"legacyReports"`
	}
	_ = json.Unmarshal(libRec.Body.Bytes(), &libOut)
	if len(libOut.LegacyReports) < 1 || libOut.LegacyReports[0].ID != id {
		t.Fatalf("library=%#v", libOut)
	}

	// Reject without confirmOverwrite
	bad := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id,
		bytes.NewBufferString(`{"payload":{"reportNumber":"2","sections":[]}}`))
	bad.Header.Set("Authorization", "Bearer "+keyOut.Key)
	bad.Header.Set("Content-Type", "application/json")
	badRec := httptest.NewRecorder()
	r.ServeHTTP(badRec, bad)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 without confirmOverwrite got %d", badRec.Code)
	}

	// Additive post: update meta without wiping skeleton sections (spec 070)
	goodBody := `{"confirmOverwrite":true,"tema":"API tema","payload":{"reportNumber":"99"}}`
	good := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id,
		bytes.NewBufferString(goodBody))
	good.Header.Set("Authorization", "Bearer "+keyOut.Key)
	good.Header.Set("Content-Type", "application/json")
	goodRec := httptest.NewRecorder()
	r.ServeHTTP(goodRec, good)
	if goodRec.Code != http.StatusOK {
		t.Fatalf("v1 post=%d body=%s", goodRec.Code, goodRec.Body.String())
	}
	var postOut map[string]any
	_ = json.Unmarshal(goodRec.Body.Bytes(), &postOut)
	if postOut["snapshotId"] == nil || postOut["snapshotId"] == "" {
		t.Fatalf("expected snapshotId in response: %#v", postOut)
	}

	// History list via JWT
	hist := httptest.NewRequest(http.MethodGet,
		"/api/ereport/reports/"+ownerSafe+"/"+id+"/history", nil)
	hist.Header.Set("Authorization", "Bearer "+ownerTok)
	histRec := httptest.NewRecorder()
	r.ServeHTTP(histRec, hist)
	if histRec.Code != http.StatusOK {
		t.Fatalf("history=%d %s", histRec.Code, histRec.Body.String())
	}
	var histOut struct {
		Items []HistoryCard `json:"items"`
	}
	_ = json.Unmarshal(histRec.Body.Bytes(), &histOut)
	if len(histOut.Items) < 1 {
		t.Fatal("expected at least one history item")
	}

	// GET v1
	get := httptest.NewRequest(http.MethodGet,
		"/api/v1/ereport/reports/"+ownerSafe+"/"+id, nil)
	get.Header.Set("Authorization", "Bearer "+keyOut.Key)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, get)
	if getRec.Code != http.StatusOK {
		t.Fatalf("v1 get=%d", getRec.Code)
	}
}

func TestV1OrgAccessOrgsReportsEdit(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	ents := payments.NewStore()
	ents.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"api", "ereport"}, "monthly", 1))

	eh := NewHandler("ereport-secret", users)
	eh.Entitlements = ents
	keys := apikeys.NewMemoryStore()
	ah := apikeys.NewHandler("ereport-secret", users, keys, ents)

	r := chi.NewRouter()
	eh.Routes(r)
	ah.Routes(r)
	ah.MountV1(r, func(vr chi.Router) {
		vr.Use(ah.RequireProductAccess("ereport"))
		eh.RoutesV1(vr)
	})

	ownerTok := bearer(t, "owner@example.com")
	// Create org + report via JWT
	orgReq := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs",
		bytes.NewBufferString(`{"name":"Acme"}`))
	orgReq.Header.Set("Authorization", "Bearer "+ownerTok)
	orgReq.Header.Set("Content-Type", "application/json")
	orgRec := httptest.NewRecorder()
	r.ServeHTTP(orgRec, orgReq)
	if orgRec.Code != http.StatusCreated {
		t.Fatalf("org create=%d %s", orgRec.Code, orgRec.Body.String())
	}
	var orgCreated map[string]any
	_ = json.Unmarshal(orgRec.Body.Bytes(), &orgCreated)
	orgID := orgCreated["org"].(map[string]any)["id"].(string)

	repReq := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/reports",
		bytes.NewBufferString(`{"tema":"Website en tablet"}`))
	repReq.Header.Set("Authorization", "Bearer "+ownerTok)
	repReq.Header.Set("Content-Type", "application/json")
	repRec := httptest.NewRecorder()
	r.ServeHTTP(repRec, repReq)
	if repRec.Code != http.StatusCreated {
		t.Fatalf("org report create=%d %s", repRec.Code, repRec.Body.String())
	}
	var repCreated map[string]any
	_ = json.Unmarshal(repRec.Body.Bytes(), &repCreated)
	reportID := repCreated["meta"].(map[string]any)["id"].(string)

	ck := httptest.NewRequest(http.MethodPost, "/api/apikeys", bytes.NewBufferString(`{"label":"org-bot"}`))
	ck.Header.Set("Authorization", "Bearer "+ownerTok)
	ckRec := httptest.NewRecorder()
	r.ServeHTTP(ckRec, ck)
	var keyOut struct {
		Key string `json:"key"`
	}
	_ = json.Unmarshal(ckRec.Body.Bytes(), &keyOut)

	// Step 2 — orgs
	orgsReq := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/orgs", nil)
	orgsReq.Header.Set("Authorization", "Bearer "+keyOut.Key)
	orgsRec := httptest.NewRecorder()
	r.ServeHTTP(orgsRec, orgsReq)
	if orgsRec.Code != http.StatusOK {
		t.Fatalf("orgs=%d %s", orgsRec.Code, orgsRec.Body.String())
	}
	var orgsOut struct {
		Orgs []OrgCard `json:"orgs"`
	}
	_ = json.Unmarshal(orgsRec.Body.Bytes(), &orgsOut)
	if len(orgsOut.Orgs) < 1 || orgsOut.Orgs[0].ID != orgID {
		t.Fatalf("orgs=%#v", orgsOut)
	}

	// Step 3 — org reports
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/ereport/orgs/"+orgID+"/reports", nil)
	listReq.Header.Set("Authorization", "Bearer "+keyOut.Key)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("org reports=%d %s", listRec.Code, listRec.Body.String())
	}
	var listOut struct {
		Reports []ReportCard `json:"reports"`
	}
	_ = json.Unmarshal(listRec.Body.Bytes(), &listOut)
	if len(listOut.Reports) < 1 || listOut.Reports[0].ID != reportID {
		t.Fatalf("org reports=%#v", listOut)
	}

	// Step 4 — additive put (meta only; keep existing sections)
	putBody := `{"confirmOverwrite":true,"payload":{"reportNumber":"7"}}`
	putReq := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/orgs/"+orgID+"/reports/"+reportID,
		bytes.NewBufferString(putBody))
	putReq.Header.Set("Authorization", "Bearer "+keyOut.Key)
	putReq.Header.Set("Content-Type", "application/json")
	putRec := httptest.NewRecorder()
	r.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("org put=%d %s", putRec.Code, putRec.Body.String())
	}
	var putOut map[string]any
	_ = json.Unmarshal(putRec.Body.Bytes(), &putOut)
	if putOut["snapshotId"] == nil || putOut["snapshotId"] == "" {
		t.Fatalf("expected snapshotId %#v", putOut)
	}
	if putOut["viewUrl"] == nil || putOut["viewUrl"] == "" {
		t.Fatalf("expected viewUrl %#v", putOut)
	}
}

// TestV1OrgReportDateRoundTrip locks fechaIncidencia/fechaSolucion through additive API post (spec 062 + 070).
func TestV1OrgReportDateRoundTrip(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(context.Background(), auth.User{
		Email: "dates@x.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	ents := payments.NewStore()
	ents.PutEntitlements("dates@x.com", payments.BuildEntitlements([]string{"api", "ereport"}, "monthly", 1))

	eh := NewHandler("ereport-secret", users)
	eh.Entitlements = ents
	keys := apikeys.NewMemoryStore()
	ah := apikeys.NewHandler("ereport-secret", users, keys, ents)

	r := chi.NewRouter()
	eh.Routes(r)
	ah.Routes(r)
	ah.MountV1(r, func(vr chi.Router) {
		vr.Use(ah.RequireProductAccess("ereport"))
		eh.RoutesV1(vr)
	})

	ownerTok := bearer(t, "dates@x.com")
	orgReq := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs",
		bytes.NewBufferString(`{"name":"Date Org"}`))
	orgReq.Header.Set("Authorization", "Bearer "+ownerTok)
	orgReq.Header.Set("Content-Type", "application/json")
	orgRec := httptest.NewRecorder()
	r.ServeHTTP(orgRec, orgReq)
	if orgRec.Code != http.StatusCreated {
		t.Fatalf("org create=%d %s", orgRec.Code, orgRec.Body.String())
	}
	var orgCreated map[string]any
	_ = json.Unmarshal(orgRec.Body.Bytes(), &orgCreated)
	orgID := orgCreated["org"].(map[string]any)["id"].(string)

	repReq := httptest.NewRequest(http.MethodPost, "/api/ereport/orgs/"+orgID+"/reports",
		bytes.NewBufferString(`{"tema":"Dates"}`))
	repReq.Header.Set("Authorization", "Bearer "+ownerTok)
	repReq.Header.Set("Content-Type", "application/json")
	repRec := httptest.NewRecorder()
	r.ServeHTTP(repRec, repReq)
	if repRec.Code != http.StatusCreated {
		t.Fatalf("report create=%d %s", repRec.Code, repRec.Body.String())
	}
	var repCreated map[string]any
	_ = json.Unmarshal(repRec.Body.Bytes(), &repCreated)
	reportID := repCreated["meta"].(map[string]any)["id"].(string)

	ck := httptest.NewRequest(http.MethodPost, "/api/apikeys", bytes.NewBufferString(`{"label":"dates"}`))
	ck.Header.Set("Authorization", "Bearer "+ownerTok)
	ckRec := httptest.NewRecorder()
	r.ServeHTTP(ckRec, ck)
	var keyOut struct {
		Key string `json:"key"`
	}
	_ = json.Unmarshal(ckRec.Body.Bytes(), &keyOut)

	// Additive: new section + new open issue (cannot replace skeleton items)
	payload := map[string]any{
		"reportNumber": "DATE-1",
		"sections": []any{
			map[string]any{
				"id":    "s-dates",
				"title": "Dates",
				"kind":  "funcionalidades",
				"groups": []any{
					map[string]any{
						"id":    "g-dates",
						"title": "General",
						"items": []any{
							map[string]any{
								"id":               "ce-3143-03",
								"status":           "reprobado",
								"nombre":           "Tablet",
								"incidencia":       "broken",
								"solucion":         "fixed",
								"fechaIncidencia":  "2026-08-31",
								"fechaSolucion":    "2026-09-01",
								"images":           []any{},
								"imagesIncidencia": []any{},
								"imagesSolucion":   []any{},
							},
						},
					},
				},
			},
		},
	}
	body, _ := json.Marshal(map[string]any{"confirmOverwrite": true, "payload": payload})
	putReq := httptest.NewRequest(http.MethodPost,
		"/api/v1/ereport/orgs/"+orgID+"/reports/"+reportID,
		bytes.NewReader(body))
	putReq.Header.Set("Authorization", "Bearer "+keyOut.Key)
	putReq.Header.Set("Content-Type", "application/json")
	putReq.Host = "eduardoos.com"
	putReq.Header.Set("X-Forwarded-Proto", "https")
	putRec := httptest.NewRecorder()
	r.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("put=%d %s", putRec.Code, putRec.Body.String())
	}
	var putOut map[string]any
	_ = json.Unmarshal(putRec.Body.Bytes(), &putOut)
	vu, _ := putOut["viewUrl"].(string)
	if !strings.Contains(vu, "dates_at_x.com") || !strings.Contains(vu, orgID) || !strings.Contains(vu, reportID) {
		t.Fatalf("viewUrl=%v", putOut["viewUrl"])
	}

	getReq := httptest.NewRequest(http.MethodGet,
		"/api/v1/ereport/orgs/"+orgID+"/reports/"+reportID, nil)
	getReq.Header.Set("Authorization", "Bearer "+keyOut.Key)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get=%d %s", getRec.Code, getRec.Body.String())
	}
	var getOut struct {
		Payload map[string]any `json:"payload"`
		ViewURL string         `json:"viewUrl"`
	}
	_ = json.Unmarshal(getRec.Body.Bytes(), &getOut)
	if getOut.ViewURL == "" {
		t.Fatal("missing viewUrl on GET")
	}
	secs, _ := getOut.Payload["sections"].([]any)
	var it0 map[string]any
	for _, secAny := range secs {
		sec0, _ := secAny.(map[string]any)
		if sec0["id"] != "s-dates" {
			continue
		}
		grps, _ := sec0["groups"].([]any)
		g0, _ := grps[0].(map[string]any)
		items, _ := g0["items"].([]any)
		it0, _ = items[0].(map[string]any)
	}
	if it0 == nil {
		t.Fatal("missing dated item section")
	}
	if it0["fechaIncidencia"] != "2026-08-31" || it0["fechaSolucion"] != "2026-09-01" {
		t.Fatalf("dates stripped: %#v", it0)
	}
}
