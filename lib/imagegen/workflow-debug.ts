import "server-only";

import { readFile } from "node:fs/promises";
import {
  DEFAULT_COMFYUI_WORKFLOW_PATH,
  DEFAULT_NEGATIVE_PROMPT_NODE_TITLE,
  DEBUG_COMFYUI_WORKFLOW_PATH,
  getComfyUIConfig,
} from "@/lib/imagegen/comfyui";

export type WorkflowDebugInfo = {
  ok: boolean;
  path: string;
  error?: string;
  nodeTitles: string[];
  positivePrompt?: string;
  negativePrompt?: string;
  checkpoint?: string;
  savePrefix?: string;
  sourceFaceImage?: string;
  samplePrompt?: string;
};

export async function loadComfyUIWorkflowDebug(): Promise<WorkflowDebugInfo> {
  let config;
  try {
    config = await getComfyUIConfig();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      path: DEFAULT_COMFYUI_WORKFLOW_PATH,
      error: `Failed to load ComfyUI config: ${msg}`,
      nodeTitles: [],
    };
  }

  const path = DEBUG_COMFYUI_WORKFLOW_PATH;
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    return {
      ok: false,
      path,
      error:
        nodeErr.code === "ENOENT"
          ? `Workflow file not found at ${path}`
          : `Failed to read workflow: ${nodeErr.message}`,
      nodeTitles: [],
    };
  }

  type WorkflowNode = {
    _meta?: { title?: string };
    inputs?: Record<string, unknown>;
  };

  let workflow: Record<string, WorkflowNode>;
  try {
    workflow = JSON.parse(raw) as Record<string, WorkflowNode>;
  } catch {
    return { ok: false, path, error: "Workflow file is not valid JSON", nodeTitles: [] };
  }

  const nodeTitles: string[] = [];
  let positivePrompt: string | undefined;
  let negativePrompt: string | undefined;
  let checkpoint: string | undefined;
  let savePrefix: string | undefined;
  let sourceFaceImage: string | undefined;

  for (const node of Object.values(workflow)) {
    const title = node._meta?.title;
    if (typeof title === "string" && !nodeTitles.includes(title)) nodeTitles.push(title);
    if (title === config.promptNodeTitle && typeof node.inputs?.text === "string") {
      positivePrompt = node.inputs.text;
    }
    if (title === DEFAULT_NEGATIVE_PROMPT_NODE_TITLE && typeof node.inputs?.text === "string") {
      negativePrompt = node.inputs.text;
    }
    if (title === config.checkpointNodeTitle && typeof node.inputs?.ckpt_name === "string") {
      checkpoint = node.inputs.ckpt_name;
    }
    if (title === config.outputNodeTitle && typeof node.inputs?.filename_prefix === "string") {
      savePrefix = node.inputs.filename_prefix;
    }
    if (title === config.sourceFaceNodeTitle && typeof node.inputs?.image === "string") {
      sourceFaceImage = node.inputs.image;
    }
  }

  return {
    ok: true,
    path,
    nodeTitles,
    positivePrompt,
    negativePrompt,
    checkpoint,
    savePrefix,
    sourceFaceImage: sourceFaceImage ??
      (nodeTitles.includes(config.sourceFaceNodeTitle) ? "(will be replaced at runtime)" : undefined),
    samplePrompt: nodeTitles.includes(config.promptNodeTitle)
      ? "masterpiece, best quality, young woman, smiling, soft lighting"
      : undefined,
  };
}
