// Crawl job: bounded recursive HTTPS documentation fetch for Agent Sandbox.
// Admin supplies allowlist per request. Results are JSON only — the agent
// builds site files. No Python, no shell, no writes to the site from this package.
package agentsandbox

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	crawlJobTimeout     = 60 * time.Second
	crawlDefaultPages   = 30
	crawlHardMaxPages   = 100
	crawlDefaultDepth   = 2
	crawlHardMaxDepth   = 4
	crawlMaxPageBytes   = 512 << 10 // 512 KiB raw HTML per page
	crawlMaxTextChars   = 24_000   // plain text kept per page for the model
	crawlUserAgent      = "EduardoOS-AgentSandbox-Crawler/1.0"
)

var hrefRe = regexp.MustCompile(`(?i)href\s*=\s*["']([^"']+)["']`)
var titleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
var scriptRe = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
var styleRe = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
var tagRe = regexp.MustCompile(`(?s)<[^>]+>`)

// CrawlJobRequest is the admin-supplied crawl plan.
type CrawlJobRequest struct {
	StartURL  string   `json:"startUrl"`
	Allowlist []string `json:"allowlist"`
	MaxPages  int      `json:"maxPages"`
	MaxDepth  int      `json:"maxDepth"`
}

// CrawlPage is one fetched document reduced to text for the agent.
type CrawlPage struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Text  string `json:"text"`
	Depth int    `json:"depth"`
}

// CrawlJobResult is returned to the caller / injected into Ask as CRAWL_RESULT.
type CrawlJobResult struct {
	StartURL  string      `json:"startUrl"`
	Pages     []CrawlPage `json:"pages"`
	PageCount int         `json:"pageCount"`
	Truncated bool        `json:"truncated"`
	Errors    []string    `json:"errors,omitempty"`
}

type crawlQueueItem struct {
	url   string
	depth int
}

func normalizeCrawlLimits(maxPages, maxDepth int) (int, int) {
	if maxPages <= 0 {
		maxPages = crawlDefaultPages
	}
	if maxPages > crawlHardMaxPages {
		maxPages = crawlHardMaxPages
	}
	if maxDepth <= 0 {
		maxDepth = crawlDefaultDepth
	}
	if maxDepth > crawlHardMaxDepth {
		maxDepth = crawlHardMaxDepth
	}
	return maxPages, maxDepth
}

func normalizeAllowlist(list []string) []string {
	out := make([]string, 0, len(list))
	seen := map[string]bool{}
	for _, a := range list {
		a = strings.ToLower(strings.TrimSpace(a))
		a = strings.TrimPrefix(a, "https://")
		a = strings.TrimPrefix(a, "http://")
		a = strings.Trim(a, "/")
		if a == "" || seen[a] {
			continue
		}
		seen[a] = true
		out = append(out, a)
	}
	return out
}

func hostAllowed(host string, allowlist []string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	for _, a := range allowlist {
		if host == a || strings.HasSuffix(host, "."+a) {
			return true
		}
	}
	return false
}

func assertPublicHTTPS(ctx context.Context, raw string, allowlist []string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return nil, fmt.Errorf("only HTTPS URLs are allowed")
	}
	host := strings.ToLower(u.Hostname())
	if !hostAllowed(host, allowlist) {
		return nil, fmt.Errorf("host is not in this request allowlist")
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if ip.IP.IsPrivate() || ip.IP.IsLoopback() || ip.IP.IsLinkLocalUnicast() || ip.IP.IsUnspecified() {
			return nil, fmt.Errorf("private network targets are blocked")
		}
	}
	// Drop fragment; keep path/query.
	u.Fragment = ""
	return u, nil
}

func htmlToPlainText(raw string) (title, text string) {
	if m := titleRe.FindStringSubmatch(raw); len(m) == 2 {
		title = strings.TrimSpace(tagRe.ReplaceAllString(m[1], ""))
	}
	cleaned := scriptRe.ReplaceAllString(raw, " ")
	cleaned = styleRe.ReplaceAllString(cleaned, " ")
	cleaned = tagRe.ReplaceAllString(cleaned, " ")
	cleaned = strings.Join(strings.Fields(cleaned), " ")
	if len(cleaned) > crawlMaxTextChars {
		cleaned = cleaned[:crawlMaxTextChars] + "…"
	}
	return title, cleaned
}

