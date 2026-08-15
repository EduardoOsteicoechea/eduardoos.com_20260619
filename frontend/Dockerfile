FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM debian:bookworm-slim AS runtime
WORKDIR /srv/frontend
COPY --from=builder /app/dist ./dist
