COMPOSE_FILE = docker-compose.yaml
COMPOSE_DEV_FILE = docker-compose.dev.yaml

# Prefer docker; fall back to podman if docker is not in PATH.
DOCKER := $(shell command -v docker 2>/dev/null || command -v podman 2>/dev/null)

# Local dev PostgreSQL (used by dev-pg / dev-all). Dedicated to the BFF so it never
# collides with the Exchange or EdgeX databases. Listens on a non-default host port.
PG_CONTAINER = nereid-dev-pg
PG_IMAGE = postgres:16-alpine
PG_HOST_PORT = 5433
PG_CONTAINER_PORT = 5432
PG_DB = nereid
PG_USER = nereid
PG_PASS = nereidpass
ENV_FILE = .env

# URL injected into $(ENV_FILE) so `dev-backend` (--env-file-if-exists=.env) connects
# out of the box without the caller having to set DATABASE_URL manually.
DATABASE_URL_DEV = postgres://$(PG_USER):$(PG_PASS)@127.0.0.1:$(PG_HOST_PORT)/$(PG_DB)

.PHONY: help install build dev-pg dev-backend dev-frontend dev-all dev-stop dev-clean docker-build docker-up docker-down docker-clean docker-logs docker-ps docker-dev-up docker-dev-build docker-dev-down docker-dev-clean docker-dev-logs docker-dev-ps clean lint test images-export images-load

# Default target
help:
	@echo "Nereid Exchange UI - Available Commands:"
	@echo ""
	@echo "Local Development (npm):"
	@echo "  make install       - Install npm dependencies"
	@echo "  make build         - Build frontend for production (outputs to dist/)"
	@echo "  make dev-pg        - Start dedicated PostgreSQL for the BFF (idempotent), writes .env"
	@echo "  make dev-backend   - Start BFF backend in background (reads .env), logs to /tmp/nereid-backend.log"
	@echo "  make dev-frontend  - Start Vite frontend dev server in background, logs to /tmp/nereid-frontend.log"
	@echo "  make dev-all       - (Re)start pg + backend + frontend (kills any existing dev servers first)"
	@echo "  make dev-stop      - Stop backend & frontend & pg (keeps pg data)"
	@echo "  make dev-clean     - Stop everything + remove build artifacts (dist) & dev database"
	@echo ""
	@echo "Docker (ghcr.io images - production):"
	@echo "  make docker-up     - Pull & start containers from GitHub Container Registry"
	@echo "  make docker-down   - Stop and remove containers (keeps data volumes)"
	@echo "  make docker-clean - Stop and remove containers AND data volumes"
	@echo "  make docker-logs   - Tail container logs"
	@echo "  make docker-ps     - Show production stack status"
	@echo ""
	@echo "Docker (local build - development/test, isolated project 'nereid-dev'):"
	@echo "  make docker-dev-build - Build Docker images from local source"
	@echo "  make docker-dev-up    - Build & start the local dev stack (isolated from prod)"
	@echo "  make docker-dev-down  - Stop local dev stack (keeps data volumes)"
	@echo "  make docker-dev-clean - Stop local dev stack AND remove data volumes"
	@echo "  make docker-dev-logs  - Tail local dev stack logs"
	@echo "  make docker-dev-ps    - Show local dev stack status"
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

dev-pg:
	@if [ -z "$(DOCKER)" ]; then echo "ERROR: neither docker nor podman found in PATH" >&2; exit 1; fi
	@if $(DOCKER) ps -a --format '{{.Names}}' | grep -qx '$(PG_CONTAINER)'; then \
		echo ">> $(PG_CONTAINER) exists, starting if stopped..."; \
		$(DOCKER) start $(PG_CONTAINER) >/dev/null 2>&1 || true; \
	else \
		echo ">> Creating $(PG_CONTAINER)..."; \
		$(DOCKER) run -d --name $(PG_CONTAINER) \
			-e POSTGRES_DB=$(PG_DB) \
			-e POSTGRES_USER=$(PG_USER) \
			-e POSTGRES_PASSWORD=$(PG_PASS) \
			-p 127.0.0.1:$(PG_HOST_PORT):$(PG_CONTAINER_PORT) \
			$(PG_IMAGE) >/dev/null; \
	fi
	@echo ">> Waiting for PostgreSQL on 127.0.0.1:$(PG_HOST_PORT)..."
	@for i in $$(seq 1 30); do \
		if $(DOCKER) exec $(PG_CONTAINER) pg_isready -U $(PG_USER) -d $(PG_DB) >/dev/null 2>&1; then break; fi; \
		sleep 1; \
	done
	@if [ ! -f $(ENV_FILE) ]; then cp $(ENV_FILE).example $(ENV_FILE); fi
	@if grep -q '^DATABASE_URL=' $(ENV_FILE); then \
		if sed --version 2>/dev/null | grep -q GNU; then \
			sed -i 's#^DATABASE_URL=.*#DATABASE_URL=$(DATABASE_URL_DEV)#' $(ENV_FILE); \
		else \
			sed -i '' 's#^DATABASE_URL=.*#DATABASE_URL=$(DATABASE_URL_DEV)#' $(ENV_FILE); \
		fi; \
	else \
		echo 'DATABASE_URL=$(DATABASE_URL_DEV)' >> $(ENV_FILE); \
	fi
	@echo ">> Started $(PG_CONTAINER), DATABASE_URL=$(DATABASE_URL_DEV) written to $(ENV_FILE)"

