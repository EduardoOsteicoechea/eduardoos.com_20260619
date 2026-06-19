package common

import "time"

// FlightLogEntry matches the frontend telemetry contract (camelCase JSON).
type FlightLogEntry struct {
	CorrelationID string            `json:"correlationId"`
	Service       string            `json:"service"`
	Event         string            `json:"event"`
	Status        string            `json:"status"`
	Timestamp     time.Time         `json:"timestamp"`
	Metadata      map[string]string `json:"metadata,omitempty"`
}

// NewFlightLog creates a log entry with the current UTC timestamp.
func NewFlightLog(correlationID, service, event, status string) FlightLogEntry {
	return FlightLogEntry{
		CorrelationID: correlationID,
		Service:       service,
		Event:         event,
		Status:        status,
		Timestamp:     time.Now().UTC(),
	}
}
