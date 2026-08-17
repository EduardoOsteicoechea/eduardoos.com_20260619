package homescool

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScoreBandAndValidate(t *testing.T) {
	if ScoreBand(1) != "minimo" {
		t.Fatal("1 minimo")
	}
	if ScoreBand(2) != "pobre" {
		t.Fatal("2 pobre")
	}
	if ScoreBand(3) != "aprobado" {
		t.Fatal("3 aprobado")
	}
	if ScoreBand(4) != "bueno" || ScoreBand(5) != "bueno" {
		t.Fatal("4-5 bueno")
	}
	if err := ValidateScore(0, 5); err == nil {
		t.Fatal("score 0 should fail")
	}
	if err := ValidateScore(6, 5); err == nil {
		t.Fatal("score 6 should fail")
	}
	if NormalizeMaxScore(0) != 5 || NormalizeMaxScore(15) != 5 {
		t.Fatal("max score clamp")
	}
}

func TestTaskTemplateAssignSubmitGradeArchive(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com", "student@example.com")
	teacherTok := bearer(t, "teacher@example.com")
	studentTok := bearer(t, "student@example.com")

	// Register relationship first.
	reg := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	reg.Header.Set("Authorization", "Bearer "+teacherTok)
	reg.Header.Set("Content-Type", "application/json")
	regRec := httptest.NewRecorder()
	r.ServeHTTP(regRec, reg)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regRec.Code, regRec.Body.String())
	}

	// Create template.
	tplReq := httptest.NewRequest(http.MethodPost, "/api/homescool/task-templates",
		bytes.NewBufferString(`{"name":"Essay","description":"Write about trees","period":"2026-Q1","studyArea":"science","durationMin":45,"maxScore":5}`))
	tplReq.Header.Set("Authorization", "Bearer "+teacherTok)
	tplReq.Header.Set("Content-Type", "application/json")
	tplRec := httptest.NewRecorder()
	r.ServeHTTP(tplRec, tplReq)
	if tplRec.Code != http.StatusCreated {
		t.Fatalf("tpl status=%d body=%s", tplRec.Code, tplRec.Body.String())
	}
	var tplBody map[string]any
	_ = json.Unmarshal(tplRec.Body.Bytes(), &tplBody)
	tpl := tplBody["template"].(map[string]any)
	tplID := tpl["id"].(string)

	// Assign from template.
	assign := httptest.NewRequest(http.MethodPost, "/api/homescool/students/student_at_example.com/tasks",
		bytes.NewBufferString(`{"templateIds":["`+tplID+`"],"startDate":"2026-08-01","endDate":"2026-08-15"}`))
	assign.Header.Set("Authorization", "Bearer "+teacherTok)
	assign.Header.Set("Content-Type", "application/json")
	assignRec := httptest.NewRecorder()
	r.ServeHTTP(assignRec, assign)
	if assignRec.Code != http.StatusCreated {
		t.Fatalf("assign status=%d body=%s", assignRec.Code, assignRec.Body.String())
	}
	var assignBody map[string]any
	_ = json.Unmarshal(assignRec.Body.Bytes(), &assignBody)
	tasks := assignBody["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("want 1 task, got %#v", assignBody)
	}
	taskID := tasks[0].(map[string]any)["id"].(string)
	if tasks[0].(map[string]any)["status"] != TaskStatusPending {
		t.Fatalf("want pending, got %#v", tasks[0])
	}

	// Student lists pending tasks.
	listLearn := httptest.NewRequest(http.MethodGet,
		"/api/homescool/learning/teacher_at_example.com/tasks?status=pending", nil)
	listLearn.Header.Set("Authorization", "Bearer "+studentTok)
	listLearnRec := httptest.NewRecorder()
	r.ServeHTTP(listLearnRec, listLearn)
	if listLearnRec.Code != http.StatusOK {
		t.Fatalf("learning tasks status=%d", listLearnRec.Code)
	}

	// Student submits multipart text + file.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("text", "# My response\nDone.")
	part, _ := mw.CreateFormFile("files", "proof.pdf")
	_, _ = part.Write([]byte("%PDF-fake"))
	_ = mw.Close()
	submit := httptest.NewRequest(http.MethodPost,
		"/api/homescool/learning/teacher_at_example.com/tasks/"+taskID+"/submit", &buf)
	submit.Header.Set("Authorization", "Bearer "+studentTok)
	submit.Header.Set("Content-Type", mw.FormDataContentType())
	submitRec := httptest.NewRecorder()
	r.ServeHTTP(submitRec, submit)
	if submitRec.Code != http.StatusOK {
		t.Fatalf("submit status=%d body=%s", submitRec.Code, submitRec.Body.String())
	}
	var submitBody map[string]any
	_ = json.Unmarshal(submitRec.Body.Bytes(), &submitBody)
	submitted := submitBody["task"].(map[string]any)
	if submitted["status"] != TaskStatusActioned {
		t.Fatalf("want actioned after submit, got %#v", submitted)
	}
	sub := submitted["submission"].(map[string]any)
	files := sub["files"].([]any)
	if len(files) != 1 {
		t.Fatalf("want 1 proof file, got %#v", sub)
	}

	// Teacher boards show Accionadas.
	teacherList := httptest.NewRequest(http.MethodGet,
		"/api/homescool/students/student_at_example.com/tasks", nil)
	teacherList.Header.Set("Authorization", "Bearer "+teacherTok)
	teacherListRec := httptest.NewRecorder()
	r.ServeHTTP(teacherListRec, teacherList)
	var boardsBody map[string]any
	_ = json.Unmarshal(teacherListRec.Body.Bytes(), &boardsBody)
	boards := boardsBody["boards"].(map[string]any)
	actioned := boards[TaskStatusActioned].([]any)
	if len(actioned) != 1 {
		t.Fatalf("want 1 actioned, got %#v", boardsBody)
	}

	// Grade validate → Listas / ready.
	grade := httptest.NewRequest(http.MethodPost,
		"/api/homescool/students/student_at_example.com/tasks/"+taskID+"/grade",
		bytes.NewBufferString(`{"decision":"validate","score":5,"note":"Excellent"}`))
	grade.Header.Set("Authorization", "Bearer "+teacherTok)
	grade.Header.Set("Content-Type", "application/json")
	gradeRec := httptest.NewRecorder()
	r.ServeHTTP(gradeRec, grade)
	if gradeRec.Code != http.StatusOK {
		t.Fatalf("grade status=%d body=%s", gradeRec.Code, gradeRec.Body.String())
	}
	var gradeBody map[string]any
	_ = json.Unmarshal(gradeRec.Body.Bytes(), &gradeBody)
	if gradeBody["scoreBand"] != "bueno" {
		t.Fatalf("want bueno for 5, got %#v", gradeBody)
	}
	graded := gradeBody["task"].(map[string]any)
	if graded["status"] != TaskStatusReady {
		t.Fatalf("want ready, got %#v", graded)
	}

	// Archive → Archivadas.
	arch := httptest.NewRequest(http.MethodPost,
		"/api/homescool/students/student_at_example.com/tasks/"+taskID+"/archive", nil)
	arch.Header.Set("Authorization", "Bearer "+teacherTok)
	archRec := httptest.NewRecorder()
	r.ServeHTTP(archRec, arch)
	if archRec.Code != http.StatusOK {
		t.Fatalf("archive status=%d", archRec.Code)
	}
	var archBody map[string]any
	_ = json.Unmarshal(archRec.Body.Bytes(), &archBody)
	if archBody["task"].(map[string]any)["status"] != TaskStatusArchived {
		t.Fatalf("want archived %#v", archBody)
	}

	// Student cannot grade; other user cannot submit.
	denyGrade := httptest.NewRequest(http.MethodPost,
		"/api/homescool/students/student_at_example.com/tasks/"+taskID+"/grade",
		bytes.NewBufferString(`{"decision":"validate","score":5}`))
	denyGrade.Header.Set("Authorization", "Bearer "+studentTok)
	denyGrade.Header.Set("Content-Type", "application/json")
	denyGradeRec := httptest.NewRecorder()
	r.ServeHTTP(denyGradeRec, denyGrade)
	if denyGradeRec.Code != http.StatusNotFound {
		// Student is not the teacher owner of the slug route → 404.
		t.Fatalf("student grade status=%d want 404", denyGradeRec.Code)
	}
}

