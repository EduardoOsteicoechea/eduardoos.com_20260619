//! Persistence helpers that delegate storage to the database microservice.

use crate::models::PaymentIntent;
use common::{sign_internal_token, AppError, INTERNAL_TOKEN_HEADER};
use reqwest::Client;
use serde_json::json;

/// Writes a payment intent JSON blob to the database service.
pub async fn save_intent(
    client: &Client,
    database_url: &str,
    internal_secret: &str,
    correlation_id: &str,
    intent: &PaymentIntent,
) -> Result<(), AppError> {
    let key = format!("payment:{}", intent.intent_id);
    let url = format!("{}/put", database_url.trim_end_matches('/'));
    let token = sign_internal_token(internal_secret, correlation_id);

    client
        .post(&url)
        .header(INTERNAL_TOKEN_HEADER, token)
        .header("X-Correlation-ID", correlation_id)
        .json(&json!({ "key": key, "value": intent }))
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    Ok(())
}

/// Loads a payment intent from the database service.
pub async fn load_intent(
    client: &Client,
    database_url: &str,
    internal_secret: &str,
    correlation_id: &str,
    intent_id: &str,
) -> Result<Option<PaymentIntent>, AppError> {
    let key = format!("payment:{intent_id}");
    let url = format!("{}/get", database_url.trim_end_matches('/'));
    let token = sign_internal_token(internal_secret, correlation_id);

    let response = client
        .post(&url)
        .header(INTERNAL_TOKEN_HEADER, token)
        .header("X-Correlation-ID", correlation_id)
        .json(&json!({ "key": key }))
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    if body.get("value").is_none() || body["value"].is_null() {
        return Ok(None);
    }

    let intent: PaymentIntent = serde_json::from_value(body["value"].clone())
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Some(intent))
}

/// Checks whether a verified user exists in the authenticator service.
pub async fn user_is_registered(
    client: &Client,
    authenticator_url: &str,
    internal_secret: &str,
    correlation_id: &str,
    email: &str,
) -> Result<bool, AppError> {
    let url = format!(
        "{}/user-exists",
        authenticator_url.trim_end_matches('/')
    );
    let token = sign_internal_token(internal_secret, correlation_id);

    let response = client
        .post(&url)
        .header(INTERNAL_TOKEN_HEADER, token)
        .header("X-Correlation-ID", correlation_id)
        .json(&json!({ "email": email }))
        .send()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AppError::Upstream(e.to_string()))?;

    Ok(body
        .get("verified")
        .and_then(|v| v.as_bool())
        .unwrap_or(false))
}
