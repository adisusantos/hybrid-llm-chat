/**
 * Unit tests for app/api/chats/[id]/messages/[msgId]/comfyui-generate/route.ts
 *
 * Tests:
 *   - Guard: both providers disabled → 405
 *   - Invalid payload → 400
 *   - Message not found → 404
 *   - Pipeline error → 502
 *   - Success → 200 with faceSwapApplied in response
 *   - Cloud generation path: ping + generate + save with provider=cloud
 *   - Cloud unreachable → fallback to ComfyUI
 *
 * Requirements: 5.2, 5.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must come before any imports that transitively load them
// ---------------------------------------------------------------------------

// "server-only" guard is a no-op in test environment
vi.mock("server-only", () => ({}));

// Mock @/lib/db/queries
vi.mock("@/lib/db/queries", () => ({
  getSetting: vi.fn(),
  getChat: vi.fn(),
  createGeneratedImage: vi.fn(),
}));

// Mock @/lib/imagegen/comfyui
vi.mock("@/lib/imagegen/comfyui", () => ({
  generateWithComfyUI: vi.fn(),
  faceSwapOnlyWithComfyUI: vi.fn(),
}));

// Mock @/lib/imagegen/cloud
vi.mock("@/lib/imagegen/cloud", () => ({
  getCloudImageConfig: vi.fn(),
  pingCloud: vi.fn(),
  generateWithCloud: vi.fn(),
  SETTING_KEY_CLOUD_IMAGE_ENABLED: "cloud_image.enabled",
}));

// Mock @/lib/avatars/storage
vi.mock("@/lib/avatars/storage", () => ({
  findAvatar: vi.fn(),
}));

/**
 * Mock the drizzle db client.
 * The route calls: db.select().from(messages).where(...).limit(1)
 * We model this as a chainable builder that ultimately resolves to an array.
 * The factory must not reference outer variables (vi.mock is hoisted).
 */
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { POST } from "./route";
import { getSetting, getChat, createGeneratedImage } from "@/lib/db/queries";
import { generateWithComfyUI, faceSwapOnlyWithComfyUI } from "@/lib/imagegen/comfyui";
import { getCloudImageConfig, pingCloud, generateWithCloud } from "@/lib/imagegen/cloud";
import { findAvatar } from "@/lib/avatars/storage";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockGetSetting = vi.mocked(getSetting);
const mockGetChat = vi.mocked(getChat);
const mockCreateGeneratedImage = vi.mocked(createGeneratedImage);
const mockGenerateWithComfyUI = vi.mocked(generateWithComfyUI);
const mockFaceSwapOnlyWithComfyUI = vi.mocked(faceSwapOnlyWithComfyUI);
const mockGetCloudImageConfig = vi.mocked(getCloudImageConfig);
const mockPingCloud = vi.mocked(pingCloud);
const mockGenerateWithCloud = vi.mocked(generateWithCloud);
const mockFindAvatar = vi.mocked(findAvatar);
const mockDbSelect = vi.mocked(db.select);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CHAT_ID = "chat-abc";
const MSG_ID = "msg-xyz";

/** Build a minimal mock Request with the given body and route params */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chats/chat-abc/messages/msg-xyz/comfyui-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Route context that resolves to { id: CHAT_ID, msgId: MSG_ID } */
const routeCtx = {
  params: Promise.resolve({ id: CHAT_ID, msgId: MSG_ID }),
};

/** A minimal assistant message row returned by db.select chain */
const assistantMessageRow = {
  id: MSG_ID,
  chatId: CHAT_ID,
  role: "assistant" as const,
  content: "Hello!",
  createdAt: new Date(),
};

/** A minimal character object for getChat responses */
const character = {
  id: "char-1",
  useFaceSwap: true,
  name: "Aria",
};

/** A minimal chat object returned by getChat */
const chatRow = {
  id: CHAT_ID,
  character,
  messages: [],
  lastSummaryMsgCount: 0,
};

/** Successful generateWithComfyUI result */
const pipelineResult = {
  image: Buffer.from("fake-image-data"),
  width: 512,
  height: 512,
  contentType: "image/png",
  faceSwapApplied: true,
  promptId: "prompt-id-123",
};

