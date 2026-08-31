package evoice

import (
	"bufio"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Fixed generate plan (spec 044) — ids are stable for the UI checklist.
var defaultJobPlan = []JobStep{
	{ID: "prepare", Label: "Prepare workdir", State: "pending"},
	{ID: "download_docs", Label: "Download documents", State: "pending"},
	{ID: "download_audios", Label: "Download existing audios", State: "pending"},
	{ID: "convert", Label: "Convert docs → MP3", State: "pending"},
	{ID: "upload", Label: "Upload audios to S3", State: "pending"},
	{ID: "finalize", Label: "Finalize", State: "pending"},
}

// JobRunner converts a synced local project docs/ → audios/.
// onlyFiles empty means all convertible docs; otherwise only those basenames.
type JobRunner interface {
	Run(ctx context.Context, projectDir string, onlyFiles []string, logFn func(string)) (JobStats, error)
}

// FakeRunner writes a tiny placeholder mp3 for each convertible doc (tests / no TTS).
type FakeRunner struct{}

func (FakeRunner) Run(_ context.Context, projectDir string, onlyFiles []string, logFn func(string)) (JobStats, error) {
	docsDir := filepath.Join(projectDir, "docs")
	audiosDir := filepath.Join(projectDir, "audios")
	_ = os.MkdirAll(audiosDir, 0o755)
	entries, err := os.ReadDir(docsDir)
	if err != nil {
		return JobStats{}, err
	}
	allow := onlySet(onlyFiles)
	stats := JobStats{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if name == ".keep" || !isConvertible(name) {
			continue
		}
		if len(allow) > 0 && !allow[name] {
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
		logFn("ok     " + name + " -> " + stem + ".mp3")
	}
	return stats, nil
}

func onlySet(files []string) map[string]bool {
	if len(files) == 0 {
		return nil
	}
	m := make(map[string]bool, len(files))
	for _, f := range files {
		f = strings.TrimSpace(f)
		if f != "" {
			m[f] = true
		}
	}
	return m
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
// Stdout is streamed line-by-line so the UI sees convert progress live.
type PythonRunner struct {
	Python string
	Script string
}

func (p PythonRunner) Run(ctx context.Context, projectDir string, onlyFiles []string, logFn func(string)) (JobStats, error) {
	py := p.Python
	if py == "" {
		py = "python3"
	}
	script := p.Script
	if script == "" {
		script = defaultWorkerScript()
	}
	args := []string{script, "--project-dir", projectDir}
	for _, f := range onlyFiles {
		f = strings.TrimSpace(f)
		if f != "" {
			args = append(args, "--only", f)
		}
	}
	cmd := exec.CommandContext(ctx, py, args...)
	tmpDir := filepath.Dir(projectDir)
	cmd.Env = append(os.Environ(),
		"PYTHONUNBUFFERED=1",
		"TMPDIR="+tmpDir,
		"TEMP="+tmpDir,
		"TMP="+tmpDir,
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return JobStats{}, err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return JobStats{}, err
	}
	stats := JobStats{}
	scan := bufio.NewScanner(io.LimitReader(stdout, 8<<20))
	scan.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scan.Scan() {
		line := strings.TrimSpace(scan.Text())
		if line == "" {
			continue
		}
		logFn(line)
		if strings.HasPrefix(line, "STATS ") {
			parseStatsLine(line, &stats)
		}
	}
	waitErr := cmd.Wait()
	if scanErr := scan.Err(); scanErr != nil && waitErr == nil {
		return stats, scanErr
	}
	if waitErr != nil {
		return stats, waitErr
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
	mu     sync.RWMutex
	jobs   map[string]*JobStatus
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

func evoiceJobsBase() string {
	if v := strings.TrimSpace(os.Getenv("EVOICE_WORK_DIR")); v != "" {
		return v
	}
	if st, err := os.Stat("/var/tmp"); err == nil && st.IsDir() {
		return filepath.Join("/var/tmp", "evoice-jobs")
	}
	return filepath.Join(os.TempDir(), "evoice-jobs")
}

func cloneJobSteps(src []JobStep) []JobStep {
	out := make([]JobStep, len(src))
	copy(out, src)
	return out
}

func cloneJobFiles(src []JobFileProgress) []JobFileProgress {
	out := make([]JobFileProgress, len(src))
	copy(out, src)
	return out
}

func newQueuedJob(id, ownerSafe, project string, onlyFiles []string) *JobStatus {
	steps := cloneJobSteps(defaultJobPlan)
	only := append([]string(nil), onlyFiles...)
	return &JobStatus{
		ID:          id,
		State:       "queued",
		Owner:       ownerSafe,
		Project:     project,
		OnlyFiles:   only,
		Logs:        []string{"queued"},
		Steps:       steps,
		Files:       nil,
		Progress:    0,
		CurrentStep: "",
	}
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
	cp.Steps = cloneJobSteps(j.Steps)
	cp.Files = cloneJobFiles(j.Files)
	cp.OnlyFiles = append([]string(nil), j.OnlyFiles...)
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
		if state == "done" {
			j.Progress = 100
			j.CurrentStep = ""
			for i := range j.Steps {
				if j.Steps[i].State == "pending" || j.Steps[i].State == "active" {
					j.Steps[i].State = "done"
				}
			}
			for i := range j.Files {
				if j.Files[i].State == "pending" || j.Files[i].State == "active" {
					j.Files[i].State = "done"
					j.Files[i].Progress = 100
				}
			}
		}
		if state == "failed" {
			j.CurrentStep = ""
			for i := range j.Steps {
				if j.Steps[i].State == "active" {
					j.Steps[i].State = "failed"
				}
			}
		}
	}
}

func (s *JobStore) initFiles(id string, names []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	files := make([]JobFileProgress, 0, len(names))
	for _, n := range names {
		files = append(files, JobFileProgress{Name: n, State: "pending", Progress: 0})
	}
	j.Files = files
}

func (s *JobStore) updateFile(id, name, state string, progress int, detail string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	for i := range j.Files {
		if j.Files[i].Name != name {
			continue
		}
		if state != "" {
			j.Files[i].State = state
		}
		if progress >= 0 {
			j.Files[i].Progress = progress
		}
		if detail != "" {
			j.Files[i].Detail = detail
		}
		return
	}
}

func (s *JobStore) activateStep(id, stepID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	found := false
	for i := range j.Steps {
		switch {
		case j.Steps[i].ID == stepID:
			j.Steps[i].State = "active"
			j.CurrentStep = stepID
			found = true
		case !found && (j.Steps[i].State == "pending" || j.Steps[i].State == "active"):
			j.Steps[i].State = "done"
		}
	}
	j.Progress = progressFromSteps(j.Steps)
}

func (s *JobStore) completeStep(id, stepID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	for i := range j.Steps {
		if j.Steps[i].ID == stepID {
			j.Steps[i].State = "done"
		}
	}
	if j.CurrentStep == stepID {
		j.CurrentStep = ""
	}
	j.Progress = progressFromSteps(j.Steps)
}

func (s *JobStore) failStep(id, stepID, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	for i := range j.Steps {
		if j.Steps[i].ID == stepID {
			j.Steps[i].State = "failed"
		}
	}
	j.CurrentStep = ""
	j.State = "failed"
	j.Error = errMsg
	j.Progress = progressFromSteps(j.Steps)
}

func (s *JobStore) setConvertProgress(id string, done, total int) {
	if total <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	base := 0
	stepWeight := 100 / len(j.Steps)
	for i, st := range j.Steps {
		if st.ID == "convert" {
			base = i * stepWeight
			frac := float64(done) / float64(total)
			if frac > 1 {
				frac = 1
			}
			j.Progress = base + int(frac*float64(stepWeight))
			return
		}
	}
}

func progressFromSteps(steps []JobStep) int {
	if len(steps) == 0 {
		return 0
	}
	done := 0
	for _, st := range steps {
		if st.State == "done" || st.State == "skipped" {
			done++
		}
	}
	return (done * 100) / len(steps)
}

// Start enqueues an async generate. onlyFiles empty = all docs; else those basenames only.
func (s *JobStore) Start(ctx context.Context, objects ObjectSpace, ownerSafe, project, cid string, onlyFiles []string) (string, error) {
	cleaned := make([]string, 0, len(onlyFiles))
	for _, f := range onlyFiles {
		f = sanitizeFileName(strings.TrimSpace(f))
		if f != "" && ValidFileName(f) && isConvertible(f) {
			cleaned = append(cleaned, f)
		}
	}
	id := uuid.NewString()
	s.mu.Lock()
	s.jobs[id] = newQueuedJob(id, ownerSafe, project, cleaned)
	s.mu.Unlock()

	go s.runJob(context.WithoutCancel(ctx), objects, id, ownerSafe, project, cid, cleaned)
	return id, nil
}

func (s *JobStore) runJob(ctx context.Context, objects ObjectSpace, id, ownerSafe, project, cid string, onlyFiles []string) {
	s.setState(id, "running", "", nil)

	s.activateStep(id, "prepare")
	s.appendLog(id, "prepare: creating workdir")
	workRoot := filepath.Join(evoiceJobsBase(), id)
	s.appendLog(id, "prepare: workRoot="+workRoot)
	if len(onlyFiles) > 0 {
		s.appendLog(id, "prepare: onlyFiles="+strings.Join(onlyFiles, ","))
	}
	projectDir := filepath.Join(workRoot, "project")
	docsDir := filepath.Join(projectDir, "docs")
	audiosDir := filepath.Join(projectDir, "audios")
	_ = os.RemoveAll(workRoot)
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		s.appendLog(id, "prepare failed: "+err.Error())
		s.failStep(id, "prepare", err.Error())
		return
	}
	_ = os.MkdirAll(audiosDir, 0o755)
	defer func() { _ = os.RemoveAll(workRoot) }()
	s.completeStep(id, "prepare")

	s.activateStep(id, "download_docs")
	s.appendLog(id, "download_docs: listing and fetching from S3")
	if err := syncPrefixToDir(ctx, objects, DocsPrefix(ownerSafe, project)+"/", docsDir, cid, func(line string) {
		s.appendLog(id, line)
	}); err != nil {
		s.appendLog(id, "download docs failed: "+err.Error())
		s.failStep(id, "download_docs", err.Error())
		return
	}
	s.completeStep(id, "download_docs")

	s.activateStep(id, "download_audios")
	s.appendLog(id, "download_audios: fetching existing mp3s (for skip/regen)")
	_ = syncPrefixToDir(ctx, objects, AudiosPrefix(ownerSafe, project)+"/", audiosDir, cid, func(line string) {
		s.appendLog(id, line)
	})
	s.completeStep(id, "download_audios")

	targets := listConvertibleDocs(docsDir, onlyFiles)
	s.initFiles(id, targets)

	s.activateStep(id, "convert")
	s.appendLog(id, "convert: starting TTS worker")
	jobCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	docTotal := len(targets)
	if docTotal == 0 {
		docTotal = 1
	}
	docDone := 0
	stats, err := s.runner.Run(jobCtx, projectDir, onlyFiles, func(line string) {
		s.appendLog(id, line)
		s.applyConvertLogLine(id, line, &docDone, docTotal)
	})
	usable := stats.Generated+stats.Skipped > 0 || countMP3(audiosDir) > 0
	if err != nil && !usable {
		s.appendLog(id, "runner error: "+err.Error())
		s.failStep(id, "convert", err.Error())
		s.setState(id, "failed", err.Error(), &stats)
		return
	}
	if err != nil {
		s.appendLog(id, "runner warning: "+err.Error()+" (continuing with partial results)")
	}
	s.completeStep(id, "convert")

	s.activateStep(id, "upload")
	s.appendLog(id, "upload: writing audios/*.mp3 to S3")
	uploadAllow := uploadAllowFrom(onlyFiles, targets)
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		s.appendLog(id, "upload list failed: "+err.Error())
		s.failStep(id, "upload", err.Error())
		s.setState(id, "failed", err.Error(), &stats)
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			continue
		}
		if len(uploadAllow) > 0 && !uploadAllow[e.Name()] {
			continue
		}
		body, err := os.ReadFile(filepath.Join(audiosDir, e.Name()))
		if err != nil {
			s.appendLog(id, "read mp3 failed: "+err.Error())
			continue
		}
		key := AudioKey(ownerSafe, project, e.Name())
		s.appendLog(id, "upload: "+e.Name())
		if err := objects.PutBytes(ctx, key, body, "audio/mpeg", cid); err != nil {
			s.appendLog(id, "upload failed "+e.Name()+": "+err.Error())
			s.failStep(id, "upload", err.Error())
			s.setState(id, "failed", err.Error(), &stats)
			return
		}
		s.appendLog(id, "uploaded audios/"+e.Name())
	}
	s.completeStep(id, "upload")

	s.activateStep(id, "finalize")
	s.appendLog(id, "done")
	s.completeStep(id, "finalize")
	errMsg := ""
	if stats.Failed > 0 {
		errMsg = strconv.Itoa(stats.Failed) + " file(s) failed conversion"
	}
	final := "done"
	if stats.Failed > 0 && stats.Generated == 0 && stats.Skipped == 0 {
		final = "failed"
	}
	s.setState(id, final, errMsg, &stats)
}

func uploadAllowFrom(onlyFiles, targets []string) map[string]bool {
	if len(onlyFiles) == 0 {
		return nil
	}
	m := make(map[string]bool, len(targets))
	for _, t := range targets {
		stem := strings.TrimSuffix(t, filepath.Ext(t))
		m[stem+".mp3"] = true
	}
	return m
}

func (s *JobStore) applyConvertLogLine(id, line string, docDone *int, docTotal int) {
	lower := strings.ToLower(line)
	switch {
	case strings.HasPrefix(lower, "step convert doc="):
		// STEP convert doc=1/2 file=name.docx
		name := fileFromStepLine(line)
		if name != "" {
			s.updateFile(id, name, "active", 10, "converting")
		}
	case strings.HasPrefix(lower, "extract "):
		name := strings.TrimSpace(line[len("extract "):])
		s.updateFile(id, name, "active", 35, "extract")
	case strings.HasPrefix(lower, "tts    "):
		name := firstToken(strings.TrimSpace(line[len("tts    "):]))
		s.updateFile(id, name, "active", 65, "tts")
	case strings.HasPrefix(lower, "gen   "):
		name := firstToken(strings.TrimSpace(line[len("gen   "):]))
		s.updateFile(id, name, "active", 20, "generate")
	case strings.HasPrefix(lower, "ok     "):
		name := firstToken(strings.TrimSpace(line[len("ok     "):]))
		s.updateFile(id, name, "done", 100, "ok")
		*docDone++
		s.setConvertProgress(id, *docDone, docTotal)
	case strings.HasPrefix(lower, "skip  "):
		name := firstToken(strings.TrimSpace(line[len("skip  "):]))
		s.updateFile(id, name, "skipped", 100, "up to date")
		*docDone++
		s.setConvertProgress(id, *docDone, docTotal)
	case strings.HasPrefix(lower, "fail  "):
		name := firstToken(strings.TrimSpace(line[len("FAIL  "):]))
		detail := line
		if i := strings.Index(line, ":"); i >= 0 {
			detail = strings.TrimSpace(line[i+1:])
		}
		s.updateFile(id, name, "failed", 100, detail)
		*docDone++
		s.setConvertProgress(id, *docDone, docTotal)
	}
}

func fileFromStepLine(line string) string {
	const key = "file="
	i := strings.Index(strings.ToLower(line), key)
	if i < 0 {
		return ""
	}
	return strings.TrimSpace(line[i+len(key):])
}

func firstToken(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

func listConvertibleDocs(docsDir string, onlyFiles []string) []string {
	entries, err := os.ReadDir(docsDir)
	if err != nil {
		return nil
	}
	allow := onlySet(onlyFiles)
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if name == ".keep" || !isConvertible(name) {
			continue
		}
		if len(allow) > 0 && !allow[name] {
			continue
		}
		names = append(names, name)
	}
	return names
}

func countMP3(audiosDir string) int {
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			n++
		}
	}
	return n
}

func syncPrefixToDir(ctx context.Context, objects ObjectSpace, prefix, dir, cid string, logFn func(string)) error {
	objs, err := objects.ListObjects(ctx, prefix, cid)
	if err != nil {
		return err
	}
	if logFn != nil {
		logFn("listed " + prefix + " → " + itoa(len(objs)) + " object(s)")
	}
	for _, obj := range objs {
		name := strings.TrimPrefix(obj.Key, prefix)
		if name == "" || name == ".keep" || strings.Contains(name, "/") {
			continue
		}
		if logFn != nil {
			logFn("fetch " + name)
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

func itoa(n int) string {
	return strconv.Itoa(n)
}
