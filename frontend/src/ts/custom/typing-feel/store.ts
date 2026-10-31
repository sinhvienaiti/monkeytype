import { z } from "zod";

import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";
import { TYPING_FX_INTENSITIES, TYPING_FX_STYLES } from "./kit/settings";

export const KEYBOARD_SOUND_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Owner's pick (30/10/2026): the highest-scoring Firefly set. */
export const DEFAULT_KEYBOARD_SOUND = "bright-clack";

const KeyboardSoundSchema = z.string().regex(KEYBOARD_SOUND_ID);
const KeyboardVolumeSchema = z.number().int().min(0).max(100);
const LetterEffectSchema = z.enum(TYPING_FX_STYLES);
const EffectStrengthSchema = z.enum(TYPING_FX_INTENSITIES);

const TypingFeelSchema = z.object({
  keyboardSound: KeyboardSoundSchema,
  keyboardVolume: KeyboardVolumeSchema,
  letterEffect: LetterEffectSchema,
  effectStrength: EffectStrengthSchema,
});

export type TypingFeelSettings = z.infer<typeof TypingFeelSchema>;
export type LetterEffect = z.infer<typeof LetterEffectSchema>;
export type EffectStrength = z.infer<typeof EffectStrengthSchema>;

export const defaultTypingFeel: Readonly<TypingFeelSettings> = Object.freeze({
  keyboardSound: DEFAULT_KEYBOARD_SOUND,
  keyboardVolume: 100,
  letterEffect: "stamp",
  effectStrength: "normal",
});

function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultTypingFeel.keyboardVolume;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Each bad field falls back on its own; Monkeytype's own sound settings are never read. */
export function migrateTypingFeel(
  oldData: Record<string, unknown> | unknown[],
): TypingFeelSettings {
  if (Array.isArray(oldData)) return { ...defaultTypingFeel };
  return {
    keyboardSound:
      KeyboardSoundSchema.safeParse(oldData["keyboardSound"]).data ??
      defaultTypingFeel.keyboardSound,
    keyboardVolume: clampVolume(oldData["keyboardVolume"]),
    letterEffect:
      LetterEffectSchema.safeParse(oldData["letterEffect"]).data ??
      defaultTypingFeel.letterEffect,
    effectStrength:
      EffectStrengthSchema.safeParse(oldData["effectStrength"]).data ??
      defaultTypingFeel.effectStrength,
  };
}

const STORAGE_KEY = "personalTypingFeelSettings";

const storage = new LocalStorageWithSchema({
  key: STORAGE_KEY,
  schema: TypingFeelSchema,
  fallback: { ...defaultTypingFeel },
  migrate: migrateTypingFeel,
});

type Listener = (settings: TypingFeelSettings) => void;
const listeners = new Set<Listener>();

/**
 * The keyboard sound a player without a save follows: the ready Typing Feel
 * catalogue's `default` (parent repo docs/games/TYPING_FEEL_SERVICE.md §4.5).
 * Null until such a catalogue is in; never saved on its own.
 */
let followedDefault: string | null = null;

/** Whether this browser holds a typing feel save, read raw: the store's defaults never count. */
export function hasTypingFeelSave(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * The saved keyboard sound, or null when this browser has no save yet
 * (§5.1 step 4: read before the store's default fills it in), so a new
 * player follows the catalogue's default instead of Bright Clack.
 */
export function savedKeyboardSound(): string | null {
  return hasTypingFeelSave() ? storage.get().keyboardSound : null;
}

/** The save, or the defaults with the followed catalogue default for a player without one. */
export function getTypingFeel(): TypingFeelSettings {
  const settings = storage.get();
  if (followedDefault !== null && !hasTypingFeelSave()) {
    settings.keyboardSound = followedDefault;
  }
  return settings;
}

function notify(settings: TypingFeelSettings): void {
  for (const listener of listeners) {
    try {
      listener(settings);
    } catch (error) {
      console.error("typing feel listener failed", error);
    }
  }
}

/**
 * A player without a save follows `id`, the ready catalogue's default, until
 * they change a setting (that first change saves the sound they had, §3.10).
 * Not saved; listeners hear it when it changes what such a player plays.
 */
export function followKeyboardDefault(id: string): void {
  if (!KEYBOARD_SOUND_ID.test(id) || id === followedDefault) return;
  const before = getTypingFeel().keyboardSound;
  followedDefault = id;
  const after = getTypingFeel();
  if (after.keyboardSound !== before) notify(after);
}

/** Saves at once; listeners (the runtime's cached flags) hear every saved change. */
export function setTypingFeel(settings: TypingFeelSettings): boolean {
  const saved = storage.set(settings);
  if (!saved) return false;
  if (!hasTypingFeelSave()) {
    // The schema store skips a write equal to what it holds, its defaults
    // for a player without a save. That first save must land anyway, or a
    // player who picked the default sound would go on following the catalogue.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage.get()));
    } catch (error) {
      console.error("typing feel: first save failed", error);
    }
  }
  notify(getTypingFeel());
  return true;
}

export function onTypingFeelChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
