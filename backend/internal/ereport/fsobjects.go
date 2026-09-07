package ereport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

const (
	// dirMode and fileMode keep the tree readable only by the API user and its
	// group; nginx never serves these bytes directly (072 §1).
	dirMode  fs.FileMode = 0o750
	fileMode fs.FileMode = 0o640

	// maxObjectBytes caps a single report payload read.
	maxObjectBytes = 32 << 20

	// maxUsernameSegment bounds the human-readable owner directory segment.
	maxUsernameSegment = 64

	// invitesSegment is the one top-level key that has no owner directory.
	invitesSegment = "invites"

	// tmpPrefix marks in-flight atomic writes so listings skip them.
	tmpPrefix = ".tmp-"
)

// FSObjectSpace stores eReport objects as JSON files under a VPS root directory
// (072 §1). Object keys stay email-keyed; this type owns the physical layout,
// which adds the human-readable username segment:
//
//	key   ereport/<safe-email>/orgs/<org-id>/meta.json
//	file  <root>/<username>/<safe-email>/orgs/<org-id>/meta.json
//
// The email is authoritative. The username only labels the directory, so
// renaming a display name must never move or orphan existing files (072 §2).
type FSObjectSpace struct {
	root string

	// Username maps an owner's safe-email segment to the directory label.
	// Nil derives the label from the email local part.
	Username func(safeEmail string) string

	mu    sync.RWMutex
	owner map[string]string
}

// NewFSObjectSpace roots an object space at an existing directory.
func NewFSObjectSpace(root string) *FSObjectSpace {
	return &FSObjectSpace{root: filepath.Clean(root), owner: map[string]string{}}
}

func (f *FSObjectSpace) BackendName() string { return "fs:" + f.root }

// Root is the directory holding every owner tree.
func (f *FSObjectSpace) Root() string { return f.root }

func (f *FSObjectSpace) PutJSON(_ context.Context, key string, value any, cid string) error {
	full, err := f.resolvePath(key)
	if err != nil {
		return err
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), dirMode); err != nil {
		return err
	}
	if err := writeFileAtomic(full, raw); err != nil {
		return err
	}
	log.Printf("[correlation=%s] ereport.fs.put key=%s bytes=%d", cid, key, len(raw))
	return nil
}

