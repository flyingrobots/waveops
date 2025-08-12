# Multi-stage Docker build for WaveOps Enterprise Scaling
FROM node:18-alpine AS base

# Install dependencies needed for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies for build
RUN npm ci --only=production=false && npm cache clean --force

# Build stage
FROM base AS builder

# Copy source code
COPY src/ ./src/
COPY schemas/ ./schemas/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S waveops && \
    adduser -S waveops -u 1001 -G waveops

# Install runtime dependencies only
RUN apk add --no-cache \
    ca-certificates \
    curl \
    tini

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/*

# Copy built application
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/schemas ./schemas/

# Copy configuration files
COPY deployment/docker/config/ ./config/

# Set ownership
RUN chown -R waveops:waveops /app

# Switch to non-root user
USER waveops

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose port
EXPOSE 3000

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command
CMD ["node", "dist/index.js"]

# Labels for enterprise deployment
LABEL org.opencontainers.image.title="WaveOps Enterprise Coordinator"
LABEL org.opencontainers.image.description="Enterprise-grade GPU-style wave coordination system"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="WaveOps Team"
LABEL org.opencontainers.image.source="https://github.com/waveops/waveops"