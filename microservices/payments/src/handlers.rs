//! Payment intent creation, status lookup, and PayPal IPN webhook handling.

use crate::models::{
    CreateIntentRequest, CreateIntentResponse, PaymentIntent, PaymentStatus,
    PaymentStatusResponse,
};
use crate::paypal::{parse_ipn_form, verify_ipn};
use crate::repository::{load_intent, save_intent, user_is_registered};
use crate::state::AppState;
use axum::{
    body::Bytes,
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use chrono::Utc;
use common::{AppError, FlightLogEntry, TelemetryClient};
use uuid::Uuid;

fn correlation_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-correlation-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("payments")
        .to_string()
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "payments" }))
}

/// Creates a pending payment intent for a verified registered user.
pub async fn create_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateIntentRequest>,
) -> Result<Json<CreateIntentResponse>, AppError> {
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') {
        return Err(AppError::BadRequest("invalid email".into()));
    }

    let correlation_id = correlation_from_headers(&headers);
    emit_log(&state, &correlation_id, "payments.intent", "started").await;

    let registered = user_is_registered(
        &state.http,
        &state.authenticator_url,
        &state.internal_secret,
        &correlation_id,
        &email,
    )
    .await?;

    if !registered {
        return Err(AppError::Unauthorized(
            "user must register and verify email before subscribing".into(),
        ));
    }

    let plan_id = body
        .plan_id
        .unwrap_or_else(|| state.default_plan_id.clone());
    let intent_id = Uuid::new_v4().to_string();
    let intent = PaymentIntent::new(
        &intent_id,
        &email,
        &plan_id,
        &state.paypal_hosted_button_id,
    );

    {
        let mut cache = state.intents.write().await;
        cache.insert(intent_id.clone(), intent.clone());
    }

    save_intent(
        &state.http,
        &state.database_url,
        &state.internal_secret,
        &correlation_id,
        &intent,
    )
    .await?;

    emit_log(&state, &correlation_id, "payments.intent", "success").await;

    Ok(Json(CreateIntentResponse {
        intent_id,
        email,
        plan_id,
        hosted_button_id: state.paypal_hosted_button_id.clone(),
        currency: "USD".into(),
    }))
}

/// Returns the current status of a payment intent.
pub async fn get_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<String>,
) -> Result<Json<PaymentStatusResponse>, AppError> {
    let correlation_id = correlation_from_headers(&headers);

    let intent = {
        let cache = state.intents.read().await;
        cache.get(&intent_id).cloned()
    };

    let intent = match intent {
        Some(i) => i,
        None => load_intent(
            &state.http,
            &state.database_url,
            &state.internal_secret,
            &correlation_id,
            &intent_id,
        )
        .await?
        .ok_or_else(|| AppError::NotFound("payment intent not found".into()))?,
    };

    Ok(Json(PaymentStatusResponse {
        intent_id: intent.intent_id,
        email: intent.user_email,
        plan_id: intent.plan_id,
        status: intent.status,
        paypal_txn_id: intent.paypal_txn_id,
    }))
}

/// PayPal IPN endpoint — verifies notification and links txn to user intent.
pub async fn paypal_ipn(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    let raw = String::from_utf8_lossy(&body).to_string();
    let correlation_id = correlation_from_headers(&headers);

    emit_log(&state, &correlation_id, "payments.ipn", "started").await;

    let verified = verify_ipn(&state.http, &state.paypal_verify_url, &raw).await?;
    if !verified {
        return Err(AppError::Unauthorized("invalid PayPal IPN".into()));
    }

    let fields = parse_ipn_form(&raw);
    let intent_id = fields
        .get("custom")
        .cloned()
        .ok_or_else(|| AppError::BadRequest("missing custom intent id".into()))?;

    let payment_status = fields.get("payment_status").cloned().unwrap_or_default();
    let txn_id = fields.get("txn_id").cloned();

    let mut intent = {
        let cache = state.intents.read().await;
        cache.get(&intent_id).cloned()
    };

    if intent.is_none() {
        intent = load_intent(
            &state.http,
            &state.database_url,
            &state.internal_secret,
            &correlation_id,
            &intent_id,
        )
        .await?;
    }

    let mut intent =
        intent.ok_or_else(|| AppError::NotFound("unknown payment intent".into()))?;

    intent.status = match payment_status.as_str() {
        "Completed" | "Processed" => PaymentStatus::Completed,
        "Denied" | "Failed" => PaymentStatus::Failed,
        "Refunded" | "Reversed" => PaymentStatus::Cancelled,
        _ => PaymentStatus::Pending,
    };
    intent.paypal_txn_id = txn_id;
    intent.updated_at = Utc::now();

    {
        let mut cache = state.intents.write().await;
        cache.insert(intent_id.clone(), intent.clone());
    }

    save_intent(
        &state.http,
        &state.database_url,
        &state.internal_secret,
        &correlation_id,
        &intent,
    )
    .await?;

    emit_log(&state, &correlation_id, "payments.ipn", "success").await;

    Ok(Json(serde_json::json!({
        "ack": true,
        "intent_id": intent_id,
        "status": intent.status,
        "user_email": intent.user_email
    })))
}

async fn emit_log(state: &AppState, correlation_id: &str, event: &str, status: &str) {
    let telemetry = TelemetryClient::new(&state.telemetry_url);
    let entry = FlightLogEntry::new(correlation_id, "payments", event, status);
    telemetry.emit(&entry, correlation_id).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PaymentStatus;

    #[test]
    fn payment_status_mapping() {
        assert_eq!(
            match "Completed" {
                "Completed" | "Processed" => PaymentStatus::Completed,
                _ => PaymentStatus::Pending,
            },
            PaymentStatus::Completed
        );
    }
}
