package evoice

import (
	"bufio"
	"context"
	"encoding/json"
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
// premium asks the worker to DeepSeek-optimize speech before TTS.
type JobRunner interface {
	Run(ctx context.Context, projectDir string, onlyFiles []string, premium bool, logFn func(string)) (JobStats, error)
}

// FakeRunner writes a tiny placeholder mp3 for each convertible doc (tests / no TTS).
type FakeRunner struct{}

func (FakeRunner) Run(_ context.Context, projectDir string, onlyFiles []string, premium bool, logFn func(string)) (JobStats, error) {
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
			logFn("FILE " + name + " state=skipped")
			stats.Skipped++
			continue
		}
		logFn("FILE " + name + " state=active")
		logFn("EXTRACT " + name + " pct=50 detail=fake")
		if premium {
			logFn("PREMIUM " + name + " pct=100 detail=fake-optimized")
			_ = os.WriteFile(filepath.Join(docsDir, stem+".premium.txt"), []byte("premium speech for "+name), 0o644)
		}
		logFn("TTS " + name + " pct=50 detail=fake")
		logFn("gen   " + name + " -> audios/" + stem + ".mp3 (fake)")
		if err := os.WriteFile(mp3, []byte("ID3fake-evoice"), 0o644); err != nil {
			stats.Failed++
			logFn("FAIL  " + name + ": " + err.Error())
			logFn("FILE " + name + " state=failed")
			continue
		}
		stats.Generated++
		logFn("ok     " + name + " -> " + stem + ".mp3")
		logFn("FILE " + name + " state=done")
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
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".premium.txt") {
		return false
	}
	ext := filepath.Ext(lower)
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

