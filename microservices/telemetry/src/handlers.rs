//! HTTP handlers for flight log ingestion, listing, analytics, and trace views.

use crate::analytics::{compute_analytics, filter_logs, LogQuery};
use crate::state::AppState;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use common::{AppError, FlightLogEntry};

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "telemetry" }))
}

pub async fn ingest(
    State(state): State<AppState>,
    Json(entry): Json<FlightLogEntry>,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::info!(
        correlation_id = %entry.correlation_id,
        service = %entry.service,
        event = %entry.event,
        status = %entry.status,
        "flight log ingested"
    );
    let mut logs = state.logs.write().await;
    logs.push(entry);
    Ok(Json(serde_json::json!({ "ingested": true })))
}

/// Lists flight logs with optional filters (service, status, correlation, event).
pub async fn list_logs(
    State(state): State<AppState>,
    Query(query): Query<LogQuery>,
) -> Json<Vec<FlightLogEntry>> {
    let logs = state.logs.read().await;
    Json(filter_logs(&logs, &query))
}

/// Returns aggregated metrics for observability dashboards.
pub async fn analytics(State(state): State<AppState>) -> Json<crate::analytics::LogAnalytics> {
    let logs = state.logs.read().await;
    Json(compute_analytics(&logs))
}

/// Returns every hop in a distributed trace keyed by correlation ID.
pub async fn trace_by_correlation(
    State(state): State<AppState>,
    Path(correlation_id): Path<String>,
) -> Json<Vec<FlightLogEntry>> {
    let logs = state.logs.read().await;
    let mut trace: Vec<FlightLogEntry> = logs
        .iter()
        .filter(|e| e.correlation_id == correlation_id)
        .cloned()
        .collect();
    trace.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    Json(trace)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[tokio::test]
    async fn ingest_stores_log() {
        let state = AppState::from_env();
        let entry = FlightLogEntry {
            correlation_id: "c1".into(),
            service: "test".into(),
            event: "evt".into(),
            status: "ok".into(),
            timestamp: Utc::now(),
            metadata: None,
        };
        let _ = ingest(State(state.clone()), Json(entry)).await.unwrap();
        let listed = list_logs(State(state), Query(LogQuery::default())).await;
        assert_eq!(listed.0.len(), 1);
    }
}
