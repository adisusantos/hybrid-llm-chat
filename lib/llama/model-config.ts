import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Get the currently selected model name.
 * 
 * Priority:
 * 1. Read from data/selected-model-name.txt (if exists)
 * 2. Extract filename from AION_MODEL env var
 * 3. Fall back to default model
 * 
 * This allows dynamic model selection via the select-model.sh script
 * while maintaining backward compatibility with env-based config.
 */
export function getModelName(): string {
  // Try to read from selection file first
  const selectionFile = path.join(process.cwd(), "data", "selected-model-name.txt");
  
  try {
    if (fs.existsSync(selectionFile)) {
      const content = fs.readFileSync(selectionFile, "utf-8").trim();
      if (content) {
        return content;
      }
    }
  } catch (err) {
    // File doesn't exist or can't be read - continue to fallback
    console.warn("[model-config] Could not read selection file:", err);
  }

  // Fallback to AION_MODEL env var (extract filename only)
  if (process.env.AION_MODEL) {
    const filename = path.basename(process.env.AION_MODEL);
    if (filename.endsWith(".gguf")) {
      return filename;
    }
  }

  // Final fallback to default
  return "Aion-RP-Llama-3.1-8B-Q6_K_L.gguf";
}

/**
 * Save the selected model to persistent config files.
 * 
 * @param modelPath - Full path to the model file (e.g., /path/to/models/xxx.gguf)
 */
export function saveSelectedModel(modelPath: string): void {
  const filename = path.basename(modelPath);
  
  // Save full path to .llamarole.selected-model (for llama-server)
  const pathFile = path.join(process.cwd(), ".llamarole.selected-model");
  fs.writeFileSync(pathFile, modelPath, "utf-8");
  
  // Save filename to data/selected-model-name.txt (for app)
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const nameFile = path.join(dataDir, "selected-model-name.txt");
  fs.writeFileSync(nameFile, filename, "utf-8");
}

/**
 * Get the full path to the selected model.
 * Returns null if no selection exists.
 */
export function getSelectedModelPath(): string | null {
  const pathFile = path.join(process.cwd(), ".llamarole.selected-model");
  
  try {
    if (fs.existsSync(pathFile)) {
      const content = fs.readFileSync(pathFile, "utf-8").trim();
      if (content && fs.existsSync(content)) {
        return content;
      }
    }
  } catch {
    return null;
  }
  
  return null;
}
