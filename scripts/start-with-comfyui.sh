#!/usr/bin/env bash
# Start llamarole in PRODUCTION mode — WITH ComfyUI (tanpa Stability Matrix).
# Menjalankan ComfyUI + llama-server + build Next.js + start production server.
#
# Usage:
#   bash scripts/start-with-comfyui.sh              # full start
#   SKIP_BUILD=1 bash scripts/start-with-comfyui.sh # skip build
#   NO_OLLAMA=1 bash scripts/start-with-comfyui.sh  # skip Ollama
#   NO_LLAMA=1 bash scripts/start-with-comfyui.sh   # skip llama-server
#   NO_TTS=1 bash scripts/start-with-comfyui.sh     # skip Kokoro TTS
#   NO_COMFYUI=1 bash scripts/start-with-comfyui.sh # skip ComfyUI (sudah running)
#   PORT=3001 bash scripts/start-with-comfyui.sh    # custom Next.js port

set -euo pipefail

cd "$(dirname "$0")/.."

PIDFILE=".llamarole.pids"
PORT="${PORT:-3000}"

# ---- ComfyUI config --------------------------------------------------------
COMFYUI_DIR="${COMFYUI_DIR:-/Applications/Data/Packages/ComfyUI}"
COMFYUI_VENV="${COMFYUI_DIR}/venv"
COMFYUI_PORT="${COMFYUI_PORT:-8188}"
# Launch args dari Stability Matrix settings kamu:
#   --use-pytorch-cross-attention --force-fp16 --highvram --preview-method auto
COMFYUI_EXTRA_ARGS="${COMFYUI_EXTRA_ARGS:---use-pytorch-cross-attention --force-fp16 --highvram --preview-method auto}"

step()  { printf "\n\033[1;34m[start]\033[0m %s\n" "$1"; }
ok()    { printf "  \033[32m✓\033[0m %s\n" "$1"; }
err()   { printf "  \033[31m✗\033[0m %s\n" "$1" >&2; }
warn()  { printf "  \033[33m!\033[0m %s\n" "$1"; }

# ---- port conflict check ---------------------------------------------------

CONFLICTING_TOOL_PORT=20128
if lsof -iTCP:"$CONFLICTING_TOOL_PORT" -sTCP:LISTEN -P >/dev/null 2>&1; then
  warn "PERHATIAN: Port $CONFLICTING_TOOL_PORT sedang dipakai (kemungkinan 9router sedang berjalan)."
  warn "9router akan mematikan proses Next.js ini jika dijalankan bersamaan."
  warn "Hentikan 9router dulu sebelum menjalankan llamarole, atau jalankan 9router SETELAH llamarole."
  warn "Lanjut dalam 5 detik... (Ctrl+C untuk batalkan)"
  sleep 5
fi

get_local_ip() {
  local iface ip
  if command -v route >/dev/null 2>&1 && [[ "$(uname -s)" == "Darwin" ]]; then
    iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')
    if [[ -n "$iface" ]]; then
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      if [[ -n "$ip" ]]; then echo "$ip"; return; fi
    fi
    for i in 0 1 2 3 4 5; do
      ip=$(ipconfig getifaddr "en${i}" 2>/dev/null || true)
      if [[ -n "$ip" ]]; then echo "$ip"; return; fi
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -n "$ip" ]]; then echo "$ip"; return; fi
  fi
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip -4 addr show 2>/dev/null | awk '/inet / && !/127.0.0.1/ {print $2; exit}' | cut -d/ -f1)
    if [[ -n "$ip" ]]; then echo "$ip"; return; fi
  fi
  echo ""
}

# ---- cleanup handler -------------------------------------------------------

cleanup() {
  :
}
trap cleanup INT TERM

# ---- ComfyUI (langsung, tanpa Stability Matrix) ---------------------------

