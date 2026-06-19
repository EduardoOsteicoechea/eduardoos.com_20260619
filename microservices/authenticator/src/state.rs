//! In-memory user store, OTP cache, and SMTP configuration.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct UserRecord {
    pub email: String,
    pub password_hash: String,
    pub verified: bool,
}

#[derive(Clone)]
pub struct AppState {
    pub jwt_secret: String,
    pub internal_secret: String,
    pub smtp_user: String,
    pub smtp_pass: String,
    pub users: Arc<RwLock<HashMap<String, UserRecord>>>,
    pub otps: Arc<RwLock<HashMap<String, String>>>,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-jwt-secret".into()),
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            smtp_user: std::env::var("SMTP_USER")
                .unwrap_or_else(|_| "eduardooost@gmail.com".into()),
            smtp_pass: std::env::var("SMTP_PASS").unwrap_or_default(),
            users: Arc::new(RwLock::new(HashMap::new())),
            otps: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
