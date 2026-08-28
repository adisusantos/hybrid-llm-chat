#!/usr/bin/env bash
# Interactive model selection for llamarole
# Scans ~/AI/models for .gguf files and lets user choose

set -euo pipefail

MODEL_DIR="${LLAMAROLE_MODEL_DIR:-${HOME}/AI/models}"
SELECTION_FILE=".llamarole.selected-model"
NAME_FILE="data/selected-model-name.txt"

# Color codes
BLUE="\033[1;34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"
DIM="\033[2m"

step()  { printf "\n${BLUE}[select-model]${RESET} %s\n" "$1"; }
ok()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
err()   { printf "  ${RED}✗${RESET} %s\n" "$1" >&2; }
info()  { printf "  ${DIM}%s${RESET}\n" "$1"; }

# Get human-readable file size
get_size() {
  local file="$1"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    # macOS
    local bytes=$(stat -f%z "$file" 2>/dev/null || echo "0")
  else
    # Linux
    local bytes=$(stat -c%s "$file" 2>/dev/null || echo "0")
  fi
  
  if [[ $bytes -ge 1073741824 ]]; then
    printf "%.1f GB" $(echo "scale=1; $bytes / 1073741824" | bc)
  elif [[ $bytes -ge 1048576 ]]; then
    printf "%.1f MB" $(echo "scale=1; $bytes / 1048576" | bc)
  else
    printf "%d KB" $((bytes / 1024))
  fi
}

# Check if model directory exists
if [[ ! -d "$MODEL_DIR" ]]; then
  err "Model directory not found: $MODEL_DIR"
  err "Please create the directory and place .gguf model files there."
  exit 1
fi

# Scan for .gguf files
step "Scanning for models in $MODEL_DIR"
shopt -s nullglob
MODELS=("$MODEL_DIR"/*.gguf)
shopt -u nullglob

if [[ ${#MODELS[@]} -eq 0 ]]; then
  err "No .gguf model files found in $MODEL_DIR"
  err "Please download a model and try again."
  exit 1
fi

ok "Found ${#MODELS[@]} model(s)"

# Check for existing selection
LAST_SELECTED=""
if [[ -f "$SELECTION_FILE" ]]; then
  LAST_SELECTED=$(cat "$SELECTION_FILE" 2>/dev/null || true)
  if [[ -n "$LAST_SELECTED" ]] && [[ -f "$LAST_SELECTED" ]]; then
    LAST_NAME=$(basename "$LAST_SELECTED")
    info "Last selected: $LAST_NAME"
  else
    LAST_SELECTED=""
  fi
fi

# Display menu
printf "\n${YELLOW}Select a model:${RESET}\n\n"

DISPLAY_OPTIONS=()
IDX=1

# Option to use last selected (if exists)
if [[ -n "$LAST_SELECTED" ]]; then
  DISPLAY_OPTIONS+=("$LAST_SELECTED")
  printf "  ${GREEN}[%d]${RESET} ${GREEN}✓ Use last selected: %s${RESET}\n" "$IDX" "$(basename "$LAST_SELECTED")"
  IDX=$((IDX + 1))
fi

# List all available models
for MODEL in "${MODELS[@]}"; do
  DISPLAY_OPTIONS+=("$MODEL")
  NAME=$(basename "$MODEL")
  SIZE=$(get_size "$MODEL")
  printf "  ${GREEN}[%d]${RESET} %s ${DIM}(%s)${RESET}\n" "$IDX" "$NAME" "$SIZE"
  IDX=$((IDX + 1))
done

printf "\n  ${RED}[0]${RESET} ${RED}Cancel (exit without starting)${RESET}\n\n"

# Get user input
while true; do
  printf "${YELLOW}Enter selection [0-%d]:${RESET} " "$((${#DISPLAY_OPTIONS[@]}))"
  read -r SELECTION
  
  # Check if input is a number
  if ! [[ "$SELECTION" =~ ^[0-9]+$ ]]; then
    err "Invalid input. Please enter a number."
    continue
  fi
  
  # Handle cancel
  if [[ "$SELECTION" -eq 0 ]]; then
    printf "\n${YELLOW}Cancelled by user.${RESET}\n"
    exit 1
  fi
  
  # Validate range
  if [[ "$SELECTION" -lt 1 ]] || [[ "$SELECTION" -gt ${#DISPLAY_OPTIONS[@]} ]]; then
    err "Invalid selection. Please choose between 0 and ${#DISPLAY_OPTIONS[@]}."
    continue
  fi
  
  # Valid selection
  break
done

# Get selected model path (array is 0-indexed)
SELECTED_MODEL="${DISPLAY_OPTIONS[$((SELECTION - 1))]}"
SELECTED_NAME=$(basename "$SELECTED_MODEL")

step "Selected: $SELECTED_NAME"

# Save selection to files
mkdir -p data
echo "$SELECTED_MODEL" > "$SELECTION_FILE"
echo "$SELECTED_NAME" > "$NAME_FILE"

ok "Selection saved to $SELECTION_FILE"
ok "Model name saved to $NAME_FILE"

printf "\n${GREEN}✓ Ready to start with model: $SELECTED_NAME${RESET}\n\n"
exit 0
