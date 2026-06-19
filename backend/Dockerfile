# Stage 1: Compile the Rust binary
FROM rust:latest AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY crates ./crates
COPY backend ./backend
COPY microservices ./microservices
RUN cargo build --release -p backend

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/backend /app/backend
EXPOSE 3000
CMD ["/app/backend"]
