package homescool

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"

	"github.com/google/uuid"
)

// Link is one teacher→student registration row.
// This is the in-memory stand-in for table homescool_student_links.
type Link struct {
	ID           string   `json:"id"`
	TeacherEmail string   `json:"teacherEmail"`
	StudentEmail string   `json:"studentEmail"`
	StudentSlug  string   `json:"studentSlug"`
	S3Prefix     string   `json:"s3Prefix"`
	Folders      []string `json:"folders"`
	CreatedAt    string   `json:"createdAt"`
}

// Store persists teacher→student links. Memory is the local default.
type Store interface {
	BackendName() string
	Create(ctx context.Context, teacherEmail, studentEmail string) (Link, error)
	GetByTeacherAndSlug(ctx context.Context, teacherEmail, studentSlug string) (Link, bool, error)
	ListByTeacher(ctx context.Context, teacherEmail string) ([]Link, error)
	ListByStudent(ctx context.Context, studentEmail string) ([]Link, error)
	GetByTeacherAndStudent(ctx context.Context, teacherEmail, studentEmail string) (Link, bool, error)
}

// MemoryStore is process-local persistence for tests and local development.
type MemoryStore struct {
	mu    sync.RWMutex
	links map[string]Link
}

// NewMemoryStore constructs an empty link registry.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{links: map[string]Link{}}
}

func (s *MemoryStore) BackendName() string { return "memory" }

func pairKey(teacherEmail, studentEmail string) string {
	return auth.NormalizeEmail(teacherEmail) + "|" + auth.NormalizeEmail(studentEmail)
}

// Create inserts a new teacher→student link or returns ErrDuplicate when the pair exists.
func (s *MemoryStore) Create(_ context.Context, teacherEmail, studentEmail string) (Link, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	studentEmail = auth.NormalizeEmail(studentEmail)
	if teacherEmail == "" || studentEmail == "" {
		return Link{}, fmt.Errorf("teacher and student emails required")
	}
	if teacherEmail == studentEmail {
		return Link{}, fmt.Errorf("cannot register yourself as a student")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.links[pairKey(teacherEmail, studentEmail)]; exists {
		return Link{}, ErrDuplicate
	}
	link := Link{
		ID:           uuid.NewString(),
		TeacherEmail: teacherEmail,
		StudentEmail: studentEmail,
		StudentSlug:  StudentSlug(studentEmail),
		S3Prefix:     RelationshipPrefix(teacherEmail, studentEmail),
		Folders:      append([]string(nil), FolderNames...),
		CreatedAt:    auth.NowRFC3339(),
	}
	s.links[pairKey(teacherEmail, studentEmail)] = cloneLink(link)
	return cloneLink(link), nil
}

// ErrDuplicate is returned when the teacher already registered that student.
var ErrDuplicate = fmt.Errorf("student already registered")

func (s *MemoryStore) GetByTeacherAndSlug(_ context.Context, teacherEmail, studentSlug string) (Link, bool, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	studentSlug = strings.Trim(strings.TrimSpace(studentSlug), "/")
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, link := range s.links {
		if link.TeacherEmail == teacherEmail && link.StudentSlug == studentSlug {
			return cloneLink(link), true, nil
		}
	}
	return Link{}, false, nil
}

func (s *MemoryStore) GetByTeacherAndStudent(_ context.Context, teacherEmail, studentEmail string) (Link, bool, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	studentEmail = auth.NormalizeEmail(studentEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	link, ok := s.links[pairKey(teacherEmail, studentEmail)]
	if !ok {
		return Link{}, false, nil
	}
	return cloneLink(link), true, nil
}

func (s *MemoryStore) ListByTeacher(_ context.Context, teacherEmail string) ([]Link, error) {
	teacherEmail = auth.NormalizeEmail(teacherEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Link, 0)
	for _, link := range s.links {
		if link.TeacherEmail == teacherEmail {
			out = append(out, cloneLink(link))
		}
	}
	return out, nil
}

func (s *MemoryStore) ListByStudent(_ context.Context, studentEmail string) ([]Link, error) {
	studentEmail = auth.NormalizeEmail(studentEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Link, 0)
	for _, link := range s.links {
		if link.StudentEmail == studentEmail {
			out = append(out, cloneLink(link))
		}
	}
	return out, nil
}

func cloneLink(l Link) Link {
	cp := l
	cp.Folders = append([]string(nil), l.Folders...)
	return cp
}
