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

// Fixed generate plans (spec 044) — weights differ for premium vs standard.
var standardJobPlan = []JobStep{
	{ID: "prepare", Label: "Prepare workdir", State: "pending"},
	{ID: "download_docs", Label: "Download documents", State: "pending"},
	{ID: "download_audios", Label: "Download existing audios", State: "pending"},
	{ID: "convert", Label: "Convert docs → MP3", State: "pending"},
	{ID: "upload", Label: "Upload audios to S3", State: "pending"},
	{ID: "finalize", Label: "Finalize", State: "pending"},
}

var premiumJobPlan = []JobStep{
	{ID: "prepare", Label: "Prepare workdir", State: "pending"},
	{ID: "download_docs", Label: "Download documents", State: "pending"},
	{ID: "download_audios", Label: "Download existing audios", State: "pending"},
	{ID: "extract_speech", Label: "Convert to speech (extract)", State: "pending"},
	{ID: "refine_deepseek", Label: "Refine with DeepSeek", State: "pending"},
	{ID: "convert_audio", Label: "Convert to audio", State: "pending"},
	{ID: "upload", Label: "Upload audios to S3", State: "pending"},
	{ID: "finalize", Label: "Finalize", State: "pending"},
}

// stepWeights: non-premium convert=80 upload=10 rest=10; premium extract=30 refine=30 audio=20 upload=10 rest=10.
func stepWeights(premium bool) map[string]int {
	if premium {
		return map[string]int{
			"prepare": 2, "download_docs": 3, "download_audios": 3,
			"extract_speech": 30, "refine_deepseek": 30, "convert_audio": 20,
			"upload": 10, "finalize": 2,
		}
	}
	return map[string]int{
		"prepare": 2, "download_docs": 3, "download_audios": 3,
		"convert": 80, "upload": 10, "finalize": 2,
	}
}

func jobPlan(premium bool) []JobStep {
	if premium {
		return cloneJobSteps(premiumJobPlan)
	}
	return cloneJobSteps(standardJobPlan)
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
		docPath := filepath.Join(docsDir, name)
		docInfo, _ := os.Stat(docPath)
		if !fakeNeedsRegen(audiosDir, stem, premium, docInfo) {
			logFn("skip  " + name + " (mp3 up to date)")
			logFn("FILE " + name + " state=skipped")
			stats.Skipped++
			continue
		}
		mp3 := filepath.Join(audiosDir, stem+".mp3")
		logFn("FILE " + name + " state=active")
		logFn("EXTRACT " + name + " pct=50 detail=fake")
		if premium {
			logFn("PREMIUM " + name + " pct=20 detail=stream")
			logFn("PREMIUM " + name + " pct=60 detail=stream")
			logFn("PREMIUM " + name + " pct=100 detail=chapters=2")
			marked := "<<<CHAPTER n=\"1\" title=\"Intro\">>>\nhola uno\n<<<END>>>\n" +
				"<<<CHAPTER n=\"2\" title=\"Cuerpo\">>>\nhola dos\n<<<END>>>\n"
			_ = os.WriteFile(filepath.Join(docsDir, stem+".premium.txt"), []byte(marked), 0o644)
			_ = os.Remove(mp3)
			clearLocalStemAudios(audiosDir, stem)
			for _, ch := range []string{stem + ".c01-intro.mp3", stem + ".c02-cuerpo.mp3"} {
				logFn("TTS " + name + " pct=50 detail=chapter " + ch)
				if err := os.WriteFile(filepath.Join(audiosDir, ch), []byte("ID3fake-evoice"), 0o644); err != nil {
					stats.Failed++
					logFn("FAIL  " + name + ": " + err.Error())
					logFn("FILE " + name + " state=failed")
					continue
				}
				logFn("ok     " + name + " -> " + ch)
			}
			stats.Generated++
			logFn("FILE " + name + " state=done")
			continue
		}
		clearLocalStemAudios(audiosDir, stem)
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

func fakeNeedsRegen(audiosDir, stem string, premium bool, docInfo os.FileInfo) bool {
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		return true
	}
	var newest time.Time
	found := false
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if !isStemAudio(n, stem) {
			continue
		}
		if premium && n == stem+".mp3" {
			continue // legacy mono does not satisfy premium
		}
		if !premium && strings.Contains(n, ".c") && strings.HasPrefix(n, stem+".c") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		found = true
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
	}
	if !found {
		return true
	}
	if docInfo == nil {
		return false
	}
	return docInfo.ModTime().After(newest)
}

