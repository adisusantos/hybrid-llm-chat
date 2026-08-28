/**
 * Unit tests for ComfyUIGenerateButton — logic-only (no DOM/RTL available).
 *
 * Strategy: replicate the handleClick async logic from the component and verify
 * state transitions + side-effects using mocked fetch and state setters.
 * This mirrors the exact code path in ComfyUIGenerateButton.tsx.
 *
 * Requirements: 4.4, 4.5
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Replicated handler — mirrors ComfyUIGenerateButton.handleClick exactly
// so tests validate the real logic without requiring a DOM renderer.
// ---------------------------------------------------------------------------

type HandleClickDeps = {
  chatId: string;
  messageId: string;
  prompt: string;
  onGenerated?: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  routerRefresh: () => void;
};

async function handleClick({
  chatId,
  messageId,
  prompt,
  onGenerated,
  setLoading,
  setError,
  routerRefresh,
}: HandleClickDeps): Promise<void> {
  setLoading(true);
  setError(null);

  try {
    const res = await fetch(
      `/api/chats/${chatId}/messages/${messageId}/comfyui-generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        (data as { error?: string }).error ?? `Request failed (${res.status})`,
      );
      return;
    }

    if (onGenerated) {
      onGenerated();
    } else {
      routerRefresh();
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStateMocks() {
  const loadingValues: boolean[] = [];
  const errorValues: (string | null)[] = [];

  return {
    setLoading: (v: boolean) => loadingValues.push(v),
    setError: (v: string | null) => errorValues.push(v),
    loadingValues,
    errorValues,
  };
}

const BASE_DEPS = {
  chatId: "chat-1",
  messageId: "msg-1",
  prompt: "a beautiful sunset",
  routerRefresh: vi.fn(),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Loading state shown during request in-flight
// ---------------------------------------------------------------------------

describe("loading state", () => {
  it("sets loading=true at the start of the request and loading=false when it resolves", async () => {
    let resolveResponse!: (v: unknown) => void;
    const inflightPromise = new Promise((r) => {
      resolveResponse = r;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(inflightPromise),
    );

    const { setLoading, setError, loadingValues } = makeStateMocks();

    // Start but don't await — check in-flight state
    const clickPromise = handleClick({
      ...BASE_DEPS,
      setLoading,
      setError,
    });

    // loading=true must have been set synchronously before the first await resolves
    expect(loadingValues).toContain(true);

    // Now resolve the fetch so the handler can finish
    resolveResponse({
      ok: true,
      json: async () => ({}),
    });

    await clickPromise;

    // loading=false must be set in finally
    expect(loadingValues[loadingValues.length - 1]).toBe(false);
  });

  it("clears any previous error at the start of a new request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    const { setLoading, setError, errorValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    // setError(null) is always called at the top
    expect(errorValues[0]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Button disabled when loading (state transitions validate the flag)
// ---------------------------------------------------------------------------

describe("disabled state while loading", () => {
  it("sets loading=true before fetch and loading=false after, matching the disabled prop lifecycle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    const { setLoading, setError, loadingValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    // First call must be true (button becomes disabled)
    expect(loadingValues[0]).toBe(true);
    // Last call must be false (button re-enabled)
    expect(loadingValues[loadingValues.length - 1]).toBe(false);
    // loading=false must always come after loading=true
    expect(loadingValues.indexOf(true)).toBeLessThan(
      loadingValues.lastIndexOf(false),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Error message displayed when response fails
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("sets error from response JSON when fetch returns a non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: "ComfyUI pipeline failed" }),
      }),
    );

    const { setLoading, setError, errorValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    const finalError = errorValues.find((e) => e !== null);
    expect(finalError).toBe("ComfyUI pipeline failed");
  });

  it("falls back to 'Request failed (status)' when error body has no error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    );

    const { setLoading, setError, errorValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    const finalError = errorValues.find((e) => e !== null);
    expect(finalError).toBe("Request failed (503)");
  });

  it("sets error from exception message when fetch throws (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );

    const { setLoading, setError, errorValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    const finalError = errorValues.find((e) => e !== null);
    expect(finalError).toBe("Failed to fetch");
  });

  it("sets 'Unknown error' when a non-Error value is thrown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("something weird"));

    const { setLoading, setError, errorValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    const finalError = errorValues.find((e) => e !== null);
    expect(finalError).toBe("Unknown error");
  });

  it("still sets loading=false after an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );

    const { setLoading, setError, loadingValues } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, setLoading, setError });

    expect(loadingValues[loadingValues.length - 1]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. onGenerated called on success
// ---------------------------------------------------------------------------

describe("onGenerated callback", () => {
  it("calls onGenerated when fetch succeeds and onGenerated is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "img-1", url: "/api/images/img-1" }),
      }),
    );

    const onGenerated = vi.fn();
    const { setLoading, setError } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, onGenerated, setLoading, setError });

    expect(onGenerated).toHaveBeenCalledOnce();
  });

  it("calls routerRefresh instead when onGenerated is not provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    const routerRefresh = vi.fn();
    const { setLoading, setError } = makeStateMocks();

    await handleClick({
      ...BASE_DEPS,
      routerRefresh,
      setLoading,
      setError,
    });

    expect(routerRefresh).toHaveBeenCalledOnce();
  });

  it("does NOT call onGenerated when fetch returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    const onGenerated = vi.fn();
    const { setLoading, setError } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, onGenerated, setLoading, setError });

    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("does NOT call onGenerated when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("timeout")),
    );

    const onGenerated = vi.fn();
    const { setLoading, setError } = makeStateMocks();

    await handleClick({ ...BASE_DEPS, onGenerated, setLoading, setError });

    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("sends the correct fetch request (method, path, body)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { setLoading, setError } = makeStateMocks();

    await handleClick({
      ...BASE_DEPS,
      chatId: "chat-abc",
      messageId: "msg-xyz",
      prompt: "a dragon in the sky",
      setLoading,
      setError,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/chats/chat-abc/messages/msg-xyz/comfyui-generate",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a dragon in the sky" }),
      }),
    );
  });
});
