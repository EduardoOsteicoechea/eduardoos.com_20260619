package content

import (
	"context"
	"testing"
)

func TestOpenEpamStoreDefaultsToMemory(t *testing.T) {
	t.Setenv("EPAMS_BACKEND", "memory")
	if OpenEpamStore(context.Background()).BackendName() != "memory" {
		t.Fatal("expected memory")
	}
}
