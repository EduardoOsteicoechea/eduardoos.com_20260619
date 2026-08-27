package content

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

func pamphletBody(title, series, chapter string) map[string]any {
	return map[string]any{
		"type": "pamphlet_single_sheet",
		"id":   "src-id",
		"header": map[string]any{
			"title": title, "subtitle": "", "author": "Eduardo",
			"series": series, "series_chapter": chapter, "date": "2026-08-27",
		},
		"footer": map[string]any{
			"action": "Acción", "message": "Mensaje",
			"label1": "WhatsApp", "value1": "111",
			"label2": "Teléfono", "value2": "",
			"label3": "Dirección", "value3": "",
			"label4": "Actividades", "value4": "",
		},
		"column_1":            []any{map[string]any{"type": "paragraph", "content": "Body ink", "style_indexes": []any{}, "height_mm": 0}},
		"column_2":            []any{},
		"column_3":            []any{},
		"column_4":            []any{},
		"column_5":            []any{},
		"column_6":            []any{},
		"column_7":            []any{},
		"column_8":            []any{},
		"last_edited_element": map[string]any{"column": 1, "index": 0},
	}
}

func TestCopyEpamCreatesSuffixedClone(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("owner@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	store := NewMemoryEpamStore()
	src, err := store.Save(t.Context(), EpamRecord{
		UserID:        "owner@example.com",
		EpamID:        "src-1",
		Title:         "Foo",
		Series:        "Serie A",
		SeriesChapter: "1",
		Body:          pamphletBody("Foo", "Serie A", "1"),
	}, "cid-src")
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(secret, store)
	r := chi.NewRouter()
	h.Routes(r)

	req := httptest.NewRequest(http.MethodPost, "/api/epams/"+src.EpamID+"/copy", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("copy status=%d body=%s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Meta     EpamRecord     `json:"meta"`
		Document map[string]any `json:"document"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Meta.EpamID == src.EpamID || payload.Meta.EpamID == "" {
		t.Fatalf("expected new epamId, got %q", payload.Meta.EpamID)
	}
	if payload.Meta.Title != "Foo_1" {
		t.Fatalf("title=%q want Foo_1", payload.Meta.Title)
	}
	header, _ := payload.Document["header"].(map[string]any)
	if header["title"] != "Foo_1" {
		t.Fatalf("header.title=%v", header["title"])
	}
	if payload.Document["id"] != payload.Meta.EpamID {
		t.Fatalf("document id %v != meta %s", payload.Document["id"], payload.Meta.EpamID)
	}
	col1, _ := payload.Document["column_1"].([]any)
	if len(col1) != 1 {
		t.Fatalf("expected cloned body column, got %#v", payload.Document["column_1"])
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/epams/"+src.EpamID+"/copy", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("second copy status=%d body=%s", rec2.Code, rec2.Body.String())
	}
	var payload2 struct {
		Meta EpamRecord `json:"meta"`
	}
	if err := json.Unmarshal(rec2.Body.Bytes(), &payload2); err != nil {
		t.Fatal(err)
	}
	if payload2.Meta.Title != "Foo_2" {
		t.Fatalf("second title=%q want Foo_2", payload2.Meta.Title)
	}
}

func TestCopyEpamUnauthorized(t *testing.T) {
	h := NewHandler("secret", nil)
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/epams/x/copy", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestCopyEpamNotFound(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("owner@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(secret, NewMemoryEpamStore())
	r := chi.NewRouter()
	h.Routes(r)
	req := httptest.NewRequest(http.MethodPost, "/api/epams/missing/copy", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestFooterCRUDAndLinkedOverlay(t *testing.T) {
	secret := "content-test-secret"
	token, err := auth.IssueJWT("owner@example.com", secret)
	if err != nil {
		t.Fatal(err)
	}
	store := NewMemoryEpamStore()
	h := NewHandler(secret, store)
	r := chi.NewRouter()
	h.Routes(r)

	createReq := httptest.NewRequest(http.MethodPost, "/api/epams/footers", bytes.NewBufferString(`{
		"name": "Iglesia centro",
		"footer": {"action":"Visítanos","message":"Domingo 10am","value1":"555-0100"}
	}`))
	createReq.Header.Set("Authorization", "Bearer "+token)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	r.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create footer status=%d body=%s", createRec.Code, createRec.Body.String())
	}
	var profile FooterProfile
	if err := json.Unmarshal(createRec.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if profile.FooterID == "" || profile.Footer.Label1 != DefaultFooterLabel1 {
		t.Fatalf("profile unexpected: %#v", profile)
	}

	body := pamphletBody("Linked", "S", "1")
	body["footer_profile_id"] = profile.FooterID
	body["footer_bind"] = FooterBindLinked
	body["footer"] = map[string]any{
		"action": "old", "message": "old",
		"label1": "WhatsApp", "value1": "old",
		"label2": "Teléfono", "value2": "",
		"label3": "Dirección", "value3": "",
		"label4": "Actividades", "value4": "",
	}
	saved, err := store.Save(t.Context(), EpamRecord{
		UserID: "owner@example.com",
		Title:  "Linked",
		Body:   body,
	}, "cid-link")
	if err != nil {
		t.Fatal(err)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/epams/"+saved.EpamID, nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", getRec.Code, getRec.Body.String())
	}
	var got struct {
		Document map[string]any `json:"document"`
	}
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	footer, _ := got.Document["footer"].(map[string]any)
	if footer["action"] != "Visítanos" || footer["value1"] != "555-0100" {
		t.Fatalf("linked overlay missing: %#v", footer)
	}

	updReq := httptest.NewRequest(http.MethodPut, "/api/epams/footers/"+profile.FooterID, bytes.NewBufferString(`{
		"name": "Iglesia centro",
		"footer": {"action":"Nueva acción","message":"Domingo 10am","value1":"555-0100"}
	}`))
	updReq.Header.Set("Authorization", "Bearer "+token)
	updReq.Header.Set("Content-Type", "application/json")
	updRec := httptest.NewRecorder()
	r.ServeHTTP(updRec, updReq)
	if updRec.Code != http.StatusOK {
		t.Fatalf("update footer status=%d body=%s", updRec.Code, updRec.Body.String())
	}

	getReq2 := httptest.NewRequest(http.MethodGet, "/api/epams/"+saved.EpamID, nil)
	getReq2.Header.Set("Authorization", "Bearer "+token)
	getRec2 := httptest.NewRecorder()
	r.ServeHTTP(getRec2, getReq2)
	var got2 struct {
		Document map[string]any `json:"document"`
	}
	_ = json.Unmarshal(getRec2.Body.Bytes(), &got2)
	footer2, _ := got2.Document["footer"].(map[string]any)
	if footer2["action"] != "Nueva acción" {
		t.Fatalf("linked GET did not pick up master edit: %#v", footer2)
	}

	snapBody := pamphletBody("Snap", "S", "1")
	snapBody["footer_profile_id"] = profile.FooterID
	snapBody["footer_bind"] = FooterBindSnapshot
	snapBody["footer"] = map[string]any{
		"action": "frozen", "message": "x",
		"label1": "WhatsApp", "value1": "frozen",
		"label2": "Teléfono", "value2": "",
		"label3": "Dirección", "value3": "",
		"label4": "Actividades", "value4": "",
	}
	snap, err := store.Save(t.Context(), EpamRecord{
		UserID: "owner@example.com",
		Title:  "Snap",
		Body:   snapBody,
	}, "cid-snap")
	if err != nil {
		t.Fatal(err)
	}
	snapReq := httptest.NewRequest(http.MethodGet, "/api/epams/"+snap.EpamID, nil)
	snapReq.Header.Set("Authorization", "Bearer "+token)
	snapRec := httptest.NewRecorder()
	r.ServeHTTP(snapRec, snapReq)
	var snapGot struct {
		Document map[string]any `json:"document"`
	}
	_ = json.Unmarshal(snapRec.Body.Bytes(), &snapGot)
	snapFooter, _ := snapGot.Document["footer"].(map[string]any)
	if snapFooter["action"] != "frozen" {
		t.Fatalf("snapshot should not overlay: %#v", snapFooter)
	}
}

func TestArticlesHTMLIndexGroupsBySeries(t *testing.T) {
	store := NewMemoryEpamStore()
	h := NewHandler("test-secret", store)
	owner := publicArticlesUserID()
	_, err := store.Save(nil, EpamRecord{
		UserID: owner, Title: "Alpha one", Series: "Alpha", SeriesChapter: "1",
		Body: pamphletBody("Alpha one", "Alpha", "1"),
	}, "c1")
	if err != nil {
		t.Fatal(err)
	}
	_, err = store.Save(nil, EpamRecord{
		UserID: owner, Title: "Lone", Series: "", SeriesChapter: "",
		Body: pamphletBody("Lone", "", ""),
	}, "c2")
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/articles/index.html", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	html := rec.Body.String()
	if !strings.Contains(html, "Alpha") || !strings.Contains(html, UnassignedSeriesLabel) {
		t.Fatalf("html missing series grouping: %s", html)
	}
	if !strings.Contains(html, "Alpha one") || !strings.Contains(html, "Lone") {
		t.Fatalf("html missing pamphlet titles: %s", html)
	}
}

func TestFootersUnauthorized(t *testing.T) {
	h := NewHandler("secret", nil)
	r := chi.NewRouter()
	h.Routes(r)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/epams/footers", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}
