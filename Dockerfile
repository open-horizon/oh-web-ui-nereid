# ==========================================
# Production Multi-stage Dockerfile for NereidAI
# ==========================================
# Production Multi-stage Dockerfile for NereidAI
# ==========================================

# ---- Backend Runtime ----
FROM node:20-alpine AS backend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.cjs"]

# ---- Frontend Runtime ----
FROM nginx:alpine AS frontend
WORKDIR /usr/share/nginx/html
# Copy dist locally (built by CI before Docker)
COPY dist ./
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Generate a self-signed TLS certificate if none is mounted, then start nginx.
# For production, mount real certificates at /etc/nginx/ssl instead.
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/ssl
COPY docker/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
