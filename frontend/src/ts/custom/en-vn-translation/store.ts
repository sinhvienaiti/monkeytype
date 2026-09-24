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
const TranslationTooltipBehaviorSchema = z.enum(["hold", "float"]);
const TranslationLineSpacingSchema = z.enum([
  "normal",
  "comfortable",
  "wide",
]);
const PronunciationAccentSchema = z.enum(["en-US", "en-GB"]);
const PronunciationRateSchema = z.enum(["slow", "normal", "fast"]);
const TextReaderLanguageSchema = z.enum(["auto", "en-US", "vi-VN"]);
const DictionarySourceSchema = z.enum([
  "library",
  "topic",
  "word-type",
  "grammar",
  "custom",
]);

const EnVnTranslationSettingsSchema = z.object({
  enabled: z.boolean(),
  recallModeEnabled: z.boolean(),
  dictionarySource: DictionarySourceSchema,
  dictionaryTopicId: z.string(),
  dictionaryPosId: z.string(),
  dictionaryGrammarId: z.string(),
  dictionary: z.string(),
  durationMs: z.number().int().min(500).max(10000),
  popupStyle: TranslationPopupStyleSchema,
  popupSize: TranslationPopupSizeSchema,
  popupColor: TranslationPopupColorSchema,
  displayMode: TranslationDisplayModeSchema,
  tooltipBehavior: TranslationTooltipBehaviorSchema,
  lineSpacing: TranslationLineSpacingSchema,
  pronunciationEnabled: z.boolean(),
  pronunciationAccent: PronunciationAccentSchema,
  pronunciationRate: PronunciationRateSchema,
  pronunciationVolume: z.number().int().min(0).max(100),
  textReaderEnabled: z.boolean(),
  textReaderLanguage: TextReaderLanguageSchema,
  textReaderVoiceURI: z.string(),
  textReaderRate: z.number().min(0.5).max(2),
  textReaderVolume: z.number().int().min(0).max(100),
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
export type TranslationTooltipBehavior = z.infer<
  typeof TranslationTooltipBehaviorSchema
>;
export type TranslationLineSpacing = z.infer<
  typeof TranslationLineSpacingSchema
>;
export type PronunciationAccent = z.infer<typeof PronunciationAccentSchema>;
export type PronunciationRate = z.infer<typeof PronunciationRateSchema>;
export type TextReaderLanguage = z.infer<typeof TextReaderLanguageSchema>;
export type DictionarySource = z.infer<typeof DictionarySourceSchema>;
export type EnVnTranslationSettings = z.infer<
  typeof EnVnTranslationSettingsSchema
>;

const defaultSettings: EnVnTranslationSettings = {
  enabled: true,
  recallModeEnabled: false,
  dictionarySource: "custom",
  dictionaryTopicId: "everyday.routine",
  dictionaryPosId: "noun",
  dictionaryGrammarId: "time.present",
  dictionary: "",
  durationMs: 3000,
  popupStyle: "bubble",
  popupSize: "medium",
  popupColor: "blue",
  displayMode: "both",
  tooltipBehavior: "hold",
  lineSpacing: "comfortable",
  pronunciationEnabled: true,
  pronunciationAccent: "en-US",
  pronunciationRate: "normal",
  pronunciationVolume: 100,
  textReaderEnabled: false,
  textReaderLanguage: "auto",
  textReaderVoiceURI: "",
  textReaderRate: 1,
  textReaderVolume: 100,
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
      recallModeEnabled:
        typeof oldData["recallModeEnabled"] === "boolean"
          ? oldData["recallModeEnabled"]
          : defaultSettings.recallModeEnabled,
      dictionarySource:
        DictionarySourceSchema.safeParse(oldData["dictionarySource"]).data ??
        defaultSettings.dictionarySource,
      dictionaryTopicId:
        typeof oldData["dictionaryTopicId"] === "string" &&
        oldData["dictionaryTopicId"].trim() !== ""
          ? oldData["dictionaryTopicId"]
          : defaultSettings.dictionaryTopicId,
      dictionaryPosId:
        typeof oldData["dictionaryPosId"] === "string" &&
        oldData["dictionaryPosId"].trim() !== ""
          ? oldData["dictionaryPosId"]
          : defaultSettings.dictionaryPosId,
      dictionaryGrammarId:
        typeof oldData["dictionaryGrammarId"] === "string" &&
        oldData["dictionaryGrammarId"].trim() !== ""
          ? oldData["dictionaryGrammarId"]
          : defaultSettings.dictionaryGrammarId,
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
      tooltipBehavior:
        TranslationTooltipBehaviorSchema.safeParse(oldData["tooltipBehavior"])
          .data ?? defaultSettings.tooltipBehavior,
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
      textReaderEnabled:
        typeof oldData["textReaderEnabled"] === "boolean"
          ? oldData["textReaderEnabled"]
          : defaultSettings.textReaderEnabled,
      textReaderLanguage:
        TextReaderLanguageSchema.safeParse(oldData["textReaderLanguage"]).data ??
        defaultSettings.textReaderLanguage,
      textReaderVoiceURI:
        typeof oldData["textReaderVoiceURI"] === "string"
          ? oldData["textReaderVoiceURI"]
          : defaultSettings.textReaderVoiceURI,
      textReaderRate:
        typeof oldData["textReaderRate"] === "number"
          ? Math.min(2, Math.max(0.5, oldData["textReaderRate"]))
          : defaultSettings.textReaderRate,
      textReaderVolume:
        typeof oldData["textReaderVolume"] === "number"
          ? Math.min(100, Math.max(0, oldData["textReaderVolume"]))
          : defaultSettings.textReaderVolume,
    };
  },
});

export function getSettings(): EnVnTranslationSettings {
  return settingsStorage.get();
}

export function setSettings(settings: EnVnTranslationSettings): boolean {
  return settingsStorage.set(settings);
}
