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

/// Lists ingested flight logs with optional query string passthrough.
pub async fn logger_logs_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let qs: String = query
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    let url = if qs.is_empty() {
        format!("{}/logs", state.telemetry_url.trim_end_matches('/'))
    } else {
        format!("{}/logs?{qs}", state.telemetry_url.trim_end_matches('/'))
    };
    signed_get(&state, &url, &correlation_id).await
}

/// Returns aggregated flight log analytics for dashboard KPIs.
pub async fn logger_analytics_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!("{}/analytics", state.telemetry_url.trim_end_matches('/'));
    signed_get(&state, &url, &correlation_id).await
}

/// Returns the full distributed trace for one correlation ID.
pub async fn logger_trace_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(correlation_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let corr = extract_correlation(&headers);
    let url = format!(
        "{}/trace/{}",
        state.telemetry_url.trim_end_matches('/'),
        correlation_id
    );
    signed_get(&state, &url, &corr).await
}

/// Lists all QA test runs with summary statistics.
pub async fn tester_runs_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!("{}/runs", state.tester_url.trim_end_matches('/'));
    signed_get(&state, &url, &correlation_id).await
}

/// Returns detailed step breakdown for a single test run.
pub async fn tester_run_detail_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(run_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!("{}/runs/{}", state.tester_url.trim_end_matches('/'), run_id);
    signed_get(&state, &url, &correlation_id).await
}

/// Creates a PayPal payment intent linked to a verified user email.
pub async fn payments_create_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    emit_gateway_log(
        &state.telemetry,
        &correlation_id,
        "payments.intent.proxy",
        "started",
    )
    .await;
    let url = format!("{}/intents", state.payments_url.trim_end_matches('/'));
    let response = signed_post(&state, &url, &correlation_id, body).await?;
    emit_gateway_log(
        &state.telemetry,
        &correlation_id,
        "payments.intent.proxy",
        "success",
    )
    .await;
    Ok(response)
}

/// Returns payment intent status for polling after PayPal checkout.
pub async fn payments_get_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(intent_id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!(
        "{}/status/{}",
        state.payments_url.trim_end_matches('/'),
        intent_id
    );
    let token = sign_internal_token(&state.internal_secret, &correlation_id);
    let response = state
        .http
        .get(&url)
        .header(CORRELATION_HEADER, &correlation_id)
        .header(INTERNAL_TOKEN_HEADER, token)
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

/// Public PayPal IPN webhook proxy (no JWT, PayPal server-to-server).
pub async fn payments_paypal_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let correlation_id = extract_correlation(&headers);
    let url = format!(
        "{}/webhook/paypal",
        state.payments_url.trim_end_matches('/')
    );
    let response = state
        .http
        .post(&url)
        .header(CORRELATION_HEADER, &correlation_id)
        .header(
            "content-type",
            headers
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/x-www-form-urlencoded"),
        )
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

async fn signed_get(
    state: &AppState,
    url: &str,
    correlation_id: &str,
) -> Result<impl IntoResponse, AppError> {
    let token = sign_internal_token(&state.internal_secret, correlation_id);
    let response = state
        .http
        .get(url)
        .header(CORRELATION_HEADER, correlation_id)
        .header(INTERNAL_TOKEN_HEADER, token)
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
