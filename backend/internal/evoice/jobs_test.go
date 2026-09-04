package evoice

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWeightedProgressBands(t *testing.T) {
	std := jobPlan(false)
	// After prepare+downloads done, convert active at 50% of files → ~8 + 40 = 48.
	for i := range std {
		if std[i].ID == "prepare" || std[i].ID == "download_docs" || std[i].ID == "download_audios" {
			std[i].State = "done"
		}
	}
	p := weightedProgress(false, std, "convert", 0.5)
	if p < 40 || p > 55 {
		t.Fatalf("standard mid-convert progress=%d want ~48", p)
	}

	prem := jobPlan(true)
	for i := range prem {
		if prem[i].ID == "prepare" || prem[i].ID == "download_docs" || prem[i].ID == "download_audios" {
			prem[i].State = "done"
		}
	}
	// Premium convert band is still 80% total (30+30+20); mid-band → ~48.
	p = weightedProgress(true, prem, "refine_deepseek", 0.5)
	if p < 40 || p > 55 {
		t.Fatalf("premium mid-convert progress=%d want ~48", p)
	}
	if len(prem) < 7 {
		t.Fatalf("premium plan steps=%d", len(prem))
	}
	ids := map[string]bool{}
	for _, s := range prem {
		ids[s.ID] = true
	}
	for _, need := range []string{"extract_speech", "refine_deepseek", "convert_audio"} {
		if !ids[need] {
			t.Fatalf("missing premium step %s", need)
		}
	}
}

type gateRunner struct {
	started chan struct{}
	release chan struct{}
}

func (g gateRunner) Run(ctx context.Context, projectDir string, onlyFiles []string, opts GenerateOpts, logFn func(string)) (JobStats, error) {
	close(g.started)
	select {
	case <-g.release:
		return FakeRunner{}.Run(ctx, projectDir, onlyFiles, opts, logFn)
	case <-ctx.Done():
		return JobStats{}, ctx.Err()
	}
}

func TestStopMarksStoppedAndResumeFiles(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	store := NewJobStore(gateRunner{started: started, release: release})
	mem := NewMemoryObjectSpace()
	cid := "test-stop"

	// Seed a doc so prepare/download succeed and convert blocks.
	owner := "owner_at_example.com"
	project := "demo"
	_ = mem.PutBytes(context.Background(), DocKey(owner, project, "a.txt"), []byte("hola"), "text/plain", cid)

	id, err := store.Start(context.Background(), mem, owner, project, cid, []string{"a.txt"}, GenerateOpts{Mode: ModeStandard, ContentPercent: 100})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("runner did not start")
	}

	job, ok := store.Stop(context.Background(), mem, id, cid)
	if !ok {
		t.Fatal("stop missing job")
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		job, _ = store.Get(id)
		if job.State == "stopped" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if job.State != "stopped" {
		t.Fatalf("state=%s want stopped logs=%v", job.State, job.Logs)
	}

	// Mark file unfinished (as mid-convert would).
	store.mu.Lock()
	if j := store.jobs[id]; j != nil {
		j.Files = []JobFileProgress{{Name: "a.txt", State: "active", Progress: 40}}
	}
	store.mu.Unlock()
	job, _ = store.Get(id)
	files := ResumeFiles(job)
	if len(files) != 1 || files[0] != "a.txt" {
		t.Fatalf("ResumeFiles=%v", files)
	}

	close(release) // unblock any leftover runner
}

