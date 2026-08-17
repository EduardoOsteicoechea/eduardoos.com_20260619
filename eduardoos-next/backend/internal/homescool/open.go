package homescool

import (
	"context"
	"log"
	"strings"

	"eduardoos.nex/internal/httpx"
)

// OpenLinkStore selects memory or DynamoDB for teacher→student links.
//
// Backend resolution order:
//  1. HOMESCOOL_BACKEND (explicit override)
//  2. DATABASE_BACKEND (same switch as auth users — production sets dynamodb)
//  3. memory (local default)
//
// When DynamoDB is requested but AWS credentials/config are missing, falls back
// to memory so local boots remain usable (same pattern as auth.OpenUserStore).
func OpenLinkStore(ctx context.Context) Store {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("HOMESCOOL_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("homescool link store backend=memory")
		return NewMemoryStore()
	}
	store, err := newDynamoLinkStore(ctx)
	if err != nil {
		log.Printf("homescool HOMESCOOL_BACKEND/DATABASE_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
		return NewMemoryStore()
	}
	log.Printf("homescool link store backend=dynamodb table=%s", store.table)
	return store
}
