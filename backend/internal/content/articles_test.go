package content

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestPublicArticlesListAndGet(t *testing.T) {
	store := NewMemoryEpamStore()
	h := NewHandler("test-secret", store)
	owner := publicArticlesUserID()
	doc := map[string]any{
		"type": "pamphlet_single_sheet",
		"header": map[string]any{
			"title": "Public pamphlet", "subtitle": "", "author": "Eduardo",
			"series": "Serie", "series_chapter": "1", "date": "2026",
		},
		"footer": map[string]any{
			"action": "Acción", "message": "Mensaje",
			"label1": "WhatsApp", "value1": "123",
			"label2": "Teléfono", "value2": "",
			"label3": "Dirección", "value3": "",
			"label4": "Actividades", "value4": "",
		},
		"column_1": []any{map[string]any{"type": "paragraph", "content": "Hola mundo", "style_indexes": []any{}, "height_mm": 0}},
		"column_2": []any{}, "column_3": []any{}, "column_4": []any{},
		"column_5": []any{}, "column_6": []any{}, "column_7": []any{}, "column_8": []any{},
		"last_edited_element": map[string]any{"column": 1, "index": 0},
	}
	saved, err := store.Save(nil, EpamRecord{
		UserID: owner,
		Title:  "Public pamphlet",
		Body:   doc,
	}, "test-cid")
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, httptest.NewRequest(http.MethodGet, "/api/articles", nil))
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listRec.Code, listRec.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(listRec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if int(list["count"].(float64)) < 1 {
		t.Fatalf("expected articles: %#v", list)
	}

	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, httptest.NewRequest(http.MethodGet, "/api/articles/"+saved.EpamID, nil))
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status=%d body=%s", getRec.Code, getRec.Body.String())
	}
	var article map[string]any
	if err := json.Unmarshal(getRec.Body.Bytes(), &article); err != nil {
		t.Fatal(err)
	}
	plain, _ := article["plainText"].(string)
	if !strings.Contains(plain, "Hola mundo") || !strings.Contains(plain, "Public pamphlet") {
		t.Fatalf("plainText missing content: %q", plain)
	}

	htmlRec := httptest.NewRecorder()
	r.ServeHTTP(htmlRec, httptest.NewRequest(http.MethodGet, "/api/articles/"+saved.EpamID+"/html", nil))
	if htmlRec.Code != http.StatusOK {
		t.Fatalf("html status=%d", htmlRec.Code)
	}
	if ct := htmlRec.Header().Get("Content-Type"); !strings.Contains(ct, "text/html") {
		t.Fatalf("html content-type=%q", ct)
	}
	if !strings.Contains(htmlRec.Body.String(), "application/ld+json") {
		t.Fatalf("html missing json-ld")
	}

	textRec := httptest.NewRecorder()
	r.ServeHTTP(textRec, httptest.NewRequest(http.MethodGet, "/api/articles/"+saved.EpamID+"/text", nil))
	if textRec.Code != http.StatusOK || !strings.Contains(textRec.Body.String(), "Hola mundo") {
		t.Fatalf("text failed: %d %s", textRec.Code, textRec.Body.String())
	}
}
