use crate::state::AppState;
use axum::{extract::State, Json};
use common::AppError;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct UploadRequest {
    pub key: String,
    pub content_type: String,
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "s3" }))
}

pub async fn upload(
    State(state): State<AppState>,
    Json(body): Json<UploadRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    Ok(Json(serde_json::json!({
        "bucket": state.bucket,
        "key": body.key,
        "content_type": body.content_type,
        "stored": true
    })))
}
