#!/usr/bin/env bash
#
# Copyright (C) 2026 YIQISOFT
#
# SPDX-License-Identifier: Apache-2.0
#
# Load NereidAI Docker images previously exported by export-images.sh.
# For offline / air-gapped production hosts.

set -euo pipefail

IN_FILE="${1:-nereid-images.tar}"

if [ ! -f "${IN_FILE}" ]; then
  echo "ERROR: ${IN_FILE} not found" >&2
  exit 1
fi

echo ">> Loading images from ${IN_FILE} ..."
docker load -i "${IN_FILE}"

echo ">> Done. Start the stack with:"
echo "   docker compose up -d"
