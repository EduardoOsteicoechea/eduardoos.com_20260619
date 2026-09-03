package ereport

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOrgReportViewPath(t *testing.T) {
	p := OrgReportViewPath("a_at_b.com", "org-1", "rep-2")
	if !strings.HasPrefix(p, "/ereport/workspace?") {
		t.Fatalf("path=%s", p)
	}
	if !strings.Contains(p, "user=a_at_b.com") || !strings.Contains(p, "org=org-1") || !strings.Contains(p, "report=rep-2") {
		t.Fatalf("path=%s", p)
	}
}

func TestOrgReportViewURLAbsolute(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.Host = "eduardoos.com"
	r.Header.Set("X-Forwarded-Proto", "https")
	u := OrgReportViewURL(r, "u_at_x.com", "o", "r")
	if !strings.HasPrefix(u, "https://eduardoos.com/ereport/workspace?") {
		t.Fatalf("url=%s", u)
	}
}
