package auth

import (
	"context"
	"os"
	"testing"
)

func TestOpenUserStoreDefaultsToMemory(t *testing.T) {
	t.Setenv("DATABASE_BACKEND", "memory")
	store := OpenUserStore(context.Background())
	if store.BackendName() != "memory" {
		t.Fatalf("backend=%s", store.BackendName())
	}
}

func TestOpenUserStoreDynamoFallsBackWithoutCreds(t *testing.T) {
	t.Setenv("DATABASE_BACKEND", "dynamodb")
	// Clear common credential env so LoadConfig fails locally.
	for _, k := range []string{"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"} {
		_ = os.Unsetenv(k)
	}
	store := OpenUserStore(context.Background())
	if store.BackendName() != "memory" {
		t.Fatalf("expected memory fallback, got %s", store.BackendName())
	}
}
