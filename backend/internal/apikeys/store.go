// Package apikeys implements Feature 055: hashed API keys, JWT management
// routes, Bearer middleware for /api/v1/*, and per-key rate limiting.
package apikeys

import (
	"context"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/auth"

	"github.com/google/uuid"
)

// Record is the durable metadata for one API key (never includes the secret).
type Record struct {
	ID         string `json:"id"`
	OwnerEmail string `json:"ownerEmail"`
	Label      string `json:"label"`
	Prefix     string `json:"prefix"`
	Hash       string `json:"hash"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt string `json:"lastUsedAt,omitempty"`
	RevokedAt  string `json:"revokedAt,omitempty"`
}

// PublicView is the JSON shape returned to clients (no hash).
type PublicView struct {
	ID         string `json:"id"`
	Label      string `json:"label"`
	Prefix     string `json:"prefix"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt string `json:"lastUsedAt,omitempty"`
	RevokedAt  string `json:"revokedAt,omitempty"`
}

// ToPublic strips the hash for API responses.
func (r Record) ToPublic() PublicView {
	return PublicView{
		ID:         r.ID,
		Label:      r.Label,
		Prefix:     r.Prefix,
		CreatedAt:  r.CreatedAt,
		LastUsedAt: r.LastUsedAt,
		RevokedAt:  r.RevokedAt,
	}
}

// Active reports whether the key can authenticate requests.
func (r Record) Active() bool {
	return strings.TrimSpace(r.RevokedAt) == ""
}

// Store persists API key records (memory for tests; DynamoDB in production).
type Store interface {
	BackendName() string
	Create(ctx context.Context, rec Record) error
	GetByHash(ctx context.Context, hash string) (Record, bool, error)
	GetByID(ctx context.Context, id string) (Record, bool, error)
	ListByOwner(ctx context.Context, ownerEmail string) ([]Record, error)
	Revoke(ctx context.Context, ownerEmail, id string) (Record, bool, error)
	TouchLastUsed(ctx context.Context, id string, at string) error
}

// MemoryStore is process-local persistence for tests and local development.
type MemoryStore struct {
	mu      sync.RWMutex
	byID    map[string]Record
	byHash  map[string]string // hash → id
	byOwner map[string][]string
}

// NewMemoryStore constructs an empty key registry.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byID:    map[string]Record{},
		byHash:  map[string]string{},
		byOwner: map[string][]string{},
	}
}

func (s *MemoryStore) BackendName() string { return "memory" }

func (s *MemoryStore) Create(_ context.Context, rec Record) error {
	rec.OwnerEmail = auth.NormalizeEmail(rec.OwnerEmail)
	if rec.ID == "" {
		rec.ID = uuid.NewString()
	}
	if rec.CreatedAt == "" {
		rec.CreatedAt = auth.NowRFC3339()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.byID[rec.ID]; ok {
		return ErrDuplicate
	}
	if _, ok := s.byHash[rec.Hash]; ok {
		return ErrDuplicate
	}
	s.byID[rec.ID] = rec
	s.byHash[rec.Hash] = rec.ID
	s.byOwner[rec.OwnerEmail] = append(s.byOwner[rec.OwnerEmail], rec.ID)
	return nil
}

func (s *MemoryStore) GetByHash(_ context.Context, hash string) (Record, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.byHash[hash]
	if !ok {
		return Record{}, false, nil
	}
	rec, ok := s.byID[id]
	return cloneRecord(rec), ok, nil
}

func (s *MemoryStore) GetByID(_ context.Context, id string) (Record, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.byID[id]
	return cloneRecord(rec), ok, nil
}

func (s *MemoryStore) ListByOwner(_ context.Context, ownerEmail string) ([]Record, error) {
	ownerEmail = auth.NormalizeEmail(ownerEmail)
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := s.byOwner[ownerEmail]
	out := make([]Record, 0, len(ids))
	for _, id := range ids {
		if rec, ok := s.byID[id]; ok {
			out = append(out, cloneRecord(rec))
		}
	}
	return out, nil
}

func (s *MemoryStore) Revoke(_ context.Context, ownerEmail, id string) (Record, bool, error) {
	ownerEmail = auth.NormalizeEmail(ownerEmail)
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.byID[id]
	if !ok || !strings.EqualFold(rec.OwnerEmail, ownerEmail) {
		return Record{}, false, nil
	}
	if rec.RevokedAt == "" {
		rec.RevokedAt = auth.NowRFC3339()
		s.byID[id] = rec
	}
	return cloneRecord(rec), true, nil
}

func (s *MemoryStore) TouchLastUsed(_ context.Context, id string, at string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.byID[id]
	if !ok {
		return nil
	}
	rec.LastUsedAt = at
	s.byID[id] = rec
	return nil
}

func cloneRecord(r Record) Record { return r }

// ErrDuplicate is returned when an id or hash already exists.
var ErrDuplicate = errDuplicate{}

type errDuplicate struct{}

func (errDuplicate) Error() string { return "api key already exists" }

// NewRecord builds a Record from a freshly generated secret (caller shows secret once).
func NewRecord(ownerEmail, label, secret string) (Record, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return Record{}, ErrLabelRequired
	}
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return Record{}, ErrInvalidSecret
	}
	return Record{
		ID:         uuid.NewString(),
		OwnerEmail: auth.NormalizeEmail(ownerEmail),
		Label:      label,
		Prefix:     DisplayPrefix(secret),
		Hash:       HashSecret(secret),
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ErrLabelRequired / ErrInvalidSecret are create validation errors.
var (
	ErrLabelRequired = errMsg("label required")
	ErrInvalidSecret = errMsg("invalid secret")
)

type errMsg string

func (e errMsg) Error() string { return string(e) }
