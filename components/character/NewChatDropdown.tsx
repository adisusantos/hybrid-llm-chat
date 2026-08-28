"use client";

import { useRef, useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { CharacterAvatar } from "@/components/character/CharacterAvatar";
import { ChevronDown, Plus } from "lucide-react";

type CharacterOption = {
  id: string;
  name: string;
  avatarPath: string | null;
};

export function NewChatDropdown({
  characters,
  action,
}: {
  characters: CharacterOption[];
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (characterId: string) => {
    if (inputRef.current && formRef.current) {
      inputRef.current.value = characterId;
      const form = formRef.current;
      startTransition(async () => {
        const formData = new FormData(form);
        await action(formData);
      });
    }
  };

  return (
    <div className="relative w-full">
      <form ref={formRef} style={{ display: "none" }}>
        <input ref={inputRef} type="hidden" name="characterId" />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={isPending}
            className="w-full justify-between gap-2 px-3 py-5 text-left font-normal"
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" />
              {isPending ? "Starting chat..." : "Select a character to start chat..."}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 max-h-60 overflow-y-auto bg-card border border-border">
          {characters.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer w-full text-left"
            >
              <CharacterAvatar characterId={c.id} name={c.name} size="sm" />
              <span className="font-medium text-foreground">{c.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
