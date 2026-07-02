#!/bin/bash
# Скачивает HTTPS-сертификат сервера Glink для Android APK
set -e
cd "$(dirname "$0")/.."
OUT="glink-cert.pem"
HOST="${GLINK_HOST:-31.128.38.147}"
PORT="${GLINK_PORT:-3920}"

echo "→ получаю сертификат $HOST:$PORT"
openssl s_client -connect "$HOST:$PORT" -servername "$HOST" -showcerts </dev/null 2>/dev/null \
  | openssl x509 -outform PEM > "$OUT"
echo "✓ $OUT"
