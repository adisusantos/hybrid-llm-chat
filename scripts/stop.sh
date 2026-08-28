#!/usr/bin/env bash
# Stop semua proses yang distart oleh start.sh
#
# Usage:
#   bash scripts/stop.sh

set -euo pipefail

cd "$(dirname "$0")/.."

PIDFILE=".llamarole.pids"

ok()  { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info(){ printf "  \033[33m-\033[0m %s\n" "$1"; }

printf "\n\033[1;33m[stop]\033[0m Menghentikan Llamarole...\n"

if [[ ! -f "$PIDFILE" ]]; then
  info "Tidak ada PID file ditemukan (.llamarole.pids)"
  info "Mencoba kill by process name sebagai fallback..."

  # Fallback: kill berdasarkan nama proses
  pkill -f "llama-server" 2>/dev/null && ok "llama-server dihentikan" || info "llama-server tidak ditemukan"
  pkill -f "start-tts.sh" 2>/dev/null && ok "Kokoro TTS dihentikan" || info "Kokoro TTS tidak ditemukan"
  pkill -f "uvicorn api.src.main:app" 2>/dev/null || true
  pkill -f "next start" 2>/dev/null && ok "Next.js dihentikan" || info "Next.js tidak ditemukan"
  pkill -f "next-server" 2>/dev/null || true
  exit 0
fi

# Baca PID dari file
while IFS=: read -r name pid; do
  if [[ "$pid" == "already" || "$pid" == "skip" ]]; then
    info "$name: was not started by this script, skipping"
    continue
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    # Tunggu hingga benar-benar stop
    for i in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    # Force kill kalau masih hidup
    kill -9 "$pid" 2>/dev/null || true
    ok "$name (pid $pid) dihentikan"
  else
    info "$name (pid $pid) sudah tidak berjalan"
  fi
done < "$PIDFILE"

rm -f "$PIDFILE"

printf "\n\033[1;32m✓ Semua proses dihentikan.\033[0m\n\n"
