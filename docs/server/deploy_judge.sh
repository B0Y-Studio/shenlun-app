#!/usr/bin/env bash
# 在 124.223.5.144 上跑的部署脚本
# 作用：拉新代码、装 cryptography、重启 card_server
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@124.223.5.144}"
REMOTE_DIR="${REMOTE_DIR:-/opt/xuexi/09_选卡阅读}"
SERVICE_NAME="${SERVICE_NAME:-card_server}"

echo "[deploy] ssh $REMOTE_HOST ..."
ssh "$REMOTE_HOST" "set -e
  cd '$REMOTE_DIR'
  git pull --ff-only
  pip install cryptography >/dev/null
  systemctl restart '$SERVICE_NAME'
  sleep 1
  systemctl status '$SERVICE_NAME' --no-pager
  curl -sf http://127.0.0.1:8080/api/judge/llm-config?device_id=__healthcheck || echo 'healthcheck endpoint not 200, check logs'
"
echo "[deploy] done"