#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub bucket: String,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            bucket: std::env::var("S3_BUCKET").unwrap_or_else(|_| "eduardoos-default".into()),
        }
    }
}
