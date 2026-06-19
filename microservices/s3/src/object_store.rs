//! S3 object storage — stub for local Docker, real AWS S3 on EC2.

use aws_sdk_s3::primitives::ByteStream;
use base64::{engine::general_purpose::STANDARD, Engine};
use common::AppError;

pub enum ObjectBackend {
    Stub,
    Aws(aws_sdk_s3::Client),
}

pub struct ObjectStore {
    pub backend: ObjectBackend,
    pub bucket: String,
    pub prefix: String,
}

impl ObjectStore {
    pub async fn from_env() -> Self {
        let bucket =
            std::env::var("S3_BUCKET").unwrap_or_else(|_| "eduardoos20260607".into());
        let prefix = std::env::var("S3_PREFIX").unwrap_or_else(|_| "media".into());
        let mode = std::env::var("S3_BACKEND").unwrap_or_else(|_| "stub".into());

        let backend = if mode == "aws" {
            let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into());
            let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
                .region(aws_config::Region::new(region))
                .load()
                .await;
            ObjectBackend::Aws(aws_sdk_s3::Client::new(&config))
        } else {
            ObjectBackend::Stub
        };

        Self {
            backend,
            bucket,
            prefix,
        }
    }

    pub fn backend_name(&self) -> &'static str {
        match self.backend {
            ObjectBackend::Stub => "stub",
            ObjectBackend::Aws(_) => "aws",
        }
    }

    fn object_key(&self, key: &str) -> String {
        let trimmed = key.trim_start_matches('/');
        if self.prefix.is_empty() {
            trimmed.to_string()
        } else {
            format!("{}/{}", self.prefix.trim_end_matches('/'), trimmed)
        }
    }

    pub async fn upload(
        &self,
        key: &str,
        content_type: &str,
        body: Option<&[u8]>,
    ) -> Result<String, AppError> {
        let object_key = self.object_key(key);

        match &self.backend {
            ObjectBackend::Stub => Ok(object_key),
            ObjectBackend::Aws(client) => {
                let bytes = body.unwrap_or_default();
                client
                    .put_object()
                    .bucket(&self.bucket)
                    .key(&object_key)
                    .content_type(content_type)
                    .body(ByteStream::from(bytes.to_vec()))
                    .send()
                    .await
                    .map_err(|e| AppError::Upstream(format!("s3 put: {e}")))?;
                Ok(object_key)
            }
        }
    }
}

pub fn decode_body(body_base64: Option<&str>) -> Result<Option<Vec<u8>>, AppError> {
    match body_base64 {
        None => Ok(None),
        Some(encoded) => STANDARD
            .decode(encoded)
            .map(Some)
            .map_err(|e| AppError::BadRequest(format!("invalid base64 body: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_prefixed_object_key() {
        let store = ObjectStore {
            backend: ObjectBackend::Stub,
            bucket: "eduardoos20260607".into(),
            prefix: "media".into(),
        };
        assert_eq!(store.object_key("avatar.png"), "media/avatar.png");
    }
}
