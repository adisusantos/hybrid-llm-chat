import "server-only";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getSetting } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Setting keys
// ---------------------------------------------------------------------------

export const SETTING_KEY_COMFYUI_URL = "comfyui.url";
export const SETTING_KEY_COMFYUI_ENABLED = "comfyui.enabled";
export const SETTING_KEY_COMFYUI_WORKFLOW_PATH = "comfyui.workflow_path";
export const SETTING_KEY_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH = "comfyui.faceswap_only_workflow_path";
export const SETTING_KEY_COMFYUI_CHECKPOINT = "comfyui.checkpoint";
export const SETTING_KEY_COMFYUI_OUTPUT_PATH = "comfyui.output_path";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_COMFYUI_URL = "http://127.0.0.1:8188";
export const DEFAULT_COMFYUI_ENABLED = false;
export const DEFAULT_COMFYUI_WORKFLOW_PATH =
  "data/comfyui/faceswap_workflow.json";
export const DEFAULT_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH =
  "data/comfyui/faceswap_only_workflow.json";
export const DEBUG_COMFYUI_WORKFLOW_PATH =
  "data/comfyui/generate_workflow.json";

export const DEFAULT_PROMPT_NODE_TITLE = "Positive Prompt";
export const DEFAULT_NEGATIVE_PROMPT_NODE_TITLE = "Negative Prompt";
export const DEFAULT_SOURCE_FACE_NODE_TITLE = "Load Source Face";
export const DEFAULT_TARGET_IMAGE_NODE_TITLE = "Load Target Image";
export const DEFAULT_OUTPUT_NODE_TITLE = "Save Image";
export const DEFAULT_CHECKPOINT_NODE_TITLE = "Load Checkpoint";
/** When null, checkpoint in the workflow file is used as-is. */
export const DEFAULT_COMFYUI_CHECKPOINT: string | null = null;
/** When null/empty, auto-delete of ComfyUI output files is disabled. */
export const DEFAULT_COMFYUI_OUTPUT_PATH: string | null = null;

// ---------------------------------------------------------------------------
// Types — workflow structure
// ---------------------------------------------------------------------------

export type ComfyUINodeInputs = Record<string, unknown>;

export type ComfyUINode = {
  class_type: string;
  _meta?: { title?: string };
  inputs: ComfyUINodeInputs;
};

export type ComfyUIWorkflow = Record<string, ComfyUINode>;

// ---------------------------------------------------------------------------
// Types — configuration
// ---------------------------------------------------------------------------

export type ComfyUIConfig = {
  /** ComfyUI HTTP base URL. Default: "http://127.0.0.1:8188" */
  url: string;
  /** Whether the ComfyUI provider is active. Default: false */
  enabled: boolean;
  /** Path to the workflow JSON file. Default: "data/comfyui/faceswap_workflow.json" */
  workflowPath: string;
  /** Path to the faceswap-only workflow JSON file. Default: "data/comfyui/faceswap_only_workflow.json" */
  faceswapOnlyWorkflowPath: string;
  /** _meta.title of the positive-prompt node. Default: "Positive Prompt" */
  promptNodeTitle: string;
  /** _meta.title of the source-face loader node. Default: "Load Source Face" */
  sourceFaceNodeTitle: string;
  /** _meta.title of the target-image loader node (for hybrid faceswap). Default: "Load Target Image" */
  targetImageNodeTitle: string;
  /** _meta.title of the output/save node. Default: "Save Image" */
  outputNodeTitle: string;
  /**
   * Checkpoint model filename to inject into the workflow at runtime.
   * e.g. "realisticVisionV60B1_v51HyperVAE.safetensors"
   * When null/empty, the checkpoint already in the workflow file is used as-is.
   */
  checkpoint: string | null;
  /** _meta.title of the checkpoint loader node. Default: "Load Checkpoint" */
  checkpointNodeTitle: string;
  /**
   * Absolute path to ComfyUI's output folder.
   * When set, generated images are deleted from this folder after being
   * downloaded and saved to our encrypted store.
   * When null/empty, auto-delete is disabled and files remain in ComfyUI output.
   * Example: "/path/to/ComfyUI/output"
   */
  outputPath: string | null;
};

