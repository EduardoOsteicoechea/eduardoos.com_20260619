package evoice

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// JobRunner converts a synced local project docs/ → audios/.
type JobRunner interface {
	Run(ctx context.Context, projectDir string, logFn func(string)) (JobStats, error)
}

// FakeRunner writes a tiny placeholder mp3 for each convertible doc (tests / no TTS).
type FakeRunner struct{}

func (FakeRunner) Run(_ context.Context, projectDir string, logFn func(string)) (JobStats, error) {
	docsDir := filepath.Join(projectDir, "docs")
	audiosDir := filepath.Join(projectDir, "audios")
	_ = os.MkdirAll(audiosDir, 0o755)
	entries, err := os.ReadDir(docsDir)
	if err != nil {
		return JobStats{}, err
	}
	stats := JobStats{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if name == ".keep" || !isConvertible(name) {
			continue
		}
		stats.Docs++
		stem := strings.TrimSuffix(name, filepath.Ext(name))
		mp3 := filepath.Join(audiosDir, stem+".mp3")
		docPath := filepath.Join(docsDir, name)
		docInfo, _ := os.Stat(docPath)
		mp3Info, mp3Err := os.Stat(mp3)
		if mp3Err == nil && docInfo != nil && !docInfo.ModTime().After(mp3Info.ModTime()) {
			logFn("skip  " + name + " (mp3 up to date)")
			stats.Skipped++
			continue
		}
		logFn("gen   " + name + " -> audios/" + stem + ".mp3 (fake)")
		if err := os.WriteFile(mp3, []byte("ID3fake-evoice"), 0o644); err != nil {
			stats.Failed++
			logFn("FAIL  " + name + ": " + err.Error())
			continue
		}
		stats.Generated++
	}
	return stats, nil
}

func isConvertible(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".docx", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif":
		return true
	default:
		return false
	}
}

// PythonRunner shells out to worker/linux_sync.py (Piper / espeak-ng / ffmpeg).
type PythonRunner struct {
	Python string
	Script string
}

func (p PythonRunner) Run(ctx context.Context, projectDir string, logFn func(string)) (JobStats, error) {
	py := p.Python
	if py == "" {
		py = "python3"
	}
	script := p.Script
	if script == "" {
		script = defaultWorkerScript()
	}
	cmd := exec.CommandContext(ctx, py, script, "--project-dir", projectDir)
	cmd.Env = append(os.Environ(), "PYTHONUNBUFFERED=1")
	out, err := cmd.CombinedOutput()
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			logFn(line)
		}
	}
	stats := JobStats{}
	// Best-effort parse of STATS line: STATS docs=1 generated=1 skipped=0 failed=0
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "STATS ") {
			parseStatsLine(strings.TrimSpace(line), &stats)
		}
	}
	if err != nil {
		return stats, err
	}
	return stats, nil
}

func parseStatsLine(line string, stats *JobStats) {
	fields := strings.Fields(line)
	for _, f := range fields[1:] {
		k, v, ok := strings.Cut(f, "=")
		if !ok {
			continue
		}
		var n int
		_, _ = fmtSscanf(v, &n)
		switch k {
		case "docs":
			stats.Docs = n
		case "generated":
			stats.Generated = n
		case "skipped":
			stats.Skipped = n
		case "failed":
			stats.Failed = n
		}
	}
}

func fmtSscanf(s string, n *int) (int, error) {
	var v int
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		v = v*10 + int(c-'0')
	}
	*n = v
	return 1, nil
}

func defaultWorkerScript() string {
	if v := strings.TrimSpace(os.Getenv("EVOICE_WORKER_SCRIPT")); v != "" {
		return v
	}
	// Prefer package-relative path when binary runs from repo / deployed tree.
	candidates := []string{
		filepath.Join("internal", "evoice", "worker", "linux_sync.py"),
		filepath.Join("backend", "internal", "evoice", "worker", "linux_sync.py"),
	}
	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "evoice-worker", "linux_sync.py"),
			filepath.Join(base, "internal", "evoice", "worker", "linux_sync.py"),
		)
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return "linux_sync.py"
}

// JobStore tracks in-flight generate jobs.
type JobStore struct {
	mu    sync.RWMutex
	jobs  map[string]*JobStatus
	runner JobRunner
}

// NewJobStore wires a runner (FakeRunner in tests; PythonRunner in prod).
func NewJobStore(runner JobRunner) *JobStore {
	if runner == nil {
		runner = resolveDefaultRunner()
	}
	return &JobStore{jobs: map[string]*JobStatus{}, runner: runner}
}

