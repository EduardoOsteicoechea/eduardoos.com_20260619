//! Zero-trust internal token gate for private microservice endpoints.

use crate::state::AppState;
use axum::extract::State;
use common::middleware::require_internal_token;

/// Axum layer adapter binding the service secret to the shared verifier.
pub async fn internal_auth(
    State(state): State<AppState>,
    req: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, axum::http::StatusCode> {
    require_internal_token(state.internal_secret.clone(), req, next).await
}
