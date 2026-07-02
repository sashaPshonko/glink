#!/usr/bin/env bash
# Деплой glink на VPS через git.
#
# На Mac: git push origin main
# Потом:  bash server/deploy.sh

set -euo pipefail

HOST="${GLINK_HOST:-root@31.128.38.147}"

echo "→ deploy на $HOST"

ssh -t "$HOST" 'bash -s' <<'REMOTE'
set -e
cd ~/glink || { echo "Нет ~/glink — git clone https://github.com/sashaPshonko/glink.git ~/glink"; exit 1; }

# сохранить чаты/аккаунты
BACKUP=""
[ -f server/data/store.json ] && BACKUP=$(cat server/data/store.json)

git fetch origin main
git reset --hard origin/main

mkdir -p server/data server/uploads
[ -n "$BACKUP" ] && printf '%s' "$BACKUP" > server/data/store.json

cd server
chmod +x start.sh
npm install --omit=dev
bash start.sh
REMOTE

echo ""
echo "Проверка:"
curl -s http://31.128.38.147:3920/ | grep -o 'нажми на себя' | head -1 || echo "FAIL"
curl -s -X POST http://31.128.38.147:3920/auth/signin \
  -H 'Content-Type: application/json' \
  -d '{"username":"sasha_pshonko"}' | head -c 120
echo
