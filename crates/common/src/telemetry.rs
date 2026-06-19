//! Async client that posts flight logs to the telemetry microservice.

use crate::flight_log::FlightLogEntry;
use tracing::warn;

/// Thin HTTP wrapper for fire-and-forget telemetry reporting.
#[derive(Clone)]
pub struct TelemetryClient {
    base_url: String,
    http: reqwest::Client,
}

impl TelemetryClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            http: reqwest::Client::new(),
        }
    }

    /// POSTs a flight log; failures are logged but never bubble to callers.
    pub async fn emit(&self, entry: &FlightLogEntry, correlation_id: &str) {
        let url = format!("{}/ingest", self.base_url.trim_end_matches('/'));
        if let Err(err) = self
            .http
            .post(&url)
            .header("X-Correlation-ID", correlation_id)
            .json(entry)
            .send()
            .await
        {
            warn!(error = %err, "telemetry emit failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::flight_log::FlightLogEntry;

    #[test]
    fn client_stores_base_url() {
        let client = TelemetryClient::new("http://telemetry:3000");
        assert!(client.base_url.contains("telemetry"));
    }

    #[tokio::test]
    async fn emit_does_not_panic_on_unreachable_host() {
        let client = TelemetryClient::new("http://127.0.0.1:1");
        let entry = FlightLogEntry::new("c", "test", "evt", "started");
        client.emit(&entry, "c").await;
    }
}
