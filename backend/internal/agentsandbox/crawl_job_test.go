package agentsandbox

import (
	"context"
	"net/url"
	"strings"
	"testing"
)

func TestNormalizeCrawlLimits(t *testing.T) {
	p, d := normalizeCrawlLimits(0, 0)
	if p != crawlDefaultPages || d != crawlDefaultDepth {
		t.Fatalf("defaults: %d %d", p, d)
	}
	p, d = normalizeCrawlLimits(999, 99)
	if p != crawlHardMaxPages || d != crawlHardMaxDepth {
		t.Fatalf("caps: %d %d", p, d)
	}
}

func TestRunCrawlJobAllowlistRequired(t *testing.T) {
	_, err := runCrawlJob(context.Background(), CrawlJobRequest{
		StartURL: "https://example.com/",
	})
	if err == nil || !strings.Contains(err.Error(), "allowlist") {
		t.Fatalf("expected allowlist error, got %v", err)
	}
}

func TestMergeCrawlRequest(t *testing.T) {
	got, err := mergeCrawlRequest(askRequest{})
	if got != nil || err != nil {
		t.Fatalf("expected nil, got %#v %v", got, err)
	}
	got, err = mergeCrawlRequest(askRequest{
		Allowlist: []string{"docs.example"},
		Crawl:     &CrawlJobRequest{StartURL: "https://docs.example/a"},
	})
	if err != nil || got == nil || len(got.Allowlist) != 1 {
		t.Fatalf("merge allowlist from ask: %#v %v", got, err)
	}
	_, err = mergeCrawlRequest(askRequest{
		Crawl: &CrawlJobRequest{StartURL: "https://docs.example/a"},
	})
	if err == nil {
		t.Fatal("expected allowlist error")
	}
}

func TestHtmlToPlainTextAndLinks(t *testing.T) {
	raw := `<html><head><title>IfcWall</title><style>b{}</style></head>
<body><script>x()</script><h1>Wall</h1><p>A vertical construction.</p>
<a href="/next.html">next</a><a href="https://evil.example/x">x</a></body></html>`
	title, text := htmlToPlainText(raw)
	if title != "IfcWall" {
		t.Fatalf("title %q", title)
	}
	if !strings.Contains(text, "vertical") || strings.Contains(text, "x()") {
		t.Fatalf("text %q", text)
	}
	base, err := url.Parse("https://docs.example/IFC/index.html")
	if err != nil {
		t.Fatal(err)
	}
	links := extractLinks(base, raw, []string{"docs.example"})
	if len(links) != 1 || !strings.Contains(links[0], "/next.html") {
		t.Fatalf("links %#v", links)
	}
}

func TestHostAllowed(t *testing.T) {
	if !hostAllowed("ifc43-docs.standards.buildingsmart.org", []string{"standards.buildingsmart.org"}) {
		t.Fatal("suffix allow expected")
	}
	if hostAllowed("evil.com", []string{"standards.buildingsmart.org"}) {
		t.Fatal("evil must fail")
	}
}
