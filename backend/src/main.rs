//! # Backend API Gateway
//!
//! The gateway is the only public-facing Rust service. It injects correlation IDs,
//! signs internal tokens for downstream hops, and proxies requests to microservices.

mod handlers;
mod middleware;
mod routes;
mod state;

use state::AppState;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Bootstraps tracing, builds shared state, and listens on port 3000.
#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let state = AppState::from_env();
    let app = routes::create_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!(%addr, "backend gateway listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
