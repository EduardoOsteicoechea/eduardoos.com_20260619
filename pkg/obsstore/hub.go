package obsstore

import (
	"context"
	"sync"

	"eduardoos/pkg/common"
)

// Hub fans out ingested logs to live SSE subscribers.
type Hub struct {
	mu          sync.RWMutex
	subscribers map[chan common.FlightLogEntry]struct{}
}

func NewHub() *Hub {
	return &Hub{subscribers: map[chan common.FlightLogEntry]struct{}{}}
}

func (h *Hub) Publish(entry common.FlightLogEntry) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers {
		select {
		case ch <- entry:
		default:
		}
	}
}

func (h *Hub) Subscribe(ctx context.Context) <-chan common.FlightLogEntry {
	ch := make(chan common.FlightLogEntry, 64)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	go func() {
		<-ctx.Done()
		h.mu.Lock()
		delete(h.subscribers, ch)
		close(ch)
		h.mu.Unlock()
	}()
	return ch
}
