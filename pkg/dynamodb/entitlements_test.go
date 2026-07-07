package dynamodb

import (
	"context"
	"testing"
	"time"

	"eduardoos/pkg/subscriptions"
)

func TestMemoryEntitlementStoreGrantAndRead(t *testing.T) {
	store := newMemoryEntitlementStore()
	ctx := context.Background()
	paidAt := time.Date(2026, 7, 7, 12, 0, 0, 0, time.UTC)

	granted, err := store.GrantServices(ctx, "user@example.com", []string{subscriptions.ServicePlaylist}, subscriptions.BillingMonthly, "intent-1", paidAt, "corr-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(granted) != 1 {
		t.Fatalf("granted = %+v", granted)
	}

	active, err := store.HasActiveService(ctx, "user@example.com", subscriptions.ServicePlaylist, paidAt.Add(24*time.Hour))
	if err != nil || !active {
		t.Fatalf("active=%t err=%v", active, err)
	}

	all, err := store.GetEntitlements(ctx, "user@example.com", "corr-2")
	if err != nil || len(all) != 1 {
		t.Fatalf("all=%+v err=%v", all, err)
	}
}
