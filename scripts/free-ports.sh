#!/usr/bin/env bash
# Free up the ports this project uses by killing any leftover process.
# Use when start-llama.sh reports "couldn't bind HTTP server socket".
#   ./scripts/free-ports.sh           # kill anything on 8080
#   PORT=8081 ./scripts/free-ports.sh # different port
set -euo pipefail

PORT="${PORT:-8080}"

echo "checking port $PORT..."
PIDS="$(lsof -ti :"$PORT" 2>/dev/null || true)"
if [[ -z "$PIDS" ]]; then
  echo "  port $PORT is free"
  exit 0
fi

echo "  found process(es): $PIDS"
echo "$PIDS" | xargs kill -9
sleep 1

REMAINING="$(lsof -ti :"$PORT" 2>/dev/null || true)"
if [[ -n "$REMAINING" ]]; then
  echo "  still running: $REMAINING — try again or check 'ps aux | grep llama'"
  exit 1
fi
echo "  port $PORT is now free"
