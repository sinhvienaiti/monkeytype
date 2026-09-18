import { z } from "zod";

import { LocalStorageWithSchema } from "../../utils/local-storage-with-schema";

const EnVnTranslationSettingsSchema = z.object({
  enabled: z.boolean(),
  dictionary: z.string(),
  durationMs: z.number().int().min(500).max(10000),
});

export type EnVnTranslationSettings = z.infer<
  typeof EnVnTranslationSettingsSchema
>;

const defaultSettings: EnVnTranslationSettings = {
  enabled: true,
  dictionary: "",
  durationMs: 3000,
};

const settingsStorage = new LocalStorageWithSchema({
  key: "personalEnVnTranslationSettings",
  schema: EnVnTranslationSettingsSchema,
  fallback: defaultSettings,
});

export function getSettings(): EnVnTranslationSettings {
  return settingsStorage.get();
}

export function setSettings(settings: EnVnTranslationSettings): boolean {
  return settingsStorage.set(settings);
}
