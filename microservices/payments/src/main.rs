//! # Payments Microservice
//!
//! Creates payment intents linked to registered users, stores records in the
//! database service, and processes PayPal IPN callbacks to confirm payments.

mod handlers;
mod middleware;
mod models;
mod paypal;
mod repository;
mod routes;
mod state;

use state::AppState;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let state = AppState::from_env();
    let app = routes::create_router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!(%addr, "payments service listening");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
