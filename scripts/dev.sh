#!/usr/bin/env bash
# Start llama-server + Next.js dev + Kokoro TTS together. Both are killed on Ctrl+C.
#   ./scripts/dev.sh                    # full
#   NO_LLAMA=1 ./scripts/dev.sh         # skip starting llama-server (assume it's already running)
#   NO_TTS=1 ./scripts/dev.sh           # skip starting Kokoro TTS server
#   PORT=3001 ./scripts/dev.sh          # custom Next.js port

set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf "\n\033[1;34m[dev]\033[0m %s\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }

cleanup() {
  printf "\n\033[1;33m[dev]\033[0m shutting down...\n"
  if [[ -n "${LLAMA_PID:-}" ]]; then
    kill "$LLAMA_PID" 2>/dev/null || true
    wait "$LLAMA_PID" 2>/dev/null || true
  fi
  if [[ -n "${TTS_PID:-}" ]]; then
    kill "$TTS_PID" 2>/dev/null || true
    wait "$TTS_PID" 2>/dev/null || true
  fi
  if [[ -n "${NEXT_PID:-}" ]]; then
    kill "$NEXT_PID" 2>/dev/null || true
    wait "$NEXT_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup INT TERM EXIT

# ---- llama-server -------------------------------------------------------

if [[ "${NO_LLAMA:-0}" != "1" ]]; then
  if curl -sf -m 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    ok "llama-server already running on :8080"
  else
    step "Starting llama-server"
    bash scripts/start-llama.sh &
    LLAMA_PID=$!
    ok "llama-server pid: $LLAMA_PID"

    step "Waiting for llama-server to be ready"
    for i in $(seq 1 60); do
      if curl -sf -m 1 http://127.0.0.1:8080/health >/dev/null 2>&1; then
        ok "llama-server ready"
        break
      fi
      sleep 1
      if [[ "$i" -eq 60 ]]; then
        echo "llama-server did not become ready in 60s" >&2
        exit 1
      fi
    done
  fi
else
  ok "NO_LLAMA=1 set, not starting llama-server"
fi

# ---- Kokoro TTS ---------------------------------------------------------

KOKORO_SCRIPT="$HOME/Documents/kokoro-fastapi/start-tts.sh"

if [[ "${NO_TTS:-0}" != "1" ]]; then
  if curl -sf -m 2 http://127.0.0.1:8880/v1/models >/dev/null 2>&1; then
    ok "Kokoro TTS server already running on :8880"
  elif [[ -f "$KOKORO_SCRIPT" ]]; then
    step "Starting Kokoro TTS server"
    bash "$KOKORO_SCRIPT" > /tmp/tts-server.log 2>&1 &
    TTS_PID=$!
    ok "Kokoro TTS server pid: $TTS_PID"

    step "Waiting for Kokoro TTS server to be ready"
    for i in $(seq 1 30); do
      if curl -sf -m 1 http://127.0.0.1:8880/v1/models >/dev/null 2>&1; then
        ok "Kokoro TTS server ready"
        break
      fi
      sleep 1
      if [[ "$i" -eq 30 ]]; then
        echo "Kokoro TTS server did not become ready in 30s" >&2
      fi
    done
  else
    ok "Kokoro TTS script not found at $KOKORO_SCRIPT, skipping"
  fi
else
  ok "NO_TTS=1 set, not starting Kokoro TTS server"
fi

# ---- next dev ------------------------------------------------------------

step "Starting Next.js dev server"
pnpm dev &
NEXT_PID=$!
ok "next dev pid: $NEXT_PID"

# Wait for Next to be ready (best effort)
PORT="${PORT:-3000}"
for i in $(seq 1 30); do
  if curl -sf -m 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    ok "Next.js ready on http://localhost:${PORT}"
    break
  fi
  sleep 1
done

# Tail the dev server output. The user hits Ctrl+C to stop.
step "Tailing Next.js output (Ctrl+C to stop)"
wait "$NEXT_PID"
