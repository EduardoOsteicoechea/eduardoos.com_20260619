package ereport

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// OrgReportViewPath is the canonical website deep link (relative) for an org report.
// Matches frontend orgReportHref: /ereport/workspace?user=&org=&report=
func OrgReportViewPath(ownerSafe, orgID, reportID string) string {
	q := url.Values{}
	q.Set("user", strings.TrimSpace(ownerSafe))
	q.Set("org", strings.TrimSpace(orgID))
	q.Set("report", strings.TrimSpace(reportID))
	return "/ereport/workspace?" + q.Encode()
}

// OrgReportViewURL builds an absolute view URL from the request host when available.
func OrgReportViewURL(r *http.Request, ownerSafe, orgID, reportID string) string {
	path := OrgReportViewPath(ownerSafe, orgID, reportID)
	if r == nil {
		return path
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = strings.TrimSpace(r.Host)
	}
	if host == "" {
		return path
	}
	scheme := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	return fmt.Sprintf("%s://%s%s", scheme, host, path)
}
