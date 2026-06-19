package common

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// TelemetryClient posts flight logs to the telemetry microservice /ingest endpoint.
type TelemetryClient struct {
	BaseURL    string
	HTTPClient *http.Client
	Secret     string
}

// NewTelemetryClient builds a client with sane defaults.
func NewTelemetryClient(baseURL, secret string) *TelemetryClient {
	return &TelemetryClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Secret:  secret,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// Emit sends a flight log; failures are logged and ignored.
func (c *TelemetryClient) Emit(entry FlightLogEntry, correlationID string) {
	if c == nil || c.BaseURL == "" {
		return
	}
	body, err := json.Marshal(entry)
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/ingest", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(CorrelationHeader, correlationID)
	if c.Secret != "" {
		req.Header.Set(InternalTokenHeader, SignInternalToken(c.Secret, correlationID))
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		log.Printf("telemetry emit failed: %v", err)
		return
	}
	_ = resp.Body.Close()
}
