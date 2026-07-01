#!/bin/bash
set -e

# ==============================================================
# 部署 myorg/myagbot 容器到管理 hub
# 用法:
#   1. 先在 Exchange 中设置 myorg/myagbot token:
#      curl -s -u "root/root:ROOT_PW" -X PUT \
#        -H "Content-Type: application/json" \
#        -d '{"token":"mytoken"}' \
#        "http://localhost:3090/v1/orgs/myorg/agbots/myagbot"
#
#   2. 编辑本脚本中 TOKEN 变量或通过环境变量传入
#   3. sudo bash deploy-myorg-agbot.sh
# ==============================================================

EXCHANGE_URL="${EXCHANGE_URL:-http://localhost:3090/v1}"
ROOT_AUTH="${ROOT_AUTH:-root/root:jWpvzS1nL0IxCbkWHwteF6lJGAclB3}"
AGBOT_TOKEN="${AGBOT_TOKEN:-}"

# ---- 1. 设置 Exchange token (如果提供了) ----
if [[ -n "$AGBOT_TOKEN" ]]; then
  echo ">>> 设置 myorg/myagbot token ..."
  curl -s -u "$ROOT_AUTH" -X PUT \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$AGBOT_TOKEN\"}" \
    "$EXCHANGE_URL/orgs/myorg/agbots/myagbot"
  echo ""
fi

# ---- 2. 生成 config ----
echo ">>> 生成 /etc/horizon/myorg-agbot.json ..."
if [[ -z "$AGBOT_TOKEN" ]]; then
  echo "WARNING: AGBOT_TOKEN 未设置，请手动编辑 /etc/horizon/myorg-agbot.json 中的 ExchangeToken"
fi

cat > /etc/horizon/myorg-agbot.json << EOF
{
    "AgreementBot": {
        "DBPath": "",
        "Postgresql": {
            "Host": "postgres",
            "Port": "5432",
            "User": "admin",
            "Password": "",
            "DBName": "exchange",
            "SSLMode": "disable",
            "MaxOpenConnections": 20
        },
        "TxLostDelayTolerationSeconds": 120,
        "AgreementWorkers": 5,
        "ProtocolTimeoutS": 120,
        "AgreementTimeoutS": 360,
        "NoDataIntervalS": 300,
        "ActiveAgreementsURL": "",
        "ActiveAgreementsUser": "",
        "ActiveAgreementsPW": "",
        "PolicyPath": "/home/agbotuser/policy.d",
        "NewContractIntervalS": 5,
        "ProcessGovernanceIntervalS": 5,
        "IgnoreContractWithAttribs": "ethereum_account",
        "ExchangeURL": "http://exchange-api:8080/v1",
        "ExchangeId": "myorg/myagbot",
        "ExchangeToken": "${AGBOT_TOKEN}",
        "ExchangeHeartbeat": 5,
        "ExchangeMessageTTL": 1800,
        "ActiveDeviceTimeoutS": 180,
        "DefaultWorkloadPW": "",
        "MessageKeyPath": "msgKey",
        "APIListen": "0.0.0.0:8080",
        "PurgeArchivedAgreementHours": 1,
        "CheckUpdatedPolicyS": 7,
        "CSSURL": "http://css-api:8080",
        "CSSSSLCert": "",
        "SecureAPIListenHost": "0.0.0.0",
        "SecureAPIListenPort": "8083",
        "SecureAPIServerKey": "",
        "SecureAPIServerCert": "",
        "AgreementBatchSize": 300,
        "RetryLookBackWindow": 3600,
        "MMSGarbageCollectionInterval": 20,
        "Vault": {
            "VaultURL": "http://bao:8200"
        }
    },
    "ArchSynonyms": {
        "x86_64": "amd64",
        "armhf": "arm",
        "aarch64": "arm64"
    }
}
EOF

echo ">>> 配置已写入 /etc/horizon/myorg-agbot.json"

# ---- 3. 启动容器 ----
echo ">>> 启动 myorg-agbot 容器 ..."
docker rm -f myorg-agbot 2>/dev/null || true
docker run -d --name myorg-agbot --restart always \
  --network hzn_horizonnet \
  -p 0.0.0.0:3112:8080 \
  -p 0.0.0.0:3113:8083 \
  -v /etc/horizon/myorg-agbot.json:/etc/horizon/anax.json.tmpl:ro \
  -v /etc/horizon/keys:/home/agbotuser/keys:ro \
  -v myorg-agbot-msgkey:/var/horizon/msgKey \
  -e ANAX_LOG_LEVEL=3 \
  ghcr.io/open-horizon/amd64_agbot:latest

echo ">>> 检查状态:"
sleep 3
docker ps --filter name=myorg-agbot --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
