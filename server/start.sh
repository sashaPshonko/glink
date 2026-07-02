#!/bin/bash
cd "$(dirname "$0")" || exit 1
mkdir -p data uploads certs

if [ ! -f certs/cert.pem ]; then
  echo "[glink] создаю HTTPS-сертификат (для микрофона в браузере)…"
  openssl req -x509 -newkey rsa:2048 \
    -keyout certs/key.pem -out certs/cert.pem \
    -days 3650 -nodes -subj "/CN=glink" 2>/dev/null
fi

pkill -f 'node index.mjs' 2>/dev/null || true
sleep 1
nohup node index.mjs >> glink.log 2>&1 &
disown
echo "[glink] pid $! — https://0.0.0.0:3920"
sleep 2
curl -sk https://127.0.0.1:3920/health && echo
curl -sk https://127.0.0.1:3920/ | grep -o 'нажми на себя' | head -1 || echo "WARN: старый HTML"
