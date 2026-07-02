#!/bin/bash
cd "$(dirname "$0")" || exit 1
mkdir -p data uploads
pkill -f 'node index.mjs' 2>/dev/null || true
sleep 1
nohup node index.mjs >> glink.log 2>&1 &
disown
echo "[glink] pid $! — http://0.0.0.0:3920"
sleep 2
curl -s http://127.0.0.1:3920/health && echo
curl -s http://127.0.0.1:3920/ | grep -o 'нажми на себя' | head -1 || echo "WARN: старый HTML"
