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

const storage = new LocalStorageWithSchema({
  key: "personalTypingFeelSettings",
  schema: TypingFeelSchema,
  fallback: { ...defaultTypingFeel },
  migrate: migrateTypingFeel,
});

type Listener = (settings: TypingFeelSettings) => void;
const listeners = new Set<Listener>();

export function getTypingFeel(): TypingFeelSettings {
  return storage.get();
}

/** Saves at once; listeners (the runtime's cached flags) hear every saved change. */
export function setTypingFeel(settings: TypingFeelSettings): boolean {
  const saved = storage.set(settings);
  if (!saved) return false;
  const current = storage.get();
  for (const listener of listeners) {
    try {
      listener(current);
    } catch (error) {
      console.error("typing feel listener failed", error);
    }
  }
  return true;
}

export function onTypingFeelChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
