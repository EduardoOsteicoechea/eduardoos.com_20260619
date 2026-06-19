package obsstore

import (
	"encoding/json"
	"fmt"
	"net/http"

	"eduardoos/pkg/common"
)

// StreamLogs writes Server-Sent Events for live flight log observation.
func StreamLogs(w http.ResponseWriter, r *http.Request, store LogStore) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		common.WriteError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ctx := r.Context()
	ch := store.Subscribe(ctx)

	recent, _ := store.List(ctx, LogQuery{Limit: 200})
	for i := len(recent) - 1; i >= 0; i-- {
		writeSSE(w, flusher, recent[i])
	}

	for {
		select {
		case <-ctx.Done():
			return
		case entry, open := <-ch:
			if !open {
				return
			}
			writeSSE(w, flusher, entry)
		}
	}
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, entry common.FlightLogEntry) {
	payload, _ := json.Marshal(entry)
	fmt.Fprintf(w, "event: log\ndata: %s\n\n", payload)
	flusher.Flush()
}
