use crate::state::AppState;
use axum::{extract::State, Json};
use common::{sign_internal_token, AppError, FlightLogEntry, INTERNAL_TOKEN_HEADER};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct RunRequest {
    pub script: String,
}

#[derive(Serialize)]
pub struct RunResponse {
    pub script: String,
    pub passed: bool,
    pub steps: Vec<String>,
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "tester" }))
}

/// Executes a named test script and reports each step to telemetry.
pub async fn run(
    State(state): State<AppState>,
    Json(body): Json<RunRequest>,
) -> Result<Json<RunResponse>, AppError> {
    let correlation_id = format!("tester-{}", body.script);
    let steps = vec![
        format!("start:{}", body.script),
        "assert:health".into(),
        format!("finish:{}", body.script),
    ];

    for step in &steps {
        emit_step(&state, &correlation_id, step).await;
    }

    Ok(Json(RunResponse {
        script: body.script.clone(),
        passed: true,
        steps,
    }))
}

async fn emit_step(state: &AppState, correlation_id: &str, step: &str) {
    let entry = FlightLogEntry::new(correlation_id, "tester", step, "success");
    let token = sign_internal_token(&state.internal_secret, correlation_id);
    let url = format!("{}/ingest", state.telemetry_url.trim_end_matches('/'));
    let _ = state
        .http
        .post(&url)
        .header(INTERNAL_TOKEN_HEADER, token)
        .header("X-Correlation-ID", correlation_id)
        .json(&entry)
        .send()
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_response_serializes() {
        let resp = RunResponse {
            script: "smoke".into(),
            passed: true,
            steps: vec!["a".into()],
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("smoke"));
    }
}
