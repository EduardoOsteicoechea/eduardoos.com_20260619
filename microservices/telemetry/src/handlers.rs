use crate::state::AppState;
use axum::{extract::State, Json};
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

pub async fn list_logs(State(state): State<AppState>) -> Json<Vec<FlightLogEntry>> {
    let logs = state.logs.read().await;
    Json(logs.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;
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
        let listed = list_logs(State(state)).await;
        assert_eq!(listed.0.len(), 1);
    }
}
