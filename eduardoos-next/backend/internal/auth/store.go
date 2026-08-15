package auth

import (
	"sync"
)

// User is the in-memory account record (production-shaped fields only).
type User struct {
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Verified     bool   `json:"verified"`
}

// Store holds users plus OTP maps for email verification and password reset.
// This memory backend is the default for Next until Dynamo adapters land.
type Store struct {
	mu        sync.RWMutex
	users     map[string]User
	otp       map[string]string
	resetOTP  map[string]string
}

// NewMemoryStore constructs an empty auth store suitable for local/tests.
func NewMemoryStore() *Store {
	return &Store{
		users:    make(map[string]User),
		otp:      make(map[string]string),
		resetOTP: make(map[string]string),
	}
}

func (s *Store) PutUser(u User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	email := NormalizeEmail(u.Email)
	u.Email = email
	s.users[email] = u
}

func (s *Store) GetUser(email string) (User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[NormalizeEmail(email)]
	return u, ok
}

func (s *Store) PutOTP(email, code string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.otp[NormalizeEmail(email)] = code
}

func (s *Store) GetOTP(email string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.otp[NormalizeEmail(email)]
	return v, ok
}

func (s *Store) ClearOTP(email string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.otp, NormalizeEmail(email))
}

func (s *Store) PutResetOTP(email, code string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.resetOTP[NormalizeEmail(email)] = code
}

func (s *Store) GetResetOTP(email string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.resetOTP[NormalizeEmail(email)]
	return v, ok
}

func (s *Store) ClearResetOTP(email string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.resetOTP, NormalizeEmail(email))
}

func (s *Store) SetVerified(email string, verified bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	email = NormalizeEmail(email)
	u, ok := s.users[email]
	if !ok {
		return false
	}
	u.Verified = verified
	s.users[email] = u
	return true
}

func (s *Store) UpdatePassword(email, hash string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	email = NormalizeEmail(email)
	u, ok := s.users[email]
	if !ok {
		return false
	}
	u.PasswordHash = hash
	s.users[email] = u
	return true
}
