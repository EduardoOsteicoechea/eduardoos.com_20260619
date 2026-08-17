package homescool

import (
	"fmt"
	"strings"
)

// Task board statuses shown to teachers (Spanish UI labels in the frontend).
const (
	TaskStatusPending  = "pending"  // Pendientes — assigned, awaiting student work
	TaskStatusActioned = "actioned" // Accionadas — student submitted / needs review
	TaskStatusReady    = "ready"    // Listas — validated (or closed) until archived
	TaskStatusArchived = "archived" // Archivadas
)

// Grade decisions a teacher may apply to a submitted response.
const (
	GradeValidate = "validate"
	GradeReject   = "reject"
)

// TaskTemplate is a reusable assignment blueprint owned by a teacher.
// Stored in DynamoDB (or memory) and optionally illustrated with S3 image keys
// under homeschool/{teacher}/templates/{id}/…
type TaskTemplate struct {
	ID           string   `json:"id"`
	TeacherEmail string   `json:"teacherEmail"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Period       string   `json:"period"`
	StudyArea    string   `json:"studyArea"`
	DurationMin  int      `json:"durationMin"`
	MaxScore     int      `json:"maxScore"`
	ImageKeys    []string `json:"imageKeys,omitempty"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
}

// TaskFile is one proof file attached to a student submission.
type TaskFile struct {
	Key  string `json:"key"`
	Name string `json:"name"`
	Size int64  `json:"size"`
}

// TaskSubmission is the student's response payload (text/markdown + files).
type TaskSubmission struct {
	Text        string     `json:"text"`
	Files       []TaskFile `json:"files"`
	SubmittedAt string     `json:"submittedAt"`
}

// TaskGrade is the teacher's score and validate/reject decision.
type TaskGrade struct {
	Decision string `json:"decision"`
	Score    int    `json:"score"`
	GradedAt string `json:"gradedAt"`
	Note     string `json:"note,omitempty"`
}

// AssignedTask is one concrete task for a teacher→student pair.
// Metadata lives in DynamoDB; proof files live under the student's tasks/ S3 prefix.
type AssignedTask struct {
	ID           string          `json:"id"`
	TemplateID   string          `json:"templateId,omitempty"`
	TeacherEmail string          `json:"teacherEmail"`
	StudentEmail string          `json:"studentEmail"`
	StudentSlug  string          `json:"studentSlug"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Period       string          `json:"period"`
	StudyArea    string          `json:"studyArea"`
	StartDate    string          `json:"startDate"`
	EndDate      string          `json:"endDate"`
	DurationMin  int             `json:"durationMin"`
	MaxScore     int             `json:"maxScore"`
	Status       string          `json:"status"`
	ImageKeys    []string        `json:"imageKeys,omitempty"`
	Submission   *TaskSubmission `json:"submission,omitempty"`
	Grade        *TaskGrade      `json:"grade,omitempty"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
}

// IsValidTaskStatus reports whether s is one of the four board columns.
func IsValidTaskStatus(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case TaskStatusPending, TaskStatusActioned, TaskStatusReady, TaskStatusArchived:
		return true
	default:
		return false
	}
}

// NormalizeMaxScore clamps a template/task max score into 1–5 (default 5).
func NormalizeMaxScore(n int) int {
	if n <= 0 {
		return 5
	}
	if n > 5 {
		return 5
	}
	return n
}

// ValidateScore ensures a grade is an integer in [1, maxScore] (max capped at 5).
func ValidateScore(score, maxScore int) error {
	maxScore = NormalizeMaxScore(maxScore)
	if score < 1 || score > maxScore {
		return fmt.Errorf("score must be between 1 and %d", maxScore)
	}
	return nil
}

// ScoreBand maps a 1–5 score into the UI color band used by the 5-segment bar.
//
//	1     mínimo   (red)
//	2     pobre    (yellow)
//	3     aprobado (pale lime)
//	4–5   bueno    (green)
func ScoreBand(score int) string {
	switch {
	case score <= 0:
		return ""
	case score == 1:
		return "minimo"
	case score == 2:
		return "pobre"
	case score == 3:
		return "aprobado"
	default:
		return "bueno"
	}
}

// TemplateObjectPrefix is the S3 prefix for a teacher's template assets.
func TemplateObjectPrefix(teacherEmail, templateID string) string {
	return fmt.Sprintf("%s/%s/templates/%s", RootPrefix, SafeEmailKey(teacherEmail), strings.TrimSpace(templateID))
}

// TaskSubmissionPrefix is the S3 prefix for proof files on an assigned task.
func TaskSubmissionPrefix(teacherEmail, studentEmail, taskID string) string {
	return FolderPrefix(teacherEmail, studentEmail, "tasks") + "/" + strings.TrimSpace(taskID) + "/submission"
}

func cloneTemplate(t TaskTemplate) TaskTemplate {
	cp := t
	cp.ImageKeys = append([]string(nil), t.ImageKeys...)
	return cp
}

func cloneTask(t AssignedTask) AssignedTask {
	cp := t
	cp.ImageKeys = append([]string(nil), t.ImageKeys...)
	if t.Submission != nil {
		sub := *t.Submission
		sub.Files = append([]TaskFile(nil), t.Submission.Files...)
		cp.Submission = &sub
	}
	if t.Grade != nil {
		g := *t.Grade
		cp.Grade = &g
	}
	return cp
}
