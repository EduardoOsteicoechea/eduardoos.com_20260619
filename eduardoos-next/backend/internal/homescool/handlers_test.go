package homescool

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

func seedUsers(t *testing.T, store auth.UserStore, emails ...string) {
	t.Helper()
	for _, email := range emails {
		if err := store.PutUser(t.Context(), auth.User{
			Email:        email,
			PasswordHash: auth.HashPassword("password123"),
			Verified:     true,
		}); err != nil {
			t.Fatal(err)
		}
	}
}

func testRouter(t *testing.T) (*Handler, chi.Router, auth.UserStore) {
	t.Helper()
	users := auth.NewMemoryStore()
	h := NewHandler("homescool-secret", users)
	r := chi.NewRouter()
	h.Routes(r)
	return h, r, users
}

func bearer(t *testing.T, email string) string {
	t.Helper()
	tok, err := auth.IssueJWT(email, "homescool-secret")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestKeysAndFolders(t *testing.T) {
	if got := SafeEmailKey("A@Example.COM"); got != "a_at_example.com" {
		t.Fatalf("SafeEmailKey=%s", got)
	}
	if got := RelationshipPrefix("t@x.com", "s@y.com"); got != "homeschool/t_at_x.com/s_at_y.com" {
		t.Fatalf("prefix=%s", got)
	}
	if !IsValidFolder("portfolio") || IsValidFolder("other") {
		t.Fatal("folder validation")
	}
}

func TestRegisterStudentCreatesLinkAndFolders(t *testing.T) {
	h, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com", "student@example.com")
	token := bearer(t, "teacher@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	link, _ := resp["link"].(map[string]any)
	if link["studentEmail"] != "student@example.com" || link["studentSlug"] != "student_at_example.com" {
		t.Fatalf("unexpected link %#v", link)
	}
	objects, err := h.Objects.ListFolder(t.Context(), "teacher@example.com", "student@example.com", "portfolio", "cid")
	if err != nil {
		t.Fatal(err)
	}
	if len(objects) != 0 {
		t.Fatalf("empty folder should list 0 real objects, got %#v", objects)
	}
	// Markers exist in memory space.
	mem := h.Objects.(*MemoryObjectSpace)
	mem.mu.RLock()
	defer mem.mu.RUnlock()
	keep := KeepObjectKey("teacher@example.com", "student@example.com", "portfolio")
	if _, ok := mem.keys[keep]; !ok {
		t.Fatalf("missing keep marker %s in %#v", keep, mem.keys)
	}
	if !strings.HasPrefix(keep, "homeschool/") {
		t.Fatalf("keep key must be under homeschool/: %s", keep)
	}
}

func TestRegisterRejectsMissingUserDuplicateAndSelf(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com", "student@example.com")
	token := bearer(t, "teacher@example.com")

	missing := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"ghost@example.com"}`))
	missing.Header.Set("Authorization", "Bearer "+token)
	missing.Header.Set("Content-Type", "application/json")
	missRec := httptest.NewRecorder()
	r.ServeHTTP(missRec, missing)
	if missRec.Code != http.StatusNotFound {
		t.Fatalf("missing status=%d", missRec.Code)
	}

	self := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"teacher@example.com"}`))
	self.Header.Set("Authorization", "Bearer "+token)
	self.Header.Set("Content-Type", "application/json")
	selfRec := httptest.NewRecorder()
	r.ServeHTTP(selfRec, self)
	if selfRec.Code != http.StatusBadRequest {
		t.Fatalf("self status=%d", selfRec.Code)
	}

	okReq := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	okReq.Header.Set("Authorization", "Bearer "+token)
	okReq.Header.Set("Content-Type", "application/json")
	okRec := httptest.NewRecorder()
	r.ServeHTTP(okRec, okReq)
	if okRec.Code != http.StatusCreated {
		t.Fatalf("first register status=%d", okRec.Code)
	}

	dup := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	dup.Header.Set("Authorization", "Bearer "+token)
	dup.Header.Set("Content-Type", "application/json")
	dupRec := httptest.NewRecorder()
	r.ServeHTTP(dupRec, dup)
	if dupRec.Code != http.StatusConflict {
		t.Fatalf("dup status=%d", dupRec.Code)
	}
}

