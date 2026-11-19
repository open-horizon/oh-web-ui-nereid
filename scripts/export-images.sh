#!/usr/bin/env bash
#
# Copyright (C) 2026 YIQISOFT
#
# SPDX-License-Identifier: Apache-2.0
#
# Export NereidAI Docker images for offline / air-gapped deployment.
# Run this on a machine with internet access and Docker, then transfer
# the resulting tarball to the production host and run `load-images.sh`.

set -euo pipefail

IMAGE_TAG="${1:-latest}"
OUT_FILE="${2:-nereid-images.tar}"
REGISTRY="${REGISTRY:-ghcr.io/open-horizon}"

BACKEND_IMAGE="${REGISTRY}/oh-web-ui-nereid-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/oh-web-ui-nereid-frontend:${IMAGE_TAG}"

IMAGES=(
  "${BACKEND_IMAGE}"
  "${FRONTEND_IMAGE}"
  "postgres:17"
)

echo ">> Building images..."
IMAGE_TAG="${IMAGE_TAG}" docker compose -p nereid-dev -f docker-compose.dev.yaml build

echo ">> Pulling postgres image..."
docker pull postgres:17 2>/dev/null || echo "  (postgres:17 already available locally)"

echo ">> Saving images to ${OUT_FILE} ..."
docker save -o "${OUT_FILE}" "${IMAGES[@]}"

echo ">> Done. Transfer ${OUT_FILE} to the production host and run:"
echo "   docker load -i ${OUT_FILE}"
echo "   IMAGE_TAG=${IMAGE_TAG} docker compose up -d"
