.PHONY: help install build dev-backend dev-frontend docker-build docker-up docker-down docker-logs clean lint test

# Default target
help:
	@echo "Nereid Exchange UI - Available Commands:"
	@echo ""
	@echo "Local Development:"
	@echo "  make install       - Install npm dependencies"
	@echo "  make build         - Build frontend for production (outputs to dist/)"
	@echo "  make dev-backend   - Run BFF backend in development mode"
	@echo "  make dev-frontend  - Run Vite frontend dev server"
	@echo ""
	@echo "Docker (Production):"
	@echo "  make docker-build  - Build Docker images for frontend and backend"
	@echo "  make docker-up     - Start containers in detached mode"
	@echo "  make docker-down   - Stop and remove containers"
	@echo "  make docker-logs   - Tail container logs"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Remove dist/, node_modules/, and build artifacts"
	@echo "  make lint          - Run TypeScript type checking"
	@echo "  make test          - Run tests (if configured)"

# ==========================================
# Local Development
# ==========================================
install:
	npm install

build:
	npm run build

dev-backend:
	npm run dev:backend

dev-frontend:
	npm run dev

# ==========================================
# Docker Production
# ==========================================
docker-build:
	docker compose build --no-cache

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

# ==========================================
# Maintenance
# ==========================================
clean:
	rm -rf dist node_modules package-lock.json

lint:
	npm run typecheck 2>/dev/null || npx tsc --noEmit

test:
	@echo "No test script configured. Add 'test' script to package.json to enable."