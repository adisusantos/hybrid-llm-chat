"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntryFormValues = {
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment: string;
  insertionOrder: number;
  enabled: boolean;
  caseSensitive: boolean;
  regex: boolean;
  constant: boolean;
  position: "before_char" | "after_char" | "before_system" | "after_system" | "before_exmpls";
  priority: number;
  selectiveLogic: "and" | "not";
};

export const DEFAULT_ENTRY: EntryFormValues = {
  keys: [],
  secondaryKeys: [],
  content: "",
  comment: "",
  insertionOrder: 0,
  enabled: true,
  caseSensitive: false,
  regex: false,
  constant: false,
  position: "after_char",
  priority: 100,
  selectiveLogic: "and",
};

type Props = {
  lorebookId: string;
  entryId?: string;
  initial?: EntryFormValues;
  onSubmitted?: () => void;
};

export function EntryEditor({ lorebookId, entryId, initial, onSubmitted }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<EntryFormValues>(initial ?? DEFAULT_ENTRY);
  const [keysInput, setKeysInput] = useState((initial?.keys ?? []).join(", "));
  const [secondaryInput, setSecondaryInput] = useState(
    (initial?.secondaryKeys ?? []).join(", "),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof EntryFormValues>(k: K, v: EntryFormValues[K]) =>
    setValues((vs) => ({ ...vs, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const keys = parseList(keysInput);
    const secondaryKeys = parseList(secondaryInput);
    if (keys.length === 0 && !values.constant) {
      setError("At least one key is required (or mark as constant)");
      return;
    }
    if (values.content.trim().length === 0) {
      setError("Content cannot be empty");
      return;
    }

    startTransition(async () => {
      const url = entryId
        ? `/api/lorebooks/${lorebookId}/entries/${entryId}`
        : `/api/lorebooks/${lorebookId}/entries`;
      const method = entryId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, keys, secondaryKeys }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      if (entryId) {
        router.refresh();
        onSubmitted?.();
      } else {
        const out = (await res.json()) as { id: string };
        // Reset to default; list refreshes via revalidate
        setValues(DEFAULT_ENTRY);
        setKeysInput("");
        setSecondaryInput("");
        router.refresh();
        onSubmitted?.();
        // Avoid unused-var lint by referencing out.id (the new entry id)
        void out.id;
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keys">Keys (comma-separated) *</Label>
            <Input
              id="keys"
              value={keysInput}
              onChange={(e) => setKeysInput(e.target.value)}
              placeholder="library, storm, lighthouse"
            />
            <p className="text-muted-foreground text-xs">
              Phrases that activate this entry when found in recent messages.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="secondary">Secondary keys (optional)</Label>
            <Input
              id="secondary"
              value={secondaryInput}
              onChange={(e) => setSecondaryInput(e.target.value)}
              placeholder="rain, evening"
            />
            <p className="text-muted-foreground text-xs">
              AND = all must be present. NOT = at least one must be absent.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              rows={4}
              value={values.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="The information injected into the prompt when this entry fires."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                max={10000}
                value={values.priority}
                onChange={(e) => set("priority", Number(e.target.value) || 0)}
              />
              <p className="text-muted-foreground text-xs">Higher fires first.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="position">Position</Label>
              <Select
                value={values.position}
                onValueChange={(v) => set("position", v as EntryFormValues["position"])}
              >
                <SelectTrigger id="position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before_char">Before character</SelectItem>
                  <SelectItem value="after_char">After character</SelectItem>
                  <SelectItem value="before_system">Before system</SelectItem>
                  <SelectItem value="after_system">After system</SelectItem>
                  <SelectItem value="before_exmpls">Before examples</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">Where to inject.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="selectiveLogic">Secondary logic</Label>
              <Select
                value={values.selectiveLogic}
                onValueChange={(v) =>
                  set("selectiveLogic", v as EntryFormValues["selectiveLogic"])
                }
              >
                <SelectTrigger id="selectiveLogic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and">AND (all must match)</SelectItem>
                  <SelectItem value="not">NOT (at least one absent)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="insertionOrder">Insertion order</Label>
              <Input
                id="insertionOrder"
                type="number"
                value={values.insertionOrder}
                onChange={(e) => set("insertionOrder", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <BoolField
              id="enabled"
              label="Enabled"
              value={values.enabled}
              onChange={(v) => set("enabled", v)}
            />
            <BoolField
              id="constant"
              label="Constant"
              value={values.constant}
              onChange={(v) => set("constant", v)}
            />
            <BoolField
              id="caseSensitive"
              label="Case sensitive"
              value={values.caseSensitive}
              onChange={(v) => set("caseSensitive", v)}
            />
            <BoolField
              id="regex"
              label="Regex"
              value={values.regex}
              onChange={(v) => set("regex", v)}
            />
          </div>
        </CardContent>
      </Card>
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {entryId && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this entry?")) return;
              startTransition(async () => {
                const res = await fetch(
                  `/api/lorebooks/${lorebookId}/entries/${entryId}`,
                  { method: "DELETE" },
                );
                if (res.ok) router.refresh();
                else setError(`Delete failed: ${res.status}`);
              });
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button type="submit" disabled={pending} className="gap-2">
          <Save className="size-4" />
          {pending ? "Saving…" : entryId ? "Save" : "Create entry"}
        </Button>
      </div>
    </form>
  );
}

function BoolField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "border-input flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
        value && "border-primary bg-primary/5",
      )}
    >
      <Checkbox
        id={id}
        checked={value}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{label}</span>
    </label>
  );
}

function parseList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
