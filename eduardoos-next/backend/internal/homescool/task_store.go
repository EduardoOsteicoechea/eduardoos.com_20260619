package homescool

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"

	"github.com/google/uuid"
)

// TaskStore persists teacher task templates, per-student assigned tasks, and
// teacher catalogs (period / study area).
// Production uses DynamoDB via OpenTaskStore; tests use MemoryTaskStore.
type TaskStore interface {
	BackendName() string

	CreateTemplate(ctx context.Context, tpl TaskTemplate) (TaskTemplate, error)
	UpdateTemplate(ctx context.Context, tpl TaskTemplate) (TaskTemplate, error)
	GetTemplate(ctx context.Context, teacherEmail, id string) (TaskTemplate, bool, error)
	ListTemplates(ctx context.Context, teacherEmail, period, studyArea string) ([]TaskTemplate, error)

	CreateTask(ctx context.Context, task AssignedTask) (AssignedTask, error)
	UpdateTask(ctx context.Context, task AssignedTask) (AssignedTask, error)
	GetTask(ctx context.Context, teacherEmail, studentEmail, id string) (AssignedTask, bool, error)
	ListTasksByTeacherStudent(ctx context.Context, teacherEmail, studentEmail string) ([]AssignedTask, error)
	ListTasksByStudent(ctx context.Context, studentEmail string) ([]AssignedTask, error)

	CreateCatalogEntry(ctx context.Context, entry CatalogEntry) (CatalogEntry, error)
	ListCatalogEntries(ctx context.Context, teacherEmail, kind string) ([]CatalogEntry, error)
}

// MemoryTaskStore is process-local persistence for tests and local development.
type MemoryTaskStore struct {
	mu        sync.RWMutex
	templates map[string]TaskTemplate
	tasks     map[string]AssignedTask
	catalogs  map[string]CatalogEntry
}

// NewMemoryTaskStore constructs empty template + task + catalog maps.
func NewMemoryTaskStore() *MemoryTaskStore {
	return &MemoryTaskStore{
		templates: map[string]TaskTemplate{},
		tasks:     map[string]AssignedTask{},
		catalogs:  map[string]CatalogEntry{},
	}
}

func (s *MemoryTaskStore) BackendName() string { return "memory" }

func templateKey(teacherEmail, id string) string {
	return auth.NormalizeEmail(teacherEmail) + "|tpl|" + strings.TrimSpace(id)
}

func taskKey(teacherEmail, studentEmail, id string) string {
	return auth.NormalizeEmail(teacherEmail) + "|" + auth.NormalizeEmail(studentEmail) + "|task|" + strings.TrimSpace(id)
}

func catalogKey(teacherEmail, kind, id string) string {
	return auth.NormalizeEmail(teacherEmail) + "|cat|" + NormalizeCatalogKind(kind) + "|" + strings.TrimSpace(id)
}

func (s *MemoryTaskStore) CreateTemplate(_ context.Context, tpl TaskTemplate) (TaskTemplate, error) {
	tpl.TeacherEmail = auth.NormalizeEmail(tpl.TeacherEmail)
	tpl.Name = strings.TrimSpace(tpl.Name)
	if tpl.TeacherEmail == "" || tpl.Name == "" {
		return TaskTemplate{}, fmt.Errorf("teacherEmail and name required")
	}
	if tpl.ID == "" {
		tpl.ID = uuid.NewString()
	}
	tpl.MaxScore = NormalizeMaxScore(tpl.MaxScore)
	now := auth.NowRFC3339()
	if tpl.CreatedAt == "" {
		tpl.CreatedAt = now
	}
	tpl.UpdatedAt = now

	s.mu.Lock()
	defer s.mu.Unlock()
	s.templates[templateKey(tpl.TeacherEmail, tpl.ID)] = cloneTemplate(tpl)
	return cloneTemplate(tpl), nil
}

func (s *MemoryTaskStore) UpdateTemplate(_ context.Context, tpl TaskTemplate) (TaskTemplate, error) {
	tpl.TeacherEmail = auth.NormalizeEmail(tpl.TeacherEmail)
	if tpl.ID == "" {
		return TaskTemplate{}, fmt.Errorf("template id required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	key := templateKey(tpl.TeacherEmail, tpl.ID)
	existing, ok := s.templates[key]
	if !ok {
		return TaskTemplate{}, fmt.Errorf("template not found")
	}
	tpl.CreatedAt = existing.CreatedAt
	tpl.MaxScore = NormalizeMaxScore(tpl.MaxScore)
	tpl.UpdatedAt = auth.NowRFC3339()
	s.templates[key] = cloneTemplate(tpl)
	return cloneTemplate(tpl), nil
}

func (s *MemoryTaskStore) GetTemplate(_ context.Context, teacherEmail, id string) (TaskTemplate, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tpl, ok := s.templates[templateKey(teacherEmail, id)]
	if !ok {
		return TaskTemplate{}, false, nil
	}
	return cloneTemplate(tpl), true, nil
}

func (s *MemoryTaskStore) ListTemplates(_ context.Context, teacherEmail, period, studyArea string) ([]TaskTemplate, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	period = strings.TrimSpace(period)
	studyArea = strings.TrimSpace(studyArea)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]TaskTemplate, 0)
	for _, tpl := range s.templates {
		if tpl.TeacherEmail != teacherEmail {
			continue
		}
		if period != "" && !strings.EqualFold(tpl.Period, period) {
			continue
		}
		if studyArea != "" && !strings.EqualFold(tpl.StudyArea, studyArea) {
			continue
		}
		out = append(out, cloneTemplate(tpl))
	}
	return out, nil
}

