# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 loop

USER loop

ENV NODE_ENV=production

# Temporal configuration (override via docker-compose or k8s)
ENV TEMPORAL_ADDRESS=localhost:7233
ENV TEMPORAL_NAMESPACE=loop
ENV OTEL_SERVICE_NAME=loop-processor-stripe

CMD ["node", "dist/worker.js"]
