#!/bin/sh
set -e
# Reuse the mgmt-hub's self-signed TLS certificate when its key directory is
# mounted (deploy-mgmt-hub.sh writes horizonMgmtHub.crt/.key only when the
# mgmt-hub was deployed with HZN_TRANSPORT=https). The FDO-only cert
# (horizonMgmtHubFDO.crt) is a different certificate without a private key and
# is therefore not used.
MGMT_HUB_CERT="${MGMT_HUB_CERT:-/etc/horizon/keys/horizonMgmtHub.crt}"
MGMT_HUB_KEY="${MGMT_HUB_KEY:-${MGMT_HUB_CERT%.crt}.key}"

if [ -f /etc/nginx/ssl/fullchain.pem ] && [ -f /etc/nginx/ssl/privkey.pem ]; then
  echo "[nginx] using mounted certificate (/etc/nginx/ssl)"
elif [ -f "$MGMT_HUB_CERT" ] && [ -f "$MGMT_HUB_KEY" ]; then
  echo "[nginx] reusing mgmt-hub certificate: $MGMT_HUB_CERT"
  cp "$MGMT_HUB_CERT" /etc/nginx/ssl/fullchain.pem
  cp "$MGMT_HUB_KEY" /etc/nginx/ssl/privkey.pem
  chmod 600 /etc/nginx/ssl/privkey.pem
else
  echo "[nginx] generating self-signed certificate"
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/privkey.pem \
    -out /etc/nginx/ssl/fullchain.pem \
    -subj "/CN=localhost" 2>/dev/null
fi
exec nginx -g "daemon off;"
