# Multi-stage Go service image — build arg SERVICE selects cmd/<SERVICE>.
ARG SERVICE=backend
FROM golang:1.23-alpine AS builder
ARG SERVICE
RUN apk add --no-cache git ca-certificates
WORKDIR /src
COPY go.mod go.sum ./
COPY pkg ./pkg
COPY cmd ./cmd
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/service ./cmd/${SERVICE}

FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates curl
WORKDIR /app
COPY --from=builder /out/service /app/service
EXPOSE 3000
CMD ["/app/service"]
