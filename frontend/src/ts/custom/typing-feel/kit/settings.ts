// Source: new for the kit: typing feedback settings shared by every game (docs/games/TYPING_FEEDBACK_REVIEW.md §7)
/**
 * The player's typing-feedback choice. Every game stores the same object
 * under the same field name (`typingFx`) inside its own save; nothing here
 * touches storage, so a game keeps its own key and its own safe storage.
 */
export const TYPING_FX_STYLES = ["stamp", "flare", "smash", "shatter", "rune", "minimal"] as const;
export type TypingFxStyle = (typeof TYPING_FX_STYLES)[number];

export const TYPING_FX_INTENSITIES = ["off", "low", "normal", "high", "ultra"] as const;
export type TypingFxIntensity = (typeof TYPING_FX_INTENSITIES)[number];

/** How big the focus strip's word is (owner 29/10: Large by default). */
export const TYPING_FX_SIZES = ["medium", "large", "huge"] as const;
export type TypingFxSize = (typeof TYPING_FX_SIZES)[number];

export type TypingFxSettings = {
  style: TypingFxStyle;
  intensity: TypingFxIntensity;
  size: TypingFxSize;
  /** A catalogue keyboard sound id; legacy games use KEYBOARD_PROFILES. "off" plays none. */
  soundProfile: string;
  /** Key sound volume 0 … 1 (under the game's own sfx volume). */
  volume: number;
};

/** The field every game uses inside its settings object. */
export const TYPING_FX_FIELD = "typingFx";

/** Stamp is the owner's pick (29/10); players can change it in Settings. */
export const DEFAULT_TYPING_FX: Readonly<TypingFxSettings> = Object.freeze({ style: "stamp", intensity: "normal", size: "large", soundProfile: "creamy", volume: 0.7 });

export const TYPING_FX_SIZE_NAMES: Readonly<Record<TypingFxSize, string>> = { medium: "Medium", large: "Large", huge: "Huge" };

/**
 * The word's cap height (px) at a 720 and a 1080 px tall view (owner 29/10:
 * Large about 40 / 56, Huge about 52 / 72). Smaller screens keep the 720
 * look scaled down, bigger ones the 1080 look scaled up.
 */
export const TYPING_FX_CAP: Readonly<Record<TypingFxSize, { readonly at720: number; readonly at1080: number }>> = {
  medium: { at720: 30, at1080: 42 },
  large: { at720: 40, at1080: 56 },
  huge: { at720: 52, at1080: 72 },
};

/** Cap height (px) of the strip's word for `size` on a view `height` px tall. */
export function stripCapPx(size: TypingFxSize, height: number): number {
  const row = TYPING_FX_CAP[size] ?? TYPING_FX_CAP.large;
  const h = Number.isFinite(height) && height > 0 ? height : 1080;
  if (h <= 720) return (row.at720 * h) / 720;
  if (h >= 1080) return (row.at1080 * h) / 1080;
  return row.at720 + ((row.at1080 - row.at720) * (h - 720)) / 360;
}

/** Player-facing names (English: the games are English). */
export const TYPING_FX_STYLE_NAMES: Readonly<Record<TypingFxStyle, string>> = {
  stamp: "Stamp",
  flare: "Flare",
  smash: "Smash",
  shatter: "Shatter",
  rune: "Rune",
  minimal: "Minimal",
};

export const TYPING_FX_INTENSITY_NAMES: Readonly<Record<TypingFxIntensity, string>> = {
  off: "Off",
  low: "Low",
  normal: "Normal",
  high: "High",
  ultra: "Ultra",
};

const pick = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

/** Any stored value (old, partial or broken) as valid settings; each bad field falls back on its own. */
export function sanitizeTypingFx(raw: unknown, defaults: Readonly<TypingFxSettings> = DEFAULT_TYPING_FX): TypingFxSettings {
  const source = raw !== null && typeof raw === "object" ? (raw as Partial<Record<keyof TypingFxSettings, unknown>>) : {};
  const volume = typeof source.volume === "number" && Number.isFinite(source.volume) ? Math.max(0, Math.min(1, source.volume)) : defaults.volume;
  const profile = typeof source.soundProfile === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(source.soundProfile) ? source.soundProfile : defaults.soundProfile;
  return {
    style: pick(source.style, TYPING_FX_STYLES, defaults.style),
    intensity: pick(source.intensity, TYPING_FX_INTENSITIES, defaults.intensity),
    size: pick(source.size, TYPING_FX_SIZES, defaults.size),
    soundProfile: profile,
    volume,
  };
}
