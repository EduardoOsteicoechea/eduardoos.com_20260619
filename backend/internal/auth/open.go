package auth

import (
	"context"
	"log"
	"strings"

	"eduardoos.nex/internal/httpx"
)

// OpenUserStore selects memory or DynamoDB from DATABASE_BACKEND.
// When dynamodb is requested but AWS credentials/config are missing, it logs
// clearly and falls back to memory so local Next boots remain usable.
func OpenUserStore(ctx context.Context) UserStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("DATABASE_BACKEND", "memory")))
	if mode != "dynamodb" {
		log.Printf("auth user store backend=memory")
		return NewMemoryStore()
	}
	store, err := newDynamoUserStore(ctx)
	if err != nil {
		log.Printf("auth DATABASE_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
		return NewMemoryStore()
	}
	log.Printf("auth user store backend=dynamodb table=%s", store.table)
	return store
}
