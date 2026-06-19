use axum::Json;
use common::AppError;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ChatRequest {
    pub session_id: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub session_id: String,
    pub reply: String,
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "chatbot" }))
}

pub async fn chat(Json(body): Json<ChatRequest>) -> Result<Json<ChatResponse>, AppError> {
    Ok(Json(ChatResponse {
        session_id: body.session_id,
        reply: format!("Echo: {}", body.message),
    }))
}
