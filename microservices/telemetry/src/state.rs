use common::FlightLogEntry;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub logs: Arc<RwLock<Vec<FlightLogEntry>>>,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            logs: Arc::new(RwLock::new(Vec::new())),
        }
    }
}
