"use client";

import { useRouter } from "next/navigation";
import { SamplerPresetForm, type SamplerFormValues } from "./SamplerPresetForm";

type Props = {
  presetId: string;
  initialName: string;
  initialValues: SamplerFormValues;
  isDefault?: boolean;
};

export function SamplerPresetEditForm({
  presetId,
  initialName,
  initialValues,
  isDefault,
}: Props) {
  const router = useRouter();

  return (
    <SamplerPresetForm
      presetId={presetId}
      initialName={isDefault ? initialName : undefined}
      initialValues={initialValues}
      isDefault={isDefault}
      onSaved={() => {
        router.push("/settings");
        router.refresh();
      }}
    />
  );
}
