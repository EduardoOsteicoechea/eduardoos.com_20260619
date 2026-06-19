use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::PaymentIntent;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub database_url: String,
    pub authenticator_url: String,
    pub telemetry_url: String,
    pub paypal_verify_url: String,
    pub paypal_hosted_button_id: String,
    pub default_plan_id: String,
    pub http: reqwest::Client,
    pub intents: Arc<RwLock<HashMap<String, PaymentIntent>>>,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "http://database:3000".into()),
            authenticator_url: std::env::var("AUTHENTICATOR_URL")
                .unwrap_or_else(|_| "http://authenticator:3000".into()),
            telemetry_url: std::env::var("TELEMETRY_URL")
                .unwrap_or_else(|_| "http://telemetry:3000".into()),
            paypal_verify_url: std::env::var("PAYPAL_IPN_VERIFY_URL").unwrap_or_else(|_| {
                "https://ipnpb.paypal.com/cgi-bin/webscr".into()
            }),
            paypal_hosted_button_id: std::env::var("PAYPAL_HOSTED_BUTTON_ID")
                .unwrap_or_else(|_| "QEVGD66SG7LXN".into()),
            default_plan_id: std::env::var("PAYPAL_PLAN_ID")
                .unwrap_or_else(|_| "subscription_monthly_basic".into()),
            http: reqwest::Client::new(),
            intents: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
