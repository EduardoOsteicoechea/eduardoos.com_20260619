package homescool

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const maxTaskUploadBytes = 12 << 20 // 12 MiB per proof/template file

// mountTeacherTaskRoutes registers template + catalog + teacher board endpoints.
func (h *Handler) mountTeacherTaskRoutes(pr chi.Router) {
	pr.Post("/api/homescool/task-templates", h.CreateTaskTemplate)
	pr.Get("/api/homescool/task-templates", h.ListTaskTemplates)
	pr.Get("/api/homescool/task-templates/{templateId}", h.GetTaskTemplate)
	pr.Post("/api/homescool/task-templates/{templateId}/images", h.UploadTemplateImage)

	pr.Post("/api/homescool/catalogs", h.CreateCatalogEntry)
	pr.Get("/api/homescool/catalogs", h.ListCatalogEntries)

	pr.Post("/api/homescool/students/{studentSlug}/tasks", h.AssignTasks)
	pr.Get("/api/homescool/students/{studentSlug}/tasks", h.ListTeacherStudentTasks)
	pr.Post("/api/homescool/students/{studentSlug}/tasks/{taskId}/grade", h.GradeTask)
	pr.Post("/api/homescool/students/{studentSlug}/tasks/{taskId}/archive", h.ArchiveTask)
}

// mountLearningTaskRoutes registers student task board + submit endpoints.
func (h *Handler) mountLearningTaskRoutes(pr chi.Router) {
	pr.Get("/api/homescool/learning/{teacherSlug}/tasks", h.ListLearningTasks)
	pr.Get("/api/homescool/learning/{teacherSlug}/tasks/{taskId}", h.GetLearningTask)
	pr.Post("/api/homescool/learning/{teacherSlug}/tasks/{taskId}/submit", h.SubmitLearningTask)
}

// CreateTaskTemplate stores a reusable assignment blueprint for the JWT teacher.
func (h *Handler) CreateTaskTemplate(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Period      string `json:"period"`
		StudyArea   string `json:"studyArea"`
		DurationMin int    `json:"durationMin"`
		MaxScore    int    `json:"maxScore"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	tpl, err := h.Tasks.CreateTemplate(r.Context(), TaskTemplate{
		TeacherEmail: teacher,
		Name:         body.Name,
		Description:  body.Description,
		Period:       strings.TrimSpace(body.Period),
		StudyArea:    strings.TrimSpace(body.StudyArea),
		DurationMin:  body.DurationMin,
		MaxScore:     body.MaxScore,
	})
	if err != nil {
		log.Printf("[correlation=%s] homescool.tpl.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	log.Printf("[correlation=%s] homescool.tpl.create teacher=%s id=%s", cid, teacher, tpl.ID)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"template": tpl})
}

// ListTaskTemplates returns the caller's templates, optionally filtered by period/studyArea.
func (h *Handler) ListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	period := r.URL.Query().Get("period")
	studyArea := r.URL.Query().Get("studyArea")
	items, err := h.Tasks.ListTemplates(r.Context(), teacher, period, studyArea)
	if err != nil {
		log.Printf("[correlation=%s] homescool.tpl.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list templates")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"templates": items,
		"count":     len(items),
	})
}

// GetTaskTemplate returns one template owned by the JWT teacher.
func (h *Handler) GetTaskTemplate(w http.ResponseWriter, r *http.Request) {
	teacher := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "templateId")
	tpl, ok, err := h.Tasks.GetTemplate(r.Context(), teacher, id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load template")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "template not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"template": tpl})
}

// UploadTemplateImage attaches an image file to a template under the teacher S3 prefix.
func (h *Handler) UploadTemplateImage(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "templateId")
	tpl, ok, err := h.Tasks.GetTemplate(r.Context(), teacher, id)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load template")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "template not found")
		return
	}
	if err := r.ParseMultipartForm(maxTaskUploadBytes); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxTaskUploadBytes+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read upload")
		return
	}
	if len(data) > maxTaskUploadBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	}
	name := SanitizeUploadName(header.Filename)
	key := TemplateObjectPrefix(teacher, id) + "/" + name
	ct := header.Header.Get("Content-Type")
	if err := h.Objects.PutBytes(r.Context(), key, data, ct, cid); err != nil {
		log.Printf("[correlation=%s] homescool.tpl.image s3_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not store image")
		return
	}
	tpl.ImageKeys = append(tpl.ImageKeys, key)
	updated, err := h.Tasks.UpdateTemplate(r.Context(), tpl)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not update template")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"template": updated,
		"key":      key,
		"name":     name,
		"size":     len(data),
	})
}

// CreateCatalogEntry stores a teacher-owned period, study area, or time preset.
func (h *Handler) CreateCatalogEntry(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	var body struct {
		Kind        string `json:"kind"`
		Label       string `json:"label"`
		DurationMin int    `json:"durationMin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	entry, err := h.Tasks.CreateCatalogEntry(r.Context(), CatalogEntry{
		TeacherEmail: teacher,
		Kind:         body.Kind,
		Label:        body.Label,
		DurationMin:  body.DurationMin,
	})
	if err != nil {
		log.Printf("[correlation=%s] homescool.catalog.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	log.Printf("[correlation=%s] homescool.catalog.create teacher=%s kind=%s id=%s", cid, teacher, entry.Kind, entry.ID)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"entry": entry})
}

// ListCatalogEntries returns the caller's catalog rows, optionally filtered by kind.
func (h *Handler) ListCatalogEntries(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	kind := r.URL.Query().Get("kind")
	if kind != "" && !IsValidCatalogKind(kind) {
		httpx.WriteError(w, http.StatusBadRequest, "kind must be period, study_area, or time")
		return
	}
	items, err := h.Tasks.ListCatalogEntries(r.Context(), teacher, kind)
	if err != nil {
		log.Printf("[correlation=%s] homescool.catalog.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list catalogs")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"entries": items,
		"count":   len(items),
	})
}

