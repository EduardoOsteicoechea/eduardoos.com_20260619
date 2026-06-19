//! Storage backends — in-memory for local Docker, DynamoDB for EC2 production.

use async_trait::async_trait;
use aws_sdk_dynamodb::types::AttributeValue;
use common::AppError;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

const KV_PARTITION: &str = "APP";
const DATA_ATTR: &str = "data";

/// Routes generic keys to the DynamoDB tables provisioned in AWS.
pub fn table_for_key(prefix: &str, key: &str) -> String {
    let suffix = if key.starts_with("user:") {
        "users"
    } else if key.starts_with("post:") {
        "posts"
    } else if key.starts_with("refresh:") {
        "refresh_tokens"
    } else {
        "catalog"
    };
    format!("{prefix}_{suffix}")
}

#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn put(&self, key: &str, value: serde_json::Value) -> Result<(), AppError>;
    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, AppError>;
}

#[derive(Clone)]
pub struct MemoryStorage {
    store: Arc<RwLock<HashMap<String, serde_json::Value>>>,
}

impl MemoryStorage {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl StorageBackend for MemoryStorage {
    async fn put(&self, key: &str, value: serde_json::Value) -> Result<(), AppError> {
        self.store.write().await.insert(key.to_string(), value);
        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, AppError> {
        Ok(self.store.read().await.get(key).cloned())
    }
}

pub struct DynamoStorage {
    client: aws_sdk_dynamodb::Client,
    table_prefix: String,
}

impl DynamoStorage {
    pub fn new(client: aws_sdk_dynamodb::Client, table_prefix: String) -> Self {
        Self {
            client,
            table_prefix,
        }
    }
}

#[async_trait]
impl StorageBackend for DynamoStorage {
    async fn put(&self, key: &str, value: serde_json::Value) -> Result<(), AppError> {
        let table = table_for_key(&self.table_prefix, key);
        let payload = serde_json::to_string(&value)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        self.client
            .put_item()
            .table_name(table)
            .item("PK", AttributeValue::S(KV_PARTITION.to_string()))
            .item("SK", AttributeValue::S(key.to_string()))
            .item(DATA_ATTR, AttributeValue::S(payload))
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("dynamodb put: {e}")))?;

        Ok(())
    }

    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, AppError> {
        let table = table_for_key(&self.table_prefix, key);

        let response = self
            .client
            .get_item()
            .table_name(table)
            .key("PK", AttributeValue::S(KV_PARTITION.to_string()))
            .key("SK", AttributeValue::S(key.to_string()))
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("dynamodb get: {e}")))?;

        let Some(item) = response.item else {
            return Ok(None);
        };

        let Some(data) = item.get(DATA_ATTR).and_then(|v| v.as_s().ok()) else {
            return Ok(None);
        };

        let value: serde_json::Value =
            serde_json::from_str(data).map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(Some(value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_payment_keys_to_catalog() {
        assert_eq!(
            table_for_key("eduardoos", "payment:abc"),
            "eduardoos_catalog"
        );
    }

    #[test]
    fn routes_user_keys_to_users_table() {
        assert_eq!(
            table_for_key("eduardoos", "user:abc@mail.com"),
            "eduardoos_users"
        );
    }

    #[tokio::test]
    async fn memory_roundtrip() {
        let store = MemoryStorage::new();
        store
            .put("payment:1", serde_json::json!({ "amount": 10 }))
            .await
            .unwrap();
        let value = store.get("payment:1").await.unwrap();
        assert_eq!(value.unwrap()["amount"], 10);
    }
}
