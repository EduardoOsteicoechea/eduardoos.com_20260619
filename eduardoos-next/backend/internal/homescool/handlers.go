package homescool

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

// Handler serves JWT-protected Homescool teacher/student APIs.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	Links     Store
	Tasks     TaskStore
	Objects   ObjectSpace
	// Mail uses the shared auth SMTP stack (SMTP_USER / SMTP_PASS). Optional;
	// when nil, notification helpers no-op.
	Mail Mailer
	auth *auth.Handler
}

// NewHandler wires stores. Production main replaces Links/Tasks/Objects via
// OpenLinkStore / OpenTaskStore / OpenObjectSpace so data survives process restart.
// Tests keep the in-memory defaults unless they inject a shared Store.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		Links:     NewMemoryStore(),
		Tasks:     NewMemoryTaskStore(),
		Objects:   NewMemoryObjectSpace(),
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/homescool/* behind RequireJWT.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Post("/api/homescool/students", h.RegisterStudent)
		pr.Get("/api/homescool/students", h.ListStudents)
		pr.Get("/api/homescool/students/{studentSlug}", h.GetStudent)
		pr.Get("/api/homescool/students/{studentSlug}/folders/{folder}", h.ListTeacherStudentFolder)
		pr.Get("/api/homescool/learning", h.ListLearning)
		pr.Get("/api/homescool/learning/{teacherSlug}/folders/{folder}", h.ListLearningFolder)
		h.mountTaskRoutes(pr)
	})
}

// RegisterStudent links an existing platform user as the caller's student and
// scaffolds the five S3 folder markers under the relationship prefix.
func (h *Handler) RegisterStudent(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	var body struct {
		StudentEmail string `json:"studentEmail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	studentEmail := auth.NormalizeEmail(body.StudentEmail)
	if studentEmail == "" || !strings.Contains(studentEmail, "@") {
		httpx.WriteError(w, http.StatusBadRequest, "studentEmail required")
		return
	}
	if studentEmail == teacher {
		httpx.WriteError(w, http.StatusBadRequest, "cannot register yourself as a student")
		return
	}

	_, ok, err := h.Users.GetUser(r.Context(), studentEmail)
	if err != nil {
		log.Printf("[correlation=%s] homescool.register user_lookup_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not look up student")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "student account does not exist")
		return
	}

	link, err := h.Links.Create(r.Context(), teacher, studentEmail)
	alreadyLinked := false
	if errors.Is(err, ErrDuplicate) {
		// Idempotent re-register: return the existing durable row and re-ensure
		// S3 folder markers (PutObject on .keep is safe when prefixes already exist).
		existing, ok, getErr := h.Links.GetByTeacherAndStudent(r.Context(), teacher, studentEmail)
		if getErr != nil || !ok {
			log.Printf("[correlation=%s] homescool.register duplicate_lookup_error: ok=%v err=%v", cid, ok, getErr)
			httpx.WriteError(w, http.StatusConflict, "student already registered")
			return
		}
		link = existing
		alreadyLinked = true
	} else if err != nil {
		log.Printf("[correlation=%s] homescool.register create_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.Objects.EnsureStudentFolders(r.Context(), teacher, studentEmail, cid); err != nil {
		log.Printf("[correlation=%s] homescool.register s3_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create student folders")
		return
	}

	status := http.StatusCreated
	if alreadyLinked {
		status = http.StatusOK
	}
	log.Printf("[correlation=%s] homescool.register teacher=%s student=%s prefix=%s existing=%t",
		cid, teacher, studentEmail, link.S3Prefix, alreadyLinked)
	// Notify on first registration (and on idempotent re-register so the student
	// still gets a fresh pointer to their space). Mail failure is logged only.
	h.notifyStudentRegistered(cid, link)
	httpx.WriteJSON(w, status, map[string]any{
		"link":     link,
		"folders":  FolderNames,
		"existing": alreadyLinked,
	})
}

// ListStudents returns students registered by the JWT teacher.
func (h *Handler) ListStudents(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	items, err := h.Links.ListByTeacher(r.Context(), teacher)
	if err != nil {
		log.Printf("[correlation=%s] homescool.list_students error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list students")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"students": items,
		"count":    len(items),
	})
}

// GetStudent returns one of the teacher's registered students by slug.
func (h *Handler) GetStudent(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil {
		log.Printf("[correlation=%s] homescool.get_student error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load student")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"link":    link,
		"folders": FolderNames,
	})
}

// ListTeacherStudentFolder lists S3 objects for a folder of the teacher's student.
func (h *Handler) ListTeacherStudentFolder(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	teacher := auth.UserEmailFromRequest(r)
	slug := chi.URLParam(r, "studentSlug")
	folder := chi.URLParam(r, "folder")
	if !IsValidFolder(folder) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid folder")
		return
	}
	link, ok, err := h.Links.GetByTeacherAndSlug(r.Context(), teacher, slug)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load student")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "student not found")
		return
	}
	objects, err := h.Objects.ListFolder(r.Context(), link.TeacherEmail, link.StudentEmail, folder, cid)
	if err != nil {
		log.Printf("[correlation=%s] homescool.teacher_folder error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list folder")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"folder":  folder,
		"prefix":  FolderPrefix(link.TeacherEmail, link.StudentEmail, folder),
		"objects": objects,
		"count":   len(objects),
		"link":    link,
	})
}

// ListLearning returns relationships where the JWT user is the registered student.
func (h *Handler) ListLearning(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	student := auth.UserEmailFromRequest(r)
	items, err := h.Links.ListByStudent(r.Context(), student)
	if err != nil {
		log.Printf("[correlation=%s] homescool.learning_list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list learning spaces")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"links":   items,
		"count":   len(items),
		"folders": FolderNames,
	})
}

// ListLearningFolder lists a folder in the student's own space under a teacher.
// Authorization: JWT subject must be the student on that teacher→student link.
func (h *Handler) ListLearningFolder(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	student := auth.UserEmailFromRequest(r)
	teacherSlug := chi.URLParam(r, "teacherSlug")
	folder := chi.URLParam(r, "folder")
	if !IsValidFolder(folder) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid folder")
		return
	}

	links, err := h.Links.ListByStudent(r.Context(), student)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not load learning space")
		return
	}
	var link Link
	found := false
	for _, item := range links {
		if SafeEmailKey(item.TeacherEmail) == teacherSlug || item.TeacherEmail == teacherSlug {
			link = item
			found = true
			break
		}
	}
	if !found {
		httpx.WriteError(w, http.StatusNotFound, "learning space not found")
		return
	}
	// Defense in depth: student may only see their own row.
	if link.StudentEmail != student {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}

	objects, err := h.Objects.ListFolder(r.Context(), link.TeacherEmail, link.StudentEmail, folder, cid)
	if err != nil {
		log.Printf("[correlation=%s] homescool.learning_folder error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list folder")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"folder":  folder,
		"prefix":  FolderPrefix(link.TeacherEmail, link.StudentEmail, folder),
		"objects": objects,
		"count":   len(objects),
		"link":    link,
	})
}
