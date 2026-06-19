//! HMAC-based internal token for zero-trust service-to-service calls.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};

/// HTTP header name the gateway attaches when calling private microservices.
pub const INTERNAL_TOKEN_HEADER: &str = "x-internal-token";

type HmacSha256 = Hmac<Sha256>;

/// Signs a short-lived payload: `{unix_timestamp}:{correlation_id}`.
pub fn sign_internal_token(secret: &str, correlation_id: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let payload = format!("{timestamp}:{correlation_id}");
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    format!("{payload}:{signature}")
}

/// Verifies token freshness (60s window) and HMAC signature.
pub fn verify_internal_token(secret: &str, token: &str) -> bool {
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 3 {
        return false;
    }
    let timestamp: u64 = match parts[0].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if now.saturating_sub(timestamp) > 60 {
        return false;
    }
    let payload = format!("{}:{}", parts[0], parts[1]);
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    mac.verify_slice(&hex::decode(parts[2]).unwrap_or_default())
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_roundtrip() {
        let secret = "test-internal-secret-key-32chars!";
        let token = sign_internal_token(secret, "corr-abc");
        assert!(verify_internal_token(secret, &token));
    }

    #[test]
    fn rejects_wrong_secret() {
        let token = sign_internal_token("secret-a", "corr-1");
        assert!(!verify_internal_token("secret-b", &token));
    }
}
