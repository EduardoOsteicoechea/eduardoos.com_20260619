use crate::object_store::decode_body;
use crate::state::AppState;
use axum::{extract::State, Json};
use common::AppError;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct UploadRequest {
    pub key: String,
    pub content_type: String,
    #[serde(default)]
    pub body_base64: Option<String>,
}

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "s3",
        "backend": state.store.backend_name(),
        "bucket": state.store.bucket
    }))
}

pub async fn upload(
    State(state): State<AppState>,
    Json(body): Json<UploadRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let bytes = decode_body(body.body_base64.as_deref())?;
    let object_key = state
        .store
        .upload(&body.key, &body.content_type, bytes.as_deref())
        .await?;

    Ok(Json(serde_json::json!({
        "bucket": state.store.bucket,
        "key": object_key,
        "content_type": body.content_type,
        "stored": true
    })))
}
