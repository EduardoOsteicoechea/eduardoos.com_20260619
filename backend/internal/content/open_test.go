package content

import (
	"context"
	"os"
	"testing"
)

func TestOpenEpamStoreDefaultsToMemory(t *testing.T) {
	t.Setenv("EPAMS_BACKEND", "memory")
	if OpenEpamStore(context.Background()).BackendName() != "memory" {
		t.Fatal("expected memory")
	}
}

func TestOpenBIMStoreDynamoFallsBackWithoutCreds(t *testing.T) {
	t.Setenv("IFCBIM_BACKEND", "dynamodb")
	for _, k := range []string{"AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE"} {
		_ = os.Unsetenv(k)
	}
	if OpenBIMStore(context.Background()).BackendName() != "memory" {
		t.Fatal("expected memory fallback")
	}
}
