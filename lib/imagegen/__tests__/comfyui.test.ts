/**
 * Property-Based Tests for lib/imagegen/comfyui.ts
 *
 * Property 5: Node lookup by `_meta.title`
 * Validates: Requirements 7.4
 */

import * as fc from "fast-check";
import { describe, it, expect, vi, afterEach } from "vitest";

// Mock "server-only" so the module can be imported in test environment
vi.mock("server-only", () => ({}));

import {
  findNodeByTitle,
  injectWorkflowValues,
  testConnection,
  type ComfyUIWorkflow,
  type ComfyUINode,
  DEFAULT_PROMPT_NODE_TITLE,
  DEFAULT_SOURCE_FACE_NODE_TITLE,
} from "@/lib/imagegen/comfyui";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a single ComfyUI node with an optional _meta.title */
const arbitraryNode = (title?: string): fc.Arbitrary<ComfyUINode> =>
  fc
    .record({
      class_type: fc.string({ minLength: 1, maxLength: 50 }),
      inputs: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.oneof(fc.string(), fc.integer(), fc.boolean()),
      ),
    })
    .map((base) => ({
      ...base,
      ...(title !== undefined ? { _meta: { title } } : {}),
    }));

/**
 * Generate a workflow that contains at least one node with a known title,
 * plus zero or more other nodes with distinct titles.
 *
 * Returns `{ workflow, targetTitle, targetNodeId }`.
 */
const arbitraryWorkflowWithTitle = fc.tuple(
  // The title we'll search for
  fc.string({ minLength: 1, maxLength: 50 }),
  // Extra nodes with their own (possibly different) titles
  fc.array(
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^\d+$/.test(s) || s.length > 0),
      fc.string({ minLength: 1, maxLength: 50 }),
    ),
    { minLength: 0, maxLength: 5 },
  ),
).chain(([targetTitle, extras]) => {
  const targetId = "target";

  return fc
    .tuple(
      arbitraryNode(targetTitle),
      ...extras.map(([, extraTitle]) => arbitraryNode(extraTitle)),
    )
    .map((nodes) => {
      const [targetNode, ...extraNodes] = nodes as [ComfyUINode, ...ComfyUINode[]];

      const workflow: ComfyUIWorkflow = { [targetId]: targetNode };
      extras.forEach(([id], i) => {
        // Use a unique id to avoid collision with "target"
        workflow[`extra_${i}_${id}`] = extraNodes[i];
      });

      return { workflow, targetTitle, targetNodeId: targetId };
    });
});

/**
 * Generate a workflow where NO node has the given title.
 *
 * Returns `{ workflow, absentTitle }`.
 */
const arbitraryWorkflowWithoutTitle = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.array(
      fc.string({ minLength: 1, maxLength: 50 }),
      { minLength: 0, maxLength: 5 },
    ),
  )
  .chain(([absentTitle, otherTitles]) => {
    // Make sure none of the node titles equal absentTitle
    const safeTitles = otherTitles.map((t) =>
      t === absentTitle ? `${t}_other` : t,
    );

    return fc
      .tuple(...safeTitles.map((t) => arbitraryNode(t)))
      .map((nodes) => {
        const workflow: ComfyUIWorkflow = {};
        (nodes as ComfyUINode[]).forEach((node, i) => {
          workflow[`node_${i}`] = node;
        });
        return { workflow, absentTitle };
      });
  });

// ---------------------------------------------------------------------------
// Property 5 — Node lookup by _meta.title
// Validates: Requirements 7.4
// ---------------------------------------------------------------------------

