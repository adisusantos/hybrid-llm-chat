import { getModelName } from "./model-config";

// Stop tokens for Aion-RP via llama-server.
// Keep these specific to synthetic speaker labels instead of broad prefixes like
// "\n\n__", which can prematurely stop otherwise normal prose.

export const AION_RP_STOP_TOKENS: readonly string[] = [
  "__USER__:",
  "__ASSISTANT__:",
  "__SYSTEM__:",
  "<|im_end|>",
  "<|eot_id|>",
  "</s>",
] as const;

// Dynamic model name - loaded from selection file or env var
// See lib/llama/model-config.ts for implementation details
export const AION_RP_MODEL_NAME = getModelName();
