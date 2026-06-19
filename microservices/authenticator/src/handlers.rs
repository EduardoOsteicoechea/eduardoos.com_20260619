//! Registration, login, and OTP verification handlers with SMTP via lettre.

use crate::state::{AppState, UserRecord};
use axum::{extract::State, Json};
use common::{AppError, FlightLogEntry, TelemetryClient};
use jsonwebtoken::{encode, EncodingKey, Header};
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
pub struct AuthRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct OtpRequest {
    pub email: String,
    pub otp: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Serialize)]
struct Claims {
    sub: String,
    exp: usize,
}

/// Creates a user record and emails a 6-digit OTP.
pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    if !body.email.contains('@') {
        return Err(AppError::BadRequest("invalid email".into()));
    }

    let otp = generate_otp();
    {
        let mut users = state.users.write().await;
        users.insert(
            body.email.clone(),
            UserRecord {
                email: body.email.clone(),
                password_hash: hash_password(&body.password),
                verified: false,
            },
        );
    }
    {
        let mut otps = state.otps.write().await;
        otps.insert(body.email.clone(), otp.clone());
    }

    send_otp_email(&state, &body.email, &otp).await?;
    report(&state, "auth.register", "success", &body.email).await;

    Ok(Json(AuthResponse {
        message: "OTP sent to email".into(),
        token: None,
    }))
}

/// Validates credentials and issues a JWT for verified users.
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<AuthRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let users = state.users.read().await;
    let user = users
        .get(&body.email)
        .ok_or_else(|| AppError::Unauthorized("unknown user".into()))?;

    if user.password_hash != hash_password(&body.password) {
        return Err(AppError::Unauthorized("invalid password".into()));
    }
    if !user.verified {
        return Err(AppError::Unauthorized("email not verified".into()));
    }

    let token = issue_jwt(&state.jwt_secret, &body.email)?;
    report(&state, "auth.login", "success", &body.email).await;

    Ok(Json(AuthResponse {
        message: "Login successful".into(),
        token: Some(token),
    }))
}

/// Confirms OTP and marks the account verified.
pub async fn verify_otp(
    State(state): State<AppState>,
    Json(body): Json<OtpRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let expected = {
        let otps = state.otps.read().await;
        otps.get(&body.email).cloned()
    }
    .ok_or_else(|| AppError::BadRequest("no pending OTP".into()))?;

    if expected != body.otp {
        return Err(AppError::Unauthorized("invalid OTP".into()));
    }

    {
        let mut users = state.users.write().await;
        if let Some(user) = users.get_mut(&body.email) {
            user.verified = true;
        }
    }
    {
        let mut otps = state.otps.write().await;
        otps.remove(&body.email);
    }

    let token = issue_jwt(&state.jwt_secret, &body.email)?;
    report(&state, "auth.verify-otp", "success", &body.email).await;

    Ok(Json(AuthResponse {
        message: "Email verified".into(),
        token: Some(token),
    }))
}

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "service": "authenticator" }))
}

fn generate_otp() -> String {
    let mut rng = rand::rng();
    format!("{:06}", rng.random_range(0..1_000_000))
}

fn hash_password(password: &str) -> String {
    format!("sha256:{password}")
}

fn issue_jwt(secret: &str, email: &str) -> Result<String, AppError> {
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as usize
        + 3600;
    encode(
        &Header::default(),
        &Claims {
            sub: email.to_string(),
            exp,
        },
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.to_string()))
}

async fn send_otp_email(state: &AppState, to: &str, otp: &str) -> Result<(), AppError> {
    if state.smtp_pass.is_empty() {
        tracing::warn!(email = %to, otp = %otp, "SMTP_PASS unset — OTP logged only");
        return Ok(());
    }

    let email = Message::builder()
        .from(state.smtp_user.parse::<Mailbox>().map_err(|e| AppError::Internal(e.to_string()))?)
        .to(to.parse::<Mailbox>().map_err(|e| AppError::Internal(e.to_string()))?)
        .subject("Your Eduardo OS verification code")
        .body(format!("Your one-time code is: {otp}"))
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let creds = Credentials::new(state.smtp_user.clone(), state.smtp_pass.clone());
    let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay("smtp.gmail.com")
        .map_err(|e| AppError::Internal(e.to_string()))?
        .credentials(creds)
        .build();

    mailer
        .send(email)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

async fn report(_state: &AppState, event: &str, status: &str, email: &str) {
    let telemetry = TelemetryClient::new(
        std::env::var("TELEMETRY_URL").unwrap_or_else(|_| "http://telemetry:3000".into()),
    );
    let entry = FlightLogEntry::new(email, "authenticator", event, status);
    telemetry.emit(&entry, email).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn otp_is_six_digits() {
        let otp = generate_otp();
        assert_eq!(otp.len(), 6);
    }

    #[test]
    fn password_hash_is_deterministic() {
        assert_eq!(hash_password("abc"), hash_password("abc"));
    }
}
