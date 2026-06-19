//! Flight log contract for distributed telemetry ingestion.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A single observability event flowing through the microservice mesh.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlightLogEntry {
    pub correlation_id: String,
    pub service: String,
    pub event: String,
    pub status: String,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl FlightLogEntry {
    /// Builds a new flight log with the current UTC timestamp.
    pub fn new(
        correlation_id: impl Into<String>,
        service: impl Into<String>,
        event: impl Into<String>,
        status: impl Into<String>,
    ) -> Self {
        Self {
            correlation_id: correlation_id.into(),
            service: service.into(),
            event: event.into(),
            status: status.into(),
            timestamp: Utc::now(),
            metadata: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flight_log_serializes_required_fields() {
        let entry = FlightLogEntry::new("corr-1", "backend", "health", "success");
        let json = serde_json::to_string(&entry).unwrap();
        assert!(json.contains("corr-1"));
        assert!(json.contains("backend"));
    }
}
