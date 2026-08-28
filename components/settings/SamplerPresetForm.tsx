"use client";

import { useState, useTransition } from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save } from "lucide-react";

export type SamplerFormValues = {
  temperature: number;
  top_p: number;
  top_k: number;
  min_p: number;
  repeat_penalty: number;
  repeat_last_n: number;
  dry_multiplier: number;
  dry_base: number;
  dry_allowed_length: number;
  max_tokens: number;
};

const DEFAULTS: SamplerFormValues = {
  temperature: 0.8,
  top_p: 0.95,
  top_k: 40,
  min_p: 0.05,
  repeat_penalty: 1.0,
  repeat_last_n: 64,
  dry_multiplier: 0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  max_tokens: 512,
};

type Props = {
  presetId?: string;
  initialValues?: Partial<SamplerFormValues>;
  initialName?: string;
  isDefault?: boolean;
  onSaved?: (presetId: string) => void;
};

export function SamplerPresetForm({
  presetId,
  initialValues,
  initialName,
  isDefault,
  onSaved,
}: Props) {
  const [name, setName] = useState(initialName ?? "New preset");
  const [values, setValues] = useState<SamplerFormValues>({
    ...DEFAULTS,
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SamplerFormValues>(k: K, v: SamplerFormValues[K]) =>
    setValues((vs) => ({ ...vs, [k]: v }));

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    startTransition(async () => {
      const url = presetId ? `/api/sampler-presets/${presetId}` : "/api/sampler-presets";
      const method = presetId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), config: values }),
      });
      if (!res.ok) {
        const t = await res.text();
        setError(`${res.status}: ${t.slice(0, 200)}`);
        return;
      }
      const out = (await res.json()) as { id?: string };
      onSaved?.(out.id ?? presetId ?? "");
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{presetId ? "Edit preset" : "New preset"}</span>
          <Button onClick={submit} disabled={pending} size="sm" className="gap-2">
            <Save className="size-4" />
            {pending ? "Saving…" : presetId ? "Save" : "Create"}
          </Button>
        </CardTitle>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset name"
          className="mt-2"
          disabled={isDefault}
          readOnly={isDefault}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-2">
        <SliderRow
          label="Temperature"
          help="Higher = more creative/random. 0 = deterministic. Recommended: 0.7 – 1.0."
          value={values.temperature}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) => set("temperature", v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Top P"
          help="Nucleus sampling. Keep small mass of high-prob tokens. Recommended: 0.9 – 0.99."
          value={values.top_p}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => set("top_p", v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Top K"
          help="Sample only from the top K tokens. 0 = off. Recommended: 30 – 60."
          value={values.top_k}
          min={0}
          max={200}
          step={1}
          onChange={(v) => set("top_k", Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <SliderRow
          label="Min P"
          help="Sample tokens with relative probability above this fraction of the top token."
          value={values.min_p}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => set("min_p", v)}
          format={(v) => v.toFixed(2)}
        />
        <Separator />
        <SliderRow
          label="Repeat penalty"
          help="Discourage repetition. 1.0 = off, 1.05 – 1.15 typical."
          value={values.repeat_penalty}
          min={1}
          max={2}
          step={0.01}
          onChange={(v) => set("repeat_penalty", v)}
          format={(v) => v.toFixed(2)}
        />
        <SliderRow
          label="Repeat last N"
          help="How many recent tokens to penalize. 0 = whole context. Typical: 64 – 256."
          value={values.repeat_last_n}
          min={0}
          max={512}
          step={8}
          onChange={(v) => set("repeat_last_n", Math.round(v))}
          format={(v) => `${Math.round(v)}`}
        />
        <Separator />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SliderRow
            label="DRY multiplier"
            help="DRY sampling. 0 = off. 0.5 – 1.0 for anti-repetition."
            value={values.dry_multiplier}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set("dry_multiplier", v)}
            format={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="DRY base"
            help="Exponent base for DRY. Default 1.75."
            value={values.dry_base}
            min={1}
            max={4}
            step={0.05}
            onChange={(v) => set("dry_base", v)}
            format={(v) => v.toFixed(2)}
          />
          <SliderRow
            label="DRY allowed length"
            help="Longest n-gram DRY allows without penalty."
            value={values.dry_allowed_length}
            min={0}
            max={20}
            step={1}
            onChange={(v) => set("dry_allowed_length", Math.round(v))}
            format={(v) => `${Math.round(v)}`}
          />
          <SliderRow
            label="Max tokens"
            help="Cap on response length."
            value={values.max_tokens}
            min={32}
            max={4096}
            step={32}
            onChange={(v) => set("max_tokens", Math.round(v))}
            format={(v) => `${Math.round(v)}`}
          />
        </div>
        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SliderRow({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        <span className="text-muted-foreground font-mono text-xs">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v: number[]) => {
          const n = v[0] ?? value;
          onChange(n);
        }}
      />
      <p className="text-muted-foreground text-xs">{help}</p>
    </div>
  );
}