// AssignTasks creates one or more pending tasks for a registered student.
// Body may include templateIds (copied) and/or an inline task definition.
func (h *Handler) AssignTasks(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load student")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}

	var body struct {
		TemplateIDs []string `json:"templateIds"`
		StartDate   string   `json:"startDate"`
		EndDate     string   `json:"endDate"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Period      string   `json:"period"`
		StudyArea   string   `json:"studyArea"`
		DurationMin int      `json:"durationMin"`
		MaxScore    int      `json:"maxScore"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	created := make([]AssignedTask, 0)
	for _, tid := range body.TemplateIDs {
		tid = strings.TrimSpace(tid)
		if tid == "" {
			continue
		}
		tpl, found, getErr := h.Tasks.GetTemplate(r.Context(), teacher, tid)
		if getErr != nil || !found {
			httpx.WriteError(w, http.StatusBadRequest, "template not found: "+tid)
			return
		}
		task, createErr := h.Tasks.CreateTask(r.Context(), AssignedTask{
			TemplateID:   tpl.ID,
			TeacherEmail: teacher,
			StudentEmail: link.StudentEmail,
			Name:         tpl.Name,
			Description:  tpl.Description,
			Period:       tpl.Period,
			StudyArea:    tpl.StudyArea,
			StartDate:    strings.TrimSpace(body.StartDate),
			EndDate:      strings.TrimSpace(body.EndDate),
			DurationMin:  tpl.DurationMin,
			MaxScore:     tpl.MaxScore,
			Status:       TaskStatusPending,
			ImageKeys:    append([]string(nil), tpl.ImageKeys...),
		})
		if createErr != nil {
			log.Printf("[correlation=%s] homescool.task.assign tpl_error: %v", cid, createErr)
			httpx.WriteError(w, http.StatusBadRequest, createErr.Error())
			return
		}
		created = append(created, task)
	}

	if strings.TrimSpace(body.Name) != "" {
		task, createErr := h.Tasks.CreateTask(r.Context(), AssignedTask{
			TeacherEmail: teacher,
			StudentEmail: link.StudentEmail,
			Name:         body.Name,
			Description:  body.Description,
			Period:       strings.TrimSpace(body.Period),
			StudyArea:    strings.TrimSpace(body.StudyArea),
			StartDate:    strings.TrimSpace(body.StartDate),
			EndDate:      strings.TrimSpace(body.EndDate),
			DurationMin:  body.DurationMin,
			MaxScore:     body.MaxScore,
			Status:       TaskStatusPending,
		})
		if createErr != nil {
			httpx.WriteError(w, http.StatusBadRequest, createErr.Error())
			return
		}
		created = append(created, task)
	}

	if len(created) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "provide templateIds and/or name")
		return
	}
	for _, task := range created {
		h.notifyTaskAssigned(cid, task)
	}
	log.Printf("[correlation=%s] homescool.task.assign teacher=%s student=%s count=%d",
		cid, teacher, link.StudentEmail, len(created))
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"tasks": created,
		"count": len(created),
	})
}

