use crate::storage::{DynamoStorage, MemoryStorage, StorageBackend};
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub internal_secret: String,
    pub backend: Arc<dyn StorageBackend>,
    pub backend_name: String,
}

impl AppState {
    pub async fn from_env() -> Self {
        let internal_secret = std::env::var("INTERNAL_SERVICE_SECRET")
            .unwrap_or_else(|_| "dev-internal-secret".into());
        let backend_mode = std::env::var("DATABASE_BACKEND").unwrap_or_else(|_| "memory".into());

        let (backend, backend_name): (Arc<dyn StorageBackend>, String) =
            if backend_mode == "dynamodb" {
                let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into());
                let prefix =
                    std::env::var("DYNAMODB_TABLE_PREFIX").unwrap_or_else(|_| "eduardoos".into());
                let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
                    .region(aws_config::Region::new(region))
                    .load()
                    .await;
                let client = aws_sdk_dynamodb::Client::new(&config);
                (
                    Arc::new(DynamoStorage::new(client, prefix)),
                    "dynamodb".into(),
                )
            } else {
                (Arc::new(MemoryStorage::new()), "memory".into())
            };

        Self {
            internal_secret,
            backend,
            backend_name,
        }
    }
}
