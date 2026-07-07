package dynamodb

import (
	"context"
	"testing"
)

func TestMemoryPaymentStoreSaveAndLookup(t *testing.T) {
	store := newMemoryPaymentStore()
	ctx := context.Background()

	saved, err := store.SavePayment(ctx, PaymentRecord{
		IntentID:  "intent-1",
		UserEmail: "user@example.com",
		PlanID:    "subscription_monthly_basic",
		Status:    "pending",
		Currency:  "USD",
	}, "corr-1")
	if err != nil {
		t.Fatal(err)
	}
	if saved.ProductName != "Monthly Basic Subscription" {
		t.Fatalf("product name = %q", saved.ProductName)
	}

	got, ok, err := store.GetPaymentByIntentID(ctx, "intent-1", "corr-2")
	if err != nil || !ok {
		t.Fatalf("lookup failed ok=%t err=%v", ok, err)
	}
	if got.UserEmail != "user@example.com" {
		t.Fatalf("unexpected record: %+v", got)
	}

	list, err := store.GetPaymentsByUserEmail(ctx, "user@example.com", "corr-3")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].IntentID != "intent-1" {
		t.Fatalf("unexpected list: %+v", list)
	}
}

func TestProductNameForPlan(t *testing.T) {
	if got := ProductNameForPlan("subscription_monthly_basic"); got != "Monthly Basic Subscription" {
		t.Fatalf("ProductNameForPlan() = %q", got)
	}
}