if [[ "${NO_COMFYUI:-0}" != "1" ]]; then
  if curl -sf -m 2 "http://127.0.0.1:${COMFYUI_PORT}/system_stats" >/dev/null 2>&1; then
    ok "ComfyUI sudah running di :${COMFYUI_PORT}"
    echo "comfyui:already" >> "$PIDFILE.tmp"
  else
    step "Starting ComfyUI (langsung, tanpa Stability Matrix)"

    # Validasi: cek folder ComfyUI ada
    if [[ ! -f "${COMFYUI_DIR}/main.py" ]]; then
      err "ComfyUI tidak ditemukan di ${COMFYUI_DIR}"
      err "Set COMFYUI_DIR ke lokasi ComfyUI kamu, atau jalankan ComfyUI manual lalu pakai NO_COMFYUI=1"
      exit 1
    fi

    # Validasi: cek venv ada
    if [[ ! -f "${COMFYUI_VENV}/bin/activate" ]]; then
      err "Python venv tidak ditemukan di ${COMFYUI_VENV}"
      err "Pastikan ComfyUI sudah di-install dengan benar (ada folder venv/)"
      exit 1
    fi

    # Start ComfyUI di background
    (
      source "${COMFYUI_VENV}/bin/activate"
      cd "${COMFYUI_DIR}"
      # shellcheck disable=SC2086
      python main.py --port "${COMFYUI_PORT}" ${COMFYUI_EXTRA_ARGS}
    ) > /tmp/comfyui-server.log 2>&1 &
    COMFYUI_PID=$!
    ok "ComfyUI pid: $COMFYUI_PID"

    step "Menunggu ComfyUI ready"
    for i in $(seq 1 120); do
      if curl -sf -m 2 "http://127.0.0.1:${COMFYUI_PORT}/system_stats" >/dev/null 2>&1; then
        ok "ComfyUI ready di :${COMFYUI_PORT}"
        break
      fi
      # Cek apakah proses masih hidup
      if ! kill -0 "$COMFYUI_PID" 2>/dev/null; then
        err "ComfyUI process died — cek /tmp/comfyui-server.log"
        exit 1
      fi
      sleep 2
      if [[ "$i" -eq 120 ]]; then
        err "ComfyUI tidak ready dalam 240s — cek /tmp/comfyui-server.log"
        exit 1
      fi
    done

    echo "comfyui:$COMFYUI_PID" > "$PIDFILE.tmp"
  fi
else
  ok "NO_COMFYUI=1, skip ComfyUI"
  echo "comfyui:skip" > "$PIDFILE.tmp"
fi

# ---- model selection -------------------------------------------------------

if [[ "${NO_LLAMA:-0}" != "1" ]]; then
  if ! curl -sf -m 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    step "Model Selection"
    if ! bash scripts/select-model.sh; then
      err "Model selection cancelled or failed"
      exit 1
    fi
  fi
fi

# ---- llama-server ----------------------------------------------------------

if [[ "${NO_LLAMA:-0}" != "1" ]]; then
  if curl -sf -m 2 http://127.0.0.1:8080/health >/dev/null 2>&1; then
    ok "llama-server sudah running di :8080"
    echo "llama:already" >> "$PIDFILE.tmp"
  else
    step "Starting llama-server"
    bash scripts/start-llama.sh > /tmp/llama-server.log 2>&1 &
    LLAMA_PID=$!
    ok "llama-server pid: $LLAMA_PID"

    step "Menunggu llama-server ready"
    for i in $(seq 1 90); do
      if curl -sf -m 1 http://127.0.0.1:8080/health >/dev/null 2>&1; then
        ok "llama-server ready"
        break
      fi
      sleep 1
      if [[ "$i" -eq 90 ]]; then
        err "llama-server tidak ready dalam 90s — cek /tmp/llama-server.log"
        exit 1
      fi
    done

    echo "llama:$LLAMA_PID" >> "$PIDFILE.tmp"
  fi
else
  ok "NO_LLAMA=1, skip llama-server"
  echo "llama:skip" >> "$PIDFILE.tmp"
fi

# ---- Kokoro TTS ------------------------------------------------------------

KOKORO_SCRIPT="$HOME/Documents/kokoro-fastapi/start-tts.sh"

if [[ "${NO_TTS:-0}" != "1" ]]; then
  if curl -sf -m 2 http://127.0.0.1:8880/v1/models >/dev/null 2>&1; then
    ok "Kokoro TTS server sudah running di :8880"
    echo "tts:already" >> "$PIDFILE.tmp"
  elif [[ -f "$KOKORO_SCRIPT" ]]; then
    step "Starting Kokoro TTS server"
    bash "$KOKORO_SCRIPT" > /tmp/tts-server.log 2>&1 &
    TTS_PID=$!
    ok "Kokoro TTS server pid: $TTS_PID"

    step "Menunggu Kokoro TTS server ready"
    for i in $(seq 1 30); do
      if curl -sf -m 1 http://127.0.0.1:8880/v1/models >/dev/null 2>&1; then
        ok "Kokoro TTS server ready"
        break
      fi
      sleep 1
      if [[ "$i" -eq 30 ]]; then
        warn "Kokoro TTS server tidak ready dalam 30s — cek /tmp/tts-server.log"
      fi
    done

    echo "tts:$TTS_PID" >> "$PIDFILE.tmp"
  else
    warn "Script Kokoro TTS ($KOKORO_SCRIPT) tidak ditemukan, skip TTS server"
    echo "tts:skip" >> "$PIDFILE.tmp"
  fi
