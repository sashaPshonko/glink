#!/usr/bin/env bash
# Деплой glink на VPS через git.
# На Mac (один раз закоммитить и push):
#   cd ~/Documents/4narek/glink
#   git add server/web server/files.mjs server/index.mjs server/db.mjs server/start.sh server/package.json
#   git commit -m "glink: web client, no passwords, media"
#   git push
#
# Потом каждый раз:
#   bash server/deploy.sh

set -euo pipefail

HOST="${GLINK_HOST:-root@31.128.38.147}"

echo "→ git pull + restart на $HOST"

ssh -t "$HOST" 'bash -s' <<'REMOTE'
set -e
cd ~/glink || { echo "Нет ~/glink — сначала: git clone https://github.com/sashaPshonko/glink.git ~/glink"; exit 1; }
git pull origin main
cd server
chmod +x start.sh
npm install --omit=dev
bash start.sh
REMOTE

echo ""
echo "Проверка снаружи:"
curl -s http://31.128.38.147:3920/ | grep -o 'нажми на себя' | head -1 || echo "FAIL — обнови страницу Cmd+Shift+R"
curl -s -X POST http://31.128.38.147:3920/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"username":"sasha_pshonko"}' | head -c 100
echo
