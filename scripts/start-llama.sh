#!/usr/bin/env bash
# Start llama-server with the selected model.
# OpenAI-compatible API at http://127.0.0.1:${LLAMA_PORT:-8080}/v1

set -euo pipefail

cd "$(dirname "$0")/.."

SELECTION_FILE=".llamarole.selected-model"
DEFAULT_MODEL="${LLAMAROLE_MODEL_DIR:-${HOME}/AI/models}/Aion-RP-Llama-3.1-8B-Q6_K_L.gguf"

# Priority: .llamarole.selected-model > AION_MODEL env > default
if [[ -f "$SELECTION_FILE" ]]; then
  MODEL=$(cat "$SELECTION_FILE")
else
  MODEL="${AION_MODEL:-$DEFAULT_MODEL}"
fi

PORT="${LLAMA_PORT:-8080}"
HOST="${LLAMA_HOST:-127.0.0.1}"
CTX="${LLAMA_CTX:-16384}"
NGPU="${LLAMA_NGL:-99}"

if [[ ! -f "$MODEL" ]]; then
  echo "error: model file not found: $MODEL" >&2
  exit 1
fi

echo "starting llama-server"
echo "  model : $MODEL"
echo "  host  : $HOST"
echo "  port  : $PORT"
echo "  ctx   : $CTX"
echo "  ngl   : $NGPU (GPU layers, 99 = all)"

exec llama-server \
  -m "$MODEL" \
  --jinja \
  -c "$CTX" \
  -ngl "$NGPU" \
  --host "$HOST" \
  --port "$PORT" \
  --timeout 600 \
  "$@"
