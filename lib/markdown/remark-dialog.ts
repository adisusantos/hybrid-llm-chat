import type { Plugin } from "unified";
import type { Root, Text, RootContent } from "mdast";
import { visit } from "unist-util-visit";

// Match straight double-quote pairs in text nodes. Excludes newlines and
// empty strings (so `""` is not treated as dialog).
const DIALOG_RE = /"([^"\n]+?)"/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extract the first balanced JSON object from a string. Returns the
 * substring from the first `{` to the matching `}` (or null if no
 * balanced object is found). String contents and escapes are respected
 * so braces inside JSON strings don't fool the matcher.
 *
 * Used to robustly parse LLM output that often continues generating after
 * the JSON envelope closes.
 */
export function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}


/**
 * remark plugin: wrap `"text"` runs in assistant messages with
 * `<span class="chat-dialog">` so they can be styled distinctly from the
 * surrounding narration (which uses `*…*` → `<em>`).
 *
 * Skips code spans/blocks to avoid touching inline code that happens to
 * contain quotes.
 */
export const remarkDialog: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      // Don't touch code spans / blocks. (Cast needed: mdast's parent
      // type for `text` doesn't list `inlineCode`/`code` but they are
      // legal parents at runtime.)
      const parentType = (parent as { type: string }).type;
      if (parentType === "inlineCode" || parentType === "code") return;
      if (typeof node.value !== "string") return;

      const value = node.value;
      DIALOG_RE.lastIndex = 0;
      if (!DIALOG_RE.test(value)) return;
      DIALOG_RE.lastIndex = 0;

      const newNodes: RootContent[] = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DIALOG_RE.exec(value)) !== null) {
        if (m.index > lastIndex) {
          newNodes.push({ type: "text", value: value.slice(lastIndex, m.index) });
        }
        const inner = escapeHtml(m[1]!);
        newNodes.push({
          type: "html",
          value: `<span class="chat-dialog">"${inner}"</span>`,
        } as RootContent);
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < value.length) {
        newNodes.push({ type: "text", value: value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...newNodes);
      // Tell visit to skip the nodes we just inserted (they were processed).
      return index + newNodes.length;
    });
  };
};
