package greek

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"
)

// ErrDuplicate is returned when creating a group that already exists.
var ErrDuplicate = errors.New("group already exists")

// ErrNotFound is returned when a group catalog row is missing.
var ErrNotFound = errors.New("group not found")

// CatalogStore persists the admin's group cards (DynamoDB or memory).
type CatalogStore interface {
	BackendName() string
	Create(ctx context.Context, g Group) (Group, error)
	Get(ctx context.Context, ownerEmail, slug string) (Group, bool, error)
	List(ctx context.Context, ownerEmail string) ([]Group, error)
	Update(ctx context.Context, g Group) (Group, error)
	Delete(ctx context.Context, ownerEmail, slug string) error
}

// MemoryCatalog is an in-process catalog for tests and local boots.
type MemoryCatalog struct {
	mu   sync.RWMutex
	bySK map[string]Group
}

// NewMemoryCatalog constructs an empty catalog.
func NewMemoryCatalog() *MemoryCatalog {
	return &MemoryCatalog{bySK: map[string]Group{}}
}

func (m *MemoryCatalog) BackendName() string { return "memory" }

func catalogKey(ownerEmail, slug string) string {
	return auth.NormalizeEmail(ownerEmail) + "|" + strings.TrimSpace(slug)
}

func (m *MemoryCatalog) Create(_ context.Context, g Group) (Group, error) {
	g.OwnerEmail = auth.NormalizeEmail(g.OwnerEmail)
	g.Slug = strings.TrimSpace(g.Slug)
	if g.OwnerEmail == "" || g.Slug == "" {
		return Group{}, errors.New("owner and slug required")
	}
	key := catalogKey(g.OwnerEmail, g.Slug)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[key]; ok {
		return Group{}, ErrDuplicate
	}
	cp := g
	m.bySK[key] = cp
	return cp, nil
}

func (m *MemoryCatalog) Get(_ context.Context, ownerEmail, slug string) (Group, bool, error) {
	key := catalogKey(ownerEmail, slug)
	m.mu.RLock()
	defer m.mu.RUnlock()
	g, ok := m.bySK[key]
	if !ok {
		return Group{}, false, nil
	}
	return g, true, nil
}

func (m *MemoryCatalog) List(_ context.Context, ownerEmail string) ([]Group, error) {
	ownerEmail = auth.NormalizeEmail(ownerEmail)
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Group, 0)
	for _, g := range m.bySK {
		if g.OwnerEmail == ownerEmail {
			out = append(out, g)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt == out[j].UpdatedAt {
			return out[i].Title < out[j].Title
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out, nil
}

func (m *MemoryCatalog) Update(_ context.Context, g Group) (Group, error) {
	g.OwnerEmail = auth.NormalizeEmail(g.OwnerEmail)
	key := catalogKey(g.OwnerEmail, g.Slug)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[key]; !ok {
		return Group{}, ErrNotFound
	}
	m.bySK[key] = g
	return g, nil
}

func (m *MemoryCatalog) Delete(_ context.Context, ownerEmail, slug string) error {
	key := catalogKey(ownerEmail, slug)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[key]; !ok {
		return ErrNotFound
	}
	delete(m.bySK, key)
	return nil
}
