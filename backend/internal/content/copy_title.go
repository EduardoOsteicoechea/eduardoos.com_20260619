package content

import (
	"fmt"
	"strings"
)

// NextCopyTitle returns sourceTitle plus the smallest "_n" suffix (n ≥ 1)
// that does not already appear in existingTitles.
//
// Copying "Foo" while nothing else exists yields "Foo_1". Copying again
// yields "Foo_2". Copying a pamphlet whose title is already "Foo_1" yields
// "Foo_1_1" — the suffix is always appended to the title being copied, never
// parsed back to a root name.
func NextCopyTitle(sourceTitle string, existingTitles []string) string {
	base := strings.TrimSpace(sourceTitle)
	if base == "" {
		base = "Untitled pamphlet"
	}
	used := make(map[string]struct{}, len(existingTitles)+1)
	for _, t := range existingTitles {
		used[strings.TrimSpace(t)] = struct{}{}
	}
	for n := 1; ; n++ {
		candidate := fmt.Sprintf("%s_%d", base, n)
		if _, taken := used[candidate]; !taken {
			return candidate
		}
	}
}
