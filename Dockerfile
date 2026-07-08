# ==========================================
# Production multi-stage Dockerfile for NereidAI
# All dependencies are installed and the frontend is built
# INSIDE the container. Nothing (node_modules/dist) is copied
# from the local checkout, so this works in CI (GitHub Actions)
# where those directories do not exist.
# ==========================================

# ---- Frontend build stage ----
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
RUN npx vite build

# ---- Backend Runtime (Express BFF) ----
FROM node:20-alpine AS backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.cjs"]

# ---- Frontend Runtime (Nginx + built dist) ----
FROM nginx:alpine AS frontend
WORKDIR /usr/share/nginx/html
COPY --from=frontend-build /app/dist ./
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Generate a self-signed TLS certificate if none is mounted, then start nginx.
# For production, mount real certificates at /etc/nginx/ssl instead.
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/ssl
COPY docker/nginx-entrypoint.sh /usr/local/bin/nginx-entrypoint.sh
RUN chmod +x /usr/local/bin/nginx-entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
