import { z } from "zod";

import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";

const TranslationPopupStyleSchema = z.enum([
  "bubble",
  "pill",
  "soft",
  "minimal",
]);
const TranslationPopupSizeSchema = z.enum(["small", "medium", "large"]);
const TranslationPopupColorSchema = z.enum([
  "auto",
  "blue",
  "green",
  "amber",
  "purple",
]);
const TranslationDisplayModeSchema = z.enum(["tooltip", "top", "both"]);
const TranslationLineSpacingSchema = z.enum([
  "normal",
  "comfortable",
  "wide",
]);
const PronunciationAccentSchema = z.enum(["en-US", "en-GB"]);
const PronunciationRateSchema = z.enum(["slow", "normal", "fast"]);

const EnVnTranslationSettingsSchema = z.object({
  enabled: z.boolean(),
  dictionary: z.string(),
  durationMs: z.number().int().min(500).max(10000),
  popupStyle: TranslationPopupStyleSchema,
  popupSize: TranslationPopupSizeSchema,
  popupColor: TranslationPopupColorSchema,
  displayMode: TranslationDisplayModeSchema,
  lineSpacing: TranslationLineSpacingSchema,
  pronunciationEnabled: z.boolean(),
  pronunciationAccent: PronunciationAccentSchema,
  pronunciationRate: PronunciationRateSchema,
  pronunciationVolume: z.number().int().min(0).max(100),
});

export type TranslationPopupStyle = z.infer<
  typeof TranslationPopupStyleSchema
>;
export type TranslationPopupSize = z.infer<typeof TranslationPopupSizeSchema>;
export type TranslationPopupColor = z.infer<
  typeof TranslationPopupColorSchema
>;
export type TranslationDisplayMode = z.infer<
  typeof TranslationDisplayModeSchema
>;
export type TranslationLineSpacing = z.infer<
  typeof TranslationLineSpacingSchema
>;
export type PronunciationAccent = z.infer<typeof PronunciationAccentSchema>;
export type PronunciationRate = z.infer<typeof PronunciationRateSchema>;
export type EnVnTranslationSettings = z.infer<
  typeof EnVnTranslationSettingsSchema
>;

const defaultSettings: EnVnTranslationSettings = {
  enabled: true,
  dictionary: "",
  durationMs: 3000,
  popupStyle: "bubble",
  popupSize: "medium",
  popupColor: "blue",
  displayMode: "both",
  lineSpacing: "comfortable",
  pronunciationEnabled: true,
  pronunciationAccent: "en-US",
  pronunciationRate: "normal",
  pronunciationVolume: 100,
};

const settingsStorage = new LocalStorageWithSchema({
  key: "personalEnVnTranslationSettings",
  schema: EnVnTranslationSettingsSchema,
  fallback: defaultSettings,
  migrate: (oldData) => {
    if (Array.isArray(oldData)) {
      return defaultSettings;
    }

    return {
      enabled:
        typeof oldData["enabled"] === "boolean"
          ? oldData["enabled"]
          : defaultSettings.enabled,
      dictionary:
        typeof oldData["dictionary"] === "string"
          ? oldData["dictionary"]
          : defaultSettings.dictionary,
      durationMs:
        typeof oldData["durationMs"] === "number"
          ? Math.min(10000, Math.max(500, oldData["durationMs"]))
          : defaultSettings.durationMs,
      popupStyle:
        TranslationPopupStyleSchema.safeParse(oldData["popupStyle"]).data ??
        defaultSettings.popupStyle,
      popupSize:
        TranslationPopupSizeSchema.safeParse(oldData["popupSize"]).data ??
        defaultSettings.popupSize,
      popupColor:
        TranslationPopupColorSchema.safeParse(oldData["popupColor"]).data ??
        defaultSettings.popupColor,
      displayMode:
        TranslationDisplayModeSchema.safeParse(oldData["displayMode"]).data ??
        defaultSettings.displayMode,
      lineSpacing:
        TranslationLineSpacingSchema.safeParse(oldData["lineSpacing"]).data ??
        defaultSettings.lineSpacing,
      pronunciationEnabled:
        typeof oldData["pronunciationEnabled"] === "boolean"
          ? oldData["pronunciationEnabled"]
          : defaultSettings.pronunciationEnabled,
      pronunciationAccent:
        PronunciationAccentSchema.safeParse(oldData["pronunciationAccent"])
          .data ?? defaultSettings.pronunciationAccent,
      pronunciationRate:
        PronunciationRateSchema.safeParse(oldData["pronunciationRate"]).data ??
        defaultSettings.pronunciationRate,
      pronunciationVolume:
        typeof oldData["pronunciationVolume"] === "number"
          ? Math.min(100, Math.max(0, oldData["pronunciationVolume"]))
          : defaultSettings.pronunciationVolume,
    };
  },
});

export function getSettings(): EnVnTranslationSettings {
  return settingsStorage.get();
}

export function setSettings(settings: EnVnTranslationSettings): boolean {
  return settingsStorage.set(settings);
}
