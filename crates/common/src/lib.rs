//! # Common Crate — Shared Zero Trust Primitives
//!
//! This crate centralizes error types, internal token signing/verification,
//! and the telemetry flight-log contract used by every Rust service.

pub mod error;
pub mod flight_log;
pub mod internal_token;
pub mod middleware;
pub mod telemetry;

pub use error::AppError;
pub use flight_log::FlightLogEntry;
pub use internal_token::{sign_internal_token, verify_internal_token, INTERNAL_TOKEN_HEADER};
pub use telemetry::TelemetryClient;