func TestListStudentsRequiresAuthAndIsolatesTeachers(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "t1@example.com", "t2@example.com", "s@example.com")

	unauth := httptest.NewRequest(http.MethodGet, "/api/homescool/students", nil)
	unauthRec := httptest.NewRecorder()
	r.ServeHTTP(unauthRec, unauth)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth status=%d", unauthRec.Code)
	}

	t1 := bearer(t, "t1@example.com")
	reg := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"s@example.com"}`))
	reg.Header.Set("Authorization", "Bearer "+t1)
	reg.Header.Set("Content-Type", "application/json")
	regRec := httptest.NewRecorder()
	r.ServeHTTP(regRec, reg)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regRec.Code, regRec.Body.String())
	}

	list1 := httptest.NewRequest(http.MethodGet, "/api/homescool/students", nil)
	list1.Header.Set("Authorization", "Bearer "+t1)
	list1Rec := httptest.NewRecorder()
	r.ServeHTTP(list1Rec, list1)
	var body1 map[string]any
	_ = json.Unmarshal(list1Rec.Body.Bytes(), &body1)
	students, _ := body1["students"].([]any)
	if list1Rec.Code != http.StatusOK || len(students) != 1 {
		t.Fatalf("t1 list=%d body=%s", list1Rec.Code, list1Rec.Body.String())
	}

	t2 := bearer(t, "t2@example.com")
	list2 := httptest.NewRequest(http.MethodGet, "/api/homescool/students", nil)
	list2.Header.Set("Authorization", "Bearer "+t2)
	list2Rec := httptest.NewRecorder()
	r.ServeHTTP(list2Rec, list2)
	var body2 map[string]any
	_ = json.Unmarshal(list2Rec.Body.Bytes(), &body2)
	students2, _ := body2["students"].([]any)
	if list2Rec.Code != http.StatusOK || len(students2) != 0 {
		t.Fatalf("t2 should see 0 students, got %s", list2Rec.Body.String())
	}

	// Teacher 2 cannot open teacher 1's student workspace by slug.
	get := httptest.NewRequest(http.MethodGet, "/api/homescool/students/s_at_example.com", nil)
	get.Header.Set("Authorization", "Bearer "+t2)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, get)
	if getRec.Code != http.StatusNotFound {
		t.Fatalf("cross-teacher get status=%d", getRec.Code)
	}
}

func TestLearningAuthzStudentOnly(t *testing.T) {
	h, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com", "student@example.com", "other@example.com")
	teacherTok := bearer(t, "teacher@example.com")
	reg := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	reg.Header.Set("Authorization", "Bearer "+teacherTok)
	reg.Header.Set("Content-Type", "application/json")
	regRec := httptest.NewRecorder()
	r.ServeHTTP(regRec, reg)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register status=%d", regRec.Code)
	}

	// Put a real object under portfolio so listing is non-empty.
	mem := h.Objects.(*MemoryObjectSpace)
	key := FolderPrefix("teacher@example.com", "student@example.com", "portfolio") + "/essay.pdf"
	mem.mu.Lock()
	mem.keys[key] = []byte("pdf")
	mem.mu.Unlock()

	studentTok := bearer(t, "student@example.com")
	learn := httptest.NewRequest(http.MethodGet, "/api/homescool/learning", nil)
	learn.Header.Set("Authorization", "Bearer "+studentTok)
	learnRec := httptest.NewRecorder()
	r.ServeHTTP(learnRec, learn)
	if learnRec.Code != http.StatusOK {
		t.Fatalf("learning list status=%d", learnRec.Code)
	}
	var learnBody map[string]any
	_ = json.Unmarshal(learnRec.Body.Bytes(), &learnBody)
	links, _ := learnBody["links"].([]any)
	if len(links) != 1 {
		t.Fatalf("want 1 learning link, got %s", learnRec.Body.String())
	}

	folderURL := "/api/homescool/learning/teacher_at_example.com/folders/portfolio"
	folderReq := httptest.NewRequest(http.MethodGet, folderURL, nil)
	folderReq.Header.Set("Authorization", "Bearer "+studentTok)
	folderRec := httptest.NewRecorder()
	r.ServeHTTP(folderRec, folderReq)
	if folderRec.Code != http.StatusOK {
		t.Fatalf("student folder status=%d body=%s", folderRec.Code, folderRec.Body.String())
	}
	var folderBody map[string]any
	_ = json.Unmarshal(folderRec.Body.Bytes(), &folderBody)
	objects, _ := folderBody["objects"].([]any)
	if len(objects) != 1 {
		t.Fatalf("want 1 object, got %s", folderRec.Body.String())
	}

	// Another user cannot read the student's learning folder.
	otherTok := bearer(t, "other@example.com")
	deny := httptest.NewRequest(http.MethodGet, folderURL, nil)
	deny.Header.Set("Authorization", "Bearer "+otherTok)
	denyRec := httptest.NewRecorder()
	r.ServeHTTP(denyRec, deny)
	if denyRec.Code != http.StatusNotFound {
		t.Fatalf("other user status=%d want 404", denyRec.Code)
	}

	// Teacher uses the teacher folder route, not learning.
	teacherFolder := httptest.NewRequest(http.MethodGet,
		"/api/homescool/students/student_at_example.com/folders/portfolio", nil)
	teacherFolder.Header.Set("Authorization", "Bearer "+teacherTok)
	teacherFolderRec := httptest.NewRecorder()
	r.ServeHTTP(teacherFolderRec, teacherFolder)
	if teacherFolderRec.Code != http.StatusOK {
		t.Fatalf("teacher folder status=%d", teacherFolderRec.Code)
	}
}
