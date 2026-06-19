//! Axum middleware for validating gateway-signed internal tokens.

use crate::internal_token::{verify_internal_token, INTERNAL_TOKEN_HEADER};
use axum::{
    body::Body,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};

/// Rejects requests missing a valid `X-Internal-Token` header.
pub async fn require_internal_token(
    secret: String,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = req
        .headers()
        .get(INTERNAL_TOKEN_HEADER)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if verify_internal_token(&secret, token) {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[cfg(test)]
mod middleware_tests {
    use super::*;
    use crate::internal_token::sign_internal_token;

    #[test]
    fn token_roundtrip_for_middleware() {
        let secret = "svc-secret";
        let token = sign_internal_token(secret, "corr");
        assert!(verify_internal_token(secret, &token));
    }
}
