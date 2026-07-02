#!/bin/bash
cd "$(dirname "$0")" || exit 1
mkdir -p data uploads certs

IP="${GLINK_CERT_IP:-31.128.38.147}"
need_cert=0
if [ ! -f certs/cert.pem ]; then
  need_cert=1
else
  CN=$(openssl x509 -in certs/cert.pem -noout -subject 2>/dev/null | sed -n 's/.*CN=\([^/]*\).*/\1/p')
  if [ "$CN" != "$IP" ]; then
    echo "[glink] старый сертификат CN=$CN — нужен CN=$IP для Android"
    need_cert=1
  fi
fi
if [ "$need_cert" = 1 ]; then
  echo "[glink] создаю HTTPS-сертификат (для микрофона в браузере)…"
  bash regen-cert.sh
fi

pkill -f 'node index.mjs' 2>/dev/null || true
sleep 1
nohup node index.mjs >> glink.log 2>&1 &
disown
echo "[glink] pid $! — https://0.0.0.0:3920"
sleep 2
curl -sk https://127.0.0.1:3920/health && echo
curl -sk https://127.0.0.1:3920/ | grep -o 'нажми на себя' | head -1 || echo "WARN: старый HTML"