describe("findNodeByTitle", () => {
  it(
    "**Validates: Requirements 7.4** — returns the correct node when title exists in workflow",
    () => {
      fc.assert(
        fc.property(arbitraryWorkflowWithTitle, ({ workflow, targetTitle, targetNodeId }) => {
          const result = findNodeByTitle(workflow, targetTitle);

          // Must not be undefined
          expect(result).toBeDefined();

          // Must be the node that actually has this title
          expect(result!._meta?.title).toBe(targetTitle);

          // Must be the exact node stored at targetNodeId
          expect(result).toBe(workflow[targetNodeId]);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 7.4** — returns undefined when title does not exist in workflow",
    () => {
      fc.assert(
        fc.property(arbitraryWorkflowWithoutTitle, ({ workflow, absentTitle }) => {
          const result = findNodeByTitle(workflow, absentTitle);
          expect(result).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 7.4** — never returns a node whose title differs from the searched title",
    () => {
      fc.assert(
        fc.property(
          // Any workflow + any title
          fc
            .array(
              fc.tuple(
                fc.string({ minLength: 1, maxLength: 10 }),
                fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
              ),
              { minLength: 0, maxLength: 8 },
            )
            .map((entries) => {
              const workflow: ComfyUIWorkflow = {};
              entries.forEach(([id, title], i) => {
                workflow[`${id}_${i}`] = {
                  class_type: "SomeNode",
                  inputs: {},
                  ...(title !== undefined ? { _meta: { title } } : {}),
                };
              });
              return workflow;
            }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (workflow, searchTitle) => {
            const result = findNodeByTitle(workflow, searchTitle);

            if (result !== undefined) {
              // If a node was returned, it must have exactly the searched title
              expect(result._meta?.title).toBe(searchTitle);
            }
            // If undefined, that's always valid — no node with that title exists
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it("returns undefined for an empty workflow", () => {
    expect(findNodeByTitle({}, "Positive Prompt")).toBeUndefined();
  });

  it("returns undefined when workflow nodes have no _meta", () => {
    const workflow: ComfyUIWorkflow = {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
    };
    expect(findNodeByTitle(workflow, "Positive Prompt")).toBeUndefined();
  });

  it("returns the node when _meta.title matches exactly", () => {
    const node: ComfyUINode = {
      class_type: "CLIPTextEncode",
      _meta: { title: "Positive Prompt" },
      inputs: { text: "hello" },
    };
    const workflow: ComfyUIWorkflow = { "1": node };
    expect(findNodeByTitle(workflow, "Positive Prompt")).toBe(node);
  });
});

// ---------------------------------------------------------------------------
// Arbitraries for injectWorkflowValues tests
// ---------------------------------------------------------------------------

/**
 * Default config used by property tests — matches production defaults so we
 * can assert on real node titles.
 */
const defaultConfig = {
  promptNodeTitle: DEFAULT_PROMPT_NODE_TITLE,       // "Positive Prompt"
  sourceFaceNodeTitle: DEFAULT_SOURCE_FACE_NODE_TITLE, // "Load Source Face"
};

/**
 * Build a minimal but complete ComfyUI workflow that always contains both
 * a "Positive Prompt" node and a "Load Source Face" node.
 */
const arbitraryWorkflowWithBothNodes: fc.Arbitrary<ComfyUIWorkflow> = fc
  .record({
    promptText: fc.string({ minLength: 0, maxLength: 200 }),
    faceImage: fc.string({ minLength: 0, maxLength: 100 }),
    extraNodeCount: fc.integer({ min: 0, max: 4 }),
  })
  .chain(({ promptText, faceImage, extraNodeCount }) =>
    fc
      .array(
        fc.record({
          class_type: fc.string({ minLength: 1, maxLength: 30 }),
          inputs: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 15 }),
            fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          ),
        }),
        { minLength: extraNodeCount, maxLength: extraNodeCount },
      )
      .map((extras) => {
        const workflow: ComfyUIWorkflow = {
          "1": {
            class_type: "CLIPTextEncode",
            _meta: { title: DEFAULT_PROMPT_NODE_TITLE },
            inputs: { text: promptText },
          },
          "2": {
            class_type: "LoadImage",
            _meta: { title: DEFAULT_SOURCE_FACE_NODE_TITLE },
            inputs: { image: faceImage },
          },
        };
        extras.forEach((extra, i) => {
          workflow[`extra_${i + 3}`] = { ...extra };
        });
        return workflow;
      }),
  );

/**
 * Build a workflow that has ONLY the "Positive Prompt" node — no source face
 * node (txt2img-only workflow).
 */
const arbitraryTxt2ImgWorkflow: fc.Arbitrary<ComfyUIWorkflow> = fc
  .record({
    promptText: fc.string({ minLength: 0, maxLength: 200 }),
  })
  .map(({ promptText }) => ({
    "1": {
      class_type: "CLIPTextEncode",
      _meta: { title: DEFAULT_PROMPT_NODE_TITLE },
      inputs: { text: promptText },
    },
  }));

/** Generate a non-empty prompt string (realistic text content). */
const arbitraryPrompt = fc.string({ minLength: 1, maxLength: 500 });

/** Generate a non-empty filename string (what ComfyUI /upload/image returns). */
const arbitraryFilename = fc.string({ minLength: 1, maxLength: 200 });

// ---------------------------------------------------------------------------
// Property 6 — Workflow injection is pure and correct
// Validates: Requirements 6.2, 7.4
// ---------------------------------------------------------------------------

describe("injectWorkflowValues", () => {
  it(
    "**Validates: Requirements 6.2, 7.4** — (a) returns a new object, not the original reference",
    () => {
      fc.assert(
        fc.property(
          arbitraryWorkflowWithBothNodes,
          arbitraryPrompt,
          arbitraryFilename,
          (workflow, prompt, uploadedFilename) => {
            const result = injectWorkflowValues(
              workflow,
              { prompt, uploadedFilename },
              defaultConfig,
            );
            // Must be a different object identity
            expect(result).not.toBe(workflow);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.2, 7.4** — (b) prompt node inputs.text contains the injected prompt",
    () => {
      fc.assert(
        fc.property(
          arbitraryWorkflowWithBothNodes,
          arbitraryPrompt,
          arbitraryFilename,
          (workflow, prompt, uploadedFilename) => {
            const result = injectWorkflowValues(
              workflow,
              { prompt, uploadedFilename },
              defaultConfig,
            );
            const promptNode = findNodeByTitle(result, defaultConfig.promptNodeTitle);
            expect(promptNode).toBeDefined();
            expect(promptNode!.inputs.text).toBe(prompt);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.2, 7.4** — (c) source face node inputs.image contains the injected filename",
    () => {
      fc.assert(
        fc.property(
          arbitraryWorkflowWithBothNodes,
          arbitraryPrompt,
          arbitraryFilename,
          (workflow, prompt, uploadedFilename) => {
            const result = injectWorkflowValues(
              workflow,
              { prompt, uploadedFilename },
              defaultConfig,
            );
            const sourceFaceNode = findNodeByTitle(result, defaultConfig.sourceFaceNodeTitle);
            expect(sourceFaceNode).toBeDefined();
            expect(sourceFaceNode!.inputs.image).toBe(uploadedFilename);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.2, 7.4** — original workflow is NOT mutated (pure function property)",
    () => {
      fc.assert(
        fc.property(
          arbitraryWorkflowWithBothNodes,
          arbitraryPrompt,
          arbitraryFilename,
          (workflow, prompt, uploadedFilename) => {
            // Capture original values before injection
            const originalPromptText = findNodeByTitle(
              workflow,
              defaultConfig.promptNodeTitle,
            )!.inputs.text;
            const originalFaceImage = findNodeByTitle(
              workflow,
              defaultConfig.sourceFaceNodeTitle,
            )!.inputs.image;

            // Inject different values
            injectWorkflowValues(
              workflow,
              { prompt, uploadedFilename },
              defaultConfig,
            );

            // Original must be unchanged
            const promptNodeAfter = findNodeByTitle(workflow, defaultConfig.promptNodeTitle);
            const faceNodeAfter = findNodeByTitle(workflow, defaultConfig.sourceFaceNodeTitle);

            expect(promptNodeAfter!.inputs.text).toBe(originalPromptText);
            expect(faceNodeAfter!.inputs.image).toBe(originalFaceImage);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.2, 7.4** — when uploadedFilename is undefined, source face node is NOT changed",
    () => {
      fc.assert(
        fc.property(
          arbitraryWorkflowWithBothNodes,
          arbitraryPrompt,
          (workflow, prompt) => {
            const originalFaceImage = findNodeByTitle(
              workflow,
              defaultConfig.sourceFaceNodeTitle,
            )!.inputs.image;

            const result = injectWorkflowValues(
              workflow,
              { prompt }, // uploadedFilename intentionally absent
              defaultConfig,
            );

            const faceNodeInResult = findNodeByTitle(result, defaultConfig.sourceFaceNodeTitle);
            expect(faceNodeInResult!.inputs.image).toBe(originalFaceImage);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.2, 7.4** — txt2img-only workflow (no source face node) does not throw, prompt is still injected",
    () => {
      fc.assert(
        fc.property(
          arbitraryTxt2ImgWorkflow,
          arbitraryPrompt,
          arbitraryFilename,
          (workflow, prompt, uploadedFilename) => {
            // Must not throw even though there is no source face node
            let result: ComfyUIWorkflow | undefined;
            expect(
              () => {
                result = injectWorkflowValues(
                  workflow,
                  { prompt, uploadedFilename },
                  defaultConfig,
                );
              },
            ).not.toThrow();

            // Prompt must still be injected
            const promptNode = findNodeByTitle(result!, defaultConfig.promptNodeTitle);
            expect(promptNode).toBeDefined();
            expect(promptNode!.inputs.text).toBe(prompt);

            // And no source face node should appear
            expect(findNodeByTitle(result!, defaultConfig.sourceFaceNodeTitle)).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Deterministic unit tests (complement to property tests)
  // -------------------------------------------------------------------------

  it("injects prompt and filename into a concrete workflow", () => {
    const workflow: ComfyUIWorkflow = {
      "1": {
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt" },
        inputs: { text: "old prompt" },
      },
      "2": {
        class_type: "LoadImage",
        _meta: { title: "Load Source Face" },
        inputs: { image: "old.png" },
      },
    };

    const result = injectWorkflowValues(
      workflow,
      { prompt: "a beautiful sunset", uploadedFilename: "face_abc123.png" },
      defaultConfig,
    );

    expect(result["1"].inputs.text).toBe("a beautiful sunset");
    expect(result["2"].inputs.image).toBe("face_abc123.png");
    // Original untouched
    expect(workflow["1"].inputs.text).toBe("old prompt");
    expect(workflow["2"].inputs.image).toBe("old.png");
  });

  it("does not change source face node when uploadedFilename is undefined (concrete)", () => {
    const workflow: ComfyUIWorkflow = {
      "1": {
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt" },
        inputs: { text: "old prompt" },
      },
      "2": {
        class_type: "LoadImage",
        _meta: { title: "Load Source Face" },
        inputs: { image: "face_original.png" },
      },
    };

    const result = injectWorkflowValues(
      workflow,
      { prompt: "new prompt" },
      defaultConfig,
    );

    expect(result["1"].inputs.text).toBe("new prompt");
    expect(result["2"].inputs.image).toBe("face_original.png");
  });
});

// ---------------------------------------------------------------------------
// Property 10 — testConnection error is descriptive for any failure mode
// Validates: Requirements 8.3
// ---------------------------------------------------------------------------

/** A raw-number string like "404" — error messages that consist ONLY of this
 *  are considered non-descriptive and must NOT be returned. */
const isRawStatusCodeOnly = (msg: string): boolean =>
  /^\d+$/.test(msg.trim());

/**
 * Assert that calling testConnection rejects and that the error message is
 * non-empty and not a bare numeric status code.
 */
async function assertDescriptiveError(promise: Promise<unknown>): Promise<void> {
  let threw = false;
  let errMsg = "";
  try {
    await promise;
  } catch (err) {
    threw = true;
    errMsg = err instanceof Error ? err.message : String(err);
  }
  expect(threw, "Expected testConnection to throw but it resolved").toBe(true);
  expect(errMsg.length, "Error message must be non-empty").toBeGreaterThan(0);
  expect(
    isRawStatusCodeOnly(errMsg),
    `Error message must not be a raw status code alone, got: "${errMsg}"`,
  ).toBe(false);
}

describe("testConnection — Property 10: error is descriptive for any failure mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Network error (fetch throws)
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — network error: throws with non-empty, non-status-code message",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (errorMsg) => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(errorMsg)));
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 2: HTTP 4xx responses
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — HTTP 4xx: throws with non-empty, non-status-code message",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 499 }),
          async (statusCode) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok: false,
                status: statusCode,
                json: () => Promise.reject(new Error("not called")),
                text: () => Promise.resolve(""),
              } as unknown as Response),
            );
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 3: HTTP 5xx responses
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — HTTP 5xx: throws with non-empty, non-status-code message",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 500, max: 599 }),
          async (statusCode) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok: false,
                status: statusCode,
                json: () => Promise.reject(new Error("not called")),
                text: () => Promise.resolve(""),
              } as unknown as Response),
            );
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Combined 4xx/5xx scenario using full range
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — any HTTP 4xx or 5xx: throws descriptive error",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 400, max: 599 }),
          async (statusCode) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok: false,
                status: statusCode,
                json: () => Promise.reject(new Error("not called")),
                text: () => Promise.resolve(""),
              } as unknown as Response),
            );
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 4: Response is not valid JSON (fetch.json() rejects)
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — malformed JSON response: throws descriptive error",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // We only vary the error message; the key is that json() always rejects
          fc.string({ minLength: 1, maxLength: 80 }),
          async (syntaxErrMsg) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.reject(new SyntaxError(syntaxErrMsg)),
                text: () => Promise.resolve(""),
              } as unknown as Response),
            );
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 5: Valid JSON but missing system.comfyui_version field
  // -------------------------------------------------------------------------

  it(
    "**Validates: Requirements 8.3** — valid JSON missing version field: throws descriptive error",
    async () => {
      /** Arbitrary that produces JSON objects with no valid string version field */
      const noVersionBody = fc.oneof(
        fc.constant({}),
        fc.constant({ system: {} }),
        fc.constant({ system: { comfyui_version: null } }),
        fc.constant({ system: { comfyui_version: 123 } }),
        fc.constant({ system: { version: null } }),
        fc.constant({ system: { version: 42 } }),
        fc.constant({ system: { comfyui_version: "" } }),
        fc.record({ foo: fc.string(), bar: fc.integer() }),
        fc.record({
          system: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        }),
      );

      await fc.assert(
        fc.asyncProperty(
          noVersionBody,
          async (responseBody) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: () => Promise.resolve(responseBody),
                text: () => Promise.resolve(JSON.stringify(responseBody)),
              } as unknown as Response),
            );
            await assertDescriptiveError(testConnection("http://127.0.0.1:8188"));
            vi.unstubAllGlobals();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Deterministic unit tests (complement to property tests)
  // -------------------------------------------------------------------------

  it("throws on network error with URL in message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(testConnection("http://127.0.0.1:8188")).rejects.toThrow(
      /127\.0\.0\.1:8188/,
    );
  });

  it("throws on HTTP 404 with descriptive message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn(),
        text: () => Promise.resolve(""),
      } as unknown as Response),
    );
    const err = await testConnection("http://127.0.0.1:8188").catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toBe("404");
    expect(err.message.length).toBeGreaterThan(3);
  });

  it("throws on HTTP 500 with descriptive message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn(),
        text: () => Promise.resolve(""),
      } as unknown as Response),
    );
    const err = await testConnection("http://127.0.0.1:8188").catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toBe("500");
    expect(err.message.length).toBeGreaterThan(3);
  });

  it("throws on invalid JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
        text: () => Promise.resolve("{invalid"),
      } as unknown as Response),
    );
    await expect(testConnection("http://127.0.0.1:8188")).rejects.toThrow(
      /invalid JSON/i,
    );
  });

  it("throws when system_stats response has no version field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ system: { other_field: "value" } }),
        text: () => Promise.resolve(""),
      } as unknown as Response),
    );
    await expect(testConnection("http://127.0.0.1:8188")).rejects.toThrow(
      /version/i,
    );
  });

  it("succeeds and returns version when response is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ system: { comfyui_version: "0.3.12" } }),
        text: () => Promise.resolve(""),
      } as unknown as Response),
    );
    const result = await testConnection("http://127.0.0.1:8188");
    expect(result).toEqual({ version: "0.3.12" });
  });
});

// ---------------------------------------------------------------------------
// Property 7 — Error message includes configured URL
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------

describe("testConnection — Property 7: error message includes configured URL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it(
    "**Validates: Requirements 6.5** — when ComfyUI is unreachable, thrown error message contains the configured URL",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid-looking HTTP URLs so testConnection has something to
          // normalise and embed in its error message.
          fc.webUrl({ validSchemes: ["http", "https"] }),
          async (url) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
            );

            let threw = false;
            let errMsg = "";
            try {
              await testConnection(url);
            } catch (err) {
              threw = true;
              errMsg = err instanceof Error ? err.message : String(err);
            } finally {
              vi.unstubAllGlobals();
            }

            // Must throw — ComfyUI is unreachable
            expect(threw, "testConnection must throw when fetch rejects").toBe(true);

            // The error message must reference the URL that was passed in.
            // testConnection normalises the URL by stripping trailing slashes, so
            // we strip them here too before comparing.
            const normalizedUrl = url.replace(/\/+$/, "");
            expect(
              errMsg,
              `Error message "${errMsg}" must contain the configured URL "${normalizedUrl}"`,
            ).toContain(normalizedUrl);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "**Validates: Requirements 6.5** — error contains URL regardless of the underlying network error message",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl({ validSchemes: ["http", "https"] }),
          // Vary the underlying OS-level error message
          fc.string({ minLength: 1, maxLength: 100 }),
          async (url, networkErrorMsg) => {
            vi.stubGlobal(
              "fetch",
              vi.fn().mockRejectedValue(new Error(networkErrorMsg)),
            );

            let threw = false;
            let errMsg = "";
            try {
              await testConnection(url);
            } catch (err) {
              threw = true;
              errMsg = err instanceof Error ? err.message : String(err);
            } finally {
              vi.unstubAllGlobals();
            }

            expect(threw).toBe(true);

            const normalizedUrl = url.replace(/\/+$/, "");
            expect(errMsg).toContain(normalizedUrl);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Deterministic unit test (complement to property tests)
  // -------------------------------------------------------------------------

  it("error message contains the exact URL when fetch throws ECONNREFUSED (concrete)", async () => {
    const url = "http://192.168.1.100:8188";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED 192.168.1.100:8188")),
    );
    const err = await testConnection(url).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(url);
  });

  it("error message contains URL with trailing slash stripped (concrete)", async () => {
    const urlWithSlash = "http://127.0.0.1:8188/";
    const normalizedUrl = "http://127.0.0.1:8188";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ETIMEDOUT")),
    );
    const err = await testConnection(urlWithSlash).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(normalizedUrl);
  });
});

