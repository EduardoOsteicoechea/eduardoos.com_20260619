use crate::{handlers, middleware, state::AppState};
use axum::{
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

pub fn create_router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/intents", post(handlers::create_intent))
        .route("/status/{intent_id}", get(handlers::get_status))
        .layer(from_fn_with_state(state.clone(), middleware::internal_auth));

    Router::new()
        .route("/health", get(handlers::health))
        .route("/webhook/paypal", post(handlers::paypal_ipn))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
