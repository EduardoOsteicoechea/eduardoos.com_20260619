package ereport

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
)

// ObjectSpace reads/writes eReport JSON objects under ereport/.
type ObjectSpace interface {
	BackendName() string
	PutJSON(ctx context.Context, key string, value any, correlationID string) error
	GetJSON(ctx context.Context, key string, dest any, correlationID string) (bool, error)
	ListKeys(ctx context.Context, prefix, correlationID string) ([]string, error)
	DeleteKey(ctx context.Context, key, correlationID string) error
}

// MemoryObjectSpace is an in-process map for unit tests.
type MemoryObjectSpace struct {
	mu      sync.RWMutex
	objects map[string][]byte
}

// NewMemoryObjectSpace constructs an empty object map.
func NewMemoryObjectSpace() *MemoryObjectSpace {
	return &MemoryObjectSpace{objects: map[string][]byte{}}
}

func (m *MemoryObjectSpace) BackendName() string { return "memory" }

func (m *MemoryObjectSpace) PutJSON(_ context.Context, key string, value any, _ string) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	key = strings.TrimSpace(key)
	if key == "" || !strings.HasPrefix(key, RootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	cp := make([]byte, len(raw))
	copy(cp, raw)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = cp
	return nil
}

func (m *MemoryObjectSpace) GetJSON(_ context.Context, key string, dest any, _ string) (bool, error) {
	m.mu.RLock()
	body, ok := m.objects[key]
	m.mu.RUnlock()
	if !ok {
		return false, nil
	}
	if err := json.Unmarshal(body, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (m *MemoryObjectSpace) ListKeys(_ context.Context, prefix, _ string) ([]string, error) {
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]string, 0)
	for key := range m.objects {
		if strings.HasPrefix(key, prefix) || key == strings.TrimSuffix(prefix, "/") {
			out = append(out, key)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (m *MemoryObjectSpace) DeleteKey(_ context.Context, key, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, key)
	return nil
}

// DefaultMediaRoot is the VPS directory that holds every eReport file (072 §1).
const DefaultMediaRoot = "/var/www/eduardoos.com/media/ereport"

// OpenObjectSpace returns the VPS filesystem space when EREPORT_MEDIA_ROOT is
// set (or the default root already exists); otherwise memory for local dev and
// tests. S3 is deliberately unreachable from here (072 decision 9A).
//
// users is optional: it only supplies the human-readable username segment of
// each owner directory, never the identity the API authorizes against.
func OpenObjectSpace(_ context.Context, users auth.UserStore) ObjectSpace {
	root := strings.TrimSpace(httpx.Env("EREPORT_MEDIA_ROOT", ""))
	if root == "" && dirExists(DefaultMediaRoot) {
		root = DefaultMediaRoot
	}
	if root == "" {
		log.Printf("ereport objects: memory (set EREPORT_MEDIA_ROOT to persist under a VPS directory)")
		return NewMemoryObjectSpace()
	}
	if err := os.MkdirAll(root, dirMode); err != nil {
		log.Printf("ereport objects: memory fallback (cannot use %s: %v)", root, err)
		return NewMemoryObjectSpace()
	}
	space := NewFSObjectSpace(root)
	space.Username = usernameLookup(users)
	log.Printf("ereport objects: filesystem root=%s", root)
	return space
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// usernameLookup resolves an owner's display name for the directory label.
// The safe email stays authoritative; a miss just falls back to the local part.
func usernameLookup(users auth.UserStore) func(string) string {
	if users == nil {
		return nil
	}
	return func(safeEmail string) string {
		ctx := context.Background()
		if user, ok, err := users.GetUser(ctx, strings.ReplaceAll(safeEmail, "_at_", "@")); err == nil && ok {
			return user.Name
		}
		// An address containing a literal "_at_" does not round-trip, so fall
		// back to matching the encoded form against every stored user.
		listed, err := users.ListUsers(ctx)
		if err != nil {
			return ""
		}
		for _, user := range listed {
			if SafeEmailKey(user.Email) == safeEmail {
				return user.Name
			}
		}
		return ""
	}
}