func TestRejectReturnsToPending(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com", "student@example.com")
	teacherTok := bearer(t, "teacher@example.com")
	studentTok := bearer(t, "student@example.com")

	reg := httptest.NewRequest(http.MethodPost, "/api/homescool/students",
		bytes.NewBufferString(`{"studentEmail":"student@example.com"}`))
	reg.Header.Set("Authorization", "Bearer "+teacherTok)
	reg.Header.Set("Content-Type", "application/json")
	regRec := httptest.NewRecorder()
	r.ServeHTTP(regRec, reg)

	assign := httptest.NewRequest(http.MethodPost, "/api/homescool/students/student_at_example.com/tasks",
		bytes.NewBufferString(`{"name":"Quiz","description":"Q1","startDate":"2026-08-01","endDate":"2026-08-02"}`))
	assign.Header.Set("Authorization", "Bearer "+teacherTok)
	assign.Header.Set("Content-Type", "application/json")
	assignRec := httptest.NewRecorder()
	r.ServeHTTP(assignRec, assign)
	var assignBody map[string]any
	_ = json.Unmarshal(assignRec.Body.Bytes(), &assignBody)
	taskID := assignBody["tasks"].([]any)[0].(map[string]any)["id"].(string)

	submit := httptest.NewRequest(http.MethodPost,
		"/api/homescool/learning/teacher_at_example.com/tasks/"+taskID+"/submit",
		bytes.NewBufferString(`{"text":"rough draft"}`))
	submit.Header.Set("Authorization", "Bearer "+studentTok)
	submit.Header.Set("Content-Type", "application/json")
	submitRec := httptest.NewRecorder()
	r.ServeHTTP(submitRec, submit)
	if submitRec.Code != http.StatusOK {
		t.Fatalf("submit status=%d body=%s", submitRec.Code, submitRec.Body.String())
	}

	grade := httptest.NewRequest(http.MethodPost,
		"/api/homescool/students/student_at_example.com/tasks/"+taskID+"/grade",
		bytes.NewBufferString(`{"decision":"reject","score":1}`))
	grade.Header.Set("Authorization", "Bearer "+teacherTok)
	grade.Header.Set("Content-Type", "application/json")
	gradeRec := httptest.NewRecorder()
	r.ServeHTTP(gradeRec, grade)
	var gradeBody map[string]any
	_ = json.Unmarshal(gradeRec.Body.Bytes(), &gradeBody)
	if gradeBody["scoreBand"] != "minimo" {
		t.Fatalf("want minimo for 1, got %#v", gradeBody)
	}
	if gradeBody["task"].(map[string]any)["status"] != TaskStatusPending {
		t.Fatalf("reject should return pending, got %#v", gradeBody)
	}
}

