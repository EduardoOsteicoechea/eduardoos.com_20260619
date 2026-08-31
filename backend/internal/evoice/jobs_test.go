package evoice

import (
	"context"
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

func (g gateRunner) Run(ctx context.Context, projectDir string, onlyFiles []string, premium bool, logFn func(string)) (JobStats, error) {
	close(g.started)
	select {
	case <-g.release:
		return FakeRunner{}.Run(ctx, projectDir, onlyFiles, premium, logFn)
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

	id, err := store.Start(context.Background(), mem, owner, project, cid, []string{"a.txt"}, false)
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
