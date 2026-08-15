package payments

import (
	"strings"
	"sync"
	"time"
)

// Intent is a PayPal checkout intent held in memory for Next staging.
// Shape mirrors production payment records enough for UI + status polling.
type Intent struct {
	IntentID       string   `json:"intent_id"`
	Email          string   `json:"email"`
	PlanID         string   `json:"plan_id"`
	ProductName    string   `json:"product_name"`
	HostedButtonID string   `json:"hosted_button_id"`
	Currency       string   `json:"currency"`
	Amount         string   `json:"amount"`
	Services       []string `json:"services"`
	BillingPeriod  string   `json:"billing_period"`
	Status         string   `json:"status"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

// Entitlement is a lightweight active-service preview row.
type Entitlement struct {
	ServiceID     string `json:"service_id"`
	ServiceLabel  string `json:"service_label"`
	BillingPeriod string `json:"billing_period"`
	ValidFrom     string `json:"valid_from"`
	ValidUntil    string `json:"valid_until"`
}

// Store is an in-process intent + entitlement map (no Dynamo yet).
type Store struct {
	mu           sync.RWMutex
	intents      map[string]Intent
	entitlements map[string][]Entitlement // keyed by email
}

// NewStore returns an empty memory-backed payment store.
func NewStore() *Store {
	return &Store{
		intents:      make(map[string]Intent),
		entitlements: make(map[string][]Entitlement),
	}
}

// SaveIntent upserts an intent by IntentID.
func (s *Store) SaveIntent(intent Intent) Intent {
	now := time.Now().UTC().Format(time.RFC3339)
	if intent.CreatedAt == "" {
		intent.CreatedAt = now
	}
	intent.UpdatedAt = now
	s.mu.Lock()
	defer s.mu.Unlock()
	s.intents[intent.IntentID] = intent
	return intent
}

// GetIntent looks up an intent by id.
func (s *Store) GetIntent(id string) (Intent, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.intents[id]
	return rec, ok
}

// ListEntitlements returns entitlements for an email (may be empty).
func (s *Store) ListEntitlements(email string) []Entitlement {
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := s.entitlements[email]
	if out == nil {
		return []Entitlement{}
	}
	copied := make([]Entitlement, len(out))
	copy(copied, out)
	return copied
}

// PutEntitlements replaces entitlement rows for an email (test / preview helper).
func (s *Store) PutEntitlements(email string, rows []Entitlement) {
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.Lock()
	defer s.mu.Unlock()
	if rows == nil {
		rows = []Entitlement{}
	}
	s.entitlements[email] = rows
}
