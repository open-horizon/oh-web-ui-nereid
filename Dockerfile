# ==========================================
# Offline multi-stage Dockerfile for NereidAI
# Reuses locally-installed node_modules and the prebuilt dist/
# (no in-container npm ci / vite build -> fast, network-free)
# ==========================================

# ---- Base: local dependencies ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY node_modules ./node_modules

# ---- Backend Runtime (Express BFF) ----
FROM base AS backend
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.cjs"]

# ---- Frontend Runtime (Nginx + prebuilt dist) ----
FROM nginx:alpine AS frontend
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Generate a self-signed TLS certificate if none is mounted, then start nginx.
# For production, mount real certificates at /etc/nginx/ssl instead.
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/ssl
COPY docker/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
