package auth

import (
	"context"
	"sync"
)

// User is the account record shaped like production authstore JSON.
type User struct {
	Email           string `json:"email"`
	PasswordHash    string `json:"passwordHash"`
	Verified        bool   `json:"verified"`
	ProfileImageKey string `json:"profileImageKey,omitempty"`
}

// UserStore persists users and OTP codes. Memory is default; DynamoDB is optional.
type UserStore interface {
	BackendName() string
	GetUser(ctx context.Context, email string) (User, bool, error)
	PutUser(ctx context.Context, user User) error
	GetOTP(ctx context.Context, email string) (string, bool, error)
	PutOTP(ctx context.Context, email, otp string) error
	DeleteOTP(ctx context.Context, email string) error
	GetResetOTP(ctx context.Context, email string) (string, bool, error)
	PutResetOTP(ctx context.Context, email, otp string) error
	DeleteResetOTP(ctx context.Context, email string) error
}

// MemoryStore is the local default auth backend.
type MemoryStore struct {
	mu        sync.RWMutex
	users     map[string]User
	otp       map[string]string
	resetOTP  map[string]string
}

// NewMemoryStore constructs an empty auth store suitable for local/tests.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:    make(map[string]User),
		otp:      make(map[string]string),
		resetOTP: make(map[string]string),
	}
}

func (s *MemoryStore) BackendName() string { return "memory" }

func (s *MemoryStore) GetUser(_ context.Context, email string) (User, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[NormalizeEmail(email)]
	return u, ok, nil
}

func (s *MemoryStore) PutUser(_ context.Context, u User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	email := NormalizeEmail(u.Email)
	u.Email = email
	s.users[email] = u
	return nil
}

func (s *MemoryStore) GetOTP(_ context.Context, email string) (string, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.otp[NormalizeEmail(email)]
	return v, ok, nil
}

func (s *MemoryStore) PutOTP(_ context.Context, email, code string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.otp[NormalizeEmail(email)] = code
	return nil
}

func (s *MemoryStore) DeleteOTP(_ context.Context, email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.otp, NormalizeEmail(email))
	return nil
}

func (s *MemoryStore) GetResetOTP(_ context.Context, email string) (string, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.resetOTP[NormalizeEmail(email)]
	return v, ok, nil
}

func (s *MemoryStore) PutResetOTP(_ context.Context, email, code string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetOTP[NormalizeEmail(email)] = code
	return nil
}

func (s *MemoryStore) DeleteResetOTP(_ context.Context, email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.resetOTP, NormalizeEmail(email))
	return nil
}
