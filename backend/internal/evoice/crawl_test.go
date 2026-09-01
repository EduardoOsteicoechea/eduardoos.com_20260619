package evoice

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestStripHTMLToText(t *testing.T) {
	html := `<html><head><script>bad()</script><style>.x{}</style></head><body><h1>Hello</h1><p>World &amp; more</p></body></html>`
	got := stripHTMLToText(html)
	if !strings.Contains(got, "Hello") || !strings.Contains(got, "World & more") {
		t.Fatalf("got %q", got)
	}
	if strings.Contains(got, "bad()") || strings.Contains(got, ".x{}") {
		t.Fatalf("script/style leaked: %q", got)
	}
}

func TestCrawlDocTextSavesDoc(t *testing.T) {
	prev := crawlHTTPClient
	t.Cleanup(func() { crawlHTTPClient = prev })
	crawlHTTPClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if strings.Contains(r.URL.Path, "chat/completions") {
				body := `{"choices":[{"message":{"content":"Speech ready text from DeepSeek."}}]}`
				return &http.Response{
					StatusCode: 200,
					Body:       io.NopCloser(strings.NewReader(body)),
					Header:     make(http.Header),
				}, nil
			}
			page := `<html><body><article><p>Article body for crawl.</p></article></body></html>`
			return &http.Response{
				StatusCode: 200,
				Body:       io.NopCloser(strings.NewReader(page)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	t.Setenv("DEEPSEEK_API_KEY", "test-key")

	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	h := NewHandler("evoice-secret", users)
	h.Entitlements = payments.NewStore()
	h.Entitlements.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"evoice"}, "monthly", 1))

	r := chi.NewRouter()
	h.Routes(r)
	tok, _ := auth.IssueJWT("owner@example.com", "evoice-secret")
	ownerSafe := SafeEmailKey("owner@example.com")
	project := "crawlme"

	req := httptest.NewRequest(http.MethodPost, "/api/evoice/projects", strings.NewReader(`{"name":"crawlme"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		// Create may return 200/201 depending on handler
		if rec.Code >= 400 {
			t.Fatalf("create project %d %s", rec.Code, rec.Body.String())
		}
	}

	req = httptest.NewRequest(http.MethodPost, "/api/evoice/projects/"+ownerSafe+"/"+project+"/docs/crawl",
		strings.NewReader(`{"url":"https://example.com/article"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("crawl status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	name, _ := resp["name"].(string)
	if !strings.HasPrefix(name, "crawl-") || !strings.HasSuffix(name, ".txt") {
		t.Fatalf("name=%q", name)
	}
}

func TestCrawlDocTextRejectsBadURL(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	h := NewHandler("evoice-secret", users)
	h.Entitlements = payments.NewStore()
	h.Entitlements.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"evoice"}, "monthly", 1))
	r := chi.NewRouter()
	h.Routes(r)
	tok, _ := auth.IssueJWT("owner@example.com", "evoice-secret")
	ownerSafe := SafeEmailKey("owner@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/evoice/projects/"+ownerSafe+"/p/docs/crawl",
		strings.NewReader(`{"url":"not-a-url"}`))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d %s", rec.Code, rec.Body.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
