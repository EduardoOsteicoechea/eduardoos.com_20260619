# Stage 1: Build the Astro static site
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve artifacts via nginx volume mount (compose copies dist)
FROM debian:bookworm-slim AS runtime
WORKDIR /srv/frontend
COPY --from=builder /app/dist ./dist
# Runtime container exists for compose artifact extraction; nginx serves the files.
