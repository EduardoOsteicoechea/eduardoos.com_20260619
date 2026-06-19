//! Payment intent and PayPal IPN record types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Lifecycle status for a payment intent tied to a registered user email.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
    Cancelled,
}

/// A payment intent created before the user clicks the PayPal hosted button.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentIntent {
    pub intent_id: String,
    pub user_email: String,
    pub plan_id: String,
    pub hosted_button_id: String,
    pub currency: String,
    pub status: PaymentStatus,
    pub paypal_txn_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl PaymentIntent {
    pub fn new(
        intent_id: impl Into<String>,
        user_email: impl Into<String>,
        plan_id: impl Into<String>,
        hosted_button_id: impl Into<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            intent_id: intent_id.into(),
            user_email: user_email.into(),
            plan_id: plan_id.into(),
            hosted_button_id: hosted_button_id.into(),
            currency: "USD".into(),
            status: PaymentStatus::Pending,
            paypal_txn_id: None,
            created_at: now,
            updated_at: now,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateIntentRequest {
    pub email: String,
    pub plan_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateIntentResponse {
    pub intent_id: String,
    pub email: String,
    pub plan_id: String,
    pub hosted_button_id: String,
    pub currency: String,
}

#[derive(Debug, Serialize)]
pub struct PaymentStatusResponse {
    pub intent_id: String,
    pub email: String,
    pub plan_id: String,
    pub status: PaymentStatus,
    pub paypal_txn_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intent_starts_pending() {
        let intent = PaymentIntent::new("id-1", "user@example.com", "basic_monthly", "BTN");
        assert_eq!(intent.status, PaymentStatus::Pending);
    }
}
