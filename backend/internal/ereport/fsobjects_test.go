package ereport

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
)

const ownerKey = "owner_at_example.com"

func newTestSpace(t *testing.T, displayName string) *FSObjectSpace {
	t.Helper()
	space := NewFSObjectSpace(t.TempDir())
	space.Username = func(string) string { return displayName }
	return space
}

func TestFSObjectSpaceWritesOwnerDirectoryAsUsernameThenEmail(t *testing.T) {
	space := newTestSpace(t, "Eduardo Osteicoechea")
	key := "ereport/" + ownerKey + "/orgs.json"

	if err := space.PutJSON(context.Background(), key, map[string]string{"a": "b"}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}

	want := filepath.Join(space.Root(), "eduardo-osteicoechea", ownerKey, "orgs.json")
	if _, err := os.Stat(want); err != nil {
		t.Fatalf("expected report file at %s: %v", want, err)
	}

	var got map[string]string
	found, err := space.GetJSON(context.Background(), key, &got, "cid")
	if err != nil || !found {
		t.Fatalf("get: found=%v err=%v", found, err)
	}
	if got["a"] != "b" {
		t.Fatalf("round trip mismatch: %v", got)
	}
}

func TestFSObjectSpaceLabelsDirectoryFromEmailWhenNameIsEmpty(t *testing.T) {
	space := newTestSpace(t, "   ")
	key := "ereport/" + ownerKey + "/orgs.json"

	if err := space.PutJSON(context.Background(), key, map[string]string{}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}

	want := filepath.Join(space.Root(), "owner", ownerKey, "orgs.json")
	if _, err := os.Stat(want); err != nil {
		t.Fatalf("expected fallback label directory at %s: %v", want, err)
	}
}

// Spec 072 §2: the email is authoritative and the username is only a label, so
// editing a display name must not move, rename, or orphan the owner directory.
func TestFSObjectSpaceKeepsOwnerDirectoryAfterDisplayNameChange(t *testing.T) {
	root := t.TempDir()
	key := "ereport/" + ownerKey + "/orgs.json"

	before := NewFSObjectSpace(root)
	before.Username = func(string) string { return "Eduardo Osteicoechea" }
	if err := before.PutJSON(context.Background(), key, map[string]string{"v": "1"}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}

	// A fresh space drops the in-process cache, so this proves resolution reads
	// the existing directory off disk rather than recomputing from the name.
	renamed := NewFSObjectSpace(root)
	renamed.Username = func(string) string { return "Nombre Nuevo" }
	if err := renamed.PutJSON(context.Background(), key, map[string]string{"v": "2"}, "cid"); err != nil {
		t.Fatalf("put after rename: %v", err)
	}

	if _, err := os.Stat(filepath.Join(root, "nombre-nuevo")); !os.IsNotExist(err) {
		t.Fatalf("display name change created a second owner directory")
	}
	var got map[string]string
	found, err := renamed.GetJSON(context.Background(), key, &got, "cid")
	if err != nil || !found || got["v"] != "2" {
		t.Fatalf("expected updated file in original directory: found=%v err=%v got=%v", found, err, got)
	}
}

func TestFSObjectSpaceRejectsKeysThatEscapeTheRoot(t *testing.T) {
	space := newTestSpace(t, "Owner")
	bad := []string{
		"",
		"ereport",
		"ereport/",
		"other/x.json",
		"ereport/../etc/passwd",
		"ereport/" + ownerKey + "/../../escape.json",
		"ereport//double.json",
		"ereport/" + ownerKey + `/..\windows.json`,
		"ereport/" + ownerKey + "/C:/abs.json",
		"ereport/" + ownerKey + "/./same.json",
	}
	for _, key := range bad {
		if err := space.PutJSON(context.Background(), key, map[string]string{}, "cid"); err == nil {
			t.Fatalf("expected %q to be rejected", key)
		}
		if _, err := space.GetJSON(context.Background(), key, &map[string]string{}, "cid"); err == nil {
			t.Fatalf("expected read of %q to be rejected", key)
		}
	}
}

func TestFSObjectSpaceWritesAtomicallyWithoutLeavingTempFiles(t *testing.T) {
	space := newTestSpace(t, "Owner")
	key := "ereport/" + ownerKey + "/orgs/o1/reports/r1/report.ereport"

	for _, payload := range []string{"first", "second"} {
		if err := space.PutJSON(context.Background(), key, map[string]string{"body": payload}, "cid"); err != nil {
			t.Fatalf("put %s: %v", payload, err)
		}
	}

	var got map[string]string
	if _, err := space.GetJSON(context.Background(), key, &got, "cid"); err != nil {
		t.Fatalf("get: %v", err)
	}
	if got["body"] != "second" {
		t.Fatalf("overwrite did not land: %v", got)
	}

	_ = filepath.WalkDir(space.Root(), func(path string, entry os.DirEntry, err error) error {
		if err == nil && !entry.IsDir() && strings.HasPrefix(entry.Name(), tmpPrefix) {
			t.Errorf("temp file left behind: %s", path)
		}
		return nil
	})
}

func TestFSObjectSpaceUsesRestrictivePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permission bits are not modelled on Windows")
	}
	space := newTestSpace(t, "Owner")
	key := "ereport/" + ownerKey + "/orgs.json"
	if err := space.PutJSON(context.Background(), key, map[string]string{}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}

	file, err := os.Stat(filepath.Join(space.Root(), "owner", ownerKey, "orgs.json"))
	if err != nil {
		t.Fatalf("stat file: %v", err)
	}
	if file.Mode().Perm() != fileMode {
		t.Errorf("file mode = %v, want %v", file.Mode().Perm(), fileMode)
	}

	dir, err := os.Stat(filepath.Join(space.Root(), "owner", ownerKey))
	if err != nil {
		t.Fatalf("stat dir: %v", err)
	}
	if dir.Mode().Perm() != dirMode {
		t.Errorf("dir mode = %v, want %v", dir.Mode().Perm(), dirMode)
	}
}

func TestFSObjectSpaceListsAndDeletesAnOrgTree(t *testing.T) {
	space := newTestSpace(t, "Owner")
	ctx := context.Background()
	keys := []string{
		"ereport/" + ownerKey + "/orgs/o1/meta.json",
		"ereport/" + ownerKey + "/orgs/o1/library.json",
		"ereport/" + ownerKey + "/orgs/o1/reports/r1/report.ereport",
		"ereport/" + ownerKey + "/orgs/o2/meta.json",
	}
	for _, key := range keys {
		if err := space.PutJSON(ctx, key, map[string]string{}, "cid"); err != nil {
			t.Fatalf("put %s: %v", key, err)
		}
	}

	listed, err := space.ListKeys(ctx, "ereport/"+ownerKey+"/orgs/o1/", "cid")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(listed) != 3 {
		t.Fatalf("listed %d keys, want 3: %v", len(listed), listed)
	}
	for _, key := range listed {
		if err := space.DeleteKey(ctx, key, "cid"); err != nil {
			t.Fatalf("delete %s: %v", key, err)
		}
	}

	if _, err := os.Stat(filepath.Join(space.Root(), "owner", ownerKey, "orgs", "o1")); !os.IsNotExist(err) {
		t.Errorf("emptied org directory was not pruned")
	}
	if _, err := os.Stat(filepath.Join(space.Root(), "owner", ownerKey, "orgs", "o2", "meta.json")); err != nil {
		t.Errorf("sibling org was affected by the delete: %v", err)
	}
}

func TestFSObjectSpaceKeepsInvitesOutsideOwnerDirectories(t *testing.T) {
	space := newTestSpace(t, "Owner")
	key := InviteKey("token123")
	if err := space.PutJSON(context.Background(), key, map[string]string{}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}
	if _, err := os.Stat(filepath.Join(space.Root(), "invites", "token123.json")); err != nil {
		t.Fatalf("expected invite at <root>/invites/token123.json: %v", err)
	}
}

func TestOpenObjectSpaceUsesFilesystemAndNeverS3(t *testing.T) {
	root := filepath.Join(t.TempDir(), "ereport")
	t.Setenv("EREPORT_MEDIA_ROOT", root)
	t.Setenv("S3_BUCKET", "should-be-ignored")

	users := auth.NewMemoryStore()
	if err := users.PutUser(context.Background(), auth.User{Email: "owner@example.com", Name: "Eduardo Osteicoechea"}); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	space := OpenObjectSpace(context.Background(), users)
	if !strings.HasPrefix(space.BackendName(), "fs:") {
		t.Fatalf("backend = %s, want filesystem", space.BackendName())
	}
	if err := space.PutJSON(context.Background(), LibraryKey("owner@example.com"), map[string]string{}, "cid"); err != nil {
		t.Fatalf("put: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "eduardo-osteicoechea", ownerKey, "library.json")); err != nil {
		t.Fatalf("expected user store to label the owner directory: %v", err)
	}
}

func TestOpenObjectSpaceFallsBackToMemoryWithoutARoot(t *testing.T) {
	if dirExists(DefaultMediaRoot) {
		t.Skip("host already provides the production media root")
	}
	t.Setenv("EREPORT_MEDIA_ROOT", "")
	if space := OpenObjectSpace(context.Background(), nil); space.BackendName() != "memory" {
		t.Fatalf("backend = %s, want memory", space.BackendName())
	}
}

func TestUsernameSegment(t *testing.T) {
	cases := map[string]string{
		"Eduardo Osteicoechea": "eduardo-osteicoechea",
		"  Ángel Muñoz  ":      "angel-munoz",
		"José/../root":         "jose-root",
		"C:\\Windows":          "c-windows",
		"!!!":                  "",
		"":                     "",
		strings.Repeat("a", 90): strings.Repeat("a", maxUsernameSegment),
	}
	for name, want := range cases {
		if got := usernameSegment(name); got != want {
			t.Errorf("usernameSegment(%q) = %q, want %q", name, got, want)
		}
	}

	if got := defaultUsernameSegment("owner_at_example.com"); got != "owner" {
		t.Errorf("defaultUsernameSegment = %q, want owner", got)
	}
	if got := defaultUsernameSegment("_at_example.com"); got != "user" {
		t.Errorf("defaultUsernameSegment fallback = %q, want user", got)
	}
}