// ListTeacherStudentTasks returns all assigned tasks for one student (four boards).
func (h *Handler) ListTeacherStudentTasks(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load student")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}
	items, err := h.Tasks.ListTasksByTeacherStudent(r.Context(), teacher, link.StudentEmail)
	if err != nil {
		log.Printf("[correlation=%s] homescool.task.teacher_list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list tasks")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"tasks":  items,
		"count":  len(items),
		"boards": taskBoardsPayload(items),
		"link":   link,
	})
}

func taskBoardsPayload(items []AssignedTask) map[string][]AssignedTask {
	boards := map[string][]AssignedTask{
		TaskStatusPending:  {},
		TaskStatusActioned: {},
		TaskStatusReady:    {},
		TaskStatusArchived: {},
	}
	for _, t := range items {
		st := t.Status
		if !IsValidTaskStatus(st) {
			st = TaskStatusPending
		}
		boards[st] = append(boards[st], t)
	}
	return boards
}

// GradeTask lets the teacher validate or reject a submitted response with score 1–5.
func (h *Handler) GradeTask(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	taskID := chi.URLParam(r, "taskId")
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}
	task, found, err := h.Tasks.GetTask(r.Context(), teacher, link.StudentEmail, taskID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load task")
		return
	}
	if !found {
		httpx.WriteError(w, http.StatusNotFound, "task not found")
		return
	}
	if task.Status != TaskStatusActioned {
		httpx.WriteError(w, http.StatusBadRequest, "only actioned tasks can be graded")
		return
	}

	var body struct {
		Decision string `json:"decision"`
		Score    int    `json:"score"`
		Note     string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	decision := strings.ToLower(strings.TrimSpace(body.Decision))
	if decision != GradeValidate && decision != GradeReject {
		httpx.WriteError(w, http.StatusBadRequest, "decision must be validate or reject")
		return
	}
	if err := ValidateScore(body.Score, task.MaxScore); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	task.Grade = &TaskGrade{
		Decision: decision,
		Score:    body.Score,
		GradedAt: auth.NowRFC3339(),
		Note:     strings.TrimSpace(body.Note),
	}
	if decision == GradeValidate {
		task.Status = TaskStatusReady
	} else {
		// Reject returns the card to Pendientes so the student can resubmit.
		task.Status = TaskStatusPending
	}
	updated, err := h.Tasks.UpdateTask(r.Context(), task)
	if err != nil {
		log.Printf("[correlation=%s] homescool.task.grade error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save grade")
		return
	}
	h.notifyTaskGraded(cid, updated)
	log.Printf("[correlation=%s] homescool.task.grade id=%s decision=%s score=%d band=%s",
		cid, taskID, decision, body.Score, ScoreBand(body.Score))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"task":      updated,
		"scoreBand": ScoreBand(body.Score),
	})
}

// ArchiveTask moves a ready (or any non-archived) task into Archivadas.
func (h *Handler) ArchiveTask(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	taskID := chi.URLParam(r, "taskId")
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}
	task, found, err := h.Tasks.GetTask(r.Context(), teacher, link.StudentEmail, taskID)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "task not found")
		return
	}
	task.Status = TaskStatusArchived
	updated, err := h.Tasks.UpdateTask(r.Context(), task)
	if err != nil {
		log.Printf("[correlation=%s] homescool.task.archive error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not archive task")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"task": updated})
}

// resolveLearningLink finds the teacher→student link for the JWT student + teacherSlug.
func (h *Handler) resolveLearningLink(r *http.Request, student, teacherSlug string) (Link, bool, error) {
	links, err := h.Links.ListByStudent(r.Context(), student)
	if err != nil {
		return Link{}, false, err
	}
	for _, item := range links {
		if SafeEmailKey(item.TeacherEmail) == teacherSlug || item.TeacherEmail == teacherSlug {
			if item.StudentEmail != student {
				return Link{}, false, nil
			}
			return item, true, nil
		}
	}
	return Link{}, false, nil
}

