//! Axum middleware: correlation ID extraction and auth bypass rules.

use axum::{
    body::Body,
    http::{HeaderValue, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

pub const CORRELATION_HEADER: &str = "x-correlation-id";

/// Paths that bypass JWT authentication at the gateway layer.
pub const PUBLIC_PATHS: &[&str] = &[
    "/health",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/verify-otp",
    "/api/tester",
    "/api/logger",
    "/api/payments/intents",
    "/api/payments/webhook/paypal",
    "/api/payments/status",
];

/// Returns true when the request path is on the public allow-list.
pub fn is_public_path(path: &str) -> bool {
    PUBLIC_PATHS
        .iter()
        .any(|p| path == *p || path.starts_with(&format!("{p}/")))
}

/// Injects or propagates `X-Correlation-ID` on every inbound request.
pub async fn correlation_middleware(mut req: Request<Body>, next: Next) -> Response {
    let correlation_id = req
        .headers()
        .get(CORRELATION_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        req.headers_mut().insert(CORRELATION_HEADER, value);
    }

    tracing::Span::current().record("correlation_id", &correlation_id);
    next.run(req).await
}

/// Placeholder JWT gate — public routes pass through; others require Authorization header.
pub async fn auth_middleware(req: Request<Body>, next: Next) -> Result<Response, StatusCode> {
    let path = req.uri().path().to_string();
    if is_public_path(&path) {
        return Ok(next.run(req).await);
    }

    if req.headers().get("authorization").is_some() {
        return Ok(next.run(req).await);
    }

    Err(StatusCode::UNAUTHORIZED)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_paths_include_auth_routes() {
        assert!(is_public_path("/api/auth/login"));
        assert!(is_public_path("/api/auth/register"));
        assert!(is_public_path("/api/auth/verify-otp"));
        assert!(is_public_path("/api/logger"));
        assert!(is_public_path("/api/payments/intents"));
        assert!(!is_public_path("/api/private"));
    }
}