func isStemAudio(name, stem string) bool {
	if name == stem+".mp3" {
		return true
	}
	return strings.HasPrefix(name, stem+".c") && strings.HasSuffix(strings.ToLower(name), ".mp3")
}

func clearLocalStemAudios(audiosDir, stem string) {
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		if isStemAudio(e.Name(), stem) {
			_ = os.Remove(filepath.Join(audiosDir, e.Name()))
		}
	}
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
	mu      sync.RWMutex
	jobs    map[string]*JobStatus
	cancels map[string]context.CancelFunc
	runner  JobRunner
}

// NewJobStore wires a runner (FakeRunner in tests; PythonRunner in prod).
func NewJobStore(runner JobRunner) *JobStore {
	if runner == nil {
		runner = resolveDefaultRunner()
	}
	return &JobStore{
		jobs:    map[string]*JobStatus{},
		cancels: map[string]context.CancelFunc{},
		runner:  runner,
	}
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
	only := append([]string(nil), onlyFiles...)
	return &JobStatus{
		ID:          id,
		State:       "queued",
		Owner:       ownerSafe,
		Project:     project,
		OnlyFiles:   only,
		Premium:     premium,
		Logs:        []string{"queued"},
		Steps:       jobPlan(premium),
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

func isConvertStepID(id string) bool {
	switch id {
	case "convert", "extract_speech", "refine_deepseek", "convert_audio":
		return true
	default:
		return false
	}
}

func (s *JobStore) activateStep(ctx context.Context, objects ObjectSpace, id, stepID, cid string) {
	s.mu.Lock()
	j, ok := s.jobs[id]
	if ok {
		found := false
		enteringConvert := isConvertStepID(stepID)
		for i := range j.Steps {
			switch {
			case j.Steps[i].ID == stepID:
				j.Steps[i].State = "active"
				j.CurrentStep = stepID
				found = true
			case enteringConvert && isConvertStepID(j.Steps[i].ID):
				// Premium convert trio (and standard convert) share one progress band;
				// switching EXTRACT→PREMIUM→TTS must not mark siblings fully done.
				if j.Steps[i].State == "active" {
					j.Steps[i].State = "pending"
				}
			case !found && (j.Steps[i].State == "pending" || j.Steps[i].State == "active"):
				j.Steps[i].State = "done"
			}
		}
		j.Progress = weightedProgress(j.Premium, j.Steps, stepID, 0)
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
		j.Progress = weightedProgress(j.Premium, j.Steps, "", 0)
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
		j.Progress = weightedProgress(j.Premium, j.Steps, "", 0)
	}
	s.mu.Unlock()
	if ok {
		s.persistSnapshot(ctx, objects, id, cid)
	}
}

// setBandProgress sets overall progress inside the convert-related band(s).
// done/total = completed files; filePct 0–100 within the current file's active phase.
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
	frac := (float64(done) + float64(filePct)/100.0) / float64(total)
	if frac > 1 {
		frac = 1
	}
	if frac < 0 {
		frac = 0
	}
	active := j.CurrentStep
	if active == "" {
		if j.Premium {
			active = "extract_speech"
		} else {
			active = "convert"
		}
	}
	j.Progress = weightedProgress(j.Premium, j.Steps, active, frac)
}

// weightedProgress: sum weights of done steps + frac of the active step.
// Convert-related steps (convert / extract / refine / audio) share one 80% band:
// while any of them is active, activeFrac applies to the full convert-band weight.
func weightedProgress(premium bool, steps []JobStep, activeStepID string, activeFrac float64) int {
	w := stepWeights(premium)
	if activeFrac < 0 {
		activeFrac = 0
	}
	if activeFrac > 1 {
		activeFrac = 1
	}
	convertBand := 0
	for id, wt := range w {
		if isConvertStepID(id) {
			convertBand += wt
		}
	}
	sum := 0
	convertActive := isConvertStepID(activeStepID)
	for _, st := range steps {
		wt := w[st.ID]
		if isConvertStepID(st.ID) {
			continue
		}
		switch {
		case st.State == "done" || st.State == "skipped":
			sum += wt
		case st.ID == activeStepID:
			sum += int(float64(wt) * activeFrac)
		}
	}
	if convertActive {
		sum += int(float64(convertBand) * activeFrac)
	} else {
		for _, st := range steps {
			if !isConvertStepID(st.ID) {
				continue
			}
			if st.State == "done" || st.State == "skipped" {
				sum += w[st.ID]
			}
		}
	}
	if sum > 100 {
		sum = 100
	}
	return sum
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
	jobCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	s.mu.Lock()
	s.jobs[id] = newQueuedJob(id, ownerSafe, project, cleaned, premium)
	s.cancels[id] = cancel
	s.mu.Unlock()
	s.persistSnapshot(ctx, objects, id, cid)

	go s.runJob(jobCtx, objects, id, ownerSafe, project, cid, cleaned, premium)
	return id, nil
}

// Stop cancels an in-flight job and marks it stopped (snapshot persisted).
func (s *JobStore) Stop(ctx context.Context, objects ObjectSpace, id, cid string) (JobStatus, bool) {
	s.mu.Lock()
	cancel := s.cancels[id]
	j, ok := s.jobs[id]
	if ok && (j.State == "queued" || j.State == "running") {
		j.State = "stopped"
		j.Error = "stopped by user"
		j.CurrentStep = ""
		for i := range j.Steps {
			if j.Steps[i].State == "active" {
				j.Steps[i].State = "pending"
			}
		}
	}
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if !ok {
		return JobStatus{}, false
	}
	s.persistSnapshot(ctx, objects, id, cid)
	return s.Get(id)
}

// ResumeFiles returns basenames that still need generate after a stopped/failed job.
func ResumeFiles(job JobStatus) []string {
	var out []string
	seen := map[string]bool{}
	for _, f := range job.Files {
		if f.State == "done" || f.State == "skipped" {
			continue
		}
		if !seen[f.Name] {
			seen[f.Name] = true
			out = append(out, f.Name)
		}
	}
	if len(out) == 0 {
		for _, f := range job.OnlyFiles {
			if !seen[f] {
				seen[f] = true
				out = append(out, f)
			}
		}
	}
	return out
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
		s.clearCancel(id)
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
		s.clearCancel(id)
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

	convertStep := "convert"
	if premium {
		convertStep = "extract_speech"
	}
	s.activateStep(ctx, objects, id, convertStep, cid)
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
		s.applyConvertLogLine(ctx, objects, id, line, &docDone, docTotal, cid, premium)
	})
	if ctx.Err() != nil {
		s.appendLog(ctx, objects, id, "stopped: cancelled", cid)
		s.mu.Lock()
		if j, ok := s.jobs[id]; ok && j.State != "stopped" {
			j.State = "stopped"
			j.Error = "stopped by user"
		}
		delete(s.cancels, id)
		s.mu.Unlock()
		s.persistSnapshot(ctx, objects, id, cid)
		return
	}
	usable := stats.Generated+stats.Skipped > 0 || countMP3(audiosDir) > 0
	if err != nil && !usable {
		s.appendLog(ctx, objects, id, "runner error: "+err.Error(), cid)
		s.failStep(ctx, objects, id, convertStep, err.Error(), cid)
		s.setState(ctx, objects, id, "failed", err.Error(), cid, &stats)
		s.clearCancel(id)
		return
	}
	if err != nil {
		s.appendLog(ctx, objects, id, "runner warning: "+err.Error()+" (continuing with partial results)", cid)
	}
	if premium {
		s.completeStep(ctx, objects, id, "extract_speech", cid)
		s.completeStep(ctx, objects, id, "refine_deepseek", cid)
		s.completeStep(ctx, objects, id, "convert_audio", cid)
	} else {
		s.completeStep(ctx, objects, id, "convert", cid)
	}

	s.activateStep(ctx, objects, id, "upload", cid)
	s.appendLog(ctx, objects, id, "upload: writing audios/*.mp3 (+ premium.txt) to S3", cid)
	uploadAllow := uploadAllowFrom(onlyFiles, targets)
	for _, t := range targets {
		stem := strings.TrimSuffix(t, filepath.Ext(t))
		s.deleteStemAudiosFromObjects(ctx, objects, id, ownerSafe, project, stem, cid)
	}
	entries, err := os.ReadDir(audiosDir)
	if err != nil {
		s.appendLog(ctx, objects, id, "upload list failed: "+err.Error(), cid)
		s.failStep(ctx, objects, id, "upload", err.Error(), cid)
		s.setState(ctx, objects, id, "failed", err.Error(), cid, &stats)
		s.clearCancel(id)
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".mp3") {
			continue
		}
		if len(uploadAllow) > 0 && !mp3UploadAllowed(e.Name(), uploadAllow) {
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
			s.clearCancel(id)
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
	s.clearCancel(id)
}

