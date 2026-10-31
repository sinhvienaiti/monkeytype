// Source: new for the kit: intensity levels, combo curve and effect priority of the typing feedback (TYPING_FEEDBACK_REVIEW.md §7)
import type { TypingFxIntensity } from "./settings";

/**
 * What one intensity level allows. `motion` scales every glyph pose away
 * from rest (scale − 1, tilt, offsets); `particles` scales spawn counts;
 * `cap` is the particle pool's hard ceiling at that level.
 */
export type IntensityLevel = {
  readonly fx: boolean;
  readonly motion: number;
  readonly particles: number;
  readonly cap: number;
  /** Letters fly to the game's target on a word; trail copies behind each (0–2). */
  readonly fly: boolean;
  readonly trails: number;
  /** Rim pop overshoot multiplier on a word. */
  readonly rim: number;
  /** A shock ring across the whole word on a word (Ultra, and milestones from High). */
  readonly shock: boolean;
};

export const INTENSITY: Readonly<Record<TypingFxIntensity, IntensityLevel>> = {
  off: { fx: false, motion: 0, particles: 0, cap: 0, fly: false, trails: 0, rim: 0, shock: false },
  low: { fx: true, motion: 0.5, particles: 0, cap: 0, fly: false, trails: 0, rim: 0.5, shock: false },
  normal: { fx: true, motion: 1, particles: 1, cap: 160, fly: true, trails: 1, rim: 1, shock: false },
  high: { fx: true, motion: 1, particles: 1.5, cap: 240, fly: true, trails: 2, rim: 1.15, shock: false },
  ultra: { fx: true, motion: 1.1, particles: 2, cap: 320, fly: true, trails: 2, rim: 1.3, shock: true },
};

/**
 * Reduced motion keeps every correctness cue (colour, flash, opacity) and
 * drops what moves: no scale, tilt or offset, no flying letters, particles
 * that do not travel (the renderer keeps them still).
 */
export function levelFor(intensity: TypingFxIntensity, reduced: boolean): IntensityLevel {
  const base = INTENSITY[intensity];
  if (!reduced || !base.fx) return base;
  return REDUCED[intensity];
}

const REDUCED: Readonly<Record<TypingFxIntensity, IntensityLevel>> = Object.fromEntries(
  (Object.keys(INTENSITY) as TypingFxIntensity[]).map((id) => {
    const base = INTENSITY[id];
    return [id, { ...base, motion: 0, particles: Math.min(base.particles, 0.5), cap: Math.min(base.cap, 80), fly: false, trails: 0, rim: Math.min(base.rim, 1), shock: false }];
  }),
) as Record<TypingFxIntensity, IntensityLevel>;

/** Combo 0 → 0, 20 and above → 1, smooth in between: the capped curve every escalation reads. */
export function comboFactor(combo: number): number {
  const t = Math.max(0, Math.min(1, (Number.isFinite(combo) ? combo : 0) / 20));
  return t * t * (3 - 2 * t);
}

/** Particle multiplier from the combo: ×1 at 0, ×1.6 at 20+. */
export const comboParticles = (combo: number): number => 1 + 0.6 * comboFactor(combo);

/** Ring and burst size multiplier from the combo: ×1 at 0, ×1.2 at 20+. */
export const comboSize = (combo: number): number => 1 + 0.2 * comboFactor(combo);

/** Combo counts that earn a milestone: 10, 25, 50, then every 50. */
export function isMilestone(combo: number): boolean {
  if (!Number.isInteger(combo) || combo <= 0) return false;
  return combo === 10 || combo === 25 || combo % 50 === 0;
}

/** Effect priority (proposal §37): a higher one replaces lower layers, never stacks on them. */
export const PRIORITY = { key: 1, word: 2, perfect: 3, milestone: 4 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

/** The one word effect a finished word gets: a milestone upgrades a perfect word, which upgrades a word. */
export function wordPriority(perfect: boolean, combo: number): Priority {
  if (isMilestone(combo)) return PRIORITY.milestone;
  return perfect ? PRIORITY.perfect : PRIORITY.word;
}