func (s *MemoryTaskStore) CreateTask(_ context.Context, task AssignedTask) (AssignedTask, error) {
	task.TeacherEmail = auth.NormalizeEmail(task.TeacherEmail)
	task.StudentEmail = auth.NormalizeEmail(task.StudentEmail)
	task.Name = strings.TrimSpace(task.Name)
	if task.TeacherEmail == "" || task.StudentEmail == "" || task.Name == "" {
		return AssignedTask{}, fmt.Errorf("teacher, student, and name required")
	}
	if task.ID == "" {
		task.ID = uuid.NewString()
	}
	task.StudentSlug = StudentSlug(task.StudentEmail)
	task.MaxScore = NormalizeMaxScore(task.MaxScore)
	if task.Status == "" {
		task.Status = TaskStatusPending
	}
	if !IsValidTaskStatus(task.Status) {
		return AssignedTask{}, fmt.Errorf("invalid status")
	}
	now := auth.NowRFC3339()
	if task.CreatedAt == "" {
		task.CreatedAt = now
	}
	task.UpdatedAt = now

	s.mu.Lock()
	defer s.mu.Unlock()
	s.tasks[taskKey(task.TeacherEmail, task.StudentEmail, task.ID)] = cloneTask(task)
	return cloneTask(task), nil
}

func (s *MemoryTaskStore) UpdateTask(_ context.Context, task AssignedTask) (AssignedTask, error) {
	task.TeacherEmail = auth.NormalizeEmail(task.TeacherEmail)
	task.StudentEmail = auth.NormalizeEmail(task.StudentEmail)
	if task.ID == "" {
		return AssignedTask{}, fmt.Errorf("task id required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	key := taskKey(task.TeacherEmail, task.StudentEmail, task.ID)
	existing, ok := s.tasks[key]
	if !ok {
		return AssignedTask{}, fmt.Errorf("task not found")
	}
	task.CreatedAt = existing.CreatedAt
	task.StudentSlug = StudentSlug(task.StudentEmail)
	task.MaxScore = NormalizeMaxScore(task.MaxScore)
	if !IsValidTaskStatus(task.Status) {
		return AssignedTask{}, fmt.Errorf("invalid status")
	}
	task.UpdatedAt = auth.NowRFC3339()
	s.tasks[key] = cloneTask(task)
	return cloneTask(task), nil
}

func (s *MemoryTaskStore) GetTask(_ context.Context, teacherEmail, studentEmail, id string) (AssignedTask, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	task, ok := s.tasks[taskKey(teacherEmail, studentEmail, id)]
	if !ok {
		return AssignedTask{}, false, nil
	}
	return cloneTask(task), true, nil
}

func (s *MemoryTaskStore) ListTasksByTeacherStudent(_ context.Context, teacherEmail, studentEmail string) ([]AssignedTask, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	studentEmail = auth.NormalizeEmail(studentEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AssignedTask, 0)
	for _, task := range s.tasks {
		if task.TeacherEmail == teacherEmail && task.StudentEmail == studentEmail {
			out = append(out, cloneTask(task))
		}
	}
	return out, nil
}

func (s *MemoryTaskStore) ListTasksByStudent(_ context.Context, studentEmail string) ([]AssignedTask, error) {
	studentEmail = auth.NormalizeEmail(studentEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AssignedTask, 0)
	for _, task := range s.tasks {
		if task.StudentEmail == studentEmail {
			out = append(out, cloneTask(task))
		}
	}
	return out, nil
}

func (s *MemoryTaskStore) CreateCatalogEntry(_ context.Context, entry CatalogEntry) (CatalogEntry, error) {
	entry.TeacherEmail = auth.NormalizeEmail(entry.TeacherEmail)
	entry.Kind = NormalizeCatalogKind(entry.Kind)
	entry.Label = strings.TrimSpace(entry.Label)
	if entry.TeacherEmail == "" {
		return CatalogEntry{}, fmt.Errorf("teacherEmail required")
	}
	if err := ValidateCatalogEntry(entry); err != nil {
		return CatalogEntry{}, err
	}
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	if entry.CreatedAt == "" {
		entry.CreatedAt = auth.NowRFC3339()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.catalogs[catalogKey(entry.TeacherEmail, entry.Kind, entry.ID)] = cloneCatalogEntry(entry)
	return cloneCatalogEntry(entry), nil
}

func (s *MemoryTaskStore) ListCatalogEntries(_ context.Context, teacherEmail, kind string) ([]CatalogEntry, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	kind = NormalizeCatalogKind(kind)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]CatalogEntry, 0)
	for _, e := range s.catalogs {
		if e.TeacherEmail != teacherEmail {
			continue
		}
		if kind != "" && e.Kind != kind {
			continue
		}
		out = append(out, cloneCatalogEntry(e))
	}
	return out, nil
}
