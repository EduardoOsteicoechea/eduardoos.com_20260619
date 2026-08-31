package evoice

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
)

func TestSafeEmailKey(t *testing.T) {
	if got := SafeEmailKey("A@B.com"); got != "a_at_b.com" {
		t.Fatalf("SafeEmailKey=%q", got)
	}
	if !ValidProjectName("demo-1") {
		t.Fatal("demo-1 should be valid")
	}
	if ValidProjectName("../x") || ValidProjectName(ProjectMarkerName) {
		t.Fatal("invalid names accepted")
	}
}

func TestEvoiceAPIFlow(t *testing.T) {
	users := auth.NewMemoryStore()
	_ = users.PutUser(t.Context(), auth.User{
		Email: "owner@example.com", PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	h := NewHandler("evoice-secret", users)
	h.Entitlements = payments.NewStore()
	h.Entitlements.PutEntitlements("owner@example.com", payments.BuildEntitlements([]string{"evoice"}, "monthly", 1))

	r := chi.NewRouter()
	h.Routes(r)

	tok, err := auth.IssueJWT("owner@example.com", "evoice-secret")
	if err != nil {
		t.Fatal(err)
	}
	authHdr := "Bearer " + tok

	req := httptest.NewRequest(http.MethodGet, "/api/evoice/me", nil)
	req.Header.Set("Authorization", authHdr)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("me status=%d body=%s", rec.Code, rec.Body.String())
	}
	ownerSafe := SafeEmailKey("owner@example.com")

	body := bytes.NewBufferString(`{"name":"smoke"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/projects", body)
	req.Header.Set("Authorization", authHdr)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/evoice/projects", nil)
	req.Header.Set("Authorization", authHdr)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "smoke") {
		t.Fatalf("list projects=%s", rec.Body.String())
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = fw.Write([]byte("Hola mundo eVoice."))
	_ = mw.Close()
	req = httptest.NewRequest(http.MethodPost, "/api/evoice/projects/"+ownerSafe+"/smoke/docs", &buf)
	req.Header.Set("Authorization", authHdr)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/evoice/projects/"+ownerSafe+"/smoke/generate", nil)
	req.Header.Set("Authorization", authHdr)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("generate status=%d body=%s", rec.Code, rec.Body.String())
	}
	var genResp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &genResp); err != nil {
		t.Fatal(err)
	}
	jobID := genResp["jobId"]
	if jobID == "" {
		t.Fatal("missing jobId")
	}

	deadline := time.Now().Add(5 * time.Second)
	var job JobStatus
	for time.Now().Before(deadline) {
		req = httptest.NewRequest(http.MethodGet, "/api/evoice/jobs/"+jobID, nil)
		req.Header.Set("Authorization", authHdr)
		rec = httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("job status=%d", rec.Code)
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &job); err != nil {
			t.Fatal(err)
		}
		if job.State == "done" || job.State == "failed" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if job.State != "done" {
		t.Fatalf("job state=%s err=%s logs=%v", job.State, job.Error, job.Logs)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/evoice/projects/"+ownerSafe+"/smoke/audios", nil)
	req.Header.Set("Authorization", authHdr)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "hello.mp3") {
		t.Fatalf("audios=%s", rec.Body.String())
	}
}

func TestAllowlistBypass(t *testing.T) {
	users := auth.NewMemoryStore()
	email := "eliasosteic@gmail.com"
	_ = users.PutUser(t.Context(), auth.User{
		Email: email, PasswordHash: auth.HashPassword("x"), Verified: true,
	})
	h := NewHandler("evoice-secret", users)
	h.Entitlements = payments.NewStore()

	r := chi.NewRouter()
	h.Routes(r)
	tok, _ := auth.IssueJWT(email, "evoice-secret")
	req := httptest.NewRequest(http.MethodGet, "/api/evoice/me", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("allowlist me status=%d body=%s", rec.Code, rec.Body.String())
	}
}