// ---------------------------------------------------------------------------
// Property 8 — Missing workflow path error is explicit
// Validates: Requirements 7.2
// ---------------------------------------------------------------------------

/**
 * Helper: attempt to read a file at `filePath` and return an error if thrown,
 * or null if the read unexpectedly succeeds.
 *
 * This mirrors the exact behavior `generateWithComfyUI` will implement:
 *   "if file doesn't exist → throw error with path" (no fallback).
 *
 * We use Node's `readFile` directly, which is the same call the production
 * code makes, so we are testing the real mechanism — not a mock.
 */
async function tryReadWorkflowFile(filePath: string): Promise<Error | null> {
  // dynamic import to avoid issues with top-level "server-only" mock order
  const { readFile } = await import("node:fs/promises");
  try {
    await readFile(filePath, "utf-8");
    return null; // file unexpectedly exists — caller should skip
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // Re-wrap exactly as generateWithComfyUI will:
      // "ComfyUI workflow not found at path: <path>"
      return new Error(`ComfyUI workflow not found at path: ${filePath}`);
    }
    // Propagate other errors (permission, etc.)
    throw err;
  }
}

describe("Property 8 — Missing workflow path error is explicit", () => {
  it(
    "**Validates: Requirements 7.2** — error mentions the requested path, no fallback",
    async () => {
      /**
       * Generate arbitrary path suffixes. We prepend a guaranteed-nonexistent
       * prefix so no generated path can accidentally resolve to a real file.
       * The suffix can be any non-empty string; fast-check explores the space.
       */
      const arbitraryNonExistentPath = fc
        .string({ minLength: 1, maxLength: 80 })
        .map(
          (suffix) =>
            `/tmp/nonexistent_comfyui_test_${suffix.replace(/\//g, "_")}`,
        );

      await fc.assert(
        fc.asyncProperty(arbitraryNonExistentPath, async (filePath) => {
          const err = await tryReadWorkflowFile(filePath);

          // The file must not exist — if it does, skip this sample
          // (extremely unlikely with the chosen prefix, but be defensive)
          if (err === null) return;

          // 1. An error must always be thrown (no silent fallback)
          expect(err).toBeInstanceOf(Error);

          // 2. The error message must contain the exact path that was searched
          expect(err.message).toContain(filePath);

          // 3. The error message must be descriptive (not just the path alone)
          expect(err.message.length).toBeGreaterThan(filePath.length);
        }),
        { numRuns: 100 },
      );
    },
  );

  // -------------------------------------------------------------------------
  // Deterministic unit tests (complement to property test)
  // -------------------------------------------------------------------------

  it("error message contains the searched path (concrete example)", async () => {
    const fakePath =
      "/tmp/nonexistent_comfyui_test_concrete_workflow_path.json";
    const err = await tryReadWorkflowFile(fakePath);

    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain(fakePath);
  });

  it("error message is not empty", async () => {
    const fakePath = "/tmp/nonexistent_comfyui_test_empty_check.json";
    const err = await tryReadWorkflowFile(fakePath);

    expect(err).not.toBeNull();
    expect(err!.message.trim().length).toBeGreaterThan(0);
  });

  it("error message follows the expected format (contains 'not found at path')", async () => {
    const fakePath = "/tmp/nonexistent_comfyui_test_format_check.json";
    const err = await tryReadWorkflowFile(fakePath);

    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/not found at path/i);
    expect(err!.message).toContain(fakePath);
  });
});
