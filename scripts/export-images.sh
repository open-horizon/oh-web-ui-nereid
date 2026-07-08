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

IMAGES=(
  "open-horizon-exchangeui-backend:${IMAGE_TAG}"
  "open-horizon-exchangeui-frontend:${IMAGE_TAG}"
  "redis:6.2.2-alpine"
)

echo ">> Building images..."
docker compose build

echo ">> Saving images to ${OUT_FILE} ..."
docker save -o "${OUT_FILE}" "${IMAGES[@]}"

echo ">> Done. Transfer ${OUT_FILE} to the production host and run:"
echo "   docker load -i ${OUT_FILE}"
echo "   docker compose up -d"
