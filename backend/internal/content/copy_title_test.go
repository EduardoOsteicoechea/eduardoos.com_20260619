package content

import "testing"

func TestNextCopyTitleFirstCopy(t *testing.T) {
	got := NextCopyTitle("Foo", []string{"Foo", "Bar"})
	if got != "Foo_1" {
		t.Fatalf("got %q want Foo_1", got)
	}
}

func TestNextCopyTitleSkipsTakenSuffixes(t *testing.T) {
	got := NextCopyTitle("Foo", []string{"Foo", "Foo_1", "Foo_2"})
	if got != "Foo_3" {
		t.Fatalf("got %q want Foo_3", got)
	}
}

func TestNextCopyTitleAppendsToAlreadySuffixedName(t *testing.T) {
	got := NextCopyTitle("Foo_1", []string{"Foo", "Foo_1"})
	if got != "Foo_1_1" {
		t.Fatalf("got %q want Foo_1_1", got)
	}
}

func TestNextCopyTitleEmptyFallsBack(t *testing.T) {
	got := NextCopyTitle("  ", nil)
	if got != "Untitled pamphlet_1" {
		t.Fatalf("got %q", got)
	}
}
