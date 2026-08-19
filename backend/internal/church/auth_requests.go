package church

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"
)

// Authorization status values persisted on church-auth Dynamo rows.
const (
	AuthStatusPending  = "pending"
	AuthStatusApproved = "approved"
	AuthStatusRejected = "rejected"
)

// ErrAuthAlreadyPending is returned when the user already has a pending request.
var ErrAuthAlreadyPending = errors.New("authorization request already pending")

// AuthorizationRequest is a platform-admin approval to manage/register churches.
// Payment (church-management entitlement) is required after approval, not before.
type AuthorizationRequest struct {
	Email       string `json:"email"`
	Status      string `json:"status"` // pending | approved | rejected
	RequestedAt string `json:"requestedAt"`
	DecidedAt   string `json:"decidedAt,omitempty"`
	DecidedBy   string `json:"decidedBy,omitempty"`
	Note        string `json:"note,omitempty"`
}

// AuthorizationStore persists per-user church-management authorization requests.
type AuthorizationStore interface {
	BackendName() string
	Get(ctx context.Context, email string) (AuthorizationRequest, bool, error)
	Put(ctx context.Context, req AuthorizationRequest) (AuthorizationRequest, error)
	List(ctx context.Context, statusFilter string) ([]AuthorizationRequest, error)
}

// AuthRequestSK is Dynamo SK church-auth:u:{email}.
func AuthRequestSK(email string) string {
	return "church-auth:u:" + auth.NormalizeEmail(email)
}

// AuthRequestSKPrefix is begins_with for all church authorization rows.
func AuthRequestSKPrefix() string {
	return "church-auth:u:"
}

// NormalizeAuthStatus returns pending|approved|rejected or empty if unknown.
func NormalizeAuthStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case AuthStatusPending:
		return AuthStatusPending
	case AuthStatusApproved:
		return AuthStatusApproved
	case AuthStatusRejected:
		return AuthStatusRejected
	default:
		return ""
	}
}

// MemoryAuthorizations is an in-process store for tests and local boots.
type MemoryAuthorizations struct {
	mu   sync.RWMutex
	bySK map[string]AuthorizationRequest
}

// NewMemoryAuthorizations constructs an empty authorization store.
func NewMemoryAuthorizations() *MemoryAuthorizations {
	return &MemoryAuthorizations{bySK: map[string]AuthorizationRequest{}}
}

func (m *MemoryAuthorizations) BackendName() string { return "memory" }

func (m *MemoryAuthorizations) Get(_ context.Context, email string) (AuthorizationRequest, bool, error) {
	sk := AuthRequestSK(email)
	m.mu.RLock()
	defer m.mu.RUnlock()
	req, ok := m.bySK[sk]
	return req, ok, nil
}

func (m *MemoryAuthorizations) Put(_ context.Context, req AuthorizationRequest) (AuthorizationRequest, error) {
	req.Email = auth.NormalizeEmail(req.Email)
	req.Status = NormalizeAuthStatus(req.Status)
	if req.Email == "" || req.Status == "" {
		return AuthorizationRequest{}, errors.New("email and status required")
	}
	sk := AuthRequestSK(req.Email)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.bySK[sk] = req
	return req, nil
}

func (m *MemoryAuthorizations) List(_ context.Context, statusFilter string) ([]AuthorizationRequest, error) {
	want := NormalizeAuthStatus(statusFilter)
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]AuthorizationRequest, 0, len(m.bySK))
	for _, req := range m.bySK {
		if want != "" && req.Status != want {
			continue
		}
		out = append(out, req)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].RequestedAt > out[j].RequestedAt
	})
	return out, nil
}

// nowAuthRFC3339 returns UTC RFC3339 for auth request timestamps.
func nowAuthRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