func TestFakeRunnerPremiumAllModalities(t *testing.T) {
	// Spec 044: when premium is on, every convertible modality must get a .premium.txt
	// (DeepSeek system-role prep) and chapter MP3s — not a single mono file.
	dir := t.TempDir()
	docs := filepath.Join(dir, "docs")
	audios := filepath.Join(dir, "audios")
	if err := os.MkdirAll(docs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(audios, 0o755); err != nil {
		t.Fatal(err)
	}
	modalities := []string{"paste.txt", "book.docx", "scan.pdf", "page.png"}
	for _, name := range modalities {
		if err := os.WriteFile(filepath.Join(docs, name), []byte("contenido de prueba"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	var logs []string
	stats, err := FakeRunner{}.Run(context.Background(), dir, nil, GenerateOpts{Mode: ModePremium, ContentPercent: 100}, func(line string) {
		logs = append(logs, line)
	})
	if err != nil {
		t.Fatal(err)
	}
	if stats.Generated != len(modalities) {
		t.Fatalf("generated=%d want %d failed=%d logs=%v", stats.Generated, len(modalities), stats.Failed, logs)
	}
	for _, name := range modalities {
		stem := strings.TrimSuffix(name, filepath.Ext(name))
		premPath := filepath.Join(docs, stem+".v1.premium.txt")
		if _, err := os.Stat(premPath); err != nil {
			t.Fatalf("missing premium sidecar for %s: %v", name, err)
		}
		c1 := filepath.Join(audios, stem+".v1.c01-intro.mp3")
		c2 := filepath.Join(audios, stem+".v1.c02-cuerpo.mp3")
		if _, err := os.Stat(c1); err != nil {
			t.Fatalf("missing chapter1 for %s", name)
		}
		if _, err := os.Stat(c2); err != nil {
			t.Fatalf("missing chapter2 for %s", name)
		}
		foundPrep := false
		for _, line := range logs {
			if strings.Contains(line, "PREMIUM "+name+" detail=system_role_prep") {
				foundPrep = true
				break
			}
		}
		if !foundPrep {
			t.Fatalf("missing system_role_prep log for %s", name)
		}
	}
}

func TestConvertJobTimeoutByMode(t *testing.T) {
	t.Setenv("EVOICE_JOB_TIMEOUT", "")
	if d := convertJobTimeout(GenerateOpts{Mode: ModeStandard}); d != 45*time.Minute {
		t.Fatalf("standard timeout=%v", d)
	}
	if d := convertJobTimeout(GenerateOpts{Mode: ModePremium}); d != 2*time.Hour {
		t.Fatalf("premium timeout=%v", d)
	}
	if d := convertJobTimeout(GenerateOpts{Mode: ModeSuperPremium}); d != 6*time.Hour {
		t.Fatalf("super timeout=%v", d)
	}
	t.Setenv("EVOICE_JOB_TIMEOUT", "90m")
	if d := convertJobTimeout(GenerateOpts{Mode: ModeSuperPremium}); d != 90*time.Minute {
		t.Fatalf("env override timeout=%v", d)
	}
}

func TestUploadNewOutputsUsesBeforeMaps(t *testing.T) {
	dir := t.TempDir()
	docs := filepath.Join(dir, "docs")
	audios := filepath.Join(dir, "audios")
	_ = os.MkdirAll(docs, 0o755)
	_ = os.MkdirAll(audios, 0o755)
	_ = os.WriteFile(filepath.Join(docs, "book.premium.txt"), []byte("old"), 0o644)
	_ = os.WriteFile(filepath.Join(audios, "book.mp3"), []byte("ID3old"), 0o644)
	beforeAudios := listMP3Names(audios)
	beforeDocs := listSidecarNames(docs)
	_ = os.WriteFile(filepath.Join(docs, "book.v1.vision.txt"), []byte("vision"), 0o644)
	_ = os.WriteFile(filepath.Join(docs, "book.v1.premium.txt"), []byte("prem"), 0o644)
	_ = os.WriteFile(filepath.Join(audios, "book.v1.c01-intro.mp3"), []byte("ID3new"), 0o644)

	store := NewJobStore(FakeRunner{})
	mem := NewMemoryObjectSpace()
	owner := "o_at_x.com"
	project := "p"
	err := store.uploadNewOutputs(
		context.Background(), mem, "job1", owner, project, audios, docs,
		beforeAudios, beforeDocs, []string{"book.pdf"}, []string{"book.pdf"}, "cid",
	)
	if err != nil {
		t.Fatal(err)
	}
	body, ok, err := mem.GetBytes(context.Background(), AudioKey(owner, project, "book.v1.c01-intro.mp3"), "cid")
	if err != nil || !ok || string(body) != "ID3new" {
		t.Fatalf("new chapter not uploaded: ok=%v err=%v body=%q", ok, err, body)
	}
	body, ok, err = mem.GetBytes(context.Background(), DocKey(owner, project, "book.v1.vision.txt"), "cid")
	if err != nil || !ok || string(body) != "vision" {
		t.Fatalf("new vision sidecar not uploaded: ok=%v err=%v body=%q", ok, err, body)
	}
	// Pre-existing legacy names must not be re-uploaded as "new".
	_, ok, err = mem.GetBytes(context.Background(), AudioKey(owner, project, "book.mp3"), "cid")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("legacy book.mp3 should not be treated as new upload")
	}
}
