use crate::{pdf::build_sample_pdf, state::AppState};
use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode},
    response::Response,
    Json,
};
use common::AppError;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct GenerateRequest {
    pub title: String,
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "documents" }))
}

pub async fn generate_pdf(
    State(_state): State<AppState>,
    Json(body): Json<GenerateRequest>,
) -> Result<Response, AppError> {
    let bytes = build_sample_pdf(&body.title);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(e.to_string()))
}
