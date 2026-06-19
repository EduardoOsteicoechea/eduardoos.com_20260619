use crate::{handlers, middleware, state::AppState};
use axum::{
    middleware::from_fn_with_state,
    routing::{get, post},
    Router,
};
use tower_http::trace::TraceLayer;

pub fn create_router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/ingest", post(handlers::ingest))
        .route("/logs", get(handlers::list_logs))
        .route("/analytics", get(handlers::analytics))
        .route("/trace/{correlation_id}", get(handlers::trace_by_correlation))
        .layer(from_fn_with_state(state.clone(), middleware::internal_auth));

    Router::new()
        .route("/health", get(handlers::health))
        .merge(protected)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
