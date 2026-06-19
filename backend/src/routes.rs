//! Route table wiring middleware layers to handler functions.

use crate::{handlers, middleware, state::AppState};
use axum::{
    middleware::from_fn,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

/// Builds the complete gateway router with tracing and auth layers.
pub fn create_router(state: AppState) -> Router {
    let public = Router::new()
        .route("/health", get(handlers::health))
        .route("/api/auth/register", post(handlers::auth_register))
        .route("/api/auth/login", post(handlers::auth_login))
        .route("/api/auth/verify-otp", post(handlers::auth_verify_otp))
        .route("/api/logger", post(handlers::logger_proxy))
        .route("/api/logger/logs", get(handlers::logger_logs_proxy))
        .route("/api/logger/analytics", get(handlers::logger_analytics_proxy))
        .route(
            "/api/logger/trace/:correlation_id",
            get(handlers::logger_trace_proxy),
        )
        .route("/api/tester", post(handlers::tester_proxy))
        .route("/api/tester/", post(handlers::tester_proxy))
        .route("/api/tester/runs", get(handlers::tester_runs_proxy))
        .route(
            "/api/tester/runs/:run_id",
            get(handlers::tester_run_detail_proxy),
        )
        .route("/api/payments/intents", post(handlers::payments_create_intent))
        .route(
            "/api/payments/webhook/paypal",
            post(handlers::payments_paypal_webhook),
        )
        .route(
            "/api/payments/status/:intent_id",
            get(handlers::payments_get_status),
        );

    public
        .layer(TraceLayer::new_for_http())
        .layer(from_fn(middleware::auth_middleware))
        .layer(from_fn(middleware::correlation_middleware))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use crate::middleware::is_public_path;

    #[test]
    fn router_module_compiles_public_checks() {
        assert!(is_public_path("/api/auth/login"));
    }
}
