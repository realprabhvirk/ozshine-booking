import type { Tone } from "@/lib/core/status";

// Soft tinted surface + readable text for each status colour.
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-neutral/12 text-neutral-ink ring-neutral/25",
  accent: "bg-accent/12 text-accent-ink ring-accent/30",
  info: "bg-info/12 text-info-ink ring-info/30",
  violet: "bg-violet/12 text-violet-ink ring-violet/30",
  cyan: "bg-cyan/12 text-cyan-ink ring-cyan/30",
  ok: "bg-ok/12 text-ok-ink ring-ok/30",
  warn: "bg-warn/14 text-warn-ink ring-warn/35",
  bad: "bg-bad/12 text-bad-ink ring-bad/30",
};

// Solid dot / bar colour.
export const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-neutral",
  accent: "bg-accent",
  info: "bg-info",
  violet: "bg-violet",
  cyan: "bg-cyan",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
