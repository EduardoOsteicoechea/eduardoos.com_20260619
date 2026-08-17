package homescool

import (
	"strings"
	"testing"
)

type captureMailer struct {
	subjects []string
	tos      []string
	htmls    []string
	plains   []string
}

func (c *captureMailer) SendHTMLMail(_, to, subject, plainBody, htmlBody string) error {
	c.tos = append(c.tos, to)
	c.subjects = append(c.subjects, subject)
	c.plains = append(c.plains, plainBody)
	c.htmls = append(c.htmls, htmlBody)
	return nil
}

func TestFormalEmailHTMLUsesAtelierPalette(t *testing.T) {
	htmlBody := formalEmailHTML("Eyebrow", "Title", "Lead copy.", "", "Open", "https://eduardoos.com/homescool/learning")
	for _, needle := range []string{mailBg, mailSurface, mailAccent, mailInk, "Homescool", "Open"} {
		if !strings.Contains(htmlBody, needle) {
			t.Fatalf("expected %q in html", needle)
		}
	}
	if strings.Contains(strings.ToLower(htmlBody), "purple") || strings.Contains(htmlBody, "#7c3aed") {
		t.Fatal("must not use purple SaaS palette")
	}
}

func TestNotifyStudentRegisteredSendsStudentAndTeacher(t *testing.T) {
	mail := &captureMailer{}
	h := &Handler{Mail: mail}
	h.notifyStudentRegistered("cid", Link{
		TeacherEmail: "t@example.com",
		StudentEmail: "s@example.com",
		StudentSlug:  "s_at_example.com",
		S3Prefix:     "homeschool/t_at_example.com/s_at_example.com",
	})
	if len(mail.tos) != 2 {
		t.Fatalf("want 2 mails, got %#v", mail.tos)
	}
	if mail.tos[0] != "s@example.com" || mail.tos[1] != "t@example.com" {
		t.Fatalf("unexpected recipients %#v", mail.tos)
	}
	if !strings.Contains(mail.htmls[0], "/homescool/learning") {
		t.Fatal("student mail missing learning CTA")
	}
	if !strings.Contains(mail.htmls[1], "student=") {
		t.Fatal("teacher mail missing workspace CTA")
	}
}

func TestNotifyTaskAssignedAndGraded(t *testing.T) {
	mail := &captureMailer{}
	h := &Handler{Mail: mail}
	task := AssignedTask{
		ID:           "task-1",
		TeacherEmail: "t@example.com",
		StudentEmail: "s@example.com",
		Name:         "Essay",
		StartDate:    "2026-08-01",
		EndDate:      "2026-08-15",
		MaxScore:     5,
		Grade: &TaskGrade{
			Decision: GradeValidate,
			Score:    9,
			Note:     "Solid work",
		},
	}
	h.notifyTaskAssigned("cid", task)
	h.notifyTaskGraded("cid", task)
	if len(mail.subjects) != 2 {
		t.Fatalf("want 2 notifications, got %#v", mail.subjects)
	}
	if !strings.Contains(mail.htmls[0], "task=task-1") {
		t.Fatal("assign mail should deep-link task id")
	}
	if !strings.Contains(mail.plains[1], "9") || !strings.Contains(mail.htmls[1], "validated") && !strings.Contains(mail.htmls[1], "Validated") {
		t.Fatalf("grade mail incomplete: %#v / %#v", mail.plains[1], mail.htmls[1])
	}
}

func TestMailNilIsSafe(t *testing.T) {
	h := &Handler{}
	h.notifyStudentRegistered("cid", Link{StudentEmail: "s@x.com", TeacherEmail: "t@x.com"})
	h.notifyTaskAssigned("cid", AssignedTask{StudentEmail: "s@x.com", Name: "x"})
	h.notifyTaskGraded("cid", AssignedTask{StudentEmail: "s@x.com", Grade: &TaskGrade{Decision: GradeReject, Score: 2}})
}
