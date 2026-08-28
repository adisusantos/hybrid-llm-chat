/**
 * Unit + property tests for provider-label parsing logic.
 *
 * Validates: Requirements 9.1, 9.2
 *
 * The pure function under test mirrors the inline logic in GeneratedImageList.tsx:
 *
 *   let params: Record<string, unknown> = {};
 *   try { params = JSON.parse(paramsJson ?? "{}") } catch {}
 *   const isComfyUI = params.provider === "comfyui";
 *   const faceSwapApplied = params.faceSwapApplied === true;
 *
 * Extracting it here so it can be exercised in isolation without rendering React.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Pure helper — mirrors the logic in GeneratedImageList.tsx exactly
// ---------------------------------------------------------------------------
function parseImageParams(paramsJson?: string | null): {
  isComfyUI: boolean;
  faceSwapApplied: boolean;
} {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(paramsJson ?? "{}");
  } catch {
    // invalid JSON → treat as empty params
  }
  return {
    isComfyUI: params.provider === "comfyui",
    faceSwapApplied: params.faceSwapApplied === true,
  };
}

// ---------------------------------------------------------------------------
// Deterministic unit tests
// ---------------------------------------------------------------------------
describe("parseImageParams — deterministic", () => {
  // provider label
  it('provider="comfyui" → isComfyUI true', () => {
    const result = parseImageParams(JSON.stringify({ provider: "comfyui" }));
    expect(result.isComfyUI).toBe(true);
  });

  it("missing provider field → isComfyUI false", () => {
    const result = parseImageParams(JSON.stringify({ someOtherField: 1 }));
    expect(result.isComfyUI).toBe(false);
  });

  it('provider="drawthings" → isComfyUI false (legacy data backward-compat)', () => {
    const result = parseImageParams(JSON.stringify({ provider: "drawthings" }));
    expect(result.isComfyUI).toBe(false);
  });

  it("null paramsJson → isComfyUI false", () => {
    expect(parseImageParams(null).isComfyUI).toBe(false);
  });

  it("undefined paramsJson → isComfyUI false", () => {
    expect(parseImageParams(undefined).isComfyUI).toBe(false);
  });

  it("invalid JSON → isComfyUI false (no throw)", () => {
    expect(parseImageParams("{bad json}").isComfyUI).toBe(false);
  });

  // faceSwapApplied badge
  it("faceSwapApplied=true → faceSwapApplied true", () => {
    const result = parseImageParams(JSON.stringify({ faceSwapApplied: true }));
    expect(result.faceSwapApplied).toBe(true);
  });

  it("faceSwapApplied=false → faceSwapApplied false", () => {
    const result = parseImageParams(JSON.stringify({ faceSwapApplied: false }));
    expect(result.faceSwapApplied).toBe(false);
  });

  it("missing faceSwapApplied → faceSwapApplied false", () => {
    const result = parseImageParams(JSON.stringify({ provider: "comfyui" }));
    expect(result.faceSwapApplied).toBe(false);
  });

  it('faceSwapApplied="true" (string) → faceSwapApplied false', () => {
    // Only boolean true should qualify
    const result = parseImageParams(JSON.stringify({ faceSwapApplied: "true" }));
    expect(result.faceSwapApplied).toBe(false);
  });

  it("combined: provider=comfyui + faceSwapApplied=true → both true", () => {
    const result = parseImageParams(
      JSON.stringify({ provider: "comfyui", faceSwapApplied: true })
    );
    expect(result.isComfyUI).toBe(true);
    expect(result.faceSwapApplied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// **Validates: Requirements 9.1, 9.2**
// ---------------------------------------------------------------------------
describe("parseImageParams — property tests (Property 11)", () => {
  /**
   * Property 11a: Any object with provider === "comfyui" → isComfyUI true
   * Validates: Requirements 9.1
   */
  it("provider=comfyui always yields isComfyUI=true (100 runs)", () => {
    fc.assert(
      fc.property(
        // Arbitrary extra fields mixed in alongside provider: "comfyui"
        fc.record(
          { extra: fc.dictionary(fc.string(), fc.jsonValue()) },
          { withDeletedKeys: true }
        ),
        ({ extra }) => {
          const params = { ...(extra ?? {}), provider: "comfyui" };
          const result = parseImageParams(JSON.stringify(params));
          return result.isComfyUI === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11b: Any provider value OTHER than "comfyui" → isComfyUI false
   * Validates: Requirements 9.1
   */
  it("provider !== comfyui always yields isComfyUI=false (100 runs)", () => {
    fc.assert(
      fc.property(
        // Generate arbitrary strings that are not "comfyui"
        fc.string().filter((s) => s !== "comfyui"),
        (providerValue) => {
          const result = parseImageParams(
            JSON.stringify({ provider: providerValue })
          );
          return result.isComfyUI === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11c: Objects without a provider field → isComfyUI false
   * Validates: Requirements 9.1
   */
  it("absent provider field always yields isComfyUI=false (100 runs)", () => {
    fc.assert(
      fc.property(
        // Arbitrary objects that do NOT contain a "provider" key
        fc.dictionary(
          fc.string().filter((k) => k !== "provider"),
          fc.jsonValue()
        ),
        (obj) => {
          const result = parseImageParams(JSON.stringify(obj));
          return result.isComfyUI === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11d: faceSwapApplied === true (boolean) → faceSwapApplied true
   * Validates: Requirements 9.2
   */
  it("faceSwapApplied=true always yields faceSwapApplied=true (100 runs)", () => {
    fc.assert(
      fc.property(
        fc.record(
          { extra: fc.dictionary(fc.string(), fc.jsonValue()) },
          { withDeletedKeys: true }
        ),
        ({ extra }) => {
          const params = { ...(extra ?? {}), faceSwapApplied: true };
          const result = parseImageParams(JSON.stringify(params));
          return result.faceSwapApplied === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11e: Any value other than boolean true for faceSwapApplied → false
   * Validates: Requirements 9.2
   */
  it("faceSwapApplied !== boolean true always yields faceSwapApplied=false (100 runs)", () => {
    fc.assert(
      fc.property(
        // Generate any JSON value that is not boolean true
        fc.jsonValue().filter((v) => v !== true),
        (faceSwapValue) => {
          const result = parseImageParams(
            JSON.stringify({ faceSwapApplied: faceSwapValue })
          );
          return result.faceSwapApplied === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11f: Invalid / non-object JSON never throws — always returns false/false
   * Validates: Requirements 9.1, 9.2
   */
  it("invalid JSON input never throws and returns false/false (100 runs)", () => {
    // Strings that are valid JSON scalars (not objects) or outright invalid JSON
    const nonObjectJsonArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(""),
      fc.constant("{bad"),
      fc.integer().map(String),         // e.g. "42"
      fc.boolean().map(String),         // "true" / "false"
    );

    fc.assert(
      fc.property(nonObjectJsonArb, (input) => {
        const result = parseImageParams(input as string | null | undefined);
        return result.isComfyUI === false && result.faceSwapApplied === false;
      }),
      { numRuns: 100 }
    );
  });
});