// ListLearningTasks returns tasks for the JWT student under one teacher.
// Students see pending (to do) plus actioned/ready/archived for transparency;
// the default Tasks board UI focuses on pending.
func (h *Handler) ListLearningTasks(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	student := auth.UserEmailFromRequest(r)
	teacherSlug := chi.URLParam(r, "teacherSlug")
	link, ok, err := h.resolveLearningLink(r, student, teacherSlug)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load learning space")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "learning space not found")
		return
	}
	items, err := h.Tasks.ListTasksByTeacherStudent(r.Context(), link.TeacherEmail, student)
	if err != nil {
		log.Printf("[correlation=%s] homescool.task.learning_list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list tasks")
		return
	}
	statusFilter := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	if statusFilter != "" {
		filtered := make([]AssignedTask, 0)
		for _, t := range items {
			if t.Status == statusFilter {
				filtered = append(filtered, t)
			}
		}
		items = filtered
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"tasks": items,
		"count": len(items),
		"link":  link,
	})
}

// GetLearningTask returns one assigned task the JWT student owns.
func (h *Handler) GetLearningTask(w http.ResponseWriter, r *http.Request) {
	student := auth.UserEmailFromRequest(r)
	teacherSlug := chi.URLParam(r, "teacherSlug")
	taskID := chi.URLParam(r, "taskId")
	link, ok, err := h.resolveLearningLink(r, student, teacherSlug)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "learning space not found")
		return
	}
	task, found, err := h.Tasks.GetTask(r.Context(), link.TeacherEmail, student, taskID)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "task not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"task": task, "link": link})
}

// SubmitLearningTask accepts text/markdown + proof files and moves the task to Accionadas.
func (h *Handler) SubmitLearningTask(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	student := auth.UserEmailFromRequest(r)
	teacherSlug := chi.URLParam(r, "teacherSlug")
	taskID := chi.URLParam(r, "taskId")
	link, ok, err := h.resolveLearningLink(r, student, teacherSlug)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "learning space not found")
		return
	}
	task, found, err := h.Tasks.GetTask(r.Context(), link.TeacherEmail, student, taskID)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "task not found")
		return
	}
	if task.Status != TaskStatusPending {
		httpx.WriteError(w, http.StatusBadRequest, "only pending tasks accept a new response")
		return
	}

	if err := r.ParseMultipartForm(maxTaskUploadBytes * 8); err != nil {
		// Also allow JSON-only submit for text without files.
		if !strings.Contains(strings.ToLower(r.Header.Get("Content-Type")), "multipart/") {
			var body struct {
				Text string `json:"text"`
			}
			if decErr := json.NewDecoder(r.Body).Decode(&body); decErr != nil {
				httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
				return
			}
			task.Submission = &TaskSubmission{
				Text:        body.Text,
				Files:       []TaskFile{},
				SubmittedAt: auth.NowRFC3339(),
			}
			task.Status = TaskStatusActioned
			updated, updErr := h.Tasks.UpdateTask(r.Context(), task)
			if updErr != nil {
				httpx.WriteError(w, http.StatusBadGateway, "could not save response")
				return
			}
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"task": updated})
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	text := strings.TrimSpace(r.FormValue("text"))
	files := make([]TaskFile, 0)
	if r.MultipartForm != nil {
		for _, headers := range r.MultipartForm.File["files"] {
			f, openErr := headers.Open()
			if openErr != nil {
				continue
			}
			data, readErr := io.ReadAll(io.LimitReader(f, maxTaskUploadBytes+1))
			_ = f.Close()
			if readErr != nil || len(data) > maxTaskUploadBytes {
				httpx.WriteError(w, http.StatusRequestEntityTooLarge, "file too large")
				return
			}
			name := SanitizeUploadName(headers.Filename)
			key := TaskSubmissionPrefix(link.TeacherEmail, student, taskID) + "/" + name
			ct := headers.Header.Get("Content-Type")
			if putErr := h.Objects.PutBytes(r.Context(), key, data, ct, cid); putErr != nil {
				log.Printf("[correlation=%s] homescool.task.submit s3_error: %v", cid, putErr)
				httpx.WriteError(w, http.StatusBadGateway, "could not store proof file")
				return
			}
			files = append(files, TaskFile{Key: key, Name: name, Size: int64(len(data))})
		}
	}
	if text == "" && len(files) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "provide text and/or files")
		return
	}

	task.Submission = &TaskSubmission{
		Text:        text,
		Files:       files,
		SubmittedAt: auth.NowRFC3339(),
	}
	task.Status = TaskStatusActioned
	updated, err := h.Tasks.UpdateTask(r.Context(), task)
	if err != nil {
		log.Printf("[correlation=%s] homescool.task.submit error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save response")
		return
	}
	log.Printf("[correlation=%s] homescool.task.submit id=%s files=%d text_len=%d",
		cid, taskID, len(files), len(text))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"task": updated})
}
