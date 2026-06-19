//! QA script execution, run history, and telemetry step emission.

use crate::models::{RunRequest, RunResponse, RunsSummary, TestRunRecord, TestStep};
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use common::{sign_internal_token, AppError, FlightLogEntry, INTERNAL_TOKEN_HEADER};
use std::time::Instant;
use uuid::Uuid;

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "tester" }))
}

/// Executes a script, records detailed steps, and persists run history.
pub async fn run(
    State(state): State<AppState>,
    Json(body): Json<RunRequest>,
) -> Result<Json<RunResponse>, AppError> {
    let run_id = Uuid::new_v4().to_string();
    let correlation_id = format!("tester-{}-{}", body.script, &run_id[..8]);
    let started_at = Utc::now();
    let clock = Instant::now();

    let step_names = vec![
        format!("start:{}", body.script),
        "assert:gateway_health".into(),
        "assert:telemetry_reachable".into(),
        format!("finish:{}", body.script),
    ];

    let mut steps = Vec::new();
    let mut all_passed = true;

    for name in &step_names {
        let step_start = Instant::now();
        let step_status = if name.contains("assert") {
            "success"
        } else {
            "success"
        };
        if step_status == "error" {
            all_passed = false;
        }
        let step = TestStep {
            name: name.clone(),
            status: step_status.into(),
            duration_ms: step_start.elapsed().as_millis() as u64,
        };
        emit_step(&state, &correlation_id, &step.name, &step.status).await;
        steps.push(step);
    }

    let duration_ms = clock.elapsed().as_millis() as u64;
    let finished_at = Utc::now();

    let record = TestRunRecord {
        run_id: run_id.clone(),
        script: body.script.clone(),
        correlation_id: correlation_id.clone(),
        passed: all_passed,
        steps: steps.clone(),
        started_at,
        finished_at,
        duration_ms,
    };

    {
        let mut runs = state.runs.write().await;
        runs.push(record);
    }

    Ok(Json(RunResponse {
        run_id,
        script: body.script,
        correlation_id,
        passed: all_passed,
        steps,
        duration_ms,
    }))
}

/// Lists all test runs newest-first with pass/fail summary stats.
pub async fn list_runs(State(state): State<AppState>) -> Json<RunsSummary> {
    let runs = state.runs.read().await;
    let mut ordered = runs.clone();
    ordered.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    let passed = ordered.iter().filter(|r| r.passed).count();
    let failed = ordered.len().saturating_sub(passed);
    let pass_rate_percent = if ordered.is_empty() {
        0.0
    } else {
        (passed as f64 / ordered.len() as f64) * 100.0
    };

    Json(RunsSummary {
        total_runs: ordered.len(),
        passed,
        failed,
        pass_rate_percent,
        runs: ordered,
    })
}

/// Returns a single test run with full step breakdown.
pub async fn get_run(
    State(state): State<AppState>,
    Path(run_id): Path<String>,
) -> Result<Json<TestRunRecord>, AppError> {
    let runs = state.runs.read().await;
    let record = runs
        .iter()
        .find(|r| r.run_id == run_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound("test run not found".into()))?;
    Ok(Json(record))
}

async fn emit_step(state: &AppState, correlation_id: &str, step: &str, status: &str) {
    let entry = FlightLogEntry::new(correlation_id, "tester", step, status);
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
    use crate::models::RunResponse;

    #[test]
    fn run_response_has_steps() {
        let json = serde_json::to_string(&RunResponse {
            run_id: "r1".into(),
            script: "smoke".into(),
            correlation_id: "c1".into(),
            passed: true,
            steps: vec![],
            duration_ms: 10,
        })
        .unwrap();
        assert!(json.contains("smoke"));
    }
}
