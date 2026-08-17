package homescool

import (
	"fmt"
	"html"
	"log"
	"strings"

	"eduardoos.nex/internal/httpx"
)

// Mailer sends Homescool notification mail through the shared auth SMTP stack
// (SMTP_USER / SMTP_PASS). Implementations must never panic; callers log errors
// and keep the primary mutation successful when mail fails.
type Mailer interface {
	SendHTMLMail(correlationID, to, subject, plainBody, htmlBody string) error
}

// PublicBaseURL returns the absolute site origin for CTA links in emails.
// Prefer PUBLIC_BASE_URL / SITE_URL; default https://eduardoos.com.
func PublicBaseURL() string {
	base := strings.TrimSpace(httpx.Env("PUBLIC_BASE_URL", ""))
	if base == "" {
		base = strings.TrimSpace(httpx.Env("SITE_URL", "https://eduardoos.com"))
	}
	return strings.TrimRight(base, "/")
}

func learningTasksURL(taskID string) string {
	u := PublicBaseURL() + "/homescool/learning?folder=tasks"
	if strings.TrimSpace(taskID) != "" {
		u += "&task=" + strings.TrimSpace(taskID)
	}
	return u
}

func teacherStudentURL(studentSlug string) string {
	return PublicBaseURL() + "/homescool/students/workspace?student=" + strings.TrimSpace(studentSlug)
}

// gallery-atelier palette (light limestone / muted steel) — inline-safe for email clients.
const (
	mailBg      = "#f2f3f6"
	mailSurface = "#fafbfc"
	mailInk     = "#141820"
	mailMuted   = "#5c6570"
	mailAccent  = "#3d5a80"
	// Soft graphite border (~14% ink on limestone) for email clients without color-mix.
	mailBorderHex = "#d5d8de"
)

func formalEmailHTML(eyebrow, title, lead, detailHTML, ctaLabel, ctaURL string) string {
	eyebrow = html.EscapeString(eyebrow)
	title = html.EscapeString(title)
	lead = html.EscapeString(lead)
	ctaLabel = html.EscapeString(ctaLabel)
	ctaURL = html.EscapeString(ctaURL)
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>%s</title>
</head>
<body style="margin:0;padding:0;background:%s;color:%s;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:%s;padding:28px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:%s;border:1px solid %s;border-radius:3px;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.02em;color:%s;">Homescool</p>
              <p style="margin:0 0 18px 0;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:%s;">%s</p>
              <h1 style="margin:0 0 12px 0;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:20px;font-weight:600;line-height:1.35;color:%s;">%s</h1>
              <p style="margin:0 0 18px 0;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:%s;">%s</p>
              %s
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 8px 0;">
                <tr>
                  <td style="background:%s;border-radius:3px;">
                    <a href="%s" style="display:inline-block;padding:12px 18px;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.04em;text-decoration:none;color:#f7f8fa;">%s</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0;font-family:Roboto,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:%s;">
                Or open: <a href="%s" style="color:%s;text-decoration:underline;">%s</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px 28px;border-top:1px solid %s;">
              <p style="margin:0;font-family:Roboto,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:%s;">Eduardo OS · Homescool</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		title,
		mailBg, mailInk,
		mailBg,
		mailSurface, mailBorderHex,
		mailAccent,
		mailAccent, eyebrow,
		mailInk, title,
		mailMuted, lead,
		detailHTML,
		mailAccent, ctaURL, ctaLabel,
		mailMuted, ctaURL, mailAccent, ctaURL,
		mailBorderHex,
		mailMuted,
	)
}

func formalDetailRows(rows [][2]string) string {
	if len(rows) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px 0;border-top:1px solid ` + mailBorderHex + `;">`)
	for _, row := range rows {
		label := html.EscapeString(row[0])
		value := html.EscapeString(row[1])
		b.WriteString(fmt.Sprintf(`
<tr>
  <td style="padding:10px 0 0 0;font-family:Roboto,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:%s;width:38%%;">%s</td>
  <td style="padding:10px 0 0 0;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:14px;color:%s;">%s</td>
</tr>`, mailMuted, label, mailInk, value))
	}
	b.WriteString(`</table>`)
	return b.String()
}

func (h *Handler) notifyMail(cid, to, subject, plain, htmlBody string) {
	if h == nil || h.Mail == nil {
		return
	}
	to = strings.TrimSpace(to)
	if to == "" {
		return
	}
	if err := h.Mail.SendHTMLMail(cid, to, subject, plain, htmlBody); err != nil {
		log.Printf("[correlation=%s] homescool.mail failed to=%s subject=%q err=%v", cid, to, subject, err)
		return
	}
	log.Printf("[correlation=%s] homescool.mail sent to=%s subject=%q", cid, to, subject)
}

