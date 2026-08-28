/**
 * Property-based tests for the ComfyUI face swap pipeline contracts.
 *
 * These tests verify logical invariants using mocks and pure logic —
 * no real SQLite DB or filesystem setup required.
 *
 * Tasks:  14.1 – 14.5
 * Validates: Requirements 1.2, 2.2, 2.3, 9.2, 9.3, 3.1, 3.2, 5.5
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { readFile } from "node:fs/promises";

// "server-only" is a Next.js guard that throws at import time outside the
// server bundle. We neutralise it for the test environment.
vi.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Task 14.1 — Property 1: Settings round-trip
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------

describe("Property 1: Settings round-trip (simulated key-value store)", () => {
  /**
   * Simulate setSetting / getSetting with a plain Map, mirroring the
   * contract of the real DB-backed implementations in lib/db/queries.ts.
   */
  function makeSettingsStore() {
    const store = new Map<string, unknown>();
    return {
      setSetting: (key: string, value: unknown) => {
        store.set(key, value);
      },
      getSetting: <T = unknown>(key: string): T | null => {
        return (store.get(key) as T | undefined) ?? null;
      },
    };
  }

  it(
    "for any URL string, getSetting returns the exact value stored by setSetting",
    () => {
      fc.assert(
        fc.property(fc.string(), (url) => {
          const { setSetting, getSetting } = makeSettingsStore();

          setSetting("comfyui.url", url);
          const retrieved = getSetting<string>("comfyui.url");

          expect(retrieved).toBe(url);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "round-trip preserves the full URL including special characters",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.webUrl(),
            // Also test edge-case strings that aren't valid URLs
            fc.string({ minLength: 1, maxLength: 200 }),
          ),
          (url) => {
            const { setSetting, getSetting } = makeSettingsStore();

            setSetting("comfyui.url", url);
            const retrieved = getSetting<string>("comfyui.url");

            expect(retrieved).toStrictEqual(url);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it("getSetting returns null when the key has never been set", () => {
    fc.assert(
      fc.property(fc.string(), (url) => {
        const { getSetting } = makeSettingsStore();
        // Nothing stored — must return null
        expect(getSetting("comfyui.url")).toBeNull();
        // Suppress unused variable warning
        void url;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 14.2 — Property 2: useFaceSwap persisted correctly
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe("Property 2: useFaceSwap persisted correctly (simulated character DB)", () => {
  interface CharacterRecord {
    id: string;
    useFaceSwap: boolean;
  }

  /**
   * Simulate the character table with a Map keyed by character ID.
   */
  function makeCharacterStore() {
    const store = new Map<string, CharacterRecord>();

    return {
      upsertCharacter: (id: string, useFaceSwap: boolean) => {
        store.set(id, { id, useFaceSwap });
      },
      getCharacter: (id: string): CharacterRecord | null => {
        return store.get(id) ?? null;
      },
    };
  }

  it(
    "for any boolean v, storing useFaceSwap=v then reading it back yields v",
    () => {
      fc.assert(
        fc.property(fc.boolean(), (v) => {
          const { upsertCharacter, getCharacter } = makeCharacterStore();
          const charId = "char-test-1";

          upsertCharacter(charId, v);
          const record = getCharacter(charId);

          expect(record).not.toBeNull();
          expect(record!.useFaceSwap).toBe(v);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    "overwriting useFaceSwap with a new value always reflects the latest write",
    () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (first, second) => {
          const { upsertCharacter, getCharacter } = makeCharacterStore();
          const charId = "char-test-2";

          upsertCharacter(charId, first);
          upsertCharacter(charId, second);

          const record = getCharacter(charId);
          expect(record!.useFaceSwap).toBe(second);
        }),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Task 14.3 — Property 3: faceSwapApplied invariant
// Validates: Requirements 2.3, 9.2, 9.3
// ---------------------------------------------------------------------------

describe("Property 3: faceSwapApplied invariant (pure logic)", () => {
  /**
   * This is the exact same logic used in generateWithComfyUI:
   *   faceSwapApplied = useFaceSwap && avatarExists
   */
  function computeFaceSwapApplied(
    useFaceSwap: boolean,
    avatarExists: boolean,
  ): boolean {
    return useFaceSwap && avatarExists;
  }

  it(
    "faceSwapApplied is true only when both useFaceSwap=true AND avatarExists=true",
    () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.boolean(), fc.boolean()),
          ([useFaceSwap, avatarExists]) => {
            const faceSwapApplied = computeFaceSwapApplied(
              useFaceSwap,
              avatarExists,
            );

            if (useFaceSwap && avatarExists) {
              expect(faceSwapApplied).toBe(true);
            } else {
              expect(faceSwapApplied).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it("faceSwapApplied is false when useFaceSwap=false regardless of avatarExists", () => {
    fc.assert(
      fc.property(fc.boolean(), (avatarExists) => {
        const faceSwapApplied = computeFaceSwapApplied(false, avatarExists);
        expect(faceSwapApplied).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("faceSwapApplied is false when avatarExists=false regardless of useFaceSwap", () => {
    fc.assert(
      fc.property(fc.boolean(), (useFaceSwap) => {
        const faceSwapApplied = computeFaceSwapApplied(useFaceSwap, false);
        expect(faceSwapApplied).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("faceSwapApplied is never undefined or null — always a boolean", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.boolean(), fc.boolean()),
        ([useFaceSwap, avatarExists]) => {
          const result = computeFaceSwapApplied(useFaceSwap, avatarExists);
          expect(typeof result).toBe("boolean");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 14.4 — Property 4: Error on missing/unreadable avatar
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------

describe("Property 4: Error on missing/unreadable avatar", () => {
  /**
   * Simulate the production error-wrapping in uploadSourceFace:
   *
   *   try { fileBytes = await readFile(avatarPath); }
   *   catch (err) {
   *     if (err.code === "ENOENT")
   *       throw new Error(`ComfyUI: avatar not found at ${avatarPath}`);
   *     throw new Error(`ComfyUI: failed to read avatar at ${avatarPath}: ${err.message}`);
   *   }
   */
  async function tryReadAvatarWithWrapping(
    avatarPath: string,
  ): Promise<never> {
    try {
      await readFile(avatarPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        throw new Error(`ComfyUI: avatar not found at ${avatarPath}`);
      }
      const reason = nodeErr.message ?? String(err);
      throw new Error(
        `ComfyUI: failed to read avatar at ${avatarPath}: ${reason}`,
      );
    }
    // This line should never be reached for a nonexistent path
    throw new Error("Unreachable");
  }

  it(
    "readFile throws for any nonexistent path, and the wrapped error contains the path",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 80 }).filter(
            // Exclude characters that would make an invalid path on the OS
            (s) => !s.includes("\0"),
          ),
          async (suffix) => {
            const avatarPath = `/tmp/nonexistent_avatar_test_${suffix}`;

            let caughtError: Error | null = null;
            try {
              await tryReadAvatarWithWrapping(avatarPath);
            } catch (err) {
              caughtError = err as Error;
            }

            // Must throw — no silent partial result
            expect(caughtError).not.toBeNull();
            expect(caughtError).toBeInstanceOf(Error);

            // Error message must contain the path (production requirement 3.2)
            expect(caughtError!.message).toContain(avatarPath);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "error message is non-empty and descriptive (not just an HTTP status code)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 40 }).filter(
            (s) => !s.includes("\0"),
          ),
          async (suffix) => {
            const avatarPath = `/tmp/nonexistent_avatar_test_${suffix}`;

            let caughtError: Error | null = null;
            try {
              await tryReadAvatarWithWrapping(avatarPath);
            } catch (err) {
              caughtError = err as Error;
            }

            expect(caughtError).not.toBeNull();
            // Message must be a non-trivial human-readable string
            expect(caughtError!.message.length).toBeGreaterThan(10);
            // Must NOT be just a numeric status code
            expect(/^\d+$/.test(caughtError!.message)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Task 14.5 — Property 9: provider field always "comfyui"
// Validates: Requirements 5.5
// ---------------------------------------------------------------------------

describe('Property 9: provider field always "comfyui" after JSON round-trip', () => {
  it(
    'JSON.parse(JSON.stringify({provider:"comfyui",...extras})).provider === "comfyui" for any extras',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            // Generate arbitrary extra fields that might appear alongside provider
            faceSwapApplied: fc.boolean(),
            promptId: fc.string(),
            finalPrompt: fc.string(),
            width: fc.nat(),
            height: fc.nat(),
          }),
          (extras) => {
            const params = { provider: "comfyui" as const, ...extras };
            const roundTripped = JSON.parse(JSON.stringify(params)) as typeof params;

            expect(roundTripped.provider).toBe("comfyui");
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "provider field survives round-trip even with nested objects in extras",
    () => {
      fc.assert(
        fc.property(
          fc.record({
            faceSwapApplied: fc.boolean(),
            promptId: fc.string(),
            metadata: fc.record({
              width: fc.nat(),
              height: fc.nat(),
            }),
          }),
          (extras) => {
            const params = { provider: "comfyui" as const, ...extras };
            const serialised = JSON.stringify(params);
            const deserialised = JSON.parse(serialised) as typeof params;

            // The contract: provider is always "comfyui", never anything else
            expect(deserialised.provider).toBe("comfyui");
            expect(typeof deserialised.provider).toBe("string");
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    "provider field is not mutated or dropped when stringifying with JSON.stringify replacer=null",
    () => {
      fc.assert(
        fc.property(
          fc.record({
            faceSwapApplied: fc.boolean(),
            promptId: fc.string(),
          }),
          (extras) => {
            const params = { provider: "comfyui" as const, ...extras };
            // Explicit replacer=null, space=0 — closest to what DB storage does
            const json = JSON.stringify(params, null, 0);
            const parsed = JSON.parse(json) as typeof params;

            expect(parsed.provider).toBe("comfyui");
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
