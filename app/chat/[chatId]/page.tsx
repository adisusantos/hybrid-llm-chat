import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import {
  getChat,
  getChatSummary,
  getImagesForChat,
  getLastUserMessageId,
  listLorebooksForChat,
  listMemoriesForChat,
  listSamplerPresets,
  listSwipesForTurn,
  resolveSamplerForChat,
  getSetting,
  createChat,
} from "@/lib/db/queries";
import { listLorebooks } from "@/lib/db/queries";
import { ChatWindow } from "@/components/chat/ChatWindow";
import type { DisplayImage } from "@/components/chat/MessageList";
import { SamplerBadge } from "@/components/chat/SamplerBadge";
import { AttachLorebookDialog } from "@/components/lorebook/AttachLorebookDialog";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { ImageGalleryButton, type GalleryImage } from "@/components/chat/ImageGalleryButton";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function newChatWithSameCharacter(formData: FormData) {
  "use server";
  const characterId = formData.get("characterId") as string;
  if (!characterId) redirect("/chat");
  const id = await createChat({ characterId });
  redirect(`/chat/${id}`);
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const chat = await getChat(chatId);
  if (!chat) notFound();

  const [
    resolved,
    allPresets,
    attachedLorebooks,
    allLorebooks,
    summary,
    memories,
    lastUserMessageId,
    imagesByMsgRaw,
    comfyuiEnabled,
    cloudImageEnabled,
    ttsEnabled,
  ] = await Promise.all([
    resolveSamplerForChat(chatId).catch(() => ({ sourcePresetName: null })),
    listSamplerPresets().catch(() => []),
    listLorebooksForChat(chatId).catch(() => []),
    listLorebooks().catch(() => []),
    getChatSummary(chatId).catch(() => ""),
    listMemoriesForChat(chatId).catch(() => []),
    getLastUserMessageId(chatId).catch(() => null),
    getImagesForChat(chatId).catch(() => []),
    getSetting<boolean>("comfyui.enabled").catch(() => false),
    getSetting<boolean>("cloud_image.enabled").catch(() => false),
    getSetting<boolean>("tts.enabled").catch(() => false),
  ]);

  const lastTurnSwipes = lastUserMessageId
    ? (await listSwipesForTurn(chatId, lastUserMessageId)).map((s) => ({
        id: s.id,
        content: s.content,
        swipeId: s.swipeId,
        isHidden: s.isHidden,
      }))
    : [];

  const initialMessages = chat.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "system",
    name: m.name,
    content: m.content,
  }));

  const imagesByMessageId: Record<string, DisplayImage[]> = {};
  const allImages: GalleryImage[] = [];
  for (const [msgId, imgs] of imagesByMsgRaw) {
    imagesByMessageId[msgId] = imgs.map((img) => ({
      id: img.id,
      url: `/api/images/${img.id}`,
      width: img.width,
      height: img.height,
      prompt: img.prompt,
      createdAt:
        img.createdAt instanceof Date
          ? img.createdAt.toISOString()
          : String(img.createdAt),
      paramsJson: img.paramsJson ?? null,
    }));
    // Also collect all images for the gallery
    allImages.push(
      ...imgs.map((img) => ({
        id: img.id,
        url: `/api/images/${img.id}`,
        width: img.width,
        height: img.height,
        prompt: img.prompt,
        createdAt:
          img.createdAt instanceof Date
            ? img.createdAt.toISOString()
            : String(img.createdAt),
        messageId: msgId,
      }))
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-4xl flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Chats
          </Link>
          <span className="text-muted-foreground">/</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {chat.title || `Chat with ${chat.character.name}`}
            </div>
            <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
              <span>{chat.character.name}</span>
              {attachedLorebooks.length > 0 && (
                <span>
                  · {attachedLorebooks.length} lorebook
                  {attachedLorebooks.length === 1 ? "" : "s"}
                </span>
              )}
              {memories.length > 0 && (
                <span>
                  · {memories.length} memor
                  {memories.length === 1 ? "y" : "ies"}
                </span>
              )}
              {lastTurnSwipes.length > 1 && (
                <span>· {lastTurnSwipes.length} swipes</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MemoryPanel
            chatId={chat.id}
            initialSummary={summary}
            initialMemories={memories.map((m) => ({
              id: m.id,
              content: m.content,
              importance: m.importance,
              isPinned: m.isPinned,
            }))}
          />
          <AttachLorebookDialog
            chatId={chat.id}
            attached={attachedLorebooks.map((lb) => ({ id: lb.id, name: lb.name }))}
            available={allLorebooks.map((lb) => ({ id: lb.id, name: lb.name }))}
          />
          <SamplerBadge
            chatId={chat.id}
            currentPresetId={chat.samplerPresetId}
            currentPresetName={resolved.sourcePresetName}
            presets={allPresets.map((p) => ({ id: p.id, name: p.name }))}
          />
          <ImageGalleryButton chatId={chat.id} images={allImages} />
          {/* New chat with same character — one click */}
          <form action={newChatWithSameCharacter}>
            <input type="hidden" name="characterId" value={chat.character.id} />
            <button
              type="submit"
              title={`New chat with ${chat.character.name}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
              New chat
            </button>
          </form>
        </div>
      </header>

      {/* Chat window dengan streaming — bekerja di production mode */}
      <ChatWindow
        chatId={chat.id}
        characterName={chat.character.name}
        initialMessages={initialMessages}
        lastTurnSwipes={lastTurnSwipes}
        imagesByMessageId={imagesByMessageId}
        imageGenEnabled={(comfyuiEnabled ?? false) || (cloudImageEnabled ?? false)}
        ttsEnabled={ttsEnabled ?? false}
      />
    </div>
  );
}
