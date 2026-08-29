// Package bim serves the admin-only BIM IFC viewer backend (spec 037):
// host Python subprocess under backend/bim/bim_runtime — no extra Docker service.
package bim

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	maxCodeBytes   = 64 << 10
	maxOutputBytes = 256 << 10
	defaultTimeout = 15 * time.Second
)

// IfcArgs is browser-side metadata about the loaded IFC (file stays in the browser).
type IfcArgs struct {
	Name      string `json:"name,omitempty"`
	SizeBytes int64  `json:"sizeBytes,omitempty"`
	Loaded    bool   `json:"loaded"`
	Notes     string `json:"notes,omitempty"`
}

// RunRequest is POST /api/bim/python/run body.
type RunRequest struct {
	Code string  `json:"code"`
	Ifc  IfcArgs `json:"ifc"`
}

// RunResponse is the sandboxed process result.
type RunResponse struct {
	OK       bool   `json:"ok"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	TimedOut bool   `json:"timedOut,omitempty"`
	Runtime  string `json:"runtime"`
}

// Handler mounts JWT + admin BIM routes.
type Handler struct {
	JWTSecret  string
	Users      auth.UserStore
	auth       *auth.Handler
	Runtime    string
	Python     string
	PythonArgs []string
	Timeout    time.Duration
}

// NewHandler resolves the bim_runtime root and Python binary.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	h := &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
		Timeout:   defaultTimeout,
	}
	if sec := strings.TrimSpace(os.Getenv("BIM_PYTHON_TIMEOUT_SEC")); sec != "" {
		if n, err := strconv.Atoi(sec); err == nil && n > 0 && n <= 120 {
			h.Timeout = time.Duration(n) * time.Second
		}
	}
	h.Python, h.PythonArgs = resolvePython()
	h.Runtime = resolveRuntimeRoot()
	return h
}

// Routes mounts /api/bim/* (admin-gated; path is not under /api/admin).
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireAdmin)
		pr.Post("/api/bim/python/run", h.RunPython)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
				role = u.Role
			}
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RunPython executes code (or hello_world.py) inside the bim_runtime sandbox.
func (h *Handler) RunPython(w http.ResponseWriter, r *http.Request) {
	var req RunRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxCodeBytes+32<<10)).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(req.Code) > maxCodeBytes {
		httpx.WriteError(w, http.StatusBadRequest, "code too large")
		return
	}

	root, err := h.ensureRuntime()
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "runtime unavailable")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.Timeout)
	defer cancel()

	out, err := h.execPython(ctx, root, req)
	if err != nil && out == nil {
		httpx.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) ensureRuntime() (string, error) {
	root := h.Runtime
	if root == "" {
		return "", errors.New("empty runtime root")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	for _, sub := range []string{"jobs", "tmp", "out"} {
		if err := os.MkdirAll(filepath.Join(abs, sub), 0o755); err != nil {
			return "", err
		}
	}
	return abs, nil
}

func (h *Handler) execPython(ctx context.Context, root string, req RunRequest) (*RunResponse, error) {
	ifcJSON, err := json.Marshal(req.Ifc)
	if err != nil {
		return nil, err
	}

	code := strings.TrimSpace(req.Code)
	var scriptPath string
	var cleanup bool
	if code == "" {
		scriptPath = filepath.Join(root, "hello_world.py")
		if _, err := os.Stat(scriptPath); err != nil {
			return nil, fmt.Errorf("hello_world.py missing")
		}
	} else {
		name := "job_" + uuid.NewString() + ".py"
		scriptPath = filepath.Join(root, "jobs", name)
		if err := os.WriteFile(scriptPath, []byte(code+"\n"), 0o600); err != nil {
			return nil, err
		}
		cleanup = true
	}
	if cleanup {
		defer func() { _ = os.Remove(scriptPath) }()
	}

	tmpDir := filepath.Join(root, "tmp")
	args := append(append([]string{}, h.PythonArgs...), "-I", scriptPath)
	cmd := exec.CommandContext(ctx, h.Python, args...)
	cmd.Dir = root
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"LANG=" + fallbackEnv("LANG", "C.UTF-8"),
		"LC_ALL=" + fallbackEnv("LC_ALL", "C.UTF-8"),
		"HOME=" + tmpDir,
		"TMPDIR=" + tmpDir,
		"TMP=" + tmpDir,
		"TEMP=" + tmpDir,
		"BIM_RUNTIME_ROOT=" + root,
		"BIM_IFC_ARGS=" + string(ifcJSON),
		"PYTHONUNBUFFERED=1",
		"PYTHONDONTWRITEBYTECODE=1",
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitedBuffer{buf: &stdout, limit: maxOutputBytes}
	cmd.Stderr = &limitedBuffer{buf: &stderr, limit: maxOutputBytes}

	runErr := cmd.Run()
	resp := &RunResponse{
		Stdout:  stdout.String(),
		Stderr:  stderr.String(),
		Runtime: root,
	}
	if ctx.Err() == context.DeadlineExceeded {
		resp.TimedOut = true
		resp.ExitCode = -1
		resp.OK = false
		return resp, nil
	}
	if runErr != nil {
		var ee *exec.ExitError
		if errors.As(runErr, &ee) {
			resp.ExitCode = ee.ExitCode()
		} else {
			resp.ExitCode = -1
			if resp.Stderr == "" {
				resp.Stderr = runErr.Error()
			}
		}
		resp.OK = false
		return resp, nil
	}
	resp.ExitCode = 0
	resp.OK = true
	return resp, nil
}

func resolveRuntimeRoot() string {
	if v := strings.TrimSpace(os.Getenv("BIM_RUNTIME_ROOT")); v != "" {
		return v
	}
	candidates := []string{
		filepath.Join("backend", "bim", "bim_runtime"),
		filepath.Join("bim", "bim_runtime"),
		filepath.Join("..", "bim", "bim_runtime"),
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			abs, err := filepath.Abs(c)
			if err == nil {
				return abs
			}
			return c
		}
	}
	return filepath.Join("backend", "bim", "bim_runtime")
}

// resolvePython picks a host interpreter. BIM_PYTHON overrides.
// On Windows, prefer `py -3` / real `python` over the Microsoft Store python3 stub.
func resolvePython() (bin string, args []string) {
	if v := strings.TrimSpace(os.Getenv("BIM_PYTHON")); v != "" {
		return v, nil
	}
	if runtime.GOOS == "windows" {
		if p, err := exec.LookPath("py"); err == nil && pythonWorks(p, "-3") {
			return p, []string{"-3"}
		}
		if p, err := exec.LookPath("python"); err == nil && pythonWorks(p) {
			return p, nil
		}
	}
	for _, name := range []string{"python3", "python"} {
		if p, err := exec.LookPath(name); err == nil && pythonWorks(p) {
			return p, nil
		}
	}
	return "python3", nil
}

func pythonWorks(bin string, extra ...string) bool {
	args := append(append([]string{}, extra...), "--version")
	cmd := exec.Command(bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return false
	}
	s := string(out)
	if strings.Contains(s, "Microsoft Store") {
		return false
	}
	return strings.Contains(strings.ToLower(s), "python")
}

func fallbackEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// limitedBuffer stops growing after limit bytes (keeps a truncation marker).
type limitedBuffer struct {
	buf   *bytes.Buffer
	limit int
	full  bool
}

func (l *limitedBuffer) Write(p []byte) (int, error) {
	if l.full {
		return len(p), nil
	}
	remain := l.limit - l.buf.Len()
	if remain <= 0 {
		l.full = true
		_, _ = l.buf.WriteString("\n…[truncated]\n")
		return len(p), nil
	}
	if len(p) <= remain {
		return l.buf.Write(p)
	}
	n, _ := l.buf.Write(p[:remain])
	l.full = true
	_, _ = l.buf.WriteString("\n…[truncated]\n")
	return n + (len(p) - remain), nil
}
