use reqwest::Client;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub telemetry_url: String,
    pub http: Client,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            telemetry_url: std::env::var("TELEMETRY_URL")
                .unwrap_or_else(|_| "http://telemetry:3000".into()),
            http: Client::new(),
        }
    }
}