// ---------------------------------------------------------------------------
// Types — pipeline params / result
// ---------------------------------------------------------------------------

export type ComfyUIGenerateParams = {
  prompt: string;
  negativePrompt?: string;
  characterId: string;
  useFaceSwap: boolean;
  /** null when no avatar is available */
  avatarPath: string | null;
};

export type ComfyUIGenerateResult = {
  image: Buffer;
  width: number;
  height: number;
  contentType: string;
  faceSwapApplied: boolean;
  promptId: string;
};

export type ComfyUIHybridGenerateParams = {
  targetImage: Buffer;
  avatarPath: string;
};

/**
 * Hybrid ComfyUI generation pipeline — face swap only.
 *
 * Steps:
 * 1. Load config.
 * 2. Read and parse the faceswap-only workflow JSON from disk.
 * 3. Upload the target image (from cloud) to ComfyUI.
 * 4. Upload the source face (avatar) to ComfyUI.
 * 5. Inject filenames into workflow.
 * 6. Submit workflow, poll, download, and delete.
 */
export async function faceSwapOnlyWithComfyUI(
  params: ComfyUIHybridGenerateParams,
  opts?: { config?: ComfyUIConfig },
): Promise<ComfyUIGenerateResult> {
  const config = opts?.config ?? (await getComfyUIConfig());

  // 1. Read workflow
  let workflowJson: ComfyUIWorkflow;
  try {
    const raw = await readFile(config.faceswapOnlyWorkflowPath, "utf-8");
    workflowJson = JSON.parse(raw) as ComfyUIWorkflow;
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new Error(
        `ComfyUI faceswap-only workflow not found at path: ${config.faceswapOnlyWorkflowPath}`,
      );
    }
    throw err;
  }

  // 2. Upload images
  const uploadedTarget = await uploadImageBuffer(
    config.url,
    params.targetImage,
    `target_cloud_${Date.now()}.png`,
    "image/png"
  );
  
  const uploadedSource = await uploadSourceFace(config.url, params.avatarPath);

  // 3. Inject filenames
  const injectedWorkflow = injectWorkflowValues(
    workflowJson,
    {
      targetFilename: uploadedTarget.name,
      uploadedFilename: uploadedSource.name,
    },
    {
      promptNodeTitle: config.promptNodeTitle,
      sourceFaceNodeTitle: config.sourceFaceNodeTitle,
      targetImageNodeTitle: config.targetImageNodeTitle,
    },
  );
  
  for (const node of Object.values(injectedWorkflow)) {
    if (
      (node.class_type === "KSampler" || node.class_type === "KSamplerAdvanced") &&
      "seed" in node.inputs
    ) {
      node.inputs.seed = Math.floor(Math.random() * 2 ** 32);
    }
    if ("noise_seed" in node.inputs) {
      node.inputs.noise_seed = Math.floor(Math.random() * 2 ** 32);
    }
  }

  // 4. Submit
  const baseUrl = config.url.replace(/\/+$/, "");
  let promptRes: Response;
  try {
    promptRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: injectedWorkflow }),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ComfyUI unreachable at ${baseUrl}: ${reason}`);
  }

  if (!promptRes.ok) {
    const body = await promptRes.text().catch(() => "");
    throw new Error(
      `ComfyUI /prompt error ${promptRes.status}: ${body.slice(0, 400)}`,
    );
  }

  const promptData = (await promptRes.json()) as { prompt_id?: string };
  const promptId = promptData.prompt_id;
  if (!promptId) {
    throw new Error("ComfyUI /prompt: missing 'prompt_id'");
  }

  // 5. Poll & download
  const { filename, subfolder } = await pollForResult(
    config.url,
    promptId,
    config.outputNodeTitle,
  );

  const imageBuffer = await downloadResult(config.url, filename, subfolder);

  // 6. Cleanup output
  if (config.outputPath?.trim()) {
    const outputFilePath = path.join(
      config.outputPath.trim(),
      subfolder ? path.join(subfolder, filename) : filename,
    );
    try {
      await unlink(outputFilePath);
    } catch (err) {
      console.warn(
        `[ComfyUI] Could not delete output file at ${outputFilePath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  return {
    image: imageBuffer,
    width: 0,
    height: 0,
    contentType: "image/png",
    faceSwapApplied: true,
    promptId,
  };
}

