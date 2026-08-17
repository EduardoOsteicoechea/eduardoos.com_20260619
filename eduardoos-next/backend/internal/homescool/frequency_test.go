package homescool

import (
	"reflect"
	"testing"
)

func TestExpandOccurrenceDates(t *testing.T) {
	t.Parallel()

	once, err := ExpandOccurrenceDates("2026-08-17", "2026-08-20", TaskFrequency{Kind: FrequencyOnce})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(once, []string{"2026-08-17"}) {
		t.Fatalf("once got %#v", once)
	}

	daily, err := ExpandOccurrenceDates("2026-08-17", "2026-08-19", TaskFrequency{Kind: FrequencyDaily})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(daily, []string{"2026-08-17", "2026-08-18", "2026-08-19"}) {
		t.Fatalf("daily got %#v", daily)
	}

	// 2026-08-17 = Monday … exclude Sat(6)/Sun(0)
	except, err := ExpandOccurrenceDates("2026-08-17", "2026-08-23", TaskFrequency{
		Kind:            FrequencyDailyExcept,
		ExcludeWeekdays: []int{0, 6},
	})
	if err != nil {
		t.Fatal(err)
	}
	wantExcept := []string{"2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"}
	if !reflect.DeepEqual(except, wantExcept) {
		t.Fatalf("except got %#v want %#v", except, wantExcept)
	}

	if _, err := ExpandOccurrenceDates("bad", "2026-08-01", TaskFrequency{Kind: FrequencyDaily}); err == nil {
		t.Fatal("expected bad startDate error")
	}
	if FormatFrequencyLabel(TaskFrequency{Kind: FrequencyDaily}) != "Daily" {
		t.Fatal("label daily")
	}
	if NormalizeFrequency(nil).Kind != FrequencyOnce {
		t.Fatal("nil defaults to once")
	}
}
