package pamphlet

import (
	"context"
	"fmt"
	"strings"
	"sync"
)

type memoryKey struct {
	userID     string
	pamphletID string
}

// MemoryStore holds pamphlet documents in process memory (local Docker default).
type MemoryStore struct {
	mu   sync.RWMutex
	docs map[memoryKey]Document
}

// NewMemoryStore constructs an empty in-memory pamphlet store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{docs: map[memoryKey]Document{}}
}

func (s *MemoryStore) BackendName() string { return "memory" }

func (s *MemoryStore) key(userID, pamphletID string) (memoryKey, error) {
	userID = normalizeUserID(userID)
	pamphletID = normalizePamphletID(pamphletID)
	if userID == "" {
		return memoryKey{}, fmt.Errorf("user id required")
	}
	return memoryKey{userID: userID, pamphletID: pamphletID}, nil
}

// Get returns a user's pamphlet draft, seeding bundled defaults on first access.
func (s *MemoryStore) Get(_ context.Context, userID, pamphletID string) (Document, error) {
	k, err := s.key(userID, pamphletID)
	if err != nil {
		return Document{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if doc, ok := s.docs[k]; ok {
		return cloneDocument(doc), nil
	}
	doc := DefaultDocument()
	s.docs[k] = cloneDocument(doc)
	return doc, nil
}

// Put replaces a pamphlet draft for the user.
func (s *MemoryStore) Put(_ context.Context, userID, pamphletID string, doc Document) error {
	k, err := s.key(userID, pamphletID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.docs[k] = cloneDocument(doc)
	s.mu.Unlock()
	return nil
}

// Reset reloads bundled defaults for the user's draft.
func (s *MemoryStore) Reset(_ context.Context, userID, pamphletID string) (Document, error) {
	doc := DefaultDocument()
	if err := s.Put(context.Background(), userID, pamphletID, doc); err != nil {
		return Document{}, err
	}
	return doc, nil
}

func normalizeUserID(userID string) string {
	return strings.TrimSpace(userID)
}

func normalizePamphletID(pamphletID string) string {
	pamphletID = strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		return DefaultPamphletID
	}
	return pamphletID
}
