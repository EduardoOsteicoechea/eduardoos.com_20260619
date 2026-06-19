use crate::state::AppState;
use axum::{extract::State, Json};
use common::AppError;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct PutRequest {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Serialize)]
pub struct GetResponse {
    pub key: String,
    pub value: Option<serde_json::Value>,
}

pub async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "status": "ok",
        "service": "database",
        "backend": state.backend_name
    }))
}

pub async fn put(
    State(state): State<AppState>,
    Json(body): Json<PutRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    state.backend.put(&body.key, body.value).await?;
    Ok(Json(serde_json::json!({ "stored": body.key })))
}

pub async fn get(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<GetResponse>, AppError> {
    let key = body
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::BadRequest("key required".into()))?
        .to_string();
    let value = state.backend.get(&key).await?;
    Ok(Json(GetResponse {
        key: key.clone(),
        value,
    }))
}
