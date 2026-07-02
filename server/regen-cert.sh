#!/bin/bash
# Перевыпуск HTTPS-сертификата с IP в SAN (нужно для Android APK)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p certs

IP="${GLINK_CERT_IP:-31.128.38.147}"

echo "[glink] новый сертификат для IP $IP"
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem \
  -days 3650 -nodes \
  -subj "/CN=${IP}" \
  -addext "subjectAltName=IP:${IP},DNS:glink,DNS:localhost" 2>/dev/null

# Старт с 2024 — иначе на телефонах с отстающими часами «date of certificate is invalid»
openssl x509 -in certs/cert.pem -signkey certs/key.pem -out certs/cert.pem \
  -days 3650 -startdate 20240101000000Z -copy_extensions copy 2>/dev/null \
  || openssl x509 -in certs/cert.pem -signkey certs/key.pem -out certs/cert.pem \
  -days 3650 -startdate 20240101000000Z

echo "[glink] готово — перезапусти: bash start.sh"
