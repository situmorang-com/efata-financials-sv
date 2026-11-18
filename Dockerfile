# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY scripts ./scripts

# Install build dependencies (include dev deps even if NODE_ENV=production is injected by CI)
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY scripts ./scripts

# Install only production dependencies
RUN npm ci --omit=dev

# Fail the build here, not at first request, if better-sqlite3 has no binary for this platform
RUN node -e "new (require('better-sqlite3'))(':memory:').close()"

# Copy built application from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Create directory for database
RUN mkdir -p /app/data

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
# "::" listens on IPv6 and IPv4. Coolify's health check runs
# `wget http://localhost:3000/health` in the container, and busybox wget
# resolves localhost to ::1 first, so an IPv4-only 0.0.0.0 fails it.
ENV HOST=::

# Auth environment variables will be set at runtime via Coolify
# AUTH_SECRET
# GOOGLE_CLIENT_ID
# GOOGLE_CLIENT_SECRET

# Start the application
CMD ["node", "build"]
