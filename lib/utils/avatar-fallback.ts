// Deterministic avatar fallback: pick up to 2 initials and a stable background color.

const PALETTE = [
  "oklch(0.55 0.18 250)", // blue
  "oklch(0.55 0.18 160)", // teal
  "oklch(0.55 0.18 30)", // orange
  "oklch(0.55 0.18 330)", // pink
  "oklch(0.55 0.18 110)", // green
  "oklch(0.55 0.18 280)", // purple
  "oklch(0.55 0.18 200)", // cyan
  "oklch(0.55 0.18 60)", // amber
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function colorFor(seed: string): string {
  return PALETTE[hashString(seed) % PALETTE.length]!;
}
