//! Shared application state loaded from Docker Compose environment variables.

use common::TelemetryClient;
use reqwest::Client;

/// Holds secrets, service URLs, and reusable HTTP clients for the gateway.
#[derive(Clone)]
pub struct AppState {
    pub jwt_secret: String,
    pub internal_secret: String,
    pub http: Client,
    pub telemetry: TelemetryClient,
    pub authenticator_url: String,
    pub telemetry_url: String,
    pub tester_url: String,
    pub database_url: String,
    pub documents_url: String,
    pub s3_url: String,
    pub chatbot_url: String,
}

impl AppState {
    /// Reads configuration from environment with sensible Docker Compose defaults.
    pub fn from_env() -> Self {
        Self {
            jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-jwt-secret".into()),
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            http: Client::new(),
            telemetry: TelemetryClient::new(
                std::env::var("TELEMETRY_URL").unwrap_or_else(|_| "http://telemetry:3000".into()),
            ),
            authenticator_url: std::env::var("AUTHENTICATOR_URL")
                .unwrap_or_else(|_| "http://authenticator:3000".into()),
            telemetry_url: std::env::var("TELEMETRY_URL")
                .unwrap_or_else(|_| "http://telemetry:3000".into()),
            tester_url: std::env::var("TESTER_URL")
                .unwrap_or_else(|_| "http://tester:3000".into()),
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "http://database:3000".into()),
            documents_url: std::env::var("DOCUMENTS_URL")
                .unwrap_or_else(|_| "http://documents:3000".into()),
            s3_url: std::env::var("S3_URL").unwrap_or_else(|_| "http://s3:3000".into()),
            chatbot_url: std::env::var("CHATBOT_URL")
                .unwrap_or_else(|_| "http://chatbot:3000".into()),
        }
    }
}
