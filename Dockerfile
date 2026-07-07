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
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