func (p PythonRunner) Run(ctx context.Context, projectDir string, onlyFiles []string, premium bool, logFn func(string)) (JobStats, error) {
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
	if premium {
		args = append(args, "--premium")
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

// JobStore tracks in-flight generate jobs and persists snapshots to ObjectSpace.
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

func newQueuedJob(id, ownerSafe, project string, onlyFiles []string, premium bool) *JobStatus {
	steps := cloneJobSteps(defaultJobPlan)
	only := append([]string(nil), onlyFiles...)
	return &JobStatus{
		ID:          id,
		State:       "queued",
		Owner:       ownerSafe,
		Project:     project,
		OnlyFiles:   only,
		Premium:     premium,
		Logs:        []string{"queued"},
		Steps:       steps,
		Files:       nil,
		Progress:    0,
		CurrentStep: "",
	}
}

// Get returns a copy of the in-memory job status.
func (s *JobStore) Get(id string) (JobStatus, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	j, ok := s.jobs[id]
	if !ok {
		return JobStatus{}, false
	}
	return cloneJobStatus(j), true
}

// GetOrLoad returns memory first, else loads a durable S3/memory-object snapshot.
func (s *JobStore) GetOrLoad(ctx context.Context, objects ObjectSpace, id, cid string) (JobStatus, bool) {
	if job, ok := s.Get(id); ok {
		return job, true
	}
	if objects == nil {
		return JobStatus{}, false
	}
	body, ok, err := objects.GetBytes(ctx, JobSnapshotKey(id), cid)
	if err != nil || !ok || len(body) == 0 {
		return JobStatus{}, false
	}
	var job JobStatus
	if err := json.Unmarshal(body, &job); err != nil {
		return JobStatus{}, false
	}
	if strings.TrimSpace(job.ID) == "" {
		job.ID = id
	}
	// Rehydrate into memory so subsequent polls are cheap.
	s.mu.Lock()
	if _, exists := s.jobs[id]; !exists {
		cp := job
		cp.Logs = append([]string(nil), job.Logs...)
		cp.Steps = cloneJobSteps(job.Steps)
		cp.Files = cloneJobFiles(job.Files)
		cp.OnlyFiles = append([]string(nil), job.OnlyFiles...)
		if job.Stats != nil {
			st := *job.Stats
			cp.Stats = &st
		}
		s.jobs[id] = &cp
	}
	s.mu.Unlock()
	return job, true
}

func cloneJobStatus(j *JobStatus) JobStatus {
	cp := *j
	cp.Logs = append([]string(nil), j.Logs...)
	cp.Steps = cloneJobSteps(j.Steps)
	cp.Files = cloneJobFiles(j.Files)
	cp.OnlyFiles = append([]string(nil), j.OnlyFiles...)
	if j.Stats != nil {
		st := *j.Stats
		cp.Stats = &st
	}
	return cp
}

func (s *JobStore) persistSnapshot(ctx context.Context, objects ObjectSpace, id, cid string) {
	if objects == nil || strings.TrimSpace(id) == "" {
		return
	}
	job, ok := s.Get(id)
	if !ok {
		return
	}
	raw, err := json.Marshal(job)
	if err != nil {
		return
	}
	_ = objects.PutBytes(ctx, JobSnapshotKey(id), raw, "application/json", cid)
}

func (s *JobStore) appendLog(ctx context.Context, objects ObjectSpace, id, line, cid string) {
	s.mu.Lock()
	var n int
	if j, ok := s.jobs[id]; ok {
		j.Logs = append(j.Logs, line)
		if len(j.Logs) > 500 {
			j.Logs = j.Logs[len(j.Logs)-500:]
		}
		n = len(j.Logs)
	}
	s.mu.Unlock()
	// Persist frequently during convert so a restart leaves a useful trail.
	if n > 0 && (n%3 == 0 || strings.HasPrefix(strings.ToUpper(line), "FILE ") ||
		strings.HasPrefix(strings.ToUpper(line), "TTS ") ||
		strings.HasPrefix(strings.ToUpper(line), "PREMIUM ") ||
		strings.HasPrefix(strings.ToUpper(line), "EXTRACT ") ||
		strings.HasPrefix(strings.ToUpper(line), "FFMPEG ") ||
		strings.HasPrefix(line, "STATS ")) {
		s.persistSnapshot(ctx, objects, id, cid)
	}
}

func (s *JobStore) setState(ctx context.Context, objects ObjectSpace, id, state, errMsg, cid string, stats *JobStats) {
	s.mu.Lock()
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
	s.mu.Unlock()
	s.persistSnapshot(ctx, objects, id, cid)
}

func (s *JobStore) initFiles(ctx context.Context, objects ObjectSpace, id string, names []string, cid string) {
	s.mu.Lock()
	j, ok := s.jobs[id]
	if ok {
		files := make([]JobFileProgress, 0, len(names))
		for _, n := range names {
			files = append(files, JobFileProgress{Name: n, State: "pending", Progress: 0})
		}
		j.Files = files
	}
	s.mu.Unlock()
	if ok {
		s.persistSnapshot(ctx, objects, id, cid)
	}
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

func (s *JobStore) activateStep(ctx context.Context, objects ObjectSpace, id, stepID, cid string) {
	s.mu.Lock()
	j, ok := s.jobs[id]
	if ok {
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
	s.mu.Unlock()
	if ok {
		s.persistSnapshot(ctx, objects, id, cid)
	}
}

func (s *JobStore) completeStep(ctx context.Context, objects ObjectSpace, id, stepID, cid string) {
	s.mu.Lock()
	j, ok := s.jobs[id]
	if ok {
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
	s.mu.Unlock()
	if ok {
		s.persistSnapshot(ctx, objects, id, cid)
	}
}

func (s *JobStore) failStep(ctx context.Context, objects ObjectSpace, id, stepID, errMsg, cid string) {
	s.mu.Lock()
	j, ok := s.jobs[id]
	if ok {
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
	s.mu.Unlock()
	if ok {
		s.persistSnapshot(ctx, objects, id, cid)
	}
}

func (s *JobStore) setConvertProgress(id string, done, total int, filePct int) {
	if total <= 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return
	}
	stepWeight := 100 / len(j.Steps)
	for i, st := range j.Steps {
		if st.ID != "convert" {
			continue
		}
		base := i * stepWeight
		frac := (float64(done) + float64(filePct)/100.0) / float64(total)
		if frac > 1 {
			frac = 1
		}
		if frac < 0 {
			frac = 0
		}
		j.Progress = base + int(frac*float64(stepWeight))
		return
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
func (s *JobStore) Start(ctx context.Context, objects ObjectSpace, ownerSafe, project, cid string, onlyFiles []string, premium bool) (string, error) {
	cleaned := make([]string, 0, len(onlyFiles))
	for _, f := range onlyFiles {
		f = sanitizeFileName(strings.TrimSpace(f))
		if f != "" && ValidFileName(f) && isConvertible(f) {
			cleaned = append(cleaned, f)
		}
	}
	id := uuid.NewString()
	s.mu.Lock()
	s.jobs[id] = newQueuedJob(id, ownerSafe, project, cleaned, premium)
	s.mu.Unlock()
	s.persistSnapshot(ctx, objects, id, cid)

	go s.runJob(context.WithoutCancel(ctx), objects, id, ownerSafe, project, cid, cleaned, premium)
	return id, nil
}

func (s *JobStore) runJob(ctx context.Context, objects ObjectSpace, id, ownerSafe, project, cid string, onlyFiles []string, premium bool) {
	s.setState(ctx, objects, id, "running", "", cid, nil)

	s.activateStep(ctx, objects, id, "prepare", cid)
	s.appendLog(ctx, objects, id, "prepare: creating workdir", cid)
	workRoot := filepath.Join(evoiceJobsBase(), id)
	s.appendLog(ctx, objects, id, "prepare: workRoot="+workRoot, cid)
	if premium {
		s.appendLog(ctx, objects, id, "prepare: premium=1 (DeepSeek speech)", cid)
	}
	if len(onlyFiles) > 0 {
		s.appendLog(ctx, objects, id, "prepare: onlyFiles="+strings.Join(onlyFiles, ","), cid)
	}
	projectDir := filepath.Join(workRoot, "project")
	docsDir := filepath.Join(projectDir, "docs")
	audiosDir := filepath.Join(projectDir, "audios")
	_ = os.RemoveAll(workRoot)
	if err := os.MkdirAll(docsDir, 0o755); err != nil {
		s.appendLog(ctx, objects, id, "prepare failed: "+err.Error(), cid)
		s.failStep(ctx, objects, id, "prepare", err.Error(), cid)
		return
	}
	_ = os.MkdirAll(audiosDir, 0o755)
	defer func() { _ = os.RemoveAll(workRoot) }()
	s.completeStep(ctx, objects, id, "prepare", cid)

	s.activateStep(ctx, objects, id, "download_docs", cid)
	s.appendLog(ctx, objects, id, "download_docs: listing and fetching from S3", cid)
	if err := syncPrefixToDir(ctx, objects, DocsPrefix(ownerSafe, project)+"/", docsDir, cid, func(line string) {
		s.appendLog(ctx, objects, id, line, cid)
	}); err != nil {
		s.appendLog(ctx, objects, id, "download docs failed: "+err.Error(), cid)
		s.failStep(ctx, objects, id, "download_docs", err.Error(), cid)
		return
	}
	s.completeStep(ctx, objects, id, "download_docs", cid)

	s.activateStep(ctx, objects, id, "download_audios", cid)
	s.appendLog(ctx, objects, id, "download_audios: fetching existing mp3s (for skip/regen)", cid)
	_ = syncPrefixToDir(ctx, objects, AudiosPrefix(ownerSafe, project)+"/", audiosDir, cid, func(line string) {
		s.appendLog(ctx, objects, id, line, cid)
	})
	s.completeStep(ctx, objects, id, "download_audios", cid)

	targets := listConvertibleDocs(docsDir, onlyFiles)
	s.initFiles(ctx, objects, id, targets, cid)

	s.activateStep(ctx, objects, id, "convert", cid)
	s.appendLog(ctx, objects, id, "convert: starting TTS worker", cid)
	jobCtx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	docTotal := len(targets)
	if docTotal == 0 {
		docTotal = 1
	}
	docDone := 0
	stats, err := s.runner.Run(jobCtx, projectDir, onlyFiles, premium, func(line string) {
		s.appendLog(ctx, objects, id, line, cid)
		s.applyConvertLogLine(ctx, objects, id, line, &docDone, docTotal, cid)
	})
	usable := stats.Generated+stats.Skipped > 0 || countMP3(audiosDir) > 0
	if err != nil && !usable {
		s.appendLog(ctx, objects, id, "runner error: "+err.Error(), cid)
		s.failStep(ctx, objects, id, "convert", err.Error(), cid)
		s.setState(ctx, objects, id, "failed", err.Error(), cid, &stats)
		return
	}
	if err != nil {
		s.appendLog(ctx, objects, id, "runner warning: "+err.Error()+" (continuing with partial results)", cid)
	}
	s.completeStep(ctx, objects, id, "convert", cid)

	s.activateStep(ctx, objects, id, "upload", cid)
	s.appendLog(ctx, objects, id, "upload: writing audios/*.mp3 (+ premium.txt) to S3", cid)
	uploadAllow := uploadAllowFrom(onlyFiles, targets)
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		s.appendLog(ctx, objects, id, "upload list failed: "+err.Error(), cid)
		s.failStep(ctx, objects, id, "upload", err.Error(), cid)
		s.setState(ctx, objects, id, "failed", err.Error(), cid, &stats)
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
			s.appendLog(ctx, objects, id, "read mp3 failed: "+err.Error(), cid)
			continue
		}
		key := AudioKey(ownerSafe, project, e.Name())
		s.appendLog(ctx, objects, id, "upload: "+e.Name(), cid)
		if err := objects.PutBytes(ctx, key, body, "audio/mpeg", cid); err != nil {
			s.appendLog(ctx, objects, id, "upload failed "+e.Name()+": "+err.Error(), cid)
			s.failStep(ctx, objects, id, "upload", err.Error(), cid)
			s.setState(ctx, objects, id, "failed", err.Error(), cid, &stats)
			return
		}
		s.appendLog(ctx, objects, id, "uploaded audios/"+e.Name(), cid)
	}
	// Upload premium speech sidecars written by the worker.
	docEntries, _ := os.ReadDir(docsDir)
	for _, e := range docEntries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".premium.txt") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(docsDir, e.Name()))
		if err != nil {
			continue
		}
		key := DocKey(ownerSafe, project, e.Name())
		s.appendLog(ctx, objects, id, "upload: docs/"+e.Name(), cid)
		_ = objects.PutBytes(ctx, key, body, "text/plain; charset=utf-8", cid)
	}
	s.completeStep(ctx, objects, id, "upload", cid)

	s.activateStep(ctx, objects, id, "finalize", cid)
	s.appendLog(ctx, objects, id, "done", cid)
	s.completeStep(ctx, objects, id, "finalize", cid)
	errMsg := ""
	if stats.Failed > 0 {
		errMsg = strconv.Itoa(stats.Failed) + " file(s) failed conversion"
	}
	final := "done"
	if stats.Failed > 0 && stats.Generated == 0 && stats.Skipped == 0 {
		final = "failed"
	}
	s.setState(ctx, objects, id, final, errMsg, cid, &stats)
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

func (s *JobStore) applyConvertLogLine(ctx context.Context, objects ObjectSpace, id, line string, docDone *int, docTotal int, cid string) {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return
	}
	kind := strings.ToUpper(fields[0])
	switch kind {
	case "FILE":
		if len(fields) < 2 {
			return
		}
		name := fields[1]
		state := kvFromLine(line, "state")
		if state == "" {
			state = "active"
		}
		pct := 5
		switch state {
		case "done", "skipped":
			pct = 100
			*docDone++
			s.setConvertProgress(id, *docDone, docTotal, 0)
		case "failed":
			pct = 100
			*docDone++
			s.setConvertProgress(id, *docDone, docTotal, 0)
		default:
			s.setConvertProgress(id, *docDone, docTotal, pct)
		}
		s.updateFile(id, name, state, pct, state)
		s.persistSnapshot(ctx, objects, id, cid)
	case "EXTRACT", "PREMIUM", "TTS", "FFMPEG":
		if len(fields) < 2 {
			return
		}
		name := fields[1]
		pct := atoiDefault(kvFromLine(line, "pct"), 40)
		detail := kvFromLine(line, "detail")
		if detail == "" {
			detail = strings.ToLower(kind)
		}
		phaseBase := map[string]int{"EXTRACT": 10, "PREMIUM": 35, "TTS": 45, "FFMPEG": 90}[kind]
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		// Map phase-local pct into roughly 10–99 within the file bar.
		mapped := phaseBase + (pct * (100 - phaseBase) / 100)
		if mapped > 99 {
			mapped = 99
		}
		s.updateFile(id, name, "active", mapped, detail)
		s.setConvertProgress(id, *docDone, docTotal, mapped)
		s.persistSnapshot(ctx, objects, id, cid)
	default:
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "step convert doc="):
			name := fileFromStepLine(line)
			if name != "" {
				s.updateFile(id, name, "active", 10, "converting")
				s.setConvertProgress(id, *docDone, docTotal, 10)
			}
		case strings.HasPrefix(lower, "gen   "):
			name := firstToken(strings.TrimSpace(line[len("gen   "):]))
			s.updateFile(id, name, "active", 20, "generate")
		case strings.HasPrefix(lower, "ok     "):
			name := firstToken(strings.TrimSpace(line[len("ok     "):]))
			s.updateFile(id, name, "done", 100, "ok")
		case strings.HasPrefix(lower, "skip  "):
			name := firstToken(strings.TrimSpace(line[len("skip  "):]))
			s.updateFile(id, name, "skipped", 100, "up to date")
		case strings.HasPrefix(lower, "fail  "):
			name := firstToken(strings.TrimSpace(line[len("FAIL  "):]))
			detail := line
			if i := strings.Index(line, ":"); i >= 0 {
				detail = strings.TrimSpace(line[i+1:])
			}
			s.updateFile(id, name, "failed", 100, detail)
		}
	}
}

func kvFromLine(line, key string) string {
	needle := key + "="
	lower := strings.ToLower(line)
	idx := strings.Index(lower, strings.ToLower(needle))
	if idx < 0 {
		return ""
	}
	rest := line[idx+len(needle):]
	if sp := strings.IndexAny(rest, " \t"); sp >= 0 {
		rest = rest[:sp]
	}
	return strings.TrimSpace(rest)
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
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