func (h *Handler) notifyStudentRegistered(cid string, link Link) {
	viewURL := learningTasksURL("")
	teacherURL := teacherStudentURL(link.StudentSlug)
	subject := "Homescool — you were registered as a student"
	plain := fmt.Sprintf(
		"Homescool\n\nYou were registered as a student by %s.\n\nOpen your learning space:\n%s\n",
		link.TeacherEmail, viewURL,
	)
	htmlBody := formalEmailHTML(
		"Student registration",
		"You have a Homescool learning space",
		fmt.Sprintf("%s registered you as their student. Your folders and tasks are ready under their workspace.", link.TeacherEmail),
		formalDetailRows([][2]string{
			{"Teacher", link.TeacherEmail},
			{"Your space", link.S3Prefix},
		}),
		"Open learning space",
		viewURL,
	)
	h.notifyMail(cid, link.StudentEmail, subject, plain, htmlBody)

	// Optional teacher confirmation (same SMTP path).
	teacherSubject := "Homescool — student registration confirmed"
	teacherPlain := fmt.Sprintf(
		"Homescool\n\nYou registered %s as a student.\n\nOpen their workspace:\n%s\n",
		link.StudentEmail, teacherURL,
	)
	teacherHTML := formalEmailHTML(
		"Registration confirmed",
		"Student linked to your roster",
		fmt.Sprintf("%s is now on your Homescool roster with portfolio, period, skills, study section, and tasks folders.", link.StudentEmail),
		formalDetailRows([][2]string{
			{"Student", link.StudentEmail},
			{"Workspace", teacherURL},
		}),
		"Open student workspace",
		teacherURL,
	)
	h.notifyMail(cid, link.TeacherEmail, teacherSubject, teacherPlain, teacherHTML)
}

func (h *Handler) notifyTaskAssigned(cid string, task AssignedTask) {
	viewURL := learningTasksURL(task.ID)
	subject := "Homescool — new task assigned"
	plain := fmt.Sprintf(
		"Homescool\n\nNew task: %s\nFrom: %s\nStart: %s\nDue: %s\n\nOpen Tasks:\n%s\n",
		task.Name, task.TeacherEmail, task.StartDate, task.EndDate, viewURL,
	)
	htmlBody := formalEmailHTML(
		"New assignment",
		task.Name,
		fmt.Sprintf("%s assigned you a task. Review the brief and submit your response from Learning → Tasks.", task.TeacherEmail),
		formalDetailRows([][2]string{
			{"Teacher", task.TeacherEmail},
			{"Start", orDash(task.StartDate)},
			{"End / conclusion", orDash(task.EndDate)},
			{"Period", orDash(task.Period)},
			{"Study area", orDash(task.StudyArea)},
			{"Max score", fmt.Sprintf("%d", NormalizeMaxScore(task.MaxScore))},
		}),
		"View task",
		viewURL,
	)
	h.notifyMail(cid, task.StudentEmail, subject, plain, htmlBody)
}

func (h *Handler) notifyTaskGraded(cid string, task AssignedTask) {
	if task.Grade == nil {
		return
	}
	viewURL := learningTasksURL(task.ID)
	decision := task.Grade.Decision
	label := "reviewed"
	eyebrow := "Task review"
	title := task.Name
	lead := fmt.Sprintf("%s reviewed your response.", task.TeacherEmail)
	if decision == GradeValidate {
		label = "validated"
		eyebrow = "Validated"
		lead = fmt.Sprintf("%s validated your response. The task is now marked ready (Listas).", task.TeacherEmail)
	} else if decision == GradeReject {
		label = "needs revision"
		eyebrow = "Needs revision"
		lead = fmt.Sprintf("%s asked you to revise. The task is pending again so you can resubmit.", task.TeacherEmail)
	}
	subject := fmt.Sprintf("Homescool — task %s", label)
	plain := fmt.Sprintf(
		"Homescool\n\nTask: %s\nDecision: %s\nScore: %d / %d (%s)\n\nOpen Tasks:\n%s\n",
		task.Name, decision, task.Grade.Score, NormalizeMaxScore(task.MaxScore), ScoreBand(task.Grade.Score), viewURL,
	)
	rows := [][2]string{
		{"Decision", decision},
		{"Score", fmt.Sprintf("%d / %d · %s", task.Grade.Score, NormalizeMaxScore(task.MaxScore), ScoreBand(task.Grade.Score))},
		{"Teacher", task.TeacherEmail},
	}
	if strings.TrimSpace(task.Grade.Note) != "" {
		rows = append(rows, [2]string{"Note", task.Grade.Note})
	}
	htmlBody := formalEmailHTML(
		eyebrow,
		title,
		lead,
		formalDetailRows(rows),
		"Open learning space",
		viewURL,
	)
	h.notifyMail(cid, task.StudentEmail, subject, plain, htmlBody)
}

func orDash(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "—"
	}
	return s
}
