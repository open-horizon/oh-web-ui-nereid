# ==========================================
# Multi-stage Dockerfile for NereidAI
# Stage 1: Base with dependencies
# Stage 2: Frontend Build (Vite)
# Stage 3: Backend Runtime (Express)
# Stage 4: Frontend Runtime (Nginx + Static Files)
# ==========================================

# ---- Base: Install all dependencies ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- Frontend Builder ----
FROM base AS frontend-builder
COPY . .
RUN npm run build

# ---- Backend Runtime ----
FROM node:20-alpine AS backend
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY package*.json ./
COPY server/ ./server/
EXPOSE 3001
CMD ["node", "server/index.cjs"]

# ---- Frontend Runtime (Nginx) ----
FROM nginx:alpine AS frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]