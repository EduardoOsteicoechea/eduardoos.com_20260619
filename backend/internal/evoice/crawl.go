package evoice

// Crawl URL → strip HTML → DeepSeek TTS-clean text → save as docs/*.txt (spec 045).

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
)

const maxCrawlBytes = 2 << 20 // 2 MiB HTML

var (
	reScript = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	reStyle  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	reNoscript = regexp.MustCompile(`(?is)<noscript[^>]*>.*?</noscript>`)
	reTags       = regexp.MustCompile(`(?s)<[^>]+>`)
	reWS         = regexp.MustCompile(`[ \t\x0b\f\r]+`)
	reBlankLines = regexp.MustCompile(`\n{3,}`)
)

// crawlHTTPClient is swapped in tests.
var crawlHTTPClient = &http.Client{Timeout: 25 * time.Second}

type crawlDocBody struct {
	URL string `json:"url"`
}

// CrawlDocText validates URL, fetches page text, DeepSeek-cleans for TTS, saves docs/crawl-*.txt.
func (h *Handler) CrawlDocText(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	caller := auth.UserEmailFromRequest(r)
	owner := chi.URLParam(r, "ownerSafe")
	project := chi.URLParam(r, "project")
	if !ValidProjectName(project) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid project")
		return
	}
	if !h.canAccessOwner(r, caller, owner) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var body crawlDocBody
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	rawURL := strings.TrimSpace(body.URL)
	if rawURL == "" {
		httpx.WriteError(w, http.StatusBadRequest, "url required")
		return
	}
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid url")
		return
	}

	fetched, err := fetchURLText(r.Context(), u.String())
	if err != nil {
		log.Printf("[correlation=%s] evoice.crawl.fetch: %v", cid, err)
		httpx.WriteError(w, http.StatusBadRequest, "url not reachable: "+err.Error())
		return
	}
	cleaned := stripHTMLToText(fetched)
	if strings.TrimSpace(cleaned) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "no text extracted from url")
		return
	}

	speech, err := deepSeekCleanForTTS(r.Context(), cleaned)
	if err != nil {
		log.Printf("[correlation=%s] evoice.crawl.deepseek: %v (using stripped text)", cid, err)
		speech = cleaned
	}
	speech = strings.TrimSpace(speech)
	if speech == "" {
		httpx.WriteError(w, http.StatusBadGateway, "empty speech after clean")
		return
	}

	name := fmt.Sprintf("crawl-%s.txt", time.Now().UTC().Format("20060102-150405"))
	if !ValidFileName(name) || !isConvertible(name) {
		httpx.WriteError(w, http.StatusBadRequest, "could not build crawl file name")
		return
	}
	key := DocKey(owner, project, name)
	if err := h.Objects.PutBytes(r.Context(), key, []byte(speech), "text/plain; charset=utf-8", cid); err != nil {
		log.Printf("[correlation=%s] evoice.crawl.put: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not store crawl doc")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"name":    name,
		"key":     key,
		"source":  u.String(),
		"chars":   len(speech),
		"preview": truncateRunes(speech, 240),
	})
}

func fetchURLText(ctx context.Context, raw string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "EduardoOS-eVoice-Crawl/1.0")
	res, err := crawlHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	rawBody, err := io.ReadAll(io.LimitReader(res.Body, maxCrawlBytes+1))
	if err != nil {
		return "", err
	}
	if len(rawBody) > maxCrawlBytes {
		return "", fmt.Errorf("page too large")
	}
	return string(rawBody), nil
}

func stripHTMLToText(html string) string {
	s := reScript.ReplaceAllString(html, " ")
	s = reStyle.ReplaceAllString(s, " ")
	s = reNoscript.ReplaceAllString(s, " ")
	s = reTags.ReplaceAllString(s, " ")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = reWS.ReplaceAllString(s, " ")
	lines := strings.Split(s, "\n")
	var out []string
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		out = append(out, t)
	}
	s = strings.Join(out, "\n")
	s = reBlankLines.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}

func deepSeekCleanForTTS(ctx context.Context, raw string) (string, error) {
	key := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", ""))
	if key == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY is not configured")
	}
	model := httpx.Env("DEEPSEEK_MODEL_REASONING", "deepseek-v4-pro")
	base := strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")
	system := "You clean web article text for text-to-speech. Remove navigation, ads, cookies, footers, and boilerplate. Keep the main readable narrative in the same language. Output plain speech-ready text only — no markdown, no HTML, no commentary."
	user := "Clean this extracted page text for TTS:\n\n" + truncateRunes(raw, 12000)
	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"stream": false,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	res, err := crawlHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	rawResp, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("DeepSeek status %d: %s", res.StatusCode, strings.TrimSpace(string(rawResp)))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("no choices")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

func truncateRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	count := 0
	for i := range s {
		if count == n {
			return s[:i] + "…"
		}
		count++
	}
	return s
}
