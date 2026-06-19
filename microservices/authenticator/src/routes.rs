//! Authenticator route table.

use crate::{handlers, middleware, state::AppState};
use axum::{
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

pub fn create_router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/register", post(handlers::register))
        .route("/login", post(handlers::login))
        .route("/verify-otp", post(handlers::verify_otp))
        .layer(from_fn_with_state(state.clone(), middleware::internal_auth));

    Router::new()
        .route("/health", get(handlers::health))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
