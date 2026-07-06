package common

import "net/http"

// APIErrorResponse is the standard error envelope with optional debug traces.
type APIErrorResponse struct {
	Message       string   `json:"message"`
	CorrelationID string   `json:"correlation_id,omitempty"`
	DebugLogs     []string `json:"debug_logs,omitempty"`
}

// WriteErrorWithDebug returns message, correlation id, and debug log lines for API errors.
func WriteErrorWithDebug(w http.ResponseWriter, status int, message, correlationID string, logs []string) {
	WriteJSON(w, status, APIErrorResponse{
		Message:       message,
		CorrelationID: correlationID,
		DebugLogs:     logs,
	})
}
