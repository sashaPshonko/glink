#!/bin/bash
cd "$(dirname "$0")" || exit 1
mkdir -p data
nohup node index.mjs >> glink.log 2>&1 &
echo "[glink] pid $! — лог: $(pwd)/glink.log"
sleep 1
curl -s http://127.0.0.1:3920/health || echo "ещё стартует…"
