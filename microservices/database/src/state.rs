use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub store: Arc<RwLock<HashMap<String, serde_json::Value>>>,
}

impl AppState {
    pub fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}
