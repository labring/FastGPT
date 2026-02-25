# ==================== Base ====================
FROM oven/bun:1 AS base
WORKDIR /app

# ==================== Install All Dependencies ====================
FROM base AS deps

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# ==================== Build ====================
FROM deps AS build

# Copy source code and config
COPY src ./src
COPY tsconfig.json ./

# Build the application
RUN bun build src/index.ts --outdir=dist --target=bun --minify

# ==================== Production Dependencies ====================
FROM base AS prod-deps

COPY package.json bun.lock* ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# ==================== Release ====================
FROM oven/bun:1-slim AS release
WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist

# Copy package.json for metadata
COPY package.json ./

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs --no-create-home hono && \
    chown -R hono:nodejs /app

USER hono

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check using bun fetch (no curl needed in slim image)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["bun", "run", "dist/index.js"]
