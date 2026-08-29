package bim

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"eduardoos.nex/internal/auth"

	"github.com/go-chi/chi/v5"
)

func TestResolveRuntimeRootFromEnv(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BIM_RUNTIME_ROOT", root)
	h := NewHandler("test-secret", auth.NewMemoryStore())
	if h.Runtime != root {
		t.Fatalf("runtime=%q want %q", h.Runtime, root)
	}
}

func TestRunPythonHelloWorld(t *testing.T) {
	bin, args := resolvePython()
	if !pythonWorks(bin, args...) {
		t.Skip("no usable Python on PATH (install python3 or set BIM_PYTHON)")
	}

	root := t.TempDir()
	for _, sub := range []string{"jobs", "tmp", "out"} {
		if err := os.MkdirAll(filepath.Join(root, sub), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	hello := "import json, os\nprint('hello world')\nprint('ifc_args:', os.environ.get('BIM_IFC_ARGS', '{}'))\n"
	if err := os.WriteFile(filepath.Join(root, "hello_world.py"), []byte(hello), 0o600); err != nil {
		t.Fatal(err)
	}

	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        auth.AdminEmail,
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleAdmin,
		CreatedAt:    auth.NowRFC3339(),
	})
	h := NewHandler("test-secret", store)
	h.Runtime = root
	h.Python = bin
	h.PythonArgs = args
	h.Timeout = 10 * time.Second

	token, err := auth.IssueJWT(auth.AdminEmail, "test-secret")
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	body, _ := json.Marshal(RunRequest{
		Code: "",
		Ifc:  IfcArgs{Name: "demo.ifc", SizeBytes: 42, Loaded: true},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/bim/python/run", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var resp RunResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if !resp.OK {
		t.Fatalf("not ok: %+v", resp)
	}
	if !strings.Contains(resp.Stdout, "hello world") {
		t.Fatalf("stdout=%q", resp.Stdout)
	}
	if !strings.Contains(resp.Stdout, "demo.ifc") {
		t.Fatalf("missing ifc name in stdout=%q", resp.Stdout)
	}
}

func TestRunPythonForbiddenForUser(t *testing.T) {
	store := auth.NewMemoryStore()
	_ = store.PutUser(nil, auth.User{
		Email:        "user@test.local",
		PasswordHash: auth.HashPassword("password12"),
		Verified:     true,
		Role:         auth.RoleUser,
		CreatedAt:    auth.NowRFC3339(),
	})
	h := NewHandler("test-secret", store)
	h.Runtime = t.TempDir()

	token, err := auth.IssueJWT("user@test.local", "test-secret")
	if err != nil {
		t.Fatal(err)
	}

	r := chi.NewRouter()
	h.Routes(r)

	body, _ := json.Marshal(RunRequest{Code: "print(1)"})
	req := httptest.NewRequest(http.MethodPost, "/api/bim/python/run", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d want 403 body=%s", rec.Code, rec.Body.String())
	}
}