// ---------------------------------------------------------------------------
// Workflow helpers
// ---------------------------------------------------------------------------

/**
 * Find the first node in a ComfyUI workflow whose `_meta.title` matches the
 * given title. Returns `undefined` if no such node exists.
 */
export function findNodeByTitle(
  workflow: ComfyUIWorkflow,
  title: string,
): ComfyUINode | undefined {
  for (const node of Object.values(workflow)) {
    if (node._meta?.title === title) {
      return node;
    }
  }
  return undefined;
}

export async function getComfyUIConfig(): Promise<ComfyUIConfig> {
  const [url, enabled, workflowPath, faceswapOnlyWorkflowPath, checkpoint, outputPath] = await Promise.all([
    getSetting<string>(SETTING_KEY_COMFYUI_URL),
    getSetting<boolean>(SETTING_KEY_COMFYUI_ENABLED),
    getSetting<string>(SETTING_KEY_COMFYUI_WORKFLOW_PATH),
    getSetting<string>(SETTING_KEY_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH),
    getSetting<string>(SETTING_KEY_COMFYUI_CHECKPOINT),
    getSetting<string>(SETTING_KEY_COMFYUI_OUTPUT_PATH),
  ]);
  return {
    url: url ?? DEFAULT_COMFYUI_URL,
    enabled: enabled ?? DEFAULT_COMFYUI_ENABLED,
    workflowPath: workflowPath ?? DEFAULT_COMFYUI_WORKFLOW_PATH,
    faceswapOnlyWorkflowPath: faceswapOnlyWorkflowPath ?? DEFAULT_COMFYUI_FACESWAP_ONLY_WORKFLOW_PATH,
    promptNodeTitle: DEFAULT_PROMPT_NODE_TITLE,
    sourceFaceNodeTitle: DEFAULT_SOURCE_FACE_NODE_TITLE,
    targetImageNodeTitle: DEFAULT_TARGET_IMAGE_NODE_TITLE,
    outputNodeTitle: DEFAULT_OUTPUT_NODE_TITLE,
    checkpoint: checkpoint ?? DEFAULT_COMFYUI_CHECKPOINT,
    checkpointNodeTitle: DEFAULT_CHECKPOINT_NODE_TITLE,
    outputPath: outputPath ?? DEFAULT_COMFYUI_OUTPUT_PATH,
  };
}

/**
 * Deep-clone a ComfyUI workflow and inject runtime values into the appropriate
 * nodes. This is a pure function — the original workflow object is never
 * mutated.
 *
 * - `values.prompt` is written to `inputs.text` of the node whose
 *   `_meta.title` matches `config.promptNodeTitle`.
 * - `values.uploadedFilename` (when provided) is written to `inputs.image` of
 *   the node whose `_meta.title` matches `config.sourceFaceNodeTitle`. If that
 *   node does not exist in the workflow (txt2img-only workflow), the injection
 *   is silently skipped — no error is thrown.
 *
 * @returns A deep clone of `workflow` with the injected values applied.
 */
export function injectWorkflowValues(
  workflow: ComfyUIWorkflow,
  values: { prompt?: string; negativePrompt?: string; uploadedFilename?: string; targetFilename?: string; checkpoint?: string },
  config: Pick<ComfyUIConfig, "promptNodeTitle" | "sourceFaceNodeTitle"> & {
    targetImageNodeTitle?: string;
    checkpointNodeTitle?: string;
  },
): ComfyUIWorkflow {
  const clone = structuredClone(workflow);

  if (values.prompt !== undefined) {
    const promptNode = findNodeByTitle(clone, config.promptNodeTitle);
    if (promptNode) {
      promptNode.inputs.text = values.prompt;
    }
  }

  if (values.negativePrompt !== undefined) {
    const negativePromptNode = findNodeByTitle(clone, DEFAULT_NEGATIVE_PROMPT_NODE_TITLE);
    if (negativePromptNode) negativePromptNode.inputs.text = values.negativePrompt;
  }

  if (values.uploadedFilename !== undefined) {
    const sourceFaceNode = findNodeByTitle(clone, config.sourceFaceNodeTitle);
    if (sourceFaceNode) {
      sourceFaceNode.inputs.image = values.uploadedFilename;
    }
  }

  if (values.targetFilename !== undefined && config.targetImageNodeTitle) {
    const targetImageNode = findNodeByTitle(clone, config.targetImageNodeTitle);
    if (targetImageNode) {
      targetImageNode.inputs.image = values.targetFilename;
    }
  }

  // Inject checkpoint model if provided — overrides whatever is in the workflow file
  if (values.checkpoint) {
    const checkpointNode = findNodeByTitle(
      clone,
      config.checkpointNodeTitle ?? DEFAULT_CHECKPOINT_NODE_TITLE,
    );
    if (checkpointNode) {
      checkpointNode.inputs.ckpt_name = values.checkpoint;
    }
  }

  return clone;
}

