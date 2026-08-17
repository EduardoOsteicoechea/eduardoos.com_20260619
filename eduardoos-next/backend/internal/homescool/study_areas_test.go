package homescool

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestNormalizeStudyAreas(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		areas  []string
		legacy string
		want   []string
	}{
		{name: "empty", want: []string{}},
		{name: "legacy only", legacy: "dialectic", want: []string{"dialectic"}},
		{name: "array wins over legacy", areas: []string{"math", "science"}, legacy: "old", want: []string{"math", "science"}},
		{name: "trim and drop blanks", areas: []string{"  a ", "", "b"}, want: []string{"a", "b"}},
		{name: "dedupe case-insensitive", areas: []string{"Math", "math", "Science"}, want: []string{"Math", "Science"}},
		{name: "legacy ignored when array non-empty after trim", areas: []string{"  "}, legacy: "solo", want: []string{"solo"}},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := NormalizeStudyAreas(tc.areas, tc.legacy)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %#v want %#v", got, tc.want)
			}
		})
	}
	if FormatStudyAreas([]string{"a", "b"}) != "a, b" {
		t.Fatal("format join")
	}
	if !HasStudyArea([]string{"Science", "Math"}, "science") {
		t.Fatal("has study area")
	}
}

func TestCreateTemplateMultiStudyAreasAndLegacyAlias(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com")
	tok := bearer(t, "teacher@example.com")

	// Preferred payload: studyAreas array.
	multi := httptest.NewRequest(http.MethodPost, "/api/homescool/task-templates",
		bytes.NewBufferString(`{"name":"Dialectic essay","period":"2026-Q1","studyAreas":["dialectic","rhetoric"],"durationMin":60,"maxScore":5}`))
	multi.Header.Set("Authorization", "Bearer "+tok)
	multi.Header.Set("Content-Type", "application/json")
	multiRec := httptest.NewRecorder()
	r.ServeHTTP(multiRec, multi)
	if multiRec.Code != http.StatusCreated {
		t.Fatalf("multi status=%d body=%s", multiRec.Code, multiRec.Body.String())
	}
	var multiBody map[string]any
	_ = json.Unmarshal(multiRec.Body.Bytes(), &multiBody)
	tpl := multiBody["template"].(map[string]any)
	areas, _ := tpl["studyAreas"].([]any)
	if len(areas) != 2 || areas[0] != "dialectic" || areas[1] != "rhetoric" {
		t.Fatalf("want two studyAreas, got %#v", tpl["studyAreas"])
	}
	if tpl["studyArea"] != "dialectic, rhetoric" {
		t.Fatalf("want joined studyArea alias, got %#v", tpl["studyArea"])
	}

	// Deprecated alias still works.
	legacy := httptest.NewRequest(http.MethodPost, "/api/homescool/task-templates",
		bytes.NewBufferString(`{"name":"Legacy","period":"2026-Q1","studyArea":"science","durationMin":30,"maxScore":5}`))
	legacy.Header.Set("Authorization", "Bearer "+tok)
	legacy.Header.Set("Content-Type", "application/json")
	legacyRec := httptest.NewRecorder()
	r.ServeHTTP(legacyRec, legacy)
	if legacyRec.Code != http.StatusCreated {
		t.Fatalf("legacy status=%d body=%s", legacyRec.Code, legacyRec.Body.String())
	}
	var legacyBody map[string]any
	_ = json.Unmarshal(legacyRec.Body.Bytes(), &legacyBody)
	ltpl := legacyBody["template"].(map[string]any)
	lareas, _ := ltpl["studyAreas"].([]any)
	if len(lareas) != 1 || lareas[0] != "science" {
		t.Fatalf("legacy should migrate to one-item array, got %#v", ltpl["studyAreas"])
	}

	// List filter by one of the multi areas.
	list := httptest.NewRequest(http.MethodGet, "/api/homescool/task-templates?studyArea=rhetoric", nil)
	list.Header.Set("Authorization", "Bearer "+tok)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, list)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d", listRec.Code)
	}
	var listBody map[string]any
	_ = json.Unmarshal(listRec.Body.Bytes(), &listBody)
	if int(listBody["count"].(float64)) < 1 {
		t.Fatalf("expected rhetoric filter hit, got %#v", listBody)
	}
}
