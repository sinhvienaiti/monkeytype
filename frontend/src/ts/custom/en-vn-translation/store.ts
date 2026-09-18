import { z } from "zod";

import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";

const TranslationPopupStyleSchema = z.enum(["bubble", "pill", "soft", "minimal"]);
const TranslationPopupSizeSchema = z.enum(["small", "medium", "large"]);
const TranslationPopupColorSchema = z.enum([
  "auto",
  "blue",
  "green",
  "amber",
  "purple",
]);

const EnVnTranslationSettingsSchema = z.object({
  enabled: z.boolean(),
  dictionary: z.string(),
  durationMs: z.number().int().min(500).max(10000),
  popupStyle: TranslationPopupStyleSchema,
  popupSize: TranslationPopupSizeSchema,
  popupColor: TranslationPopupColorSchema,
});

export type TranslationPopupStyle = z.infer<
  typeof TranslationPopupStyleSchema
>;
export type TranslationPopupSize = z.infer<typeof TranslationPopupSizeSchema>;
export type TranslationPopupColor = z.infer<
  typeof TranslationPopupColorSchema
>;
export type EnVnTranslationSettings = z.infer<
  typeof EnVnTranslationSettingsSchema
>;

const defaultSettings: EnVnTranslationSettings = {
  enabled: true,
  dictionary: "",
  durationMs: 3000,
  popupStyle: "bubble",
  popupSize: "large",
  popupColor: "blue",
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
      popupStyle: defaultSettings.popupStyle,
      popupSize: defaultSettings.popupSize,
      popupColor: defaultSettings.popupColor,
    };
  },
});

export function getSettings(): EnVnTranslationSettings {
  return settingsStorage.get();
}

export function setSettings(settings: EnVnTranslationSettings): boolean {
  return settingsStorage.set(settings);
}
