use crate::object_store::ObjectStore;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub store: Arc<ObjectStore>,
}

impl AppState {
    pub async fn from_env() -> Self {
        Self {
            internal_secret: std::env::var("INTERNAL_SERVICE_SECRET")
                .unwrap_or_else(|_| "dev-internal-secret".into()),
            store: Arc::new(ObjectStore::from_env().await),
        }
    }
}
