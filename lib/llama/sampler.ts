import "server-only";
import { z } from "zod";

export const SamplerConfigSchema = z.object({
  temperature: z.number().min(0).max(5).default(0.8),
  top_p: z.number().min(0).max(1).default(0.95),
  top_k: z.number().int().min(0).max(200).default(40),
  min_p: z.number().min(0).max(1).default(0.05),
  repeat_penalty: z.number().min(0).max(3).default(1.0),
  repeat_last_n: z.number().int().min(0).max(2048).default(64),
  dry_multiplier: z.number().min(0).max(5).default(0),
  dry_base: z.number().min(1).max(5).default(1.75),
  dry_allowed_length: z.number().int().min(0).max(20).default(2),
  max_tokens: z.number().int().min(1).max(8192).default(512),
});

export type SamplerConfig = z.infer<typeof SamplerConfigSchema>;

export const DEFAULT_SAMPLER: SamplerConfig = SamplerConfigSchema.parse({});
