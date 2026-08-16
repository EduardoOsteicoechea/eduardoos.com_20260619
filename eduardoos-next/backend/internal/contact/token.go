package contact

import (
	"strconv"
	"strings"
)

// ValidHumanToken accepts the anti-bot proof emitted by ContactAgent after a
// 5-second hold. Two formats are accepted for parity with legacy + Next UI:
//
//	h1:{scopeId}:{heldMilliseconds}  — Next frontend (heldMs >= 5000)
//	ok:{scopeId}:{heldSeconds}       — legacy frontend (heldSeconds >= 5)
func ValidHumanToken(token string) bool {
	parts := strings.Split(strings.TrimSpace(token), ":")
	if len(parts) != 3 || parts[1] == "" {
		return false
	}
	n, err := strconv.Atoi(parts[2])
	if err != nil {
		return false
	}
	switch parts[0] {
	case "h1":
		return n >= 5000
	case "ok":
		return n >= 5
	default:
		return false
	}
}
