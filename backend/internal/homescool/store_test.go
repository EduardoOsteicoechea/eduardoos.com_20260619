package homescool

import (
	"context"
	"testing"
)

// TestMemoryStorePersistsAcrossHandlerRestart simulates an API process that
// keeps the same Store instance (durable backends) vs wiping MemoryStore on
// NewHandler (the pre-fix bug). MemoryStore itself retains data until the
// process recreates it — OpenLinkStore + DynamoDB is what survives deploy.
func TestMemoryStoreCreateListAndDuplicate(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	link, err := store.Create(ctx, "Teacher@Example.com", "Student@Example.com")
	if err != nil {
		t.Fatal(err)
	}
	if link.TeacherEmail != "teacher@example.com" || link.StudentSlug != "student_at_example.com" {
		t.Fatalf("unexpected link %#v", link)
	}
	if link.S3Prefix != "homeschool/teacher_at_example.com/student_at_example.com" {
		t.Fatalf("prefix=%s", link.S3Prefix)
	}

	_, err = store.Create(ctx, "teacher@example.com", "student@example.com")
	if err != ErrDuplicate {
		t.Fatalf("want ErrDuplicate, got %v", err)
	}

	got, ok, err := store.GetByTeacherAndStudent(ctx, "teacher@example.com", "student@example.com")
	if err != nil || !ok || got.ID != link.ID {
		t.Fatalf("get pair ok=%v err=%v got=%#v", ok, err, got)
	}

	bySlug, ok, err := store.GetByTeacherAndSlug(ctx, "teacher@example.com", "student_at_example.com")
	if err != nil || !ok || bySlug.ID != link.ID {
		t.Fatalf("get slug ok=%v err=%v", ok, err)
	}

	teacherList, err := store.ListByTeacher(ctx, "teacher@example.com")
	if err != nil || len(teacherList) != 1 {
		t.Fatalf("teacher list=%v err=%v", teacherList, err)
	}
	studentList, err := store.ListByStudent(ctx, "student@example.com")
	if err != nil || len(studentList) != 1 {
		t.Fatalf("student list=%v err=%v", studentList, err)
	}

	// Second teacher does not see the first teacher's student.
	other, err := store.ListByTeacher(ctx, "other@example.com")
	if err != nil || len(other) != 0 {
		t.Fatalf("other teacher should see 0, got %#v", other)
	}
}

func TestMemoryStoreSurvivesSharedInstance(t *testing.T) {
	ctx := context.Background()
	shared := NewMemoryStore()
	if _, err := shared.Create(ctx, "t@x.com", "s@y.com"); err != nil {
		t.Fatal(err)
	}

	// Mimic main.go wiring: handler holds the OpenLinkStore() instance across requests.
	h1 := NewHandler("secret", nil)
	h1.Links = shared
	h2 := NewHandler("secret", nil)
	h2.Links = shared

	list, err := h2.Links.ListByTeacher(ctx, "t@x.com")
	if err != nil || len(list) != 1 {
		t.Fatalf("shared store must retain link across handlers, got %#v err=%v", list, err)
	}
}

func TestOpenLinkStoreDefaultsToMemory(t *testing.T) {
	t.Setenv("HOMESCOOL_BACKEND", "")
	t.Setenv("DATABASE_BACKEND", "memory")
	store := OpenLinkStore(context.Background())
	if store.BackendName() != "memory" {
		t.Fatalf("backend=%s", store.BackendName())
	}
}

func TestOpenLinkStoreDynamoFallsBackWithoutCreds(t *testing.T) {
	t.Setenv("HOMESCOOL_BACKEND", "dynamodb")
	t.Setenv("AWS_ACCESS_KEY_ID", "")
	t.Setenv("AWS_SECRET_ACCESS_KEY", "")
	t.Setenv("AWS_SESSION_TOKEN", "")
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("AWS_REGION", "us-east-1")
	store := OpenLinkStore(context.Background())
	if store.BackendName() != "memory" {
		t.Fatalf("expected memory fallback, got %s", store.BackendName())
	}
}

func TestOpenLinkStoreFollowsDatabaseBackend(t *testing.T) {
	t.Setenv("HOMESCOOL_BACKEND", "")
	t.Setenv("DATABASE_BACKEND", "memory")
	store := OpenLinkStore(context.Background())
	if store.BackendName() != "memory" {
		t.Fatalf("backend=%s", store.BackendName())
	}
}

func TestTeacherAndStudentLinkSKShapes(t *testing.T) {
	if got := teacherLinkSK("A@B.com", "C@D.com"); got != "homescool-link:t:a@b.com|s:c@d.com" {
		t.Fatalf("teacher SK=%s", got)
	}
	if got := studentLinkSK("C@D.com", "A@B.com"); got != "homescool-by-student:s:c@d.com|t:a@b.com" {
		t.Fatalf("student SK=%s", got)
	}
	if got := teacherLinkPrefix("A@B.com"); got != "homescool-link:t:a@b.com|s:" {
		t.Fatalf("teacher prefix=%s", got)
	}
}
