package church

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"
)

// ErrDuplicate is returned when creating a church that already exists.
var ErrDuplicate = errors.New("church already exists")

// ErrNotFound is returned when a catalog/membership row is missing.
var ErrNotFound = errors.New("not found")

// CatalogStore persists searchable church cards.
type CatalogStore interface {
	BackendName() string
	Create(ctx context.Context, c ChurchCard) (ChurchCard, error)
	Get(ctx context.Context, denomID, churchID string) (ChurchCard, bool, error)
	List(ctx context.Context, query string) ([]ChurchCard, error)
	Update(ctx context.Context, c ChurchCard) (ChurchCard, error)
	Delete(ctx context.Context, denomID, churchID string) error
}

// MembershipStore persists user↔church roles.
type MembershipStore interface {
	BackendName() string
	Upsert(ctx context.Context, m Membership) (Membership, error)
	Get(ctx context.Context, email, denomID, churchID string) (Membership, bool, error)
	ListByUser(ctx context.Context, email string) ([]Membership, error)
	Delete(ctx context.Context, email, denomID, churchID string) error
}

// MemoryCatalog is an in-process catalog for tests and local boots.
type MemoryCatalog struct {
	mu   sync.RWMutex
	bySK map[string]ChurchCard
}

// NewMemoryCatalog constructs an empty catalog.
func NewMemoryCatalog() *MemoryCatalog {
	return &MemoryCatalog{bySK: map[string]ChurchCard{}}
}

func (m *MemoryCatalog) BackendName() string { return "memory" }

func (m *MemoryCatalog) Create(_ context.Context, c ChurchCard) (ChurchCard, error) {
	c.OwnerEmail = auth.NormalizeEmail(c.OwnerEmail)
	c.DenominationID = strings.TrimSpace(c.DenominationID)
	c.ChurchID = strings.TrimSpace(c.ChurchID)
	if c.DenominationID == "" || c.ChurchID == "" {
		return ChurchCard{}, errors.New("denominationId and churchId required")
	}
	sk := CatalogSK(c.DenominationID, c.ChurchID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[sk]; ok {
		return ChurchCard{}, ErrDuplicate
	}
	m.bySK[sk] = c
	return c, nil
}

func (m *MemoryCatalog) Get(_ context.Context, denomID, churchID string) (ChurchCard, bool, error) {
	sk := CatalogSK(denomID, churchID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.bySK[sk]
	return c, ok, nil
}

func (m *MemoryCatalog) List(_ context.Context, query string) ([]ChurchCard, error) {
	q := strings.ToLower(strings.TrimSpace(query))
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]ChurchCard, 0, len(m.bySK))
	for _, c := range m.bySK {
		if q == "" || churchMatchesQuery(c, q) {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].UpdatedAt == out[j].UpdatedAt {
			return out[i].Name < out[j].Name
		}
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out, nil
}

func (m *MemoryCatalog) Update(_ context.Context, c ChurchCard) (ChurchCard, error) {
	sk := CatalogSK(c.DenominationID, c.ChurchID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[sk]; !ok {
		return ChurchCard{}, ErrNotFound
	}
	m.bySK[sk] = c
	return c, nil
}

func (m *MemoryCatalog) Delete(_ context.Context, denomID, churchID string) error {
	sk := CatalogSK(denomID, churchID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[sk]; !ok {
		return ErrNotFound
	}
	delete(m.bySK, sk)
	return nil
}

func churchMatchesQuery(c ChurchCard, q string) bool {
	hay := strings.ToLower(c.Name + " " + c.DenominationID + " " + c.ChurchID + " " + c.Network + " " + c.OwnerEmail)
	return strings.Contains(hay, q)
}

// MemoryMemberships is an in-process membership map.
type MemoryMemberships struct {
	mu   sync.RWMutex
	bySK map[string]Membership
}

// NewMemoryMemberships constructs an empty membership store.
func NewMemoryMemberships() *MemoryMemberships {
	return &MemoryMemberships{bySK: map[string]Membership{}}
}

func (m *MemoryMemberships) BackendName() string { return "memory" }

func (m *MemoryMemberships) Upsert(_ context.Context, mem Membership) (Membership, error) {
	mem.Email = auth.NormalizeEmail(mem.Email)
	mem.DenominationID = strings.TrimSpace(mem.DenominationID)
	mem.ChurchID = strings.TrimSpace(mem.ChurchID)
	mem.Role = NormalizeChurchRole(mem.Role)
	if mem.Email == "" || mem.DenominationID == "" || mem.ChurchID == "" {
		return Membership{}, errors.New("email, denominationId, churchId required")
	}
	sk := MembershipSK(mem.Email, mem.DenominationID, mem.ChurchID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.bySK[sk]; ok && mem.CreatedAt == "" {
		mem.CreatedAt = existing.CreatedAt
	}
	m.bySK[sk] = mem
	return mem, nil
}

func (m *MemoryMemberships) Get(_ context.Context, email, denomID, churchID string) (Membership, bool, error) {
	sk := MembershipSK(email, denomID, churchID)
	m.mu.RLock()
	defer m.mu.RUnlock()
	mem, ok := m.bySK[sk]
	return mem, ok, nil
}

func (m *MemoryMemberships) ListByUser(_ context.Context, email string) ([]Membership, error) {
	email = auth.NormalizeEmail(email)
	prefix := MembershipSKPrefixForUser(email)
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Membership, 0)
	for sk, mem := range m.bySK {
		if strings.HasPrefix(sk, prefix) {
			out = append(out, mem)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].ChurchName < out[j].ChurchName
	})
	return out, nil
}

func (m *MemoryMemberships) Delete(_ context.Context, email, denomID, churchID string) error {
	sk := MembershipSK(email, denomID, churchID)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.bySK[sk]; !ok {
		return ErrNotFound
	}
	delete(m.bySK, sk)
	return nil
}
