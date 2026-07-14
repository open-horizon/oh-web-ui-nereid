COMPOSE_FILE = docker-compose.yaml
COMPOSE_DEV_FILE = docker-compose.dev.yaml

.PHONY: help install build dev-backend dev-frontend docker-build docker-up docker-down docker-logs docker-dev-up docker-dev-build docker-dev-down clean lint test images-export images-load

# Default target
help:
	@echo "Nereid Exchange UI - Available Commands:"
	@echo ""
	@echo "Local Development (npm):"
	@echo "  make install       - Install npm dependencies"
	@echo "  make build         - Build frontend for production (outputs to dist/)"
	@echo "  make dev-backend   - Run BFF backend in development mode"
	@echo "  make dev-frontend  - Run Vite frontend dev server"
	@echo ""
	@echo "Docker (ghcr.io images - production):"
	@echo "  make docker-up     - Pull & start containers from GitHub Container Registry"
	@echo "  make docker-down   - Stop and remove containers"
	@echo "  make docker-logs   - Tail container logs"
	@echo ""
	@echo "Docker (local build - development):"
	@echo "  make docker-dev-build - Build Docker images from local source"
	@echo "  make docker-dev-up    - Build (if needed) & start containers locally"
	@echo "  make docker-dev-down  - Stop and remove local containers"
	@echo ""
	@echo "Docker (both):"
	@echo "  make docker-build  - Build Docker images (alias for docker-dev-build)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean         - Remove dist/, node_modules/, and build artifacts"
	@echo "  make lint          - Run TypeScript type checking"
	@echo "  make test          - Run tests (if configured)"
	@echo ""
	@echo "Offline / Air-Gapped:"
	@echo "  make images-export - Build and export images to nereid-images.tar"
	@echo "  make images-load   - Load images from nereid-images.tar"

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
# Docker (ghcr.io images — production)
# ==========================================
docker-up:
	docker compose -f $(COMPOSE_FILE) up -d

docker-down:
	docker compose -f $(COMPOSE_FILE) down

docker-logs:
	docker compose -f $(COMPOSE_FILE) logs -f

# ==========================================
# Docker (local build — development)
# ==========================================
docker-dev-build:
	docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) build --no-cache

docker-dev-up:
	docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) up -d --build

docker-dev-down:
	docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_DEV_FILE) down

# Alias
docker-build: docker-dev-build

# ==========================================
# Maintenance
# ==========================================
clean:
	rm -rf dist node_modules package-lock.json

lint:
	npm run typecheck 2>/dev/null || npx tsc --noEmit

test:
	@echo "No test script configured. Add 'test' script to package.json to enable."

# ==========================================
# Offline / Air-Gapped image transfer
# ==========================================
images-export:
	./scripts/export-images.sh latest nereid-images.tar

images-load:
	./scripts/load-images.sh nereid-images.tar