package apikeys

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/httpx"
)

// DefaultRateLimit is requests allowed per key per rolling minute (spec 055).
const DefaultRateLimit = 60

// RateLimiter is a simple in-process sliding-window counter per key id.
type RateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
}

// NewRateLimiter builds a limiter (limit requests per window).
func NewRateLimiter(limit int) *RateLimiter {
	if limit < 1 {
		limit = DefaultRateLimit
	}
	return &RateLimiter{
		limit:  limit,
		window: time.Minute,
		hits:   map[string][]time.Time{},
	}
}

// Allow reports whether keyID may proceed and seconds until retry when denied.
func (l *RateLimiter) Allow(keyID string) (ok bool, retryAfterSec int) {
	now := time.Now()
	cutoff := now.Add(-l.window)
	l.mu.Lock()
	defer l.mu.Unlock()
	arr := l.hits[keyID]
	kept := arr[:0]
	for _, t := range arr {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.hits[keyID] = kept
		oldest := kept[0]
		retry := int(oldest.Add(l.window).Sub(now).Seconds()) + 1
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	kept = append(kept, now)
	l.hits[keyID] = kept
	return true, 0
}

// RateLimitMiddleware enforces DefaultRateLimit using X-API-Key-ID set by RequireAPIKey.
func (h *Handler) RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		keyID := strings.TrimSpace(r.Header.Get(HeaderKeyID))
		if keyID == "" {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		ok, retry := h.Limiter.Allow(keyID)
		if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			httpx.WriteError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		next.ServeHTTP(w, r)
	})
}
