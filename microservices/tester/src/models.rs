//! Test run records and step-level detail for QA analysis.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestStep {
    pub name: String,
    pub status: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunRecord {
    pub run_id: String,
    pub script: String,
    pub correlation_id: String,
    pub passed: bool,
    pub steps: Vec<TestStep>,
    pub started_at: DateTime<Utc>,
    pub finished_at: DateTime<Utc>,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize)]
pub struct RunRequest {
    pub script: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunResponse {
    pub run_id: String,
    pub script: String,
    pub correlation_id: String,
    pub passed: bool,
    pub steps: Vec<TestStep>,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunsSummary {
    pub total_runs: usize,
    pub passed: usize,
    pub failed: usize,
    pub pass_rate_percent: f64,
    pub runs: Vec<TestRunRecord>,
}
