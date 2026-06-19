//! HTTP handlers for health checks, auth proxying, and observability routes.

use crate::middleware::CORRELATION_HEADER;
use crate::state::AppState;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use common::{
    sign_internal_token, AppError, FlightLogEntry, INTERNAL_TOKEN_HEADER, TelemetryClient,
};
use serde_json::Value;

/// Liveness probe used by Docker health checks and the tester service.
pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok", "service": "backend" }))
}

/// Proxies registration to the authenticator microservice.
pub async fn auth_register(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    proxy_auth(&state, "/register", headers, body).await
}

/// Proxies login to the authenticator microservice.
pub async fn auth_login(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    proxy_auth(&state, "/login", headers, body).await
}

/// Proxies OTP verification to the authenticator microservice.
pub async fn auth_verify_otp(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    proxy_auth(&state, "/verify-otp", headers, body).await
}

/// Public proxy to telemetry ingestion (frontend flight logs).
pub async fn logger_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    emit_gateway_log(&state.telemetry, &correlation_id, "logger.proxy", "started").await;

    let url = format!("{}/ingest", state.telemetry_url.trim_end_matches('/'));
    let response = signed_post(&state, &url, &correlation_id, body).await?;

    emit_gateway_log(&state.telemetry, &correlation_id, "logger.proxy", "success").await;
    Ok(response)
}

/// Public proxy to the tester QA engine.
pub async fn tester_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!("{}/run", state.tester_url.trim_end_matches('/'));
    signed_post(&state, &url, &correlation_id, body).await
}

async fn proxy_auth(
    state: &AppState,
    path: &str,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    emit_gateway_log(
        &state.telemetry,
        &correlation_id,
        &format!("auth{path}"),
        "started",
    )
    .await;

    let url = format!(
        "{}{}",
        state.authenticator_url.trim_end_matches('/'),
        path
    );
    let response = signed_post(state, &url, &correlation_id, body).await?;

    emit_gateway_log(
        &state.telemetry,
        &correlation_id,
        &format!("auth{path}"),
        "success",
    )
    .await;
    Ok(response)
}

async fn signed_post(
    state: &AppState,
    url: &str,
    correlation_id: &str,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let token = sign_internal_token(&state.internal_secret, correlation_id);
    let response = state
        .http
        .post(url)
        .header(CORRELATION_HEADER, correlation_id)
        .header(INTERNAL_TOKEN_HEADER, token)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    Ok((status, bytes))
}

fn extract_correlation(headers: &HeaderMap) -> String {
    headers
        .get(CORRELATION_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

async fn emit_gateway_log(
    telemetry: &TelemetryClient,
    correlation_id: &str,
    event: &str,
    status: &str,
) {
    let entry = FlightLogEntry::new(correlation_id, "backend", event, status);
    telemetry.emit(&entry, correlation_id).await;
}

/// Generic JSON proxy helper for future protected routes.
pub async fn proxy_json(
    state: &AppState,
    base_url: &str,
    path: &str,
    correlation_id: &str,
    body: Option<Value>,
) -> Result<Value, AppError> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let token = sign_internal_token(&state.internal_secret, correlation_id);
    let mut req = state.http.post(&url).header(CORRELATION_HEADER, correlation_id).header(INTERNAL_TOKEN_HEADER, token);
    if let Some(json) = body {
        req = req.json(&json);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;
    resp.json()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correlation_defaults_to_unknown() {
        let headers = HeaderMap::new();
        assert_eq!(extract_correlation(&headers), "unknown");
    }
}