// ---------------------------------------------------------------------------
// Connection testing
// ---------------------------------------------------------------------------

/**
 * Test connectivity to a ComfyUI instance by calling its `/system_stats`
 * endpoint.
 *
 * Returns `{ version: string }` on success (version is read from
 * `data.system.comfyui_version` or `data.system.version`).
 *
 * Throws a human-readable error for every failure mode:
 *   - Network / DNS / connection-refused → "ComfyUI unreachable at <url>: <reason>"
 *   - Non-2xx HTTP status              → "ComfyUI /system_stats returned status <N>"
 *   - Body is not valid JSON           → "ComfyUI /system_stats returned invalid JSON"
 *   - JSON lacks version field         → "ComfyUI /system_stats response missing version field"
 *
 * Uses a 10-second timeout via `AbortSignal.timeout`.
 */
export async function testConnection(url: string): Promise<{ version: string }> {
  const normalizedUrl = url.replace(/\/+$/, "");
  const endpoint = `${normalizedUrl}/system_stats`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : String(err);
    throw new Error(`ComfyUI unreachable at ${normalizedUrl}: ${reason}`);
  }

  if (!res.ok) {
    throw new Error(
      `ComfyUI /system_stats returned status ${res.status}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("ComfyUI /system_stats returned invalid JSON");
  }

  const system = (data as Record<string, unknown>)?.system as
    | Record<string, unknown>
    | undefined;

  const version =
    typeof system?.comfyui_version === "string"
      ? system.comfyui_version
      : typeof system?.version === "string"
        ? system.version
        : undefined;

  if (!version) {
    throw new Error(
      "ComfyUI /system_stats response missing version field",
    );
  }

  return { version };
}

// ---------------------------------------------------------------------------
// Upload source face to ComfyUI (/upload/image)
// ---------------------------------------------------------------------------

const SUPPORTED_AVATAR_FORMATS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
// Normalised set for error message — "jpeg" is an alias for "jpg"
const SUPPORTED_AVATAR_FORMATS_DISPLAY = ["png", "jpg", "webp", "gif"] as const;

/**
 * Upload an avatar image to ComfyUI's `/upload/image` endpoint.
 *
 * - Validates the file extension (png, jpg, webp, gif). Throws a descriptive
 *   error for unsupported formats.
 * - Reads the file from `avatarPath`. Distinguishes "file not found" (ENOENT)
 *   from other read errors (permission, corruption, …).
 * - Sends the file as `multipart/form-data` and returns the server-assigned
 *   filename `{ name: string }`.
 */
async function uploadSourceFace(
  url: string,
  avatarPath: string,
): Promise<{ name: string }> {
  // 1. Validate file extension
  const ext = path.extname(avatarPath).toLowerCase().replace(/^\./, "");
  if (!(SUPPORTED_AVATAR_FORMATS as readonly string[]).includes(ext)) {
    throw new Error(
      `ComfyUI: unsupported avatar format '${ext}'. Supported: ${SUPPORTED_AVATAR_FORMATS_DISPLAY.join(", ")}`,
    );
  }

  // 2. Read avatar file from filesystem
  let fileBytes: Buffer;
  try {
    fileBytes = await readFile(avatarPath);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new Error(`ComfyUI: avatar not found at ${avatarPath}`);
    }
    // Other errors: permission denied, I/O error, etc.
    const reason =
      nodeErr.message ?? String(err);
    throw new Error(
      `ComfyUI: failed to read avatar at ${avatarPath}: ${reason}`,
    );
  }

  // 3. Build multipart/form-data and POST to /upload/image
  const filename = path.basename(avatarPath);
  const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(fileBytes)], { type: mimeType }), filename);

  const baseUrl = url.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    throw new Error(`ComfyUI unreachable at ${baseUrl}: ${reason}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI /upload/image error ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as { name?: string };
  if (typeof data.name !== "string") {
    throw new Error(
      "ComfyUI /upload/image: unexpected response — missing 'name' field",
    );
  }

  return { name: data.name };
}

/**
 * Upload an image buffer (e.g. from cloud generation) to ComfyUI's `/upload/image` endpoint.
 */
async function uploadImageBuffer(
  url: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ name: string }> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

  const baseUrl = url.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/upload/image`, {
      method: "POST",
      body: form,
    });
  } catch (err) {
    const reason = (err as Error).message ?? String(err);
    throw new Error(`ComfyUI unreachable at ${baseUrl}: ${reason}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ComfyUI /upload/image error ${res.status}: ${text.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as { name?: string };
  if (typeof data.name !== "string") {
    throw new Error(
      "ComfyUI /upload/image: unexpected response — missing 'name' field",
    );
  }

  return { name: data.name };
}

// ---------------------------------------------------------------------------
// Polling loop — /history/{prompt_id}
// ---------------------------------------------------------------------------

/**
 * ComfyUI /history/{prompt_id} response shape (simplified to what we need).
 * The outer object is keyed by prompt_id.
 */
type ComfyUIHistoryEntry = {
  outputs?: Record<
    string,
    { images?: Array<{ filename: string; subfolder: string; type: string }> }
  >;
  status?: {
    completed?: boolean;
    status_messages?: Array<{ type: string; data?: unknown }>;
  };
};

type ComfyUIHistoryResponse = Record<string, ComfyUIHistoryEntry>;

/**
 * Poll `GET <url>/history/<promptId>` until the workflow completes, then
 * return the filename and subfolder of the output image.
 *
 * Polling behaviour:
 * - Interval between polls: 2 seconds (via `setTimeout`).
 * - Total timeout: 120 seconds. If no output is available within 120 s,
 *   throws `Error("ComfyUI workflow timed out after 120s (prompt_id: <id>)")`.
 *
 * Error detection:
 * - If any entry in `status.status_messages` has `type === "error"`, throws
 *   `Error("ComfyUI node error: <error_detail>")`.
 *
 * Output extraction:
 * - Finds the first node in `outputs` that has at least one image with
 *   `type === "output"` and returns its `{ filename, subfolder }`.
 *
 * @param url            ComfyUI HTTP base URL (e.g. "http://127.0.0.1:8188")
 * @param promptId       The prompt_id returned by /prompt
 * @param outputNodeTitle _meta.title of the expected output node (currently
 *                        unused for matching — we match by image type instead
 *                        because /history uses node IDs, not titles — kept as
 *                        parameter for forward-compat and documentation).
 */
async function pollForResult(
  url: string,
  promptId: string,
  outputNodeTitle: string, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<{ filename: string; subfolder: string }> {
  const baseUrl = url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/history/${promptId}`;

  const POLL_INTERVAL_MS = 2_000;
  const TIMEOUT_MS = 300_000;

  const startedAt = Date.now();

  while (true) {
    // ── Timeout check ──────────────────────────────────────────────────────
    const elapsed = Date.now() - startedAt;
    if (elapsed >= TIMEOUT_MS) {
      throw new Error(
        `ComfyUI workflow timed out after 300s (prompt_id: ${promptId})`,
      );
    }

    // ── Fetch history ───────────────────────────────────────────────────────
    let historyRes: Response;
    try {
      historyRes = await fetch(endpoint);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`ComfyUI unreachable at ${baseUrl}: ${reason}`);
    }

    if (!historyRes.ok) {
      throw new Error(
        `ComfyUI /history error ${historyRes.status}: ${await historyRes.text().catch(() => "")}`,
      );
    }

    let history: ComfyUIHistoryResponse;
    try {
      history = (await historyRes.json()) as ComfyUIHistoryResponse;
    } catch {
      throw new Error("ComfyUI /history returned invalid JSON");
    }

    const entry = history[promptId];

    // ── Not yet in history → workflow still queued/running ─────────────────
    if (!entry) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    // ── Check for node errors ───────────────────────────────────────────────
    const messages = entry.status?.status_messages ?? [];
    const errorMessage = messages.find((m) => m.type === "error");
    if (errorMessage) {
      const detail =
        errorMessage.data !== undefined
          ? JSON.stringify(errorMessage.data)
          : "unknown error";
      throw new Error(`ComfyUI node error: ${detail}`);
    }

    // ── Check outputs ───────────────────────────────────────────────────────
    const outputs = entry.outputs ?? {};
    if (Object.keys(outputs).length === 0) {
      // Outputs not populated yet — workflow still running
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }

    // Find any node that has an image with type === "output"
    for (const nodeOutputs of Object.values(outputs)) {
      const images = nodeOutputs.images ?? [];
      const outputImage = images.find((img) => img.type === "output");
      if (outputImage) {
        return {
          filename: outputImage.filename,
          subfolder: outputImage.subfolder,
        };
      }
    }

    // Outputs key exists but no image with type="output" found yet
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// ---------------------------------------------------------------------------
// Download result image from ComfyUI (/view)
// ---------------------------------------------------------------------------

/**
 * Download a generated image from ComfyUI's `/view` endpoint.
 *
 * Sends `GET <url>/view?filename=<f>&subfolder=<s>&type=output` and returns
 * the raw image bytes as a `Buffer`.
 *
 * @param url       ComfyUI HTTP base URL (e.g. "http://127.0.0.1:8188")
 * @param filename  Filename returned by the polling loop
 * @param subfolder Subfolder returned by the polling loop
 * @throws `Error("ComfyUI /view error <status>")` for non-2xx responses
 */
async function downloadResult(
  url: string,
  filename: string,
  subfolder: string,
): Promise<Buffer> {
  const baseUrl = url.replace(/\/+$/, "");

  const params = new URLSearchParams({
    filename,
    subfolder,
    type: "output",
  });

  const res = await fetch(`${baseUrl}/view?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`ComfyUI /view error ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Main pipeline — generateWithComfyUI
// ---------------------------------------------------------------------------

/**
 * Full ComfyUI generation pipeline — txt2img with optional face swap.
 *
 * Steps:
 * 1. Load config (from `opts.config` or `getComfyUIConfig()`).
 * 2. Read and parse the workflow JSON from disk. Throws if the file is missing.
 * 3. Optionally upload the source face and inject its filename into the workflow.
 * 4. Inject the text prompt into the workflow.
 * 5. Submit the workflow to ComfyUI via POST /prompt.
 * 6. Poll for completion via /history, then download the result via /view.
 * 7. Return a `ComfyUIGenerateResult`.
 *
 * Error contract (matches design.md §Error Handling):
 * - Workflow file not found  → `Error("ComfyUI workflow not found at path: <path>")`
 * - ComfyUI unreachable      → `Error("ComfyUI unreachable at <url>: <reason>")`
 * - POST /prompt non-2xx     → `Error("ComfyUI /prompt error <status>: <body>")`
 * - Polling timeout          → `Error("ComfyUI workflow timed out after 120s (prompt_id: <id>)")`
 * - Node error in workflow   → `Error("ComfyUI node error: <detail>")`
 *
 * Face-swap policy:
 * - `useFaceSwap=true` + `avatarPath=null`  → log warning, run without face swap, `faceSwapApplied=false`
 * - `useFaceSwap=true` + valid `avatarPath` → upload face, inject, `faceSwapApplied=true`
 * - `useFaceSwap=false`                     → skip entirely, `faceSwapApplied=false`
 */
export async function generateWithComfyUI(
  params: ComfyUIGenerateParams,
  opts?: { config?: ComfyUIConfig },
): Promise<ComfyUIGenerateResult> {
  // ── 1. Load config ────────────────────────────────────────────────────────
  const config = opts?.config ?? (await getComfyUIConfig());

  // ── 2. Read workflow JSON from disk ───────────────────────────────────────
  let workflowJson: ComfyUIWorkflow;
  try {
    const raw = await readFile(config.workflowPath, "utf-8");
    workflowJson = JSON.parse(raw) as ComfyUIWorkflow;
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      throw new Error(
        `ComfyUI workflow not found at path: ${config.workflowPath}`,
      );
    }
    // Re-throw JSON parse errors and other I/O errors as-is
    throw err;
  }

  // ── 3. Optional face swap — upload source face ────────────────────────────
  let faceSwapApplied = false;
  let uploadedFilename: string | undefined;

  if (params.useFaceSwap) {
    if (params.avatarPath === null) {
      console.warn(
        "[ComfyUI] useFaceSwap=true but avatarPath is null — " +
          "running without face swap.",
      );
      // faceSwapApplied stays false
    } else {
      const uploaded = await uploadSourceFace(config.url, params.avatarPath);
      uploadedFilename = uploaded.name;
      faceSwapApplied = true;
    }
  }

  // ── 4. Inject prompt (and optional filename) into workflow ────────────────
  // Also randomise the KSampler seed to prevent ComfyUI from serving a cached
  // result when the prompt hasn't changed.
  const injectedWorkflow = injectWorkflowValues(
    workflowJson,
    {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      uploadedFilename,
      checkpoint: config.checkpoint ?? undefined,
    },
    config,
  );

  // Inject a random seed into any KSampler / KSamplerAdvanced node to bust
  // ComfyUI's prompt cache.
  for (const node of Object.values(injectedWorkflow)) {
    if (
      (node.class_type === "KSampler" || node.class_type === "KSamplerAdvanced") &&
      "seed" in node.inputs
    ) {
      node.inputs.seed = Math.floor(Math.random() * 2 ** 32);
    }
    // Also handles noise_seed used by some custom samplers
    if ("noise_seed" in node.inputs) {
      node.inputs.noise_seed = Math.floor(Math.random() * 2 ** 32);
    }
  }

  // ── 5. Submit workflow to ComfyUI — POST /prompt ──────────────────────────
  const baseUrl = config.url.replace(/\/+$/, "");

  let promptRes: Response;
  try {
    promptRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: injectedWorkflow }),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ComfyUI unreachable at ${baseUrl}: ${reason}`);
  }

  if (!promptRes.ok) {
    const body = await promptRes.text().catch(() => "");
    throw new Error(
      `ComfyUI /prompt error ${promptRes.status}: ${body.slice(0, 400)}`,
    );
  }

  const promptData = (await promptRes.json()) as { prompt_id?: string };
  const promptId = promptData.prompt_id;
  if (typeof promptId !== "string" || promptId.length === 0) {
    throw new Error(
      "ComfyUI /prompt: unexpected response — missing 'prompt_id' field",
    );
  }

  // ── 6. Poll for completion, then download result ──────────────────────────
  const { filename, subfolder } = await pollForResult(
    config.url,
    promptId,
    config.outputNodeTitle,
  );

  const imageBuffer = await downloadResult(config.url, filename, subfolder);

  // ── 7. Auto-delete output file from ComfyUI folder (if configured) ────────
  // Only runs when comfyui.output_path is set in Settings.
  // Non-fatal: if delete fails (file moved, permissions, etc.) we log and continue.
  if (config.outputPath?.trim()) {
    const outputFilePath = path.join(
      config.outputPath.trim(),
      subfolder ? path.join(subfolder, filename) : filename,
    );
    try {
      await unlink(outputFilePath);
    } catch (err) {
      // Non-fatal — file may have already been moved or deleted
      console.warn(
        `[ComfyUI] Could not delete output file at ${outputFilePath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  // ── 8. Return result ──────────────────────────────────────────────────────
  // width/height are not available from the ComfyUI API without extra parsing;
  // set to 0 — the route handler can update them later if needed.
  return {
    image: imageBuffer,
    width: 0,
    height: 0,
    contentType: "image/png",
    faceSwapApplied,
    promptId,
  };
}
