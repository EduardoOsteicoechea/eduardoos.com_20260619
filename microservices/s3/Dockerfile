FROM rust:latest AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY crates ./crates
COPY backend ./backend
COPY microservices ./microservices
RUN cargo build --release -p s3

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/s3 /app/s3
EXPOSE 3000
CMD ["/app/s3"]
