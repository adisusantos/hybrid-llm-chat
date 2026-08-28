#!/usr/bin/env bash
# Phase 0 probe harness for Aion-RP via llama-server's OpenAI-compatible API.
# Sends a curated set of test messages and dumps raw + content for analysis.
#
# Usage: bash scripts/probe-aion.sh [probe-name ...]
#   with no args: runs all probes
#   output goes to probe-output/<probe-name>.json (full response)
#   and probe-output/<probe-name>.content.txt (assistant content only)

set -euo pipefail

BASE="${LLAMA_BASE:-http://127.0.0.1:8080/v1}"
MODEL="${LLAMA_MODEL:-Aion-RP-Llama-3.1-8B-Q6_K_L.gguf}"
OUT_DIR="${OUT_DIR:-./probe-output}"

# Stop tokens used by every probe. Kept in one place so a future edit
# doesn't have to be replicated across 8 payloads. The value is a literal
# JSON array (with embedded \n\n__ etc.) and is dropped into the request
# body verbatim.
STOP_TOKENS='["</s>","<|im_end|>","<|eot_id|>","__USER__:","__ASSISTANT__:","\n\n__"]'

mkdir -p "$OUT_DIR"

# A representative character / system prompt mimicking a V2 card.
SYS_MINIMAL='You are a helpful assistant.'
SYS_RICH='You are Aria, a cheerful librarian in a small seaside town.

[Personality]
- Warm, curious, slightly bookish.
- Speaks with gentle humor; never sarcastic or mean.

[Scenario]
Aria works at the lighthouse library. The {{user}} visits on a stormy evening.

[First message]
*looks up from the front desk, rain dripping from the visitor''s coat* "Welcome to the lighthouse library! You look soaked — come in, come in. I was just cataloguing some new arrivals."

[Example dialogue]
{{user}}: What do you recommend?
Aria: *leans over the counter with a conspiratorial grin* "Depends on your mood. Mystery? Romance? Or something with a little more bite — maritime adventure?"

{{user}}: Something cozy.
Aria: "Then this one." *slides a worn paperback across the desk* "A baker, a small town, and a sourdough starter that becomes sentient. Trust me."

Post-History Instructions:
Stay in character. Use *asterisk actions* and "spoken dialogue". Avoid breaking the fourth wall.'

run_probe() {
  local name="$1"
  local payload="$2"
  local out="$OUT_DIR/$name.json"
  local txt="$OUT_DIR/$name.content.txt"

  echo ">>> probe: $name"
  curl -sS -X POST "$BASE/chat/completions" \
    -H 'Content-Type: application/json' \
    --data "$payload" \
    -o "$out"

  python3 - "$out" "$txt" <<'PY'
import json, sys
p, t = sys.argv[1], sys.argv[2]
try:
    d = json.load(open(p))
except Exception as e:
    open(t,'w').write(f"<no json: {e}>\n")
    print(f"   (parse error: {e})")
    sys.exit(0)
choice = (d.get("choices") or [{}])[0]
content = choice.get("message",{}).get("content","")
finish = choice.get("finish_reason","")
usage = d.get("usage",{})
open(t,'w').write(content)
print(f"   finish={finish!r}  prompt={usage.get('prompt_tokens')}  completion={usage.get('completion_tokens')}  total={usage.get('total_tokens')}")
print(f"   content_len={len(content)} chars  -> {t}")
print(f"   raw         -> {p}")
PY
  echo
}

# --- the probes -----------------------------------------------------------

p_minimal_hello() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_MINIMAL" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"Hello, who are you?"}
  ],
  "stream": false,
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 256,
  "stop": $STOP_TOKENS
}
JSON
}

p_rich_greeting() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_RICH" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"*shakes rain off coat* Hi there."}
  ],
  "stream": false,
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 400,
  "stop": $STOP_TOKENS
}
JSON
}

p_action_heavy() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_RICH" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"*walks over to the shelf, runs finger along spines* Tell me about the strangest book here."}
  ],
  "stream": false,
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 400,
  "stop": $STOP_TOKENS
}
JSON
}

p_long_dialogue() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_RICH" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"Hi Aria."},
    {"role":"assistant","content":"*smiles* Welcome back! Looking for another book today, or just here for the kettle?"},
    {"role":"user","content":"I want something scary but not too scary."},
    {"role":"assistant","content":"*taps chin thoughtfully* Hmm... a gothic mystery? Atmospheric dread, but no gore. Try 'The Lighthouse Keeper''s Wife.'"},
    {"role":"user","content":"That sounds perfect. Is it long?"},
    {"role":"assistant","content":"About 320 pages. Easy to read in two sittings, especially on a stormy day like this."},
    {"role":"user","content":"*slaps a coin on the counter* Done. And pour me some tea while I read the first page."}
  ],
  "stream": false,
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 400,
  "stop": $STOP_TOKENS
}
JSON
}

p_no_system() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"user","content":"Hello, who are you?"}
  ],
  "stream": false,
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 200,
  "stop": $STOP_TOKENS
}
JSON
}

p_mes_example_test() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_RICH" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"*nods* Hi Aria, I''m new in town."}
  ],
  "stream": false,
  "temperature": 0.5,
  "top_p": 0.9,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 400,
  "stop": $STOP_TOKENS
}
JSON
}

p_markdown_test() {
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":"You are Aria. Use *italics* for actions, **bold** for emphasis, and > for internal thoughts. You always narrate richly."},
    {"role":"user","content":"Show me a passage where you describe finding a hidden book behind a false panel."}
  ],
  "stream": false,
  "temperature": 0.7,
  "top_p": 0.95,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 300,
  "stop": $STOP_TOKENS
}
JSON
}

p_low_temp_vs_high() {
  # Same prompt, low vs high temperature
  cat <<JSON
{
  "model": "$MODEL",
  "messages": [
    {"role":"system","content":$(printf '%s' "$SYS_RICH" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')},
    {"role":"user","content":"Recommend one book to me."}
  ],
  "stream": false,
  "temperature": 0.3,
  "top_p": 0.9,
  "top_k": 40,
  "min_p": 0.05,
  "max_tokens": 300,
  "stop": $STOP_TOKENS
}
JSON
}

# dispatcher
all=("minimal_hello" "rich_greeting" "action_heavy" "long_dialogue" "no_system" "mes_example_test" "markdown_test" "low_temp_vs_high")

if [[ $# -eq 0 ]]; then
  selected=("${all[@]}")
else
  selected=("$@")
fi

for name in "${selected[@]}"; do
  case "$name" in
    minimal_hello)       run_probe "$name" "$(p_minimal_hello)" ;;
    rich_greeting)       run_probe "$name" "$(p_rich_greeting)" ;;
    action_heavy)        run_probe "$name" "$(p_action_heavy)" ;;
    long_dialogue)       run_probe "$name" "$(p_long_dialogue)" ;;
    no_system)           run_probe "$name" "$(p_no_system)" ;;
    mes_example_test)    run_probe "$name" "$(p_mes_example_test)" ;;
    markdown_test)       run_probe "$name" "$(p_markdown_test)" ;;
    low_temp_vs_high)    run_probe "$name" "$(p_low_temp_vs_high)" ;;
    *) echo "unknown probe: $name"; exit 2 ;;
  esac
done

echo "all done. outputs in: $OUT_DIR"
