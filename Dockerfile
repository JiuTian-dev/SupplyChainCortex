# ===========================================
# 小家电供应链 MCP 数据管道 - Production Dockerfile
# ===========================================
# Multi-stage build for minimal production image.
# Uses Node.js (not Bun) for production stability.
#
# Build:  docker build -t supply-chain-mcp .
# Run:    docker run -p 3000:3000 --env-file .env supply-chain-mcp
# ===========================================

# ─── Stage 1: Install dependencies ─────────────────────────────────────
FROM node:20-alpine AS deps
LABEL stage="deps"

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* bun.lock* ./
COPY prisma ./prisma/

# Install dependencies using npm (Bun not available in production image)
# If package-lock.json exists, use npm ci; otherwise npm install
RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts; \
    else \
      npm install --ignore-scripts; \
    fi \
    && npx prisma generate

# ─── Stage 2: Build the Next.js app ────────────────────────────────────
FROM node:20-alpine AS builder
LABEL stage="builder"

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (in case schema changed)
RUN npx prisma generate

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the Next.js standalone output
# next.config.ts has output: "standalone"
RUN npm run build

# ─── Stage 3: Production image (minimal) ───────────────────────────────
FROM node:20-alpine AS runner
LABEL stage="runner"

WORKDIR /app

# Metadata labels
LABEL maintainer="Supply Chain MCP Team"
LABEL description="小家电供应链 MCP 数据管道 - Small Home Appliance Supply Chain MCP Data Pipeline"
LABEL version="0.7.0"
LABEL org.opencontainers.image.title="supply-chain-mcp"
LABEL org.opencontainers.image.description="Supply Chain Management Data Pipeline with MCP Integration"
LABEL org.opencontainers.image.version="0.7.0"

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install Python 3 + NumPy for MCP supply-chain math engines
RUN apk add --no-cache python3 py3-numpy

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy standalone build output (includes all needed files)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema and migrations for runtime DB operations
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy database switch script (useful for runtime DB config)
COPY --from=builder /app/scripts ./scripts

# Copy Python MCP math engines (used by supply-chain/[tool] endpoint)
COPY --from=builder /app/mcp-server ./mcp-server

# Create data directory for SQLite and set ownership
RUN mkdir -p /app/db && chown nextjs:nodejs /app/db

# Switch to non-root user
USER nextjs

# Expose the application port
EXPOSE 3000

# Health check: verify the HTTP server responds
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the standalone Next.js server
CMD ["node", "server.js"]
