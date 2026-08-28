"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export type LorebookFormValues = {
  name: string;
  description: string;
  scanDepth: number;
  tokenBudget: number;
};

const DEFAULTS: LorebookFormValues = {
  name: "",
  description: "",
  scanDepth: 5,
  tokenBudget: 1024,
};

type Props = {
  initial?: LorebookFormValues;
  lorebookId?: string;
};

export function LorebookEditor({ initial, lorebookId }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<LorebookFormValues>(initial ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof LorebookFormValues>(k: K, v: LorebookFormValues[K]) =>
    setValues((vs) => ({ ...vs, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!values.name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const url = lorebookId ? `/api/lorebooks/${lorebookId}` : "/api/lorebooks";
      const method = lorebookId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      if (lorebookId) {
        router.refresh();
      } else {
        const out = (await res.json()) as { id: string };
        router.push(`/lorebooks/${out.id}`);
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {lorebookId ? "Edit lorebook" : "New lorebook"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this lorebook about?"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scanDepth">Scan depth (messages)</Label>
              <Input
                id="scanDepth"
                type="number"
                min={1}
                max={50}
                value={values.scanDepth}
                onChange={(e) => set("scanDepth", Number(e.target.value) || 1)}
              />
              <p className="text-muted-foreground text-xs">
                How many recent messages to scan for entry keys.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tokenBudget">Token budget</Label>
              <Input
                id="tokenBudget"
                type="number"
                min={64}
                max={16384}
                step={64}
                value={values.tokenBudget}
                onChange={(e) => set("tokenBudget", Number(e.target.value) || 1024)}
              />
              <p className="text-muted-foreground text-xs">
                Total tokens for entries from this lorebook per response.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="gap-2">
          <Save className="size-4" />
          {pending ? "Saving…" : lorebookId ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
