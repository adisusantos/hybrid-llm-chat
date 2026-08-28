"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const STORAGE_KEY_PREFIX = "llamarole.message-draft.";

type Props = {
  chatId: string;
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (content: string) => void | Promise<void>;
};

export function MessageInput({ chatId, disabled, placeholder, onSubmit }: Props) {
  const storageKey = `${STORAGE_KEY_PREFIX}${chatId}`;
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.sessionStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Persist to sessionStorage on every change. Restores automatically on
  // mount (via useState initializer above) — covers page reload, component
  // remount, and multi-tab drafts (sessionStorage is per-tab).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (value) {
        window.sessionStorage.setItem(storageKey, value);
      } else {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch {
      /* quota or private mode — ignore */
    }
  }, [storageKey, value]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    requestAnimationFrame(() => ref.current?.focus());
    await onSubmit(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex items-end gap-2 border-t border-border bg-background p-3"
    >
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder ?? "Type a message…"}
        rows={2}
        disabled={disabled}
        autoComplete="off"
        className="min-h-[44px] flex-1 resize-none"
      />
      <Button type="submit" disabled={disabled}>
        Send
      </Button>
    </form>
  );
}
