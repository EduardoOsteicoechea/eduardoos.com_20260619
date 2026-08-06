package common

import "net/http"

type APIErrorResponse struct {
	Message       string   `json:"message"`
	CorrelationID string   `json:"correlation_id,omitempty"`
	DebugLogs     []string `json:"debug_logs,omitempty"`
}

func WriteErrorWithDebug(w http.ResponseWriter, status int, message, correlationID string, logs []string) {
	WriteJSON(w, status, APIErrorResponse{
		Message:       message,
		CorrelationID: correlationID,
		DebugLogs:     logs,
	})
}