func (s *JobStore) clearCancel(id string) {
	s.mu.Lock()
	if c := s.cancels[id]; c != nil {
		delete(s.cancels, id)
	}
	s.mu.Unlock()
}

func uploadAllowFrom(onlyFiles, targets []string) map[string]bool {
	if len(onlyFiles) == 0 {
		return nil
	}
	// Map of allowed exact names + stem markers (value true means stem prefix allow).
	m := make(map[string]bool, len(targets)*2)
	for _, t := range targets {
		stem := strings.TrimSuffix(t, filepath.Ext(t))
		m[stem+".mp3"] = true
		m["stem:"+stem] = true
	}
	return m
}

func mp3UploadAllowed(name string, allow map[string]bool) bool {
	if len(allow) == 0 {
		return true
	}
	if allow[name] {
		return true
	}
	lower := strings.ToLower(name)
	if !strings.HasSuffix(lower, ".mp3") {
		return false
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	// Chapter: {stem}.c01-title
	if i := strings.Index(base, ".c"); i > 0 {
		stem := base[:i]
		if allow["stem:"+stem] {
			rest := base[i+2:]
			if len(rest) >= 2 && rest[0] >= '0' && rest[0] <= '9' {
				return true
			}
		}
	}
	return false
}

func (s *JobStore) deleteStemAudiosFromObjects(ctx context.Context, objects ObjectSpace, id, ownerSafe, project, stem, cid string) {
	if objects == nil || stem == "" {
		return
	}
	prefix := AudiosPrefix(ownerSafe, project) + "/"
	objs, err := objects.ListObjects(ctx, prefix, cid)
	if err != nil {
		return
	}
	for _, o := range objs {
		name := strings.TrimPrefix(o.Key, prefix)
		if name == "" || strings.Contains(name, "/") {
			continue
		}
		if isStemAudio(name, stem) {
			s.appendLog(ctx, objects, id, "upload: replace prior "+name, cid)
			_ = objects.DeleteKey(ctx, o.Key, cid)
		}
	}
}

func (s *JobStore) applyConvertLogLine(ctx context.Context, objects ObjectSpace, id, line string, docDone *int, docTotal int, cid string, premium bool) {
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
			if premium {
				s.activateStep(ctx, objects, id, "extract_speech", cid)
			}
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
		if premium {
			switch kind {
			case "EXTRACT":
				s.activateStep(ctx, objects, id, "extract_speech", cid)
			case "PREMIUM":
				s.activateStep(ctx, objects, id, "refine_deepseek", cid)
			case "TTS", "FFMPEG":
				s.activateStep(ctx, objects, id, "convert_audio", cid)
			}
		}
		// Map phase-local pct into file bar (extract ~0–37, refine ~37–75, audio ~75–99).
		phaseBase := map[string]int{"EXTRACT": 0, "PREMIUM": 37, "TTS": 75, "FFMPEG": 90}[kind]
		phaseSpan := map[string]int{"EXTRACT": 37, "PREMIUM": 38, "TTS": 15, "FFMPEG": 9}[kind]
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		mapped := phaseBase + (pct * phaseSpan / 100)
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