func (f *FSObjectSpace) GetJSON(_ context.Context, key string, dest any, cid string) (bool, error) {
	full, err := f.resolvePath(key)
	if err != nil {
		return false, err
	}
	info, err := os.Stat(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if info.Size() > maxObjectBytes {
		return false, fmt.Errorf("object too large")
	}
	body, err := os.ReadFile(full)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	log.Printf("[correlation=%s] ereport.fs.get key=%s bytes=%d", cid, key, len(body))
	return true, nil
}

func (f *FSObjectSpace) ListKeys(_ context.Context, prefix, cid string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	dir, err := f.resolvePath(strings.TrimSuffix(prefix, "/"))
	if err != nil {
		return nil, err
	}
	out := make([]string, 0)
	walkErr := filepath.WalkDir(dir, func(p string, entry fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		if entry.IsDir() || strings.HasPrefix(entry.Name(), tmpPrefix) {
			return nil
		}
		rel, relErr := filepath.Rel(dir, p)
		if relErr != nil {
			return relErr
		}
		out = append(out, prefix+filepath.ToSlash(rel))
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	sort.Strings(out)
	log.Printf("[correlation=%s] ereport.fs.list prefix=%s count=%d", cid, prefix, len(out))
	return out, nil
}

func (f *FSObjectSpace) DeleteKey(_ context.Context, key, cid string) error {
	full, err := f.resolvePath(key)
	if err != nil {
		return err
	}
	if err := os.Remove(full); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	f.pruneEmptyDirs(filepath.Dir(full))
	log.Printf("[correlation=%s] ereport.fs.delete key=%s", cid, key)
	return nil
}

// resolvePath maps a logical object key to its file on disk. It creates
// nothing, and rejects any key that could escape the root.
func (f *FSObjectSpace) resolvePath(key string) (string, error) {
	segments, err := keySegments(key)
	if err != nil {
		return "", err
	}
	if segments[0] == invitesSegment {
		return filepath.Join(append([]string{f.root}, segments...)...), nil
	}
	if len(segments) < 2 {
		return "", fmt.Errorf("invalid object key")
	}
	return filepath.Join(append([]string{f.ownerDir(segments[0])}, segments[1:]...)...), nil
}

// ownerDir is <root>/<username>/<safe-email>, reusing whatever username
// segment already exists on disk for that email.
func (f *FSObjectSpace) ownerDir(safeEmail string) string {
	f.mu.RLock()
	label, ok := f.owner[safeEmail]
	f.mu.RUnlock()
	if !ok {
		label = f.resolveOwnerSegment(safeEmail)
		f.mu.Lock()
		f.owner[safeEmail] = label
		f.mu.Unlock()
	}
	return filepath.Join(f.root, label, safeEmail)
}

func (f *FSObjectSpace) resolveOwnerSegment(safeEmail string) string {
	if existing, ok := f.existingOwnerSegment(safeEmail); ok {
		return existing
	}
	if f.Username != nil {
		if label := usernameSegment(f.Username(safeEmail)); label != "" {
			return label
		}
	}
	return defaultUsernameSegment(safeEmail)
}

// existingOwnerSegment finds an already-created <username>/<safe-email> so a
// renamed display name cannot strand a directory.
func (f *FSObjectSpace) existingOwnerSegment(safeEmail string) (string, bool) {
	entries, err := os.ReadDir(f.root)
	if err != nil {
		return "", false
	}
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == invitesSegment {
			continue
		}
		info, err := os.Stat(filepath.Join(f.root, entry.Name(), safeEmail))
		if err == nil && info.IsDir() {
			return entry.Name(), true
		}
	}
	return "", false
}

// pruneEmptyDirs clears directories a delete left empty, stopping at the root.
func (f *FSObjectSpace) pruneEmptyDirs(dir string) {
	for dir != f.root && strings.HasPrefix(dir, f.root) {
		if err := os.Remove(dir); err != nil {
			return
		}
		dir = filepath.Dir(dir)
	}
}

// keySegments validates a logical key and returns its segments below RootPrefix.
func keySegments(key string) ([]string, error) {
	invalid := fmt.Errorf("invalid object key")
	key = strings.TrimSpace(key)
	if !strings.HasPrefix(key, RootPrefix+"/") {
		return nil, invalid
	}
	rest := strings.TrimPrefix(key, RootPrefix+"/")
	if rest == "" || path.Clean(rest) != rest {
		return nil, invalid
	}
	segments := strings.Split(rest, "/")
	for _, segment := range segments {
		if segment == "" || segment == "." || segment == ".." || strings.ContainsAny(segment, `\:`) {
			return nil, invalid
		}
	}
	return segments, nil
}

// writeFileAtomic renames a fully written temp file into place so a crash or a
// concurrent reader never observes a truncated report.
func writeFileAtomic(full string, raw []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(full), tmpPrefix+"*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer func() { _ = os.Remove(name) }()

	if _, err := tmp.Write(raw); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, fileMode); err != nil {
		return err
	}
	return os.Rename(name, full)
}

// latinFolds maps the accented letters Spanish display names actually use.
var latinFolds = map[rune]rune{
	'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a',
	'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
	'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
	'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
	'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
	'ñ': 'n', 'ç': 'c', 'ý': 'y',
}

// usernameSegment slugifies a display name into one lowercase path segment.
func usernameSegment(name string) string {
	var b strings.Builder
	pendingDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		if folded, ok := latinFolds[r]; ok {
			r = folded
		}
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if pendingDash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(r)
			pendingDash = false
			continue
		}
		pendingDash = true
	}
	out := b.String()
	if len(out) > maxUsernameSegment {
		out = strings.Trim(out[:maxUsernameSegment], "-")
	}
	return out
}

// defaultUsernameSegment labels an owner directory from the email local part.
func defaultUsernameSegment(safeEmail string) string {
	local := safeEmail
	if i := strings.Index(local, "_at_"); i >= 0 {
		local = local[:i]
	}
	if label := usernameSegment(local); label != "" {
		return label
	}
	return "user"
}
