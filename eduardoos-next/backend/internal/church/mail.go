package church

import (
	"fmt"
	"html"
	"log"
	"strings"

	"eduardoos.nex/internal/httpx"
)

// Mailer sends Church notification mail through the shared auth SMTP stack.
type Mailer interface {
	SendHTMLMail(correlationID, to, subject, plainBody, htmlBody string) error
}

// PublicBaseURL returns the absolute site origin for CTA links in emails.
func PublicBaseURL() string {
	base := strings.TrimSpace(httpx.Env("PUBLIC_BASE_URL", ""))
	if base == "" {
		base = strings.TrimSpace(httpx.Env("SITE_URL", "https://eduardoos.com"))
	}
	return strings.TrimRight(base, "/")
}

// gallery-atelier palette (light limestone / muted steel) — inline-safe for email clients.
const (
	mailBg        = "#f2f3f6"
	mailSurface   = "#fafbfc"
	mailInk       = "#141820"
	mailMuted     = "#5c6570"
	mailAccent    = "#3d5a80"
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
              <p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.02em;color:%s;">Church</p>
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
              <p style="margin:0;font-family:Roboto,Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:%s;">Eduardo OS · Church</p>
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

// NotifyAuthorizationApproved emails the user that they may register churches
// only after paying the church-management subscription. Mail failures are logged
// and never block the approval mutation.
func NotifyAuthorizationApproved(mail Mailer, correlationID, toEmail string) {
	if mail == nil {
		return
	}
	to := strings.TrimSpace(toEmail)
	if to == "" {
		return
	}
	subscribeURL := PublicBaseURL() + "/payments/subscription"
	registerURL := PublicBaseURL() + "/church/register"
	subject := "Church — authorization approved; subscribe to register"
	plain := fmt.Sprintf(
		"Church\n\nYour request to manage and register churches was approved.\n\n"+
			"You may register churches only after activating the Church Management subscription ($1/month).\n\n"+
			"Subscribe:\n%s\n\nThen register:\n%s\n",
		subscribeURL, registerURL,
	)
	htmlBody := formalEmailHTML(
		"Authorization approved",
		"You may register churches after subscribing",
		"A platform administrator approved your request to manage churches. "+
			"Registration stays locked until you activate the Church Management subscription.",
		formalDetailRows([][2]string{
			{"Service", "Church Management"},
			{"Price", "$1 / month"},
			{"Next step", "Subscribe, then open Register church"},
		}),
		"Subscribe to Church Management",
		subscribeURL,
	)
	if err := mail.SendHTMLMail(correlationID, to, subject, plain, htmlBody); err != nil {
		log.Printf("[correlation=%s] church.mail approval failed to=%s err=%v", correlationID, to, err)
		return
	}
	log.Printf("[correlation=%s] church.mail approval sent to=%s", correlationID, to)
}