func extractLinks(base *url.URL, html string, allowlist []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range hrefRe.FindAllStringSubmatch(html, -1) {
		if len(m) < 2 {
			continue
		}
		ref := strings.TrimSpace(m[1])
		if ref == "" || strings.HasPrefix(ref, "#") || strings.HasPrefix(strings.ToLower(ref), "javascript:") ||
			strings.HasPrefix(strings.ToLower(ref), "mailto:") || strings.HasPrefix(strings.ToLower(ref), "data:") {
			continue
		}
		abs, err := base.Parse(ref)
		if err != nil || abs.Scheme != "https" {
			continue
		}
		abs.Fragment = ""
		host := strings.ToLower(abs.Hostname())
		if !hostAllowed(host, allowlist) {
			continue
		}
		key := abs.String()
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	return out
}

func fetchPage(ctx context.Context, client *http.Client, raw string, allowlist []string) (body string, finalURL string, err error) {
	u, err := assertPublicHTTPS(ctx, raw, allowlist)
	if err != nil {
		return "", "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", crawlUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
	res, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", "", fmt.Errorf("status %d", res.StatusCode)
	}
	rawBody, err := io.ReadAll(io.LimitReader(res.Body, crawlMaxPageBytes+1))
	if err != nil {
		return "", "", err
	}
	if len(rawBody) > crawlMaxPageBytes {
		rawBody = rawBody[:crawlMaxPageBytes]
	}
	final := u.String()
	if res.Request != nil && res.Request.URL != nil {
		final = res.Request.URL.String()
	}
	return string(rawBody), final, nil
}

// runCrawlJob walks startURL up to maxPages/maxDepth within a 60s budget.
func runCrawlJob(parent context.Context, req CrawlJobRequest) (CrawlJobResult, error) {
	allowlist := normalizeAllowlist(req.Allowlist)
	if strings.TrimSpace(req.StartURL) == "" {
		return CrawlJobResult{}, fmt.Errorf("startUrl required")
	}
	if len(allowlist) == 0 {
		return CrawlJobResult{}, fmt.Errorf("allowlist required")
	}
	maxPages, maxDepth := normalizeCrawlLimits(req.MaxPages, req.MaxDepth)

	ctx, cancel := context.WithTimeout(parent, crawlJobTimeout)
	defer cancel()

	start, err := assertPublicHTTPS(ctx, req.StartURL, allowlist)
	if err != nil {
		return CrawlJobResult{}, err
	}

	result := CrawlJobResult{StartURL: start.String(), Pages: []CrawlPage{}}
	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) > 3 {
				return fmt.Errorf("too many redirects")
			}
			if !hostAllowed(strings.ToLower(r.URL.Hostname()), allowlist) {
				return fmt.Errorf("redirect host blocked")
			}
			return nil
		},
	}

	visited := map[string]bool{}
	queue := []crawlQueueItem{{url: start.String(), depth: 0}}

	for len(queue) > 0 && len(result.Pages) < maxPages {
		if ctx.Err() != nil {
			result.Truncated = true
			result.Errors = append(result.Errors, "job timeout")
			break
		}
		item := queue[0]
		queue = queue[1:]
		if visited[item.url] || item.depth > maxDepth {
			continue
		}
		visited[item.url] = true

		html, finalURL, err := fetchPage(ctx, client, item.url, allowlist)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", item.url, err))
			continue
		}
		visited[finalURL] = true
		title, text := htmlToPlainText(html)
		result.Pages = append(result.Pages, CrawlPage{
			URL:   finalURL,
			Title: title,
			Text:  text,
			Depth: item.depth,
		})

		if item.depth >= maxDepth {
			continue
		}
		base, _ := url.Parse(finalURL)
		if base == nil {
			continue
		}
		for _, link := range extractLinks(base, html, allowlist) {
			if visited[link] {
				continue
			}
			queue = append(queue, crawlQueueItem{url: link, depth: item.depth + 1})
		}
	}

	if len(queue) > 0 && len(result.Pages) >= maxPages {
		result.Truncated = true
	}
	result.PageCount = len(result.Pages)
	if result.PageCount == 0 && len(result.Errors) > 0 {
		return result, fmt.Errorf("crawl failed: %s", result.Errors[0])
	}
	return result, nil
}
