package church

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"
)

// GroupStore persists admin-managed denomination / network catalog rows.
type GroupStore interface {
	BackendName() string
	Create(ctx context.Context, g DenominationGroup) (DenominationGroup, error)
	Get(ctx context.Context, id string) (DenominationGroup, bool, error)
	List(ctx context.Context) ([]DenominationGroup, error)
	Update(ctx context.Context, g DenominationGroup) (DenominationGroup, error)
	Delete(ctx context.Context, id string) error
}

// MemoryGroups is an in-process denomination group catalog.
type MemoryGroups struct {
	mu   sync.RWMutex
	byID map[string]DenominationGroup
}

// NewMemoryGroups constructs an empty group catalog.
func NewMemoryGroups() *MemoryGroups {
	return &MemoryGroups{byID: map[string]DenominationGroup{}}
}

func (m *MemoryGroups) BackendName() string { return "memory" }

func (m *MemoryGroups) Create(_ context.Context, g DenominationGroup) (DenominationGroup, error) {
	g.ID = strings.TrimSpace(g.ID)
	g.Name = strings.TrimSpace(g.Name)
	g.CreatedBy = auth.NormalizeEmail(g.CreatedBy)
	if g.ID == "" || g.Name == "" {
		return DenominationGroup{}, errors.New("id and name required")
	}
	if !IsValidSlug(g.ID) {
		return DenominationGroup{}, errors.New("invalid group id")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byID[g.ID]; ok {
		return DenominationGroup{}, ErrDuplicate
	}
	m.byID[g.ID] = g
	return g, nil
}

func (m *MemoryGroups) Get(_ context.Context, id string) (DenominationGroup, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	g, ok := m.byID[strings.TrimSpace(id)]
	return g, ok, nil
}

func (m *MemoryGroups) List(_ context.Context) ([]DenominationGroup, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]DenominationGroup, 0, len(m.byID))
	for _, g := range m.byID {
		out = append(out, g)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

func (m *MemoryGroups) Update(_ context.Context, g DenominationGroup) (DenominationGroup, error) {
	g.ID = strings.TrimSpace(g.ID)
	g.Name = strings.TrimSpace(g.Name)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byID[g.ID]; !ok {
		return DenominationGroup{}, ErrNotFound
	}
	if g.Name == "" {
		return DenominationGroup{}, errors.New("name required")
	}
	existing := m.byID[g.ID]
	g.CreatedAt = existing.CreatedAt
	g.CreatedBy = existing.CreatedBy
	m.byID[g.ID] = g
	return g, nil
}

func (m *MemoryGroups) Delete(_ context.Context, id string) error {
	id = strings.TrimSpace(id)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byID[id]; !ok {
		return ErrNotFound
	}
	delete(m.byID, id)
	return nil
}