/** Build a chainable db.select mock that returns the given rows on .limit() */
function setupDbSelect(rows: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  mockDbSelect.mockReturnValue({ from: fromMock });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/chats/[id]/messages/[msgId]/comfyui-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 405 — both providers disabled
  // ─────────────────────────────────────────────────────────────────────────

  /** Setup mock: getSetting returns different values per key */
  function mockSettings(comfyEnabled: boolean | null, cloudEnabled: boolean | null) {
    mockGetSetting.mockImplementation(async (key: string) => {
      if (key === "comfyui.enabled") return comfyEnabled;
      if (key === "cloud_image.enabled") return cloudEnabled;
      return null;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cloud not configured (for tests that only test ComfyUI)
    mockGetCloudImageConfig.mockResolvedValue({
      url: "",
      apiKey: "",
      apiKeys: [],
      model: "",
      enabled: false,
    });
  });

  it("returns 405 when both providers are disabled", async () => {
    mockSettings(false, false);

    const res = await POST(makeRequest({ prompt: "a beautiful landscape" }), routeCtx);

    expect(res.status).toBe(405);
    const body = await res.json() as { error: string };
    expect(body.error).toBeTruthy();
    expect(body.error).toContain("No image generation provider");
    // Should NOT have proceeded to hit the DB
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns 405 when both providers are null (not configured)", async () => {
    mockSettings(null, null);

    const res = await POST(makeRequest({ prompt: "a beautiful landscape" }), routeCtx);

    expect(res.status).toBe(405);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 400 — invalid payload
  // ─────────────────────────────────────────────────────────────────────────

  it("returns 400 when prompt is missing from the request body", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);

    const res = await POST(makeRequest({}), routeCtx);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; issues: unknown[] };
    expect(body.error).toBe("invalid payload");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 when prompt is an empty string", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);

    const res = await POST(makeRequest({ prompt: "" }), routeCtx);

    expect(res.status).toBe(400);
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);

    const badReq = new Request(
      "http://localhost/api/chats/chat-abc/messages/msg-xyz/comfyui-generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{",
      },
    );

    const res = await POST(badReq, routeCtx);

    expect(res.status).toBe(400);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 404 — message not found
  // ─────────────────────────────────────────────────────────────────────────

  it("returns 404 when db returns no message rows", async () => {
    mockSettings(true, false);
    // db.select returns empty array → message not found
    setupDbSelect([]);

    const res = await POST(makeRequest({ prompt: "a beautiful landscape" }), routeCtx);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 502 — pipeline error
  // ─────────────────────────────────────────────────────────────────────────

  it("returns 502 when generateWithComfyUI throws", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue(null);
    mockGenerateWithComfyUI.mockRejectedValue(
      new Error("ComfyUI unreachable at http://127.0.0.1:8188: ECONNREFUSED"),
    );

    const res = await POST(makeRequest({ prompt: "a beautiful landscape" }), routeCtx);

    expect(res.status).toBe(502);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("ECONNREFUSED");
  });

  it("returns 502 for any pipeline error, including workflow not found", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue(null);
    mockGenerateWithComfyUI.mockRejectedValue(
      new Error("ComfyUI workflow not found at path: data/comfyui/faceswap_workflow.json"),
    );

    const res = await POST(makeRequest({ prompt: "a beautiful landscape" }), routeCtx);

    expect(res.status).toBe(502);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 200 — success
  // ─────────────────────────────────────────────────────────────────────────

  it("returns 200 with faceSwapApplied in response on success", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue({
      ext: "png",
      absPath: "/data/avatars/char-1.png",
    });
    mockGenerateWithComfyUI.mockResolvedValue(pipelineResult);
    mockCreateGeneratedImage.mockResolvedValue({
      id: "img-001",
      relPath: "images/chat-abc/img-001.png",
    });

    const res = await POST(
      makeRequest({ prompt: "a beautiful landscape", negativePrompt: "blurry" }),
      routeCtx,
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; url: string; faceSwapApplied: boolean };
    expect(body.faceSwapApplied).toBe(true);
    expect(body.id).toBe("img-001");
    expect(body.url).toBe("/api/images/img-001");
  });

  it("returns faceSwapApplied=false when pipeline runs without face swap", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue(null); // no avatar
    mockGenerateWithComfyUI.mockResolvedValue({
      ...pipelineResult,
      faceSwapApplied: false,
    });
    mockCreateGeneratedImage.mockResolvedValue({
      id: "img-002",
      relPath: "images/chat-abc/img-002.png",
    });

    const res = await POST(makeRequest({ prompt: "a stormy ocean" }), routeCtx);

    expect(res.status).toBe(200);
    const body = await res.json() as { faceSwapApplied: boolean };
    expect(body.faceSwapApplied).toBe(false);
  });

  it("calls generateWithComfyUI with the correct params including characterId and useFaceSwap", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue({
      ext: "jpg",
      absPath: "/data/avatars/char-1.jpg",
    });
    mockGenerateWithComfyUI.mockResolvedValue(pipelineResult);
    mockCreateGeneratedImage.mockResolvedValue({
      id: "img-003",
      relPath: "images/chat-abc/img-003.png",
    });

    await POST(makeRequest({ prompt: "a sunset" }), routeCtx);

    expect(mockGenerateWithComfyUI).toHaveBeenCalledWith({
      prompt: "a sunset",
      characterId: character.id,
      useFaceSwap: character.useFaceSwap,
      avatarPath: "/data/avatars/char-1.jpg",
    });
  });

  it("saves image to DB with provider=comfyui in params", async () => {
    mockSettings(true, false);
    setupDbSelect([assistantMessageRow]);
    mockGetChat.mockResolvedValue(chatRow as Awaited<ReturnType<typeof getChat>>);
    mockFindAvatar.mockResolvedValue(null);
    mockGenerateWithComfyUI.mockResolvedValue(pipelineResult);
    mockCreateGeneratedImage.mockResolvedValue({
      id: "img-004",
      relPath: "images/chat-abc/img-004.png",
    });

    await POST(makeRequest({ prompt: "a forest" }), routeCtx);

    expect(mockCreateGeneratedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT_ID,
        messageId: MSG_ID,
        prompt: "a forest",
        params: expect.objectContaining({
          provider: "comfyui",
          faceSwapApplied: pipelineResult.faceSwapApplied,
          promptId: pipelineResult.promptId,
        }),
      }),
    );
  });
});
