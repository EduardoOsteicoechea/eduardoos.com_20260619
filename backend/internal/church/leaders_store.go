package church

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	"eduardoos.nex/internal/auth"
)

// LeaderStore persists the independent leaders catalog.
type LeaderStore interface {
	BackendName() string
	Create(ctx context.Context, L LeaderDoc) (LeaderDoc, error)
	Get(ctx context.Context, id string) (LeaderDoc, bool, error)
	List(ctx context.Context) ([]LeaderDoc, error)
	Update(ctx context.Context, L LeaderDoc) (LeaderDoc, error)
	Delete(ctx context.Context, id string) error
}

// MemoryLeaders is an in-process leaders catalog.
type MemoryLeaders struct {
	mu   sync.RWMutex
	byID map[string]LeaderDoc
}

// NewMemoryLeaders constructs an empty leaders catalog.
func NewMemoryLeaders() *MemoryLeaders {
	return &MemoryLeaders{byID: map[string]LeaderDoc{}}
}

func (m *MemoryLeaders) BackendName() string { return "memory" }

func (m *MemoryLeaders) Create(_ context.Context, L LeaderDoc) (LeaderDoc, error) {
	L = sanitizeLeaderDoc(L)
	if L.ID == "" || L.FirstName == "" || L.LastName == "" {
		return LeaderDoc{}, errors.New("id, firstName and lastName required")
	}
	if !IsValidSlug(L.ID) {
		return LeaderDoc{}, errors.New("invalid leader id")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byID[L.ID]; ok {
		return LeaderDoc{}, ErrDuplicate
	}
	m.byID[L.ID] = L
	return L, nil
}

func (m *MemoryLeaders) Get(_ context.Context, id string) (LeaderDoc, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	L, ok := m.byID[strings.TrimSpace(id)]
	return L, ok, nil
}

func (m *MemoryLeaders) List(_ context.Context) ([]LeaderDoc, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]LeaderDoc, 0, len(m.byID))
	for _, L := range m.byID {
		out = append(out, L)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(leaderDocDisplayName(out[i])) < strings.ToLower(leaderDocDisplayName(out[j]))
	})
	return out, nil
}

func (m *MemoryLeaders) Update(_ context.Context, L LeaderDoc) (LeaderDoc, error) {
	L = sanitizeLeaderDoc(L)
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.byID[L.ID]
	if !ok {
		return LeaderDoc{}, ErrNotFound
	}
	if L.FirstName == "" || L.LastName == "" {
		return LeaderDoc{}, errors.New("firstName and lastName required")
	}
	L.CreatedAt = existing.CreatedAt
	L.CreatedBy = existing.CreatedBy
	m.byID[L.ID] = L
	return L, nil
}

func (m *MemoryLeaders) Delete(_ context.Context, id string) error {
	id = strings.TrimSpace(id)
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.byID[id]; !ok {
		return ErrNotFound
	}
	delete(m.byID, id)
	return nil
}

func sanitizeLeaderDoc(L LeaderDoc) LeaderDoc {
	L.ID = strings.TrimSpace(L.ID)
	L.FirstName = strings.TrimSpace(L.FirstName)
	L.LastName = strings.TrimSpace(L.LastName)
	L.Phone = strings.TrimSpace(L.Phone)
	L.Email = auth.NormalizeEmail(strings.TrimSpace(L.Email))
	L.CreatedBy = auth.NormalizeEmail(L.CreatedBy)
	L.Name = strings.TrimSpace(L.FirstName + " " + L.LastName)
	roles := make([]string, 0, len(L.Roles))
	seenRole := map[string]bool{}
	for _, r := range L.Roles {
		r = strings.TrimSpace(r)
		if !IsValidLeaderRole(r) || seenRole[r] {
			continue
		}
		seenRole[r] = true
		roles = append(roles, r)
	}
	L.Roles = roles
	nets := make([]string, 0, len(L.NetworkIDs))
	seenNet := map[string]bool{}
	for _, n := range L.NetworkIDs {
		n = strings.TrimSpace(n)
		if n == "" || seenNet[n] || !IsValidSlug(n) {
			continue
		}
		seenNet[n] = true
		nets = append(nets, n)
	}
	L.NetworkIDs = nets
	churches := make([]string, 0, len(L.ChurchIDs))
	seenChurch := map[string]bool{}
	for _, ref := range L.ChurchIDs {
		ref = NormalizeChurchRef(ref)
		if ref == "" || seenChurch[ref] {
			continue
		}
		seenChurch[ref] = true
		churches = append(churches, ref)
	}
	L.ChurchIDs = churches
	return L
}

// ChurchRef builds a durable "denominationId/churchId" association key.
func ChurchRef(denomID, churchID string) string {
	denomID = strings.TrimSpace(denomID)
	churchID = strings.TrimSpace(churchID)
	if !IsValidSlug(denomID) || !IsValidSlug(churchID) {
		return ""
	}
	return denomID + "/" + churchID
}

// NormalizeChurchRef cleans a church association ref to denom/church form.
func NormalizeChurchRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	// Accept denom/church or denom|church (catalog SK style).
	ref = strings.ReplaceAll(ref, "|", "/")
	parts := strings.Split(ref, "/")
	if len(parts) != 2 {
		return ""
	}
	return ChurchRef(parts[0], parts[1])
}

// ParseChurchRef splits a normalized church association ref.
func ParseChurchRef(ref string) (denomID, churchID string, ok bool) {
	ref = NormalizeChurchRef(ref)
	if ref == "" {
		return "", "", false
	}
	parts := strings.Split(ref, "/")
	return parts[0], parts[1], true
}

func leaderDocDisplayName(L LeaderDoc) string {
	if n := strings.TrimSpace(L.Name); n != "" {
		return n
	}
	return strings.TrimSpace(L.FirstName + " " + L.LastName)
}

// leaderMatchesNetwork reports whether a leader belongs to networkID.
// Empty NetworkIDs means the leader is available for every network.
func leaderMatchesNetwork(L LeaderDoc, networkID string) bool {
	networkID = strings.TrimSpace(networkID)
	if networkID == "" {
		return true
	}
	if len(L.NetworkIDs) == 0 {
		return true
	}
	for _, id := range L.NetworkIDs {
		if id == networkID {
			return true
		}
	}
	return false
}

// leaderDocToEmbedded copies a catalog row into a church.json Leader snapshot.
func leaderDocToEmbedded(L LeaderDoc) Leader {
	return Leader{
		ID:        L.ID,
		FirstName: L.FirstName,
		LastName:  L.LastName,
		Phone:     L.Phone,
		Email:     L.Email,
		Name:      leaderDocDisplayName(L),
		Roles:     append([]string(nil), L.Roles...),
	}
}
