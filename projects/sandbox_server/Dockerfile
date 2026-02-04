# ==================== Base ====================
FROM oven/bun:1 AS base
WORKDIR /app

# ==================== Install Dependencies ====================
FROM base AS install

# Copy package files
COPY package.json bun.lock* ./

# Install production dependencies
RUN bun install --frozen-lockfile --production

# ==================== Release ====================
FROM base AS release

# Copy node_modules from install stage
COPY --from=install /app/node_modules node_modules

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "run", "src/index.ts"]