dev-backend:
	@echo ">> Stopping existing backend..."
	@pkill -f 'server/index\.cjs' 2>/dev/null || true
	@sleep 1
	@echo ">> Starting backend (background)..."
	@nohup npm run dev:backend > /tmp/nereid-backend.log 2>&1 < /dev/null & \
	  echo "   backend pid $$!"
	@echo ">> Backend starting, logs: /tmp/nereid-backend.log"

dev-frontend:
	@echo ">> Stopping existing frontend..."
	@pkill -f 'node_modules/\.bin/vite' 2>/dev/null || true
	@sleep 1
	@echo ">> Starting frontend (background)..."
	@nohup npm run dev > /tmp/nereid-frontend.log 2>&1 < /dev/null & \
	  echo "   frontend pid $$!"
	@echo ">> Frontend starting, logs: /tmp/nereid-frontend.log"

# Start the whole local dev stack with one command: pg -> backend -> frontend.
# make runs prerequisites left-to-right, so dev-pg, dev-backend and dev-frontend
# all execute (each already runs in the background and returns immediately).
dev-all: dev-pg dev-backend dev-frontend
	@echo ">> Dev stack started: Frontend http://localhost:8080  Backend http://localhost:3001"

# Stop the whole local dev stack: backend, frontend, and the database container
# (pg data is preserved, so a later `make dev-all` reuses it without re-setup).
# Use narrow patterns so pkill cannot match make's own shell / the caller.
dev-stop:
	@echo ">> Stopping dev servers..."
	@pkill -f 'server/index\.cjs' 2>/dev/null || true
	@pkill -f 'node_modules/\.bin/vite' 2>/dev/null || true
	@if $(DOCKER) ps -a --format '{{.Names}}' | grep -qx '$(PG_CONTAINER)'; then \
		$(DOCKER) stop $(PG_CONTAINER) >/dev/null 2>&1; \
		echo ">> Stopped $(PG_CONTAINER)"; \
	else \
		echo ">> $(PG_CONTAINER) not found"; \
	fi
	@echo ">> Stopped backend, frontend, and $(PG_CONTAINER) (pg data preserved)"

# Fully clean the dev environment: stop servers, remove build artifacts (dist),
# and delete the dev database container + its data (a clean `dev-pg` rebuilds it).
dev-clean:
	@echo ">> Stopping dev servers..."
	@pkill -f 'server/index\.cjs' 2>/dev/null || true
	@pkill -f 'node_modules/\.bin/vite' 2>/dev/null || true
	@if $(DOCKER) ps -a --format '{{.Names}}' | grep -qx '$(PG_CONTAINER)'; then \
		$(DOCKER) rm -f $(PG_CONTAINER) >/dev/null 2>&1; \
	fi
	@echo ">> Removing build artifacts..."
	@rm -rf dist
	@echo ">> Removed $(PG_CONTAINER) ($(DATABASE_URL_DEV)) and dist/"

# ==========================================
# Docker (ghcr.io images — production)
# ==========================================
docker-up:
	docker compose -f $(COMPOSE_FILE) up -d

docker-down:
	docker compose -f $(COMPOSE_FILE) down

# Stop and remove containers AND their data volumes (postgres/redis data lost).
docker-clean:
	docker compose -f $(COMPOSE_FILE) down -v

docker-logs:
	docker compose -f $(COMPOSE_FILE) logs -f

docker-ps:
	docker compose -f $(COMPOSE_FILE) ps

# ==========================================
# Docker (local build — development/test).
#
# Runs a FULLY ISOLATED stack from production: it uses ONLY docker-compose.dev.yaml
# (which defines its own redis/postgres/backend/frontend) under a DIFFERENT project
# name ("nereid-dev"). So `docker-dev-up` and `docker-up` can coexist without the
# dev containers colliding with the ghcr production containers.
# ==========================================
docker-dev-build:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) build

docker-dev-up:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) up -d --build

# Stop dev containers but keep dev data volumes (postgres/redis data preserved).
docker-dev-down:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) down

# Stop dev containers AND remove dev data volumes.
docker-dev-clean:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) down -v

docker-dev-logs:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) logs -f

docker-dev-ps:
	docker compose -p nereid-dev -f $(COMPOSE_DEV_FILE) ps

# Alias: build dev images (for testing local packaging)
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