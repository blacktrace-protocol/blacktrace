# Build stage
FROM rust:1.83-alpine AS builder

# Install build dependencies
RUN apk add --no-cache musl-dev

WORKDIR /build

# Copy all source files
COPY Cargo.toml ./
COPY src ./src

# Build for release
RUN cargo build --release

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/target/release/settlement-service .

# Run the service
CMD ["./settlement-service"]
