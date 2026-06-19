//! Query filters and analytics aggregation for flight logs.

use common::FlightLogEntry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Optional filters applied when listing flight logs.
#[derive(Debug, Deserialize, Default)]
pub struct LogQuery {
    pub service: Option<String>,
    pub status: Option<String>,
    pub correlation_id: Option<String>,
    pub event: Option<String>,
    pub limit: Option<usize>,
}

impl LogQuery {
    /// Returns true when an entry matches all provided filters.
    pub fn matches(&self, entry: &FlightLogEntry) -> bool {
        if let Some(service) = &self.service {
            if !entry.service.eq_ignore_ascii_case(service) {
                return false;
            }
        }
        if let Some(status) = &self.status {
            if !entry.status.eq_ignore_ascii_case(status) {
                return false;
            }
        }
        if let Some(correlation_id) = &self.correlation_id {
            if !entry.correlation_id.contains(correlation_id) {
                return false;
            }
        }
        if let Some(event) = &self.event {
            if !entry.event.to_lowercase().contains(&event.to_lowercase()) {
                return false;
            }
        }
        true
    }
}

/// Aggregated observability metrics for dashboard charts and KPI cards.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogAnalytics {
    pub total: usize,
    pub unique_correlations: usize,
    pub by_service: HashMap<String, usize>,
    pub by_status: HashMap<String, usize>,
    pub by_event: HashMap<String, usize>,
    pub error_rate_percent: f64,
    pub recent_errors: Vec<FlightLogEntry>,
}

/// Computes analytics from the full in-memory log buffer.
pub fn compute_analytics(logs: &[FlightLogEntry]) -> LogAnalytics {
    let mut by_service: HashMap<String, usize> = HashMap::new();
    let mut by_status: HashMap<String, usize> = HashMap::new();
    let mut by_event: HashMap<String, usize> = HashMap::new();
    let mut correlations = std::collections::HashSet::new();
    let mut error_count = 0usize;

    for entry in logs {
        *by_service.entry(entry.service.clone()).or_insert(0) += 1;
        *by_status.entry(entry.status.clone()).or_insert(0) += 1;
        *by_event.entry(entry.event.clone()).or_insert(0) += 1;
        correlations.insert(entry.correlation_id.clone());
        if entry.status.eq_ignore_ascii_case("error") {
            error_count += 1;
        }
    }

    let total = logs.len();
    let error_rate_percent = if total == 0 {
        0.0
    } else {
        (error_count as f64 / total as f64) * 100.0
    };

    let recent_errors: Vec<FlightLogEntry> = logs
        .iter()
        .filter(|e| e.status.eq_ignore_ascii_case("error"))
        .rev()
        .take(10)
        .cloned()
        .collect();

    LogAnalytics {
        total,
        unique_correlations: correlations.len(),
        by_service,
        by_status,
        by_event,
        error_rate_percent,
        recent_errors,
    }
}

/// Filters and optionally limits log entries (newest first).
pub fn filter_logs(logs: &[FlightLogEntry], query: &LogQuery) -> Vec<FlightLogEntry> {
    let limit = query.limit.unwrap_or(500).min(2000);
    let mut filtered: Vec<FlightLogEntry> = logs
        .iter()
        .filter(|e| query.matches(e))
        .cloned()
        .collect();
    filtered.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    filtered.truncate(limit);
    filtered
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn sample_log(service: &str, status: &str, corr: &str) -> FlightLogEntry {
        FlightLogEntry {
            correlation_id: corr.into(),
            service: service.into(),
            event: "test.event".into(),
            status: status.into(),
            timestamp: Utc::now(),
            metadata: None,
        }
    }

    #[test]
    fn filter_by_service() {
        let logs = vec![
            sample_log("frontend", "success", "c1"),
            sample_log("backend", "success", "c2"),
        ];
        let query = LogQuery {
            service: Some("frontend".into()),
            ..Default::default()
        };
        assert_eq!(filter_logs(&logs, &query).len(), 1);
    }

    #[test]
    fn analytics_counts_errors() {
        let logs = vec![
            sample_log("a", "success", "c1"),
            sample_log("a", "error", "c2"),
        ];
        let stats = compute_analytics(&logs);
        assert_eq!(stats.total, 2);
        assert!((stats.error_rate_percent - 50.0).abs() < 0.01);
    }
}