func resolveDefaultRunner() JobRunner {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("EVOICE_FAKE_TTS")), "1") {
		return FakeRunner{}
	}
	return PythonRunner{}
}

// Get returns a copy of the job status.
func (s *JobStore) Get(id string) (JobStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	j, ok := s.jobs[id]
	if !ok {
		return JobStatus{}, false
	}
	cp := *j
	cp.Logs = append([]string(nil), j.Logs...)
	if j.Stats != nil {
		st := *j.Stats
		cp.Stats = &st
	}
	return cp, true
}

func (s *JobStore) appendLog(id, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[id]; ok {
		j.Logs = append(j.Logs, line)
		if len(j.Logs) > 500 {
			j.Logs = j.Logs[len(j.Logs)-500:]
		}
	}
}

func (s *JobStore) setState(id, state, errMsg string, stats *JobStats) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[id]; ok {
		j.State = state
		j.Error = errMsg
		j.Stats = stats
	}
}

// Start enqueues an async generate for owner/project using Objects sync.
func (s *JobStore) Start(ctx context.Context, objects ObjectSpace, ownerSafe, project, cid string) (string, error) {
	id := uuid.NewString()
	s.mu.Lock()
	s.jobs[id] = &JobStatus{
		ID:      id,
		State:   "queued",
		Owner:   ownerSafe,
		Project: project,
		Logs:    []string{"queued"},
	}
	s.mu.Unlock()

	go s.runJob(context.WithoutCancel(ctx), objects, id, ownerSafe, project, cid)
	return id, nil
}

func (s *JobStore) runJob(ctx context.Context, objects ObjectSpace, id, ownerSafe, project, cid string) {
	s.setState(id, "running", "", nil)
	s.appendLog(id, "starting sandbox sync")

	workRoot := filepath.Join(os.TempDir(), "evoice-jobs", id)
	projectDir := filepath.Join(workRoot, "project")
	docsDir := filepath.Join(projectDir, "docs")
	audiosDir := filepath.Join(projectDir, "audios")
	_ = os.RemoveAll(workRoot)
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		s.setState(id, "failed", err.Error(), nil)
		return
	}
	_ = os.MkdirAll(audiosDir, 0o755)
	defer func() { _ = os.RemoveAll(workRoot) }()

	// Download docs + existing audios (for needs_regen).
	if err := syncPrefixToDir(ctx, objects, DocsPrefix(ownerSafe, project)+"/", docsDir, cid); err != nil {
		s.appendLog(id, "download docs failed: "+err.Error())
		s.setState(id, "failed", err.Error(), nil)
		return
	}
	_ = syncPrefixToDir(ctx, objects, AudiosPrefix(ownerSafe, project)+"/", audiosDir, cid)

	jobCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	stats, err := s.runner.Run(jobCtx, projectDir, func(line string) {
		s.appendLog(id, line)
	})
	if err != nil {
		s.appendLog(id, "runner error: "+err.Error())
		s.setState(id, "failed", err.Error(), &stats)
		return
	}

	// Upload audios/*.mp3
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		s.setState(id, "failed", err.Error(), &stats)
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(audiosDir, e.Name()))
		if err != nil {
			s.appendLog(id, "read mp3 failed: "+err.Error())
			continue
		}
		key := AudioKey(ownerSafe, project, e.Name())
		if err := objects.PutBytes(ctx, key, body, "audio/mpeg", cid); err != nil {
			s.appendLog(id, "upload failed "+e.Name()+": "+err.Error())
			s.setState(id, "failed", err.Error(), &stats)
			return
		}
		s.appendLog(id, "uploaded audios/"+e.Name())
	}
	s.appendLog(id, "done")
	s.setState(id, "done", "", &stats)
}

func syncPrefixToDir(ctx context.Context, objects ObjectSpace, prefix, dir, cid string) error {
	objs, err := objects.ListObjects(ctx, prefix, cid)
	if err != nil {
		return err
	}
	for _, obj := range objs {
		name := strings.TrimPrefix(obj.Key, prefix)
		if name == "" || name == ".keep" || strings.Contains(name, "/") {
			continue
		}
		body, ok, err := objects.GetBytes(ctx, obj.Key, cid)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, body, 0o644); err != nil {
			return err
		}
		if !obj.LastModified.IsZero() {
			_ = os.Chtimes(path, obj.LastModified, obj.LastModified)
		}
	}
	return nil
}
