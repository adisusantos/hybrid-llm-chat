import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSamplerPreset } from "@/lib/db/queries";
import { DEFAULT_SAMPLER } from "@/lib/llama/sampler";
import { SamplerPresetEditForm } from "@/components/settings/SamplerPresetEditForm";
import { TopNav } from "@/components/top-nav";
import type { SamplerFormValues } from "@/components/settings/SamplerPresetForm";

export const dynamic = "force-dynamic";

export default async function EditPresetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getSamplerPreset(id);
  if (!row) notFound();

  let config: SamplerFormValues;
  try {
    config = { ...DEFAULT_SAMPLER, ...JSON.parse(row.configJson) };
  } catch {
    config = DEFAULT_SAMPLER;
  }

  return (
    <>
      <TopNav active="settings" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Settings
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{row.name}</span>
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit sampler preset</h1>
          {id === "default-balanced" && (
            <p className="mt-1 text-sm text-muted-foreground">
              This is the default preset. You can edit its values but not its name.
            </p>
          )}
        </div>

        <SamplerPresetEditForm
          presetId={id}
          initialName={row.name}
          initialValues={config}
          isDefault={id === "default-balanced"}
        />
      </main>
    </>
  );
}
