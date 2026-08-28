"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EntryEditor, type EntryFormValues } from "./EntryEditor";
import { cn } from "@/lib/utils";

export type EntryRow = {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment: string;
  insertionOrder: number;
  enabled: boolean;
  caseSensitive: boolean;
  regex: boolean;
  constant: boolean;
  position: EntryFormValues["position"];
  priority: number;
  selectiveLogic: EntryFormValues["selectiveLogic"];
};

type Props = {
  lorebookId: string;
  entries: EntryRow[];
};

export function EntryList({ lorebookId, entries }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Entries ({entries.length})</h2>
        {!creating && (
          <Button variant="outline" onClick={() => setCreating(true)}>
            + New entry
          </Button>
        )}
      </div>

      {creating && (
        <Card className="border-primary/40">
          <CardContent className="pt-6">
            <EntryEditor
              lorebookId={lorebookId}
              onSubmitted={() => setCreating(false)}
            />
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 && !creating ? (
        <Card className="border-dashed">
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No entries yet. Click &quot;New entry&quot; to add one.
          </CardContent>
        </Card>
      ) : (
        entries.map((e) => (
          <EntryCard
            key={e.id}
            lorebookId={lorebookId}
            entry={e}
            expanded={expandedId === e.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === e.id ? null : e.id))
            }
          />
        ))
      )}
    </div>
  );
}

function EntryCard({
  lorebookId,
  entry,
  expanded,
  onToggle,
}: {
  lorebookId: string;
  entry: EntryRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className={cn(!entry.enabled && "opacity-60")}>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground font-mono text-xs">
                  pri={entry.priority}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {entry.position}
                </Badge>
                {entry.constant && (
                  <Badge variant="secondary" className="text-[10px]">
                    constant
                  </Badge>
                )}
                {!entry.enabled && (
                  <Badge variant="destructive" className="text-[10px]">
                    disabled
                  </Badge>
                )}
                {entry.regex && (
                  <Badge variant="outline" className="text-[10px]">
                    regex
                  </Badge>
                )}
              </div>
              <div className="mb-1 text-sm">
                <span className="text-muted-foreground text-xs">keys: </span>
                {entry.keys.length > 0 ? (
                  entry.keys.map((k) => (
                    <code
                      key={k}
                      className="bg-muted mr-1 rounded px-1.5 py-0.5 text-xs"
                    >
                      {k}
                    </code>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs italic">none</span>
                )}
              </div>
              <p className="text-muted-foreground line-clamp-2 text-xs">
                {entry.content}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={onToggle}>
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-2 border-t pt-4">
              <EntryEditor
                lorebookId={lorebookId}
                entryId={entry.id}
                initial={entry}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
