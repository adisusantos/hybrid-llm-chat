#!/usr/bin/env bash
# Idempotent one-time setup. Safe to re-run.
#   ./scripts/setup.sh           # full setup
#   SKIP_SEED=1 ./scripts/setup.sh   # skip the optional seed chat
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

step() { printf "\n\033[1;34m[setup]\033[0m %s\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
die()  { printf "  \033[31m✗\033[0m %s\n" "$1" >&2; exit 1; }

# ---- prerequisites -------------------------------------------------------

step "Checking prerequisites"

command -v node >/dev/null 2>&1 || die "node not found. Install Node 22+ first."
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node 22+ required (found $NODE_MAJOR)."
ok "node $(node --version)"

if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm --version)"
else
  warn "pnpm not found, installing via npm..."
  npm install -g pnpm
  ok "pnpm $(pnpm --version)"
fi

if command -v llama-server >/dev/null 2>&1; then
  ok "llama-server found at $(command -v llama-server)"
else
  warn "llama-server not in PATH. Install with: brew install llama.cpp"
fi

# ---- install dependencies ------------------------------------------------

step "Installing npm dependencies"

if [[ -d node_modules ]] && [[ package-lock.json -nt package.json || pnpm-lock.yaml -nt package.json ]]; then
  ok "node_modules already present and up to date"
else
  pnpm install
  ok "pnpm install"
fi

# ---- approve native build scripts -----------------------------------------

step "Approving native build scripts (better-sqlite3, esbuild)"

pnpm approve-builds better-sqlite3 esbuild >/dev/null 2>&1 || true
ok "approved"

# ---- database ------------------------------------------------------------

step "Setting up SQLite database at ./data/roleplay.db"

mkdir -p data/avatars

if [[ -f data/roleplay.db ]]; then
  ok "data/roleplay.db already exists, skipping migration"
else
  pnpm db:migrate
  ok "ran db:migrate"
fi

# ---- seed (optional) -----------------------------------------------------

step "Optional: seed a default character + preset"

# Always ensure the defaults exist by hitting the listing endpoint.
# This is idempotent — see lib/db/queries.ts (getOrCreateDefault*).
ok "(defaults auto-seed on first access; no explicit step needed)"

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  if [[ ! -f data/roleplay.db ]] || ! node -e "require('better-sqlite3')('./data/roleplay.db').prepare(\"SELECT id FROM characters WHERE id='default-aria'\").get()" >/dev/null 2>&1; then
    warn "default character not found — run the dev server once to trigger seed"
  fi
  # Optional dev chat
  if [[ "${NO_TEST_CHAT:-0}" != "1" ]]; then
    CHAT_ID="$(pnpm tsx scripts/seed-chat.ts 2>/dev/null | tail -1 | sed 's/CHAT_ID=//')"
    if [[ -n "$CHAT_ID" ]]; then
      ok "test chat id: $CHAT_ID"
    fi
  fi
fi

# ---- summary --------------------------------------------------------------

step "Setup complete"

cat <<EOF

Next steps:
  1. Start llama-server (separate terminal):
       bash scripts/start-llama.sh

  2. Start the app:
       ./scripts/dev.sh
     or:
       pnpm dev

  3. Open http://localhost:3000

EOF
