package pamphlet

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"
)

type memoryRegistry struct {
	mu    sync.RWMutex
	items map[string]RegistryEntry
}

func newMemoryRegistry() *memoryRegistry {
	return &memoryRegistry{items: map[string]RegistryEntry{}}
}

func registryKey(userID, pamphletID string) string {
	return strings.ToLower(strings.TrimSpace(userID)) + "|" + strings.TrimSpace(pamphletID)
}

func (m *memoryRegistry) BackendName() string { return "memory" }

func (m *memoryRegistry) List(_ context.Context, userID, sortBy string) ([]RegistryEntry, error) {
	userID = strings.TrimSpace(userID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]RegistryEntry, 0)
	for k, v := range m.items {
		if strings.HasPrefix(k, strings.ToLower(userID)+"|") {
			out = append(out, v)
		}
	}
	sortRegistry(out, sortBy)
	return out, nil
}

func (m *memoryRegistry) GetLayout(_ context.Context, userID, pamphletID string) (LayoutFields, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.items[registryKey(userID, pamphletID)]
	return v.Layout, ok, nil
}

func (m *memoryRegistry) SaveLayout(_ context.Context, userID, pamphletID, title string, layout LayoutFields) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := registryKey(userID, pamphletID)
	m.items[key] = RegistryEntry{
		PamphletID: pamphletID, Title: title, UpdatedAt: time.Now().UTC(), Layout: layout,
	}
	return nil
}

func sortRegistry(entries []RegistryEntry, sortBy string) {
	switch strings.ToLower(sortBy) {
	case "date", "updated", "updatedat":
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].UpdatedAt.After(entries[j].UpdatedAt)
		})
	default:
		sort.Slice(entries, func(i, j int) bool {
			return strings.ToLower(entries[i].Title) < strings.ToLower(entries[j].Title)
		})
	}
}

// NewMemoryRegistryStore returns an in-process registry for local dev.
func NewMemoryRegistryStore() RegistryStore {
	return newMemoryRegistry()
}