else
  ok "NO_TTS=1, skip Kokoro TTS server"
  echo "tts:skip" >> "$PIDFILE.tmp"
fi

# ---- ollama (vision model untuk Analyze face) -----------------------------

OLLAMA_HOST="${OLLAMA_URL:-http://127.0.0.1:11434}"
VISION_MODEL="${VISION_MODEL:-qwen2.5vl:7b}"

if [[ "${NO_OLLAMA:-0}" != "1" ]]; then
  step "Cek Ollama ($OLLAMA_HOST)"
  if curl -sf -m 2 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
    ok "Ollama sudah jalan"
  elif command -v ollama >/dev/null 2>&1; then
    step "Ollama mati — mencoba start (ollama serve)"
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    for i in $(seq 1 15); do
      if curl -sf -m 1 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
        ok "Ollama ready"
        break
      fi
      sleep 1
      if [[ "$i" -eq 15 ]]; then
        warn "Ollama tidak ready dalam 15s — fitur Analyze face nonaktif (cek /tmp/ollama.log)"
      fi
    done
  else
    warn "Ollama tidak terpasang — fitur 'Analyze face from avatar' nonaktif."
    warn "Install dari https://ollama.com lalu: ollama pull $VISION_MODEL"
  fi

  if curl -sf -m 2 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
    if curl -sf -m 2 "$OLLAMA_HOST/api/tags" 2>/dev/null | grep -q "$VISION_MODEL"; then
      ok "Vision model '$VISION_MODEL' tersedia"
    else
      warn "Vision model '$VISION_MODEL' belum ada — jalankan: ollama pull $VISION_MODEL"
    fi
  fi
else
  ok "NO_OLLAMA=1, skip Ollama"
fi

# ---- next build ------------------------------------------------------------

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "Building Next.js (production)"
  pnpm build
  ok "Build selesai"
else
  ok "SKIP_BUILD=1, skip build"
fi

# ---- next start ------------------------------------------------------------

step "Starting Next.js production server di port $PORT"
PORT="$PORT" pnpm start > /tmp/nextjs.log 2>&1 &
NEXT_PID=$!
ok "Next.js pid: $NEXT_PID"

echo "next:$NEXT_PID" >> "$PIDFILE.tmp"
mv "$PIDFILE.tmp" "$PIDFILE"

# Tunggu Next.js ready
for i in $(seq 1 30); do
  if curl -sf -m 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

printf "\n\033[1;32m✓ Llamarole running! (with ComfyUI)\033[0m\n"
printf "  App     : http://localhost:%s\n" "$PORT"

LOCAL_IP=$(get_local_ip)
if [[ -n "$LOCAL_IP" ]]; then
  printf "  LAN     : http://%s:%s  \033[2m(buka dari HP, WiFi yang sama)\033[0m\n" "$LOCAL_IP" "$PORT"
fi

printf "  LLM     : http://127.0.0.1:8080\n"
printf "  ComfyUI : http://127.0.0.1:%s\n" "$COMFYUI_PORT"
printf "  Logs    : /tmp/nextjs.log  &  /tmp/llama-server.log  &  /tmp/comfyui-server.log\n"
printf "\nJalankan \033[1mbash scripts/stop.sh\033[0m untuk menghentikan.\n"
printf "\n\033[33m⚠ Catatan:\033[0m Jangan jalankan \033[1m9router\033[0m selagi app ini berjalan.\n"
printf "  9router mematikan semua proses 'next-server' saat startup dan akan\n"
printf "  mematikan Next.js ini. Urutan aman: jalankan 9router DULU, baru start.\n\n"

# macOS firewall hint
if [[ "$(uname -s)" == "Darwin" ]] && command -v socketfilterfw >/dev/null 2>&1; then
  fw_state=$(socketfilterfw --getglobalstate 2>/dev/null || true)
  if [[ "$fw_state" == *"enabled"* ]]; then
    printf "\033[2mCatatan: macOS firewall aktif. Jika HP tidak bisa konek, izinkan 'node' di\nSystem Settings → Network → Firewall → Options.\033[0m\n\n"
  fi
fi

# Tail Next.js log
wait "$NEXT_PID"
