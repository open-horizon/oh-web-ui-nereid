#!/usr/bin/env bash
#
# Copyright (C) 2026 YIQISOFT
#
# SPDX-License-Identifier: Apache-2.0
#
# Package this chart with version numbers taken from the repository root
# VERSION file (e.g. "v0.0.1") and upload it to the YIQISOFT ChartMuseum.
# Chart semantic version strips the leading "v" (0.0.1); appVersion keeps it
# (v0.0.1) so it matches the Docker image tags. ChartMuseum rejects the same
# chart-version twice with 409; bump VERSION before re-running.
#
# Usage: deploy/helm/push.sh [chartmuseum-url]
set -euo pipefail

CHART_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${CHART_DIR}/../.." && pwd)"
MUSEUM_URL="${1:-https://chart.yiqisoft.cn}"

RAW_VERSION="$(tr -d '[:space:]' < "${REPO_ROOT}/VERSION")"
[[ "${RAW_VERSION}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || {
  echo "ERROR: VERSION must look like v0.0.1, got '${RAW_VERSION}'" >&2
  exit 1
}
CHART_VERSION="${RAW_VERSION#v}"
APP_VERSION="${RAW_VERSION}"

DIST_DIR="${CHART_DIR}/dist"
mkdir -p "${DIST_DIR}"

echo ">> Packaging nereidhorizon chart ${CHART_VERSION} (appVersion ${APP_VERSION})"
PACKAGE="$(helm package "${CHART_DIR}/nereidhorizon" \
  --version "${CHART_VERSION}" \
  --app-version "${APP_VERSION}" \
  --destination "${DIST_DIR}" | sed 's/.*: //')"

echo ">> Uploading ${PACKAGE} to ${MUSEUM_URL}"
# chart.yiqisoft.cn is an internal host behind Traefik's default certificate
# (no matching SAN), so certificate verification is skipped; the corporate HTTP
# proxy must also bypass this internal host.
curl --noproxy '*' -k -fsS -X POST \
  -F "chart=@${PACKAGE}" \
  "${MUSEUM_URL}/api/charts"
echo
echo ">> Done. Verify with: helm repo update nlci && helm search repo nlci/nereidhorizon"