func TestCatalogCreateAndList(t *testing.T) {
	_, r, users := testRouter(t)
	seedUsers(t, users, "teacher@example.com")
	teacherTok := bearer(t, "teacher@example.com")

	periodReq := httptest.NewRequest(http.MethodPost, "/api/homescool/catalogs",
		bytes.NewBufferString(`{"kind":"period","label":"2026-Q1"}`))
	periodReq.Header.Set("Authorization", "Bearer "+teacherTok)
	periodReq.Header.Set("Content-Type", "application/json")
	periodRec := httptest.NewRecorder()
	r.ServeHTTP(periodRec, periodReq)
	if periodRec.Code != http.StatusCreated {
		t.Fatalf("period status=%d body=%s", periodRec.Code, periodRec.Body.String())
	}

	areaReq := httptest.NewRequest(http.MethodPost, "/api/homescool/catalogs",
		bytes.NewBufferString(`{"kind":"study_area","label":"science"}`))
	areaReq.Header.Set("Authorization", "Bearer "+teacherTok)
	areaReq.Header.Set("Content-Type", "application/json")
	areaRec := httptest.NewRecorder()
	r.ServeHTTP(areaRec, areaReq)
	if areaRec.Code != http.StatusCreated {
		t.Fatalf("area status=%d body=%s", areaRec.Code, areaRec.Body.String())
	}

	timeReq := httptest.NewRequest(http.MethodPost, "/api/homescool/catalogs",
		bytes.NewBufferString(`{"kind":"time","label":"45 min","durationMin":45}`))
	timeReq.Header.Set("Authorization", "Bearer "+teacherTok)
	timeReq.Header.Set("Content-Type", "application/json")
	timeRec := httptest.NewRecorder()
	r.ServeHTTP(timeRec, timeReq)
	if timeRec.Code != http.StatusBadRequest {
		t.Fatalf("time catalog should be rejected status=%d body=%s", timeRec.Code, timeRec.Body.String())
	}

	list := httptest.NewRequest(http.MethodGet, "/api/homescool/catalogs?kind=period", nil)
	list.Header.Set("Authorization", "Bearer "+teacherTok)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, list)
	if listRec.Code != http.StatusOK {
		t.Fatalf("list status=%d", listRec.Code)
	}
	var listBody map[string]any
	_ = json.Unmarshal(listRec.Body.Bytes(), &listBody)
	entries := listBody["entries"].([]any)
	if len(entries) != 1 {
		t.Fatalf("want 1 period, got %#v", listBody)
	}
	if entries[0].(map[string]any)["label"] != "2026-Q1" {
		t.Fatalf("unexpected period %#v", entries[0])
	}

	all := httptest.NewRequest(http.MethodGet, "/api/homescool/catalogs", nil)
	all.Header.Set("Authorization", "Bearer "+teacherTok)
	allRec := httptest.NewRecorder()
	r.ServeHTTP(allRec, all)
	var allBody map[string]any
	_ = json.Unmarshal(allRec.Body.Bytes(), &allBody)
	if int(allBody["count"].(float64)) != 2 {
		t.Fatalf("want 2 catalog entries, got %#v", allBody)
	}
}
