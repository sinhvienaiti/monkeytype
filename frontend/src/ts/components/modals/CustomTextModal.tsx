import type { CustomTextMode } from "@monkeytype/schemas/util";

import { createForm } from "@tanstack/solid-form";
import {
  batch,
  createMemo,
  createSignal,
  For,
  JSXElement,
  onCleanup,
  Show,
  untrack,
} from "solid-js";

import type { FaSolidIcon } from "../../types/font-awesome";

import { setConfig } from "../../config/setters";
import { Config } from "../../config/store";
import { restartTestEvent } from "../../events/test";
import {
  getCustomTextIndicator,
  setCustomTextIndicator,
} from "../../states/core";
import { hideModalAndClearChain, showModal } from "../../states/modals";
import {
  showNoticeNotification,
  showErrorNotification,
} from "../../states/notifications";
import { getLoadedChallenge, setLoadedChallenge } from "../../states/test";
import * as CustomText from "../../test/custom-text";
import * as PractiseWords from "../../test/practise-words";
import { cn } from "../../utils/cn";
import * as Strings from "../../utils/strings";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Fa } from "../common/Fa";
import { Separator } from "../common/Separator";
import { SubmitButton } from "../ui/form/SubmitButton";
import { TextareaField } from "../ui/form/TextareaField";
import { CustomGeneratorModal } from "./CustomGeneratorModal";
import { SaveCustomTextModal } from "./SaveCustomTextModal";
import { SavedTextsModal } from "./SavedTextsModal";
import { WordFilterModal } from "./WordFilterModal";
import {
  getSettings as getEnVnTranslationSettings,
  setSettings as setEnVnTranslationSettings,
} from "../../custom/en-vn-translation/store";
import {
  loadVocabularyGrammarIndex,
  loadVocabularyPosIndex,
  loadVocabularyTopicIndex,
  prepareGrammarDictionary,
  prepareLibraryDictionary,
  preparePosDictionary,
  prepareTopicDictionary,
} from "../../custom/en-vn-translation/library";
import type {
  VocabularyGrammarIndex,
  VocabularyPosIndex,
  VocabularyTopicIndex,
  VocabularyTopicMeta,
} from "../../custom/en-vn-translation/library";
import {
  loadTypingTextIndex,
  loadTypingTextSettings,
  prepareLevelPassageText,
  saveTypingTextSettings,
} from "../../custom/typing-text-library";
import type {
  TypingTextIndex,
  TypingTextSource,
} from "../../custom/typing-text-library";
import {
  getLocalTextReaderVoices,
  pauseTextReader,
  resumeTextReader,
  startTextReader,
  stopTextReader,
} from "../../custom/en-vn-translation/text-reader";
import type { TextReaderState } from "../../custom/en-vn-translation/text-reader";
import {
  draftToExercise,
  exerciseToDraft,
  loadSentenceBuilderExercise,
  saveSentenceBuilderExercise,
} from "../../learning/sentence-builder-store";
import type {
  DictionarySource,
  LearningMode,
  PronunciationAccent,
  PronunciationRate,
  TextReaderLanguage,
  TranslationDisplayMode,
  TranslationLineSpacing,
  TranslationPopupColor,
  TranslationPopupSize,
  TranslationPopupStyle,
  TranslationTooltipBehavior,
} from "../../custom/en-vn-translation/store";

export type CustomTextIncomingData =
  | ({ set?: boolean; long?: boolean } & (
      | { text: string; splitText?: never }
      | { text?: never; splitText: string[] }
    ))
  | null;

type Mode = "simple" | CustomTextMode;

const modeOptions = [
  { value: "simple", label: "simple" },
  { value: "repeat", label: "repeat" },
  { value: "shuffle", label: "shuffle" },
  { value: "random", label: "random" },
];

const delimiterOptions = [
  { value: "true", label: "pipe" },
  { value: "false", label: "space" },
];

const translationStyleOptions = [
  { value: "bubble", label: "bubble" },
  { value: "pill", label: "pill" },
  { value: "soft", label: "soft" },
  { value: "minimal", label: "minimal" },
] as const;

const translationSizeOptions = [
  { value: "small", label: "small" },
  { value: "medium", label: "medium" },
  { value: "large", label: "large" },
] as const;

const translationColorOptions = [
  { value: "auto", label: "auto" },
  { value: "blue", label: "blue" },
  { value: "green", label: "green" },
  { value: "amber", label: "amber" },
  { value: "purple", label: "purple" },
] as const;

const translationDisplayOptions = [
  { value: "tooltip", label: "tooltip" },
  { value: "top", label: "top" },
  { value: "both", label: "both" },
] as const;

const translationLineSpacingOptions = [
  { value: "normal", label: "normal" },
  { value: "comfortable", label: "comfortable" },
  { value: "wide", label: "wide" },
] as const;

const translationTooltipBehaviorOptions = [
  { value: "hold", label: "hold" },
  { value: "float", label: "float" },
] as const;

const pronunciationAccentOptions = [
  { value: "en-US", label: "US" },
  { value: "en-GB", label: "UK" },
] as const;

const pronunciationRateOptions = [
  { value: "slow", label: "slow" },
  { value: "normal", label: "normal" },
  { value: "fast", label: "fast" },
] as const;

const textReaderLanguageOptions = [
  { value: "auto", label: "auto" },
  { value: "en-US", label: "English" },
  { value: "vi-VN", label: "Vietnamese" },
] as const;

export function CustomTextModal(): JSXElement {
  const [longTextWarning, setLongTextWarning] = createSignal(false);
  const [challengeWarning, setChallengeWarning] = createSignal(false);

  const [incomingChainedData, setIncomingChainedData] =
    createSignal<CustomTextIncomingData>(null);

  const [textToSave, setTextToSave] = createSignal<string[]>([]);
  const [textReaderState, setTextReaderState] =
    createSignal<TextReaderState>("idle");
  const [textReaderVoices, setTextReaderVoices] = createSignal<
    SpeechSynthesisVoice[]
  >([]);
  const [typingTextIndex, setTypingTextIndex] =
    createSignal<TypingTextIndex | null>(null);
  const [typingTextIndexLoading, setTypingTextIndexLoading] =
    createSignal(false);
  const [vocabularyTopicIndex, setVocabularyTopicIndex] =
    createSignal<VocabularyTopicIndex | null>(null);
  const [vocabularyTopicIndexLoading, setVocabularyTopicIndexLoading] =
    createSignal(false);
  const [vocabularyPosIndex, setVocabularyPosIndex] =
    createSignal<VocabularyPosIndex | null>(null);
  const [vocabularyPosIndexLoading, setVocabularyPosIndexLoading] =
    createSignal(false);
  const [vocabularyGrammarIndex, setVocabularyGrammarIndex] =
    createSignal<VocabularyGrammarIndex | null>(null);
  const [vocabularyGrammarIndexLoading, setVocabularyGrammarIndexLoading] =
    createSignal(false);
  const vocabularyTopicGroups = createMemo(() => {
    const groups = new Map<
      string,
      { id: string; label: string; topics: VocabularyTopicMeta[] }
    >();

    for (const topic of vocabularyTopicIndex()?.topics ?? []) {
      let group = groups.get(topic.group);
      if (group === undefined) {
        group = {
          id: topic.group,
          label: topic.groupLabel ?? topic.group,
          topics: [],
        };
        groups.set(topic.group, group);
      }
      group.topics.push(topic);
    }

    return [...groups.values()];
  });
  const vocabularyGrammarPrimary = createMemo(() => {
    const index = vocabularyGrammarIndex();
    if (index === null) return [];
    return index.primaryTimeGroups.flatMap((id) => {
      const module = index.modules.find((item) => item.id === id);
      return module === undefined ? [] : [module];
    });
  });
  const vocabularyGrammarPractical = createMemo(() => {
    const index = vocabularyGrammarIndex();
    if (index === null) return [];
    const primary = new Set(index.primaryTimeGroups);
    return index.modules.filter((item) => !primary.has(item.id));
  });

  // oxlint-disable-next-line no-unassigned-vars -- assigned via SolidJS ref
  let fileInputRef!: HTMLInputElement;
  // oxlint-disable-next-line no-unassigned-vars -- assigned via SolidJS ref
  let textareaRef: HTMLTextAreaElement | undefined;

  const form = createForm(() => ({
    defaultValues: {
      text: "",
      typingTextSource: "custom" as TypingTextSource,
      typingTextLevel: "1",
      typingTextPassageCount: "1",
      mode: "simple" as Mode,
      limitWord: "",
      limitTime: "",
      limitSection: "",
      pipeDelimiter: false,
      translationEnabled: true,
      translationLearningMode: "normal" as LearningMode,
      sentenceBuilderSentenceId: "custom-sentence-1",
      sentenceBuilderGrammarId: "",
      sentenceBuilderPrompt: "Build a natural English sentence.",
      sentenceBuilderMeaning: "",
      sentenceBuilderAcceptedAnswers: "",
      sentenceBuilderDifficulty: "normal" as const,
      sentenceBuilderDistractors: "",
      sentenceBuilderGrammarHint: "",
      sentenceBuilderClassifiedAnswers: "",
      translationDictionarySource: "custom" as DictionarySource,
      translationDictionaryTopicId: "everyday.routine",
      translationDictionaryPosId: "noun",
      translationDictionaryGrammarId: "time.present",
      translationDictionary: "",
      translationDuration: "3000",
      translationPopupStyle: "bubble" as TranslationPopupStyle,
      translationPopupSize: "medium" as TranslationPopupSize,
      translationPopupColor: "blue" as TranslationPopupColor,
      translationDisplayMode: "both" as TranslationDisplayMode,
      translationTooltipBehavior: "hold" as TranslationTooltipBehavior,
      translationLineSpacing: "comfortable" as TranslationLineSpacing,
      pronunciationEnabled: true,
      pronunciationAccent: "en-US" as PronunciationAccent,
      pronunciationRate: "normal" as PronunciationRate,
      pronunciationVolume: "100",
      textReaderEnabled: false,
      textReaderLanguage: "auto" as TextReaderLanguage,
      textReaderVoiceURI: "",
      textReaderRate: 1,
      textReaderVolume: 100,
    },
    onSubmit: async ({ value }) => {
      let sourceText = value.text;

      if (value.typingTextSource === "level") {
        try {
          const prepared = await prepareLevelPassageText(
            parseInt(value.typingTextLevel) || 1,
            parseInt(value.typingTextPassageCount) || 1,
          );
          sourceText = prepared.text;
          form.setFieldValue("text", sourceText);
        } catch (error) {
          showErrorNotification(
            error instanceof Error
              ? error.message
              : "Failed to load the selected typing-text level.",
            { durationMs: 5000 },
          );
          return;
        }
      }

      if (sourceText === "") {
        showNoticeNotification("Text cannot be empty");
        return;
      }

      const effectiveMode: Mode =
        value.typingTextSource === "level" ? "simple" : value.mode;
      const effectivePipeDelimiter =
        value.typingTextSource === "level" ? false : value.pipeDelimiter;

      if (value.typingTextSource === "custom") {
        const activeLimits = [
          value.limitWord,
          value.limitTime,
          value.limitSection,
        ].filter((l) => l !== "");
        if (activeLimits.length > 1) {
          showNoticeNotification("You can only specify one limit", {
            durationMs: 5000,
          });
          return;
        }

        if (
          effectiveMode !== "simple" &&
          value.limitWord === "" &&
          value.limitTime === "" &&
          value.limitSection === ""
        ) {
          showNoticeNotification("You need to specify a limit", {
            durationMs: 5000,
          });
          return;
        }

        if (
          value.limitSection === "0" ||
          value.limitWord === "0" ||
          value.limitTime === "0"
        ) {
          showNoticeNotification(
            "Infinite test! Make sure to use Bail Out from the command line to save your result.",
            { durationMs: 7000 },
          );
        }
      }

      const text = cleanUpText(sourceText, effectivePipeDelimiter);
      if (text.length === 0) {
        showNoticeNotification("Text cannot be empty");
        return;
      }

      if (effectiveMode === "simple") {
        CustomText.setMode("repeat");
      } else {
        CustomText.setMode(effectiveMode);
      }

      CustomText.setPipeDelimiter(effectivePipeDelimiter);
      CustomText.setText(text);

      if (effectiveMode === "simple" && effectivePipeDelimiter) {
        CustomText.setLimitMode("section");
        CustomText.setLimitValue(text.length);
      } else if (effectiveMode === "simple") {
        CustomText.setLimitMode("word");
        CustomText.setLimitValue(text.length);
      } else if (value.limitWord !== "") {
        CustomText.setLimitMode("word");
        CustomText.setLimitValue(parseInt(value.limitWord));
      } else if (value.limitTime !== "") {
        CustomText.setLimitMode("time");
        CustomText.setLimitValue(parseInt(value.limitTime));
      } else if (value.limitSection !== "") {
        CustomText.setLimitMode("section");
        CustomText.setLimitValue(parseInt(value.limitSection));
      }

      const translationDuration = Math.min(
        10000,
        Math.max(500, parseInt(value.translationDuration) || 3000),
      );

      if (value.translationEnabled) {
        try {
          if (value.translationDictionarySource === "library") {
            const loaded = await prepareLibraryDictionary(sourceText);
            if (loaded.entries === 0) {
              showNoticeNotification(
                "No words from the shared library were found in this text.",
                { durationMs: 5000 },
              );
            }
          } else if (value.translationDictionarySource === "topic") {
            const loaded = await prepareTopicDictionary(
              value.translationDictionaryTopicId,
            );
            showNoticeNotification(
              `${loaded.label} dictionary ready · ${loaded.entries} entries`,
              { durationMs: 2500 },
            );
          } else if (value.translationDictionarySource === "word-type") {
            const loaded = await preparePosDictionary(
              value.translationDictionaryPosId,
            );
            showNoticeNotification(
              `${loaded.label} dictionary ready · ${loaded.entries} entries`,
              { durationMs: 2500 },
            );
          } else if (value.translationDictionarySource === "grammar") {
            const loaded = await prepareGrammarDictionary(
              value.translationDictionaryGrammarId,
            );
            showNoticeNotification(
              `${loaded.label} dictionary ready · ${loaded.entries} entries`,
              { durationMs: 2500 },
            );
          }
        } catch (error) {
          showErrorNotification(
            error instanceof Error
              ? error.message
              : "Failed to load the shared vocabulary dictionary.",
            { durationMs: 5000 },
          );
          return;
        }
      }

      saveTypingTextSettings({
        source: value.typingTextSource,
        level: parseInt(value.typingTextLevel) || 1,
        passageCount: Math.min(
          15,
          Math.max(1, parseInt(value.typingTextPassageCount) || 1),
        ),
      });

      setEnVnTranslationSettings({
        enabled: value.translationEnabled,
        learningMode: value.translationLearningMode,
        recallModeEnabled: value.translationLearningMode === "recall",
        dictionarySource: value.translationDictionarySource,
        dictionaryTopicId: value.translationDictionaryTopicId,
        dictionaryPosId: value.translationDictionaryPosId,
        dictionaryGrammarId: value.translationDictionaryGrammarId,
        dictionary: value.translationDictionary,
        durationMs: translationDuration,
        popupStyle: value.translationPopupStyle,
        popupSize: value.translationPopupSize,
        popupColor: value.translationPopupColor,
        displayMode: value.translationDisplayMode,
        tooltipBehavior: value.translationTooltipBehavior,
        lineSpacing: value.translationLineSpacing,
        pronunciationEnabled: value.pronunciationEnabled,
        pronunciationAccent: value.pronunciationAccent,
        pronunciationRate: value.pronunciationRate,
        pronunciationVolume: Math.min(
          100,
          Math.max(0, parseInt(value.pronunciationVolume) || 0),
        ),
        textReaderEnabled: value.textReaderEnabled,
        textReaderLanguage: value.textReaderLanguage,
        textReaderVoiceURI: value.textReaderVoiceURI,
        textReaderRate: Math.min(2, Math.max(0.5, value.textReaderRate)),
        textReaderVolume: Math.min(
          100,
          Math.max(0, Math.round(value.textReaderVolume)),
        ),
      });

      if (getLoadedChallenge() !== null) {
        showNoticeNotification("Challenge cleared");
        setLoadedChallenge(null);
      }
      if (Config.mode !== "custom") {
        setConfig("mode", "custom");
      }
      PractiseWords.resetBefore();
      restartTestEvent.dispatch();
      hideModalAndClearChain("CustomText");
    },
  }));

  const formValues = form.useStore((s) => s.values);

  const isDisabled = () => longTextWarning() || challengeWarning();
  const isLimitDisabled = () => formValues().mode === "simple" || isDisabled();

  const showWordLimit = () => !formValues().pipeDelimiter;
  const showSectionLimit = () => formValues().pipeDelimiter;

  const currentTextReaderSettings = () => ({
    ...getEnVnTranslationSettings(),
    textReaderEnabled: form.getFieldValue("textReaderEnabled"),
    textReaderLanguage: form.getFieldValue("textReaderLanguage"),
    textReaderVoiceURI: form.getFieldValue("textReaderVoiceURI"),
    textReaderRate: Math.min(
      2,
      Math.max(0.5, form.getFieldValue("textReaderRate")),
    ),
    textReaderVolume: Math.min(
      100,
      Math.max(0, Math.round(form.getFieldValue("textReaderVolume"))),
    ),
  });

  const refreshTextReaderVoices = (): void => {
    const voices = getLocalTextReaderVoices(
      form.getFieldValue("text"),
      form.getFieldValue("textReaderLanguage"),
    );
    setTextReaderVoices(voices);

    const selectedVoice = form.getFieldValue("textReaderVoiceURI");
    if (
      selectedVoice !== "" &&
      !voices.some((voice) => voice.voiceURI === selectedVoice)
    ) {
      form.setFieldValue("textReaderVoiceURI", "");
    }
  };

  const handleTextReaderPlay = (): void => {
    refreshTextReaderVoices();
    const result = startTextReader(
      form.getFieldValue("text"),
      currentTextReaderSettings(),
      {
        onStateChange: setTextReaderState,
        onError: (message) => showErrorNotification(message),
      },
    );

    if (!result.started && result.error !== undefined) {
      showNoticeNotification(result.error, { durationMs: 5000 });
    }
  };

  const handleTextReaderPauseResume = (): void => {
    if (textReaderState() === "paused") {
      resumeTextReader();
    } else {
      pauseTextReader();
    }
  };

  const cleanUpText = (
    sourceText: string = form.getFieldValue("text"),
    pipeDelimiter: boolean = form.getFieldValue("pipeDelimiter"),
  ): string[] => {
    let text = sourceText;
    if (text === "") return [];

    text = text.normalize();
    text = text.replace(/[\u2000-\u200A\u202F\u205F\u00A0]/g, " ");
    text = text.replace(/ +/gm, " ");
    text = text.replace(/( *(\r\n|\r|\n) *)/g, "\n ");

    return text
      .split(pipeDelimiter ? "|" : " ")
      .filter((word) => word !== "");
  };

  const applyRemoveZeroWidth = () => {
    form.setFieldValue(
      "text",
      form.getFieldValue("text").replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""),
    );
  };

  const applyRemoveFancyTypography = () => {
    form.setFieldValue(
      "text",
      Strings.cleanTypographySymbols(form.getFieldValue("text")),
    );
  };

  const applyReplaceControlChars = () => {
    form.setFieldValue(
      "text",
      Strings.replaceControlCharacters(form.getFieldValue("text")),
    );
  };

  const applyReplaceNewlines = (mode: "space" | "periodSpace") => {
    let text = form.getFieldValue("text");
    if (mode === "periodSpace") {
      text = text.replace(/\n/gm, ". ");
      text = text.replace(/\.\. /gm, ". ");
      text = text.replace(/ +/gm, " ");
    } else {
      text = text.replace(/\n/gm, " ");
      text = text.replace(/ +/gm, " ");
    }
    form.setFieldValue("text", text);
  };

  const handleDelimiterChange = (newPipeDelimiter: boolean) => {
    const currentPipeDelimiter = form.getFieldValue("pipeDelimiter");
    let newtext = form
      .getFieldValue("text")
      .split(currentPipeDelimiter ? "|" : " ")
      .join(newPipeDelimiter ? "|" : " ");
    newtext = newtext.replace(/\n /g, "\n");

    batch(() => {
      form.setFieldValue("text", newtext);
      form.setFieldValue("pipeDelimiter", newPipeDelimiter);
      if (newPipeDelimiter && form.getFieldValue("limitWord") !== "") {
        form.setFieldValue("limitWord", "");
      }
      if (!newPipeDelimiter && form.getFieldValue("limitSection") !== "") {
        form.setFieldValue("limitSection", "");
      }
    });
  };

  const initState = () => {
    let mode: Mode = CustomText.getMode();
    if (
      mode === "repeat" &&
      CustomText.getLimitMode() !== "time" &&
      CustomText.getLimitValue() === CustomText.getText().length
    ) {
      mode = "simple";
    }

    const pipeDelimiter = CustomText.getPipeDelimiter();
    let limitWord = "";
    let limitTime = "";
    let limitSection = "";

    if (mode !== "simple") {
      if (CustomText.getLimitMode() === "word") {
        limitWord = `${CustomText.getLimitValue()}`;
      } else if (CustomText.getLimitMode() === "time") {
        limitTime = `${CustomText.getLimitValue()}`;
      } else if (CustomText.getLimitMode() === "section") {
        limitSection = `${CustomText.getLimitValue()}`;
      }
    }

    const translationSettings = getEnVnTranslationSettings();
    const typingTextSettings = loadTypingTextSettings();

    const text = CustomText.getText()
      .join(pipeDelimiter ? "|" : " ")
      .replace(/^ +/gm, "");

    untrack(() => {
      batch(() => {
        form.setFieldValue("mode", mode);
        form.setFieldValue("limitWord", limitWord);
        form.setFieldValue("limitTime", limitTime);
        form.setFieldValue("limitSection", limitSection);
        form.setFieldValue("pipeDelimiter", pipeDelimiter);
        form.setFieldValue("text", text);
        form.setFieldValue("typingTextSource", typingTextSettings.source);
        form.setFieldValue(
          "typingTextLevel",
          String(typingTextSettings.level),
        );
        form.setFieldValue(
          "typingTextPassageCount",
          String(typingTextSettings.passageCount),
        );
        form.setFieldValue(
          "translationEnabled",
          translationSettings.enabled,
        );
        form.setFieldValue(
          "translationLearningMode",
          translationSettings.learningMode,
        );
        form.setFieldValue(
          "translationDictionarySource",
          translationSettings.dictionarySource,
        );
        form.setFieldValue(
          "translationDictionaryTopicId",
          translationSettings.dictionaryTopicId,
        );
        form.setFieldValue(
          "translationDictionaryPosId",
          translationSettings.dictionaryPosId,
        );
        form.setFieldValue(
          "translationDictionaryGrammarId",
          translationSettings.dictionaryGrammarId,
        );
        form.setFieldValue(
          "translationDictionary",
          translationSettings.dictionary,
        );
        form.setFieldValue(
          "translationDuration",
          `${translationSettings.durationMs}`,
        );
        form.setFieldValue(
          "translationPopupStyle",
          translationSettings.popupStyle,
        );
        form.setFieldValue(
          "translationPopupSize",
          translationSettings.popupSize,
        );
        form.setFieldValue(
          "translationPopupColor",
          translationSettings.popupColor,
        );
        form.setFieldValue(
          "translationDisplayMode",
          translationSettings.displayMode,
        );
        form.setFieldValue(
          "translationTooltipBehavior",
          translationSettings.tooltipBehavior,
        );
        form.setFieldValue(
          "translationLineSpacing",
          translationSettings.lineSpacing,
        );
        form.setFieldValue(
          "pronunciationEnabled",
          translationSettings.pronunciationEnabled,
        );
        form.setFieldValue(
          "pronunciationAccent",
          translationSettings.pronunciationAccent,
        );
        form.setFieldValue(
          "pronunciationRate",
          translationSettings.pronunciationRate,
        );
        form.setFieldValue(
          "pronunciationVolume",
          `${translationSettings.pronunciationVolume}`,
        );
        form.setFieldValue(
          "textReaderEnabled",
          translationSettings.textReaderEnabled,
        );
        form.setFieldValue(
          "textReaderLanguage",
          translationSettings.textReaderLanguage,
        );
        form.setFieldValue(
          "textReaderVoiceURI",
          translationSettings.textReaderVoiceURI,
        );
        form.setFieldValue(
          "textReaderRate",
          translationSettings.textReaderRate,
        );
        form.setFieldValue(
          "textReaderVolume",
          translationSettings.textReaderVolume,
        );
      });

      refreshTextReaderVoices();
    });

    setLongTextWarning(getCustomTextIndicator()?.isLong ?? false);
    setChallengeWarning(getLoadedChallenge() !== null);
  };

  const handleIncomingData = () => {
    const data = incomingChainedData();
    if (data === null) return;
    setIncomingChainedData(null);

    if (data.long !== true && getCustomTextIndicator()?.isLong) {
      setCustomTextIndicator(undefined);
      showNoticeNotification("Disabled long custom text progress tracking", {
        durationMs: 5000,
      });
      setLongTextWarning(false);
    }

    if (data.long) {
      setLongTextWarning(true);
    }

    const incomingText =
      data.splitText !== undefined
        ? data.splitText.join(form.getFieldValue("pipeDelimiter") ? "|" : " ")
        : data.text;

    const newText =
      (data.set ?? true)
        ? incomingText
        : `${form.getFieldValue("text")} ${incomingText}`;
    untrack(() => {
      batch(() => {
        form.setFieldValue("text", newText);
        form.setFieldValue("typingTextSource", "custom");
        form.setFieldValue("mode", "simple");
        form.setFieldValue("limitWord", `${cleanUpText().length}`);
        form.setFieldValue("limitTime", "");
        form.setFieldValue("limitSection", "");
      });
    });
  };

  const handleFileOpen = () => {
    const file = fileInputRef?.files?.[0];
    if (!file) return;

    if (file.type !== "text/plain") {
      showErrorNotification("File is not a text file", { durationMs: 5000 });
      return;
    }

    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = (e) => {
      const content = e.target?.result as string;
      form.setFieldValue("text", content);
      form.setFieldValue("typingTextSource", "custom");
      fileInputRef.value = "";
    };
    reader.onerror = () => {
      showErrorNotification("Failed to read file", { durationMs: 5000 });
    };
  };

  const handleTextareaKeydown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const area = e.currentTarget as HTMLTextAreaElement;
      const start = area.selectionStart;
      const end = area.selectionEnd;
      area.value = `${area.value.substring(0, start)}\t${area.value.substring(end)}`;
      area.selectionStart = area.selectionEnd = start + 1;
      form.setFieldValue("text", area.value);
    }
  };

  const handleTextareaKeypress = (e: KeyboardEvent) => {
    if (isDisabled()) {
      e.preventDefault();
      return;
    }
    if (e.code === "Enter" && e.ctrlKey) {
      void form.handleSubmit();
    }
    if (getCustomTextIndicator()?.isLong) {
      setCustomTextIndicator(undefined);
      setLongTextWarning(false);
      showNoticeNotification("Disabled long custom text progress tracking", {
        durationMs: 5000,
      });
    }
  };

  const handleModeChange = (value: string) => {
    batch(() => {
      const previousMode = formValues().mode;

      form.setFieldValue("mode", value as Mode);
      if (value === "simple") {
        form.setFieldValue("limitWord", "");
        form.setFieldValue("limitTime", "");
        form.setFieldValue("limitSection", "");
      } else if (previousMode === "simple") {
        const text = cleanUpText();
        form.setFieldValue("limitTime", "");
        if (form.getFieldValue("pipeDelimiter")) {
          form.setFieldValue("limitSection", `${text.length}`);
        } else {
          form.setFieldValue("limitWord", `${text.length}`);
        }
      }
    });
  };

  const refreshTypingTextIndex = async (): Promise<void> => {
    if (typingTextIndexLoading()) return;
    setTypingTextIndexLoading(true);

    try {
      const index = await loadTypingTextIndex();
      setTypingTextIndex(index);

      const selectedLevel = parseInt(
        form.getFieldValue("typingTextLevel"),
      );
      if (
        index.levels.length > 0 &&
        !index.levels.some((item) => item.level === selectedLevel)
      ) {
        form.setFieldValue(
          "typingTextLevel",
          String(index.levels[0]?.level ?? 1),
        );
      }
    } catch (error) {
      setTypingTextIndex(null);
      showErrorNotification(
        error instanceof Error
          ? error.message
          : "Failed to load typing-text levels.",
        { durationMs: 5000 },
      );
    } finally {
      setTypingTextIndexLoading(false);
    }
  };

  const refreshVocabularyTopicIndex = async (): Promise<void> => {
    if (vocabularyTopicIndexLoading()) return;
    setVocabularyTopicIndexLoading(true);

    try {
      const index = await loadVocabularyTopicIndex();
      setVocabularyTopicIndex(index);

      const selectedTopicId = form.getFieldValue(
        "translationDictionaryTopicId",
      );
      if (
        index.topics.length > 0 &&
        !index.topics.some((item) => item.id === selectedTopicId)
      ) {
        form.setFieldValue(
          "translationDictionaryTopicId",
          index.topics[0]?.id ?? "everyday.routine",
        );
      }
    } catch (error) {
      setVocabularyTopicIndex(null);
      showErrorNotification(
        error instanceof Error
          ? error.message
          : "Failed to load vocabulary topics.",
        { durationMs: 5000 },
      );
    } finally {
      setVocabularyTopicIndexLoading(false);
    }
  };

  const refreshVocabularyPosIndex = async (): Promise<void> => {
    if (vocabularyPosIndexLoading()) return;
    setVocabularyPosIndexLoading(true);

    try {
      const index = await loadVocabularyPosIndex();
      setVocabularyPosIndex(index);

      const selectedId = form.getFieldValue("translationDictionaryPosId");
      const selected = index.categories.find(
        (item) => item.id === selectedId && item.entries.length > 0,
      );
      if (selected === undefined) {
        form.setFieldValue(
          "translationDictionaryPosId",
          index.categories.find((item) => item.entries.length > 0)?.id ?? "noun",
        );
      }
    } catch (error) {
      setVocabularyPosIndex(null);
      showErrorNotification(
        error instanceof Error
          ? error.message
          : "Failed to load vocabulary word types.",
        { durationMs: 5000 },
      );
    } finally {
      setVocabularyPosIndexLoading(false);
    }
  };

  const refreshVocabularyGrammarIndex = async (): Promise<void> => {
    if (vocabularyGrammarIndexLoading()) return;
    setVocabularyGrammarIndexLoading(true);

    try {
      const index = await loadVocabularyGrammarIndex();
      setVocabularyGrammarIndex(index);

      const selectedId = form.getFieldValue("translationDictionaryGrammarId");
      if (!index.modules.some((item) => item.id === selectedId)) {
        form.setFieldValue(
          "translationDictionaryGrammarId",
          index.primaryTimeGroups[0] ?? index.modules[0]?.id ?? "time.present",
        );
      }
    } catch (error) {
      setVocabularyGrammarIndex(null);
      showErrorNotification(
        error instanceof Error
          ? error.message
          : "Failed to load vocabulary grammar.",
        { durationMs: 5000 },
      );
    } finally {
      setVocabularyGrammarIndexLoading(false);
    }
  };

  const refreshActiveDictionaryIndex = (): void => {
    const source = form.getFieldValue("translationDictionarySource");
    if (source === "topic") void refreshVocabularyTopicIndex();
    if (source === "word-type") void refreshVocabularyPosIndex();
    if (source === "grammar") void refreshVocabularyGrammarIndex();
  };

  const beforeShow = (isChained: boolean) => {
    if (!isChained) {
      initState();
    } else {
      handleIncomingData();
    }
    void refreshTypingTextIndex();
    refreshActiveDictionaryIndex();
  };

  const afterShow = () => {
    refreshTextReaderVoices();
    if (
      !isDisabled() &&
      form.getFieldValue("typingTextSource") === "custom"
    ) {
      textareaRef?.focus();
    }
  };

  const handleVoicesChanged = (): void => {
    refreshTextReaderVoices();
  };

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      handleVoicesChanged,
    );
  }

  onCleanup(() => {
    stopTextReader();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );
    }
  });

  return (
    <>
      <AnimatedModal
        id="CustomText"
        modalClass="max-w-[1200px] lg:grid-cols-[auto_20rem] grid-cols-1 h-min"
        beforeShow={beforeShow}
        afterShow={afterShow}
        afterHide={stopTextReader}
      >
        <form
          class="contents"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <Separator class="row-start-2 block lg:hidden" />
          <div class="row-start-3 grid content-start gap-4 self-start lg:row-start-1">
            {/* Top buttons row 1 */}
            <div class="grid grid-cols-2 gap-4">
              <Button
                variant="button"
                fa={{ icon: "fa-save" }}
                text="save"
                onClick={() => {
                  setTextToSave(cleanUpText());
                  showModal("SaveCustomText");
                }}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-folder" }}
                text="saved texts"
                onClick={() => showModal("SavedTexts")}
              />
            </div>

            <div class="grid gap-2">
              <div>
                <div class="text-xs text-sub lowercase">
                  typing text source
                </div>
                <div class="mt-1 text-xs text-text">
                  Type your own text, or load reviewed passages from a shared level.
                </div>
              </div>

              <form.Field name="typingTextSource">
                {(field) => (
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      variant="button"
                      text="custom text"
                      active={field().state.value === "custom"}
                      onClick={() => field().handleChange("custom")}
                    />
                    <Button
                      variant="button"
                      text="level passages"
                      active={field().state.value === "level"}
                      onClick={() => {
                        field().handleChange("level");
                        void refreshTypingTextIndex();
                      }}
                    />
                  </div>
                )}
              </form.Field>

              <Show when={formValues().typingTextSource === "level"}>
                <div class="grid grid-cols-2 gap-2">
                  <label class="grid gap-1">
                    <span class="text-xs text-sub">level</span>
                    <form.Field name="typingTextLevel">
                      {(field) => (
                        <select
                          value={field().state.value}
                          disabled={
                            typingTextIndexLoading() ||
                            (typingTextIndex()?.levels.length ?? 0) === 0
                          }
                          onChange={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        >
                          <For each={typingTextIndex()?.levels ?? []}>
                            {(item) => (
                              <option value={String(item.level)}>
                                Level {String(item.level).padStart(3, "0")} ·{" "}
                                {item.cefr}
                              </option>
                            )}
                          </For>
                        </select>
                      )}
                    </form.Field>
                  </label>

                  <label class="grid gap-1">
                    <span class="text-xs text-sub">passages per session</span>
                    <form.Field name="typingTextPassageCount">
                      {(field) => (
                        <input
                          type="number"
                          min="1"
                          max="15"
                          step="1"
                          value={field().state.value}
                          onInput={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        />
                      )}
                    </form.Field>
                  </label>
                </div>

                <div class="rounded bg-sub-alt px-3 py-2 text-xs text-sub">
                  {typingTextIndexLoading()
                    ? "Loading typing-text levels..."
                    : (typingTextIndex()?.levels.length ?? 0) === 0
                      ? "No reviewed production passage levels are available yet."
                      : "Passages use random non-repeating cycles and keep their original sentence order."}
                </div>
              </Show>
            </div>

            {/* Textarea */}
            <Show when={formValues().typingTextSource === "custom"}>
              <div class="relative lg:col-start-1">
              <Show when={longTextWarning()}>
                <div
                  class="absolute inset-0 z-10 grid cursor-pointer place-items-center rounded bg-sub-alt text-center"
                  onClick={() => setLongTextWarning(false)}
                >
                  <div>
                    <p class="text-em-xl">
                      A long custom text is currently loaded.
                      <br />
                      Editing the text will disable progress tracking.
                    </p>
                    <p class="mt-4 text-em-xs text-sub">
                      Click anywhere to start editing the text.
                    </p>
                  </div>
                </div>
              </Show>
              <Show when={challengeWarning()}>
                <div
                  class="absolute inset-0 z-10 grid cursor-pointer place-items-center rounded bg-sub-alt text-center"
                  onClick={() => setChallengeWarning(false)}
                >
                  <div>
                    <p class="text-em-xl">
                      A challenge is currently loaded.
                      <br />
                      Editing the settings will clear the challenge.
                    </p>
                    <p class="mt-4 text-em-xs text-sub">
                      Click anywhere to edit.
                    </p>
                  </div>
                </div>
              </Show>
              <form.Field name="text">
                {(field) => (
                  <TextareaField
                    field={field}
                    ref={textareaRef}
                    placeholder="type or paste your custom text"
                    class="min-h-72 max-h-[40vh] self-start overflow-x-hidden overflow-y-auto p-4 text-base font-(--font) text-text"
                    onKeyDown={handleTextareaKeydown}
                    onKeyPress={handleTextareaKeypress}
                  />
                )}
              </form.Field>
              </div>
            </Show>

            <div class="grid gap-2">
              <div>
                <div class="text-xs text-sub lowercase">
                  EN-VN translation dictionary
                </div>
                <div class="mt-1 text-xs text-text">
                  Use the current text, a shared topic, a word type, a practical grammar set, or your own dictionary.
                </div>
              </div>

              <form.Field name="translationDictionarySource">
                {(field) => (
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Button
                      variant="button"
                      text="library"
                      active={field().state.value === "library"}
                      onClick={() => field().handleChange("library")}
                    />
                    <Button
                      variant="button"
                      text="topic"
                      active={field().state.value === "topic"}
                      onClick={() => {
                        field().handleChange("topic");
                        void refreshVocabularyTopicIndex();
                      }}
                    />
                    <Button
                      variant="button"
                      text="word type"
                      active={field().state.value === "word-type"}
                      onClick={() => {
                        field().handleChange("word-type");
                        void refreshVocabularyPosIndex();
                      }}
                    />
                    <Button
                      variant="button"
                      text="grammar"
                      active={field().state.value === "grammar"}
                      onClick={() => {
                        field().handleChange("grammar");
                        void refreshVocabularyGrammarIndex();
                      }}
                    />
                    <Button
                      variant="button"
                      text="custom"
                      active={field().state.value === "custom"}
                      onClick={() => field().handleChange("custom")}
                    />
                  </div>
                )}
              </form.Field>

              <Show when={formValues().translationDictionarySource === "library"}>
                <div class="rounded bg-sub-alt px-3 py-2 text-xs text-sub">
                  Library mode uses the shared leveled vocabulary files. Monkeytype
                  automatically loads only the levels needed by the current text.
                </div>
              </Show>

              <Show when={formValues().translationDictionarySource === "topic"}>
                <div class="grid gap-2 rounded bg-sub-alt px-3 py-2">
                  <label class="grid gap-1">
                    <span class="text-xs text-sub">learning topic</span>
                    <form.Field name="translationDictionaryTopicId">
                      {(field) => (
                        <select
                          value={field().state.value}
                          disabled={
                            vocabularyTopicIndexLoading() ||
                            (vocabularyTopicIndex()?.topics.length ?? 0) === 0
                          }
                          onChange={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        >
                          <For each={vocabularyTopicGroups()}>
                            {(group) => (
                              <optgroup label={group.label}>
                                <For each={group.topics}>
                                  {(item) => (
                                    <option value={item.id}>
                                      {item.label} · {item.count}
                                    </option>
                                  )}
                                </For>
                              </optgroup>
                            )}
                          </For>
                        </select>
                      )}
                    </form.Field>
                  </label>
                  <div class="text-xs text-sub">
                    {vocabularyTopicIndexLoading()
                      ? "Loading shared topics..."
                      : (vocabularyTopicIndex()?.topics.length ?? 0) === 0
                        ? "No shared learning topics are available."
                        : "Topic mode loads only the vocabulary levels needed by the selected topic."}
                  </div>
                </div>
              </Show>

              <Show when={formValues().translationDictionarySource === "word-type"}>
                <div class="grid gap-2 rounded bg-sub-alt px-3 py-2">
                  <label class="grid gap-1">
                    <span class="text-xs text-sub">word type</span>
                    <form.Field name="translationDictionaryPosId">
                      {(field) => (
                        <select
                          value={field().state.value}
                          disabled={
                            vocabularyPosIndexLoading() ||
                            (vocabularyPosIndex()?.categories.length ?? 0) === 0
                          }
                          onChange={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        >
                          <For each={vocabularyPosIndex()?.categories ?? []}>
                            {(item) => (
                              <option
                                value={item.id}
                                disabled={item.entries.length === 0}
                              >
                                {item.id.replaceAll("-", " ")} ·{" "}
                                {item.entries.length}
                              </option>
                            )}
                          </For>
                        </select>
                      )}
                    </form.Field>
                  </label>
                  <div class="text-xs text-sub">
                    {vocabularyPosIndexLoading()
                      ? "Loading word types..."
                      : "Unavailable categories stay visible as coverage gaps instead of inventing vocabulary."}
                  </div>
                </div>
              </Show>

              <Show when={formValues().translationDictionarySource === "grammar"}>
                <div class="grid gap-2 rounded bg-sub-alt px-3 py-2">
                  <label class="grid gap-1">
                    <span class="text-xs text-sub">grammar practice</span>
                    <form.Field name="translationDictionaryGrammarId">
                      {(field) => (
                        <select
                          value={field().state.value}
                          disabled={
                            vocabularyGrammarIndexLoading() ||
                            (vocabularyGrammarIndex()?.modules.length ?? 0) === 0
                          }
                          onChange={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        >
                          <optgroup label="Past / Present / Future">
                            <For each={vocabularyGrammarPrimary()}>
                              {(item) => (
                                <option value={item.id}>{item.label}</option>
                              )}
                            </For>
                          </optgroup>
                          <optgroup label="Practical grammar">
                            <For each={vocabularyGrammarPractical()}>
                              {(item) => (
                                <option value={item.id}>{item.label}</option>
                              )}
                            </For>
                          </optgroup>
                        </select>
                      )}
                    </form.Field>
                  </label>
                  <div class="text-xs text-sub">
                    {vocabularyGrammarIndexLoading()
                      ? "Loading grammar practice..."
                      : "Present, Past and Future stay primary. Each set combines grammar signals with practical topic vocabulary."}
                  </div>
                </div>
              </Show>

              <Show when={formValues().translationDictionarySource === "custom"}>
                <form.Field name="translationDictionary">
                  {(field) => (
                    <TextareaField
                      field={field}
                      placeholder={"cache = bộ nhớ đệm\nparent block = block cha"}
                      class="min-h-32 max-h-52 self-start overflow-x-hidden overflow-y-auto p-4 text-base font-(--font) text-text"
                    />
                  )}
                </form.Field>
              </Show>
            </div>

            <SubmitButton
              form={form}
              skipUnchangedCheck
              variant="button"
              text="ok"
              class="lg:col-start-1"
              disabled={isDisabled()}
            />
          </div>

          {/* Settings sidebar — on large screens spans all rows in column 2 */}
          <div
            class={cn(
              "grid h-min content-start gap-2 self-start text-xs",
              isDisabled() && "pointer-events-none opacity-50 select-none",
            )}
          >
            <SettingsGroup
              title="Mode"
              icon="fa-cog"
              sub="Change the way words are generated."
            >
              <div class="flex w-full gap-2">
                <For each={modeOptions}>
                  {(opt) => (
                    <Button
                      variant="button"
                      text={opt.label}
                      class="flex-1"
                      active={formValues().mode === opt.value}
                      onClick={() => handleModeChange(opt.value)}
                    />
                  )}
                </For>
              </div>
            </SettingsGroup>

            <SettingsGroup
              title="Limit"
              icon="fa-step-forward"
              sub="Control how many words to generate or for how long you want to type."
            >
              <div class={cn("flex w-full items-center gap-4")}>
                <form.Field name="limitWord">
                  {(field) => (
                    <input
                      type="number"
                      class={cn("w-full", !showWordLimit() && "hidden")}
                      min="0"
                      placeholder="words"
                      value={field().state.value}
                      disabled={isLimitDisabled()}
                      onInput={(e) => {
                        field().handleChange(e.currentTarget.value);
                        form.setFieldValue("limitTime", "");
                        form.setFieldValue("limitSection", "");
                      }}
                    />
                  )}
                </form.Field>
                <form.Field name="limitSection">
                  {(field) => (
                    <input
                      type="number"
                      class={cn("w-full", !showSectionLimit() && "hidden")}
                      min="0"
                      placeholder="sections"
                      value={field().state.value}
                      disabled={isLimitDisabled()}
                      onInput={(e) => {
                        field().handleChange(e.currentTarget.value);
                        form.setFieldValue("limitWord", "");
                        form.setFieldValue("limitTime", "");
                      }}
                    />
                  )}
                </form.Field>
                <span class="text-sub">or</span>
                <form.Field name="limitTime">
                  {(field) => (
                    <input
                      type="number"
                      class="w-full"
                      min="0"
                      placeholder="time"
                      value={field().state.value}
                      disabled={isLimitDisabled()}
                      onInput={(e) => {
                        field().handleChange(e.currentTarget.value);
                        form.setFieldValue("limitWord", "");
                        form.setFieldValue("limitSection", "");
                      }}
                    />
                  )}
                </form.Field>
              </div>
            </SettingsGroup>

            <SettingsGroup
              title="Word delimiter"
              icon="fa-grip-lines-vertical"
              sub="Change how words are separated. Using the pipe delimiter allows you to randomize groups of words."
            >
              <div class="flex w-full gap-2">
                <For each={delimiterOptions}>
                  {(opt) => (
                    <Button
                      variant="button"
                      text={opt.label}
                      class="flex-1"
                      active={
                        formValues().pipeDelimiter === (opt.value === "true")
                      }
                      onClick={() =>
                        handleDelimiterChange(opt.value === "true")
                      }
                    />
                  )}
                </For>
              </div>
            </SettingsGroup>

            <SettingsGroup
              title="EN-VN translation"
              icon="fa-language"
              sub="Show the Vietnamese meaning and pronounce the English text when you start typing a matching word or phrase."
            >
              <div class="grid gap-2">
                <form.Field name="translationEnabled">
                  {(field) => (
                    <Button
                      variant="button"
                      text={field().state.value ? "enabled" : "disabled"}
                      active={field().state.value}
                      onClick={() =>
                        field().handleChange(!field().state.value)
                      }
                    />
                  )}
                </form.Field>

                <div class="grid gap-1">
                  <SettingHelpLabel
                    label="learning mode"
                    help="Normal keeps the existing EN-VN typing behavior. Learn shows English, Vietnamese and IPA. Recall hides English. Listen hides English and uses pronunciation with replay/reveal hints."
                  />
                  <form.Field name="translationLearningMode">
                    {(field) => (
                      <div class="grid grid-cols-2 gap-1 sm:grid-cols-4">
                        <For
                          each={[
                            { value: "normal", label: "normal" },
                            { value: "learn", label: "learn" },
                            { value: "recall", label: "recall" },
                            { value: "listen", label: "listen" },
                          ] as const}
                        >
                          {(option) => (
                            <Button
                              variant="button"
                              text={option.label}
                              active={field().state.value === option.value}
                              onClick={() => field().handleChange(option.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="style" help="Choose the visual shape of translation tooltips." />
                  <form.Field name="translationPopupStyle">
                    {(field) => (
                      <div class="grid grid-cols-2 gap-1">
                        <For each={translationStyleOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="size" help="Choose translation tooltip text size." />
                  <form.Field name="translationPopupSize">
                    {(field) => (
                      <div class="grid grid-cols-3 gap-1">
                        <For each={translationSizeOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="color" help="Choose the translation tooltip accent color." />
                  <form.Field name="translationPopupColor">
                    {(field) => (
                      <div class="grid grid-cols-2 gap-1">
                        <For each={translationColorOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="display" help="Show translations near the word, above the test, or both." />
                  <form.Field name="translationDisplayMode">
                    {(field) => (
                      <div class="grid grid-cols-3 gap-1">
                        <For each={translationDisplayOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="tooltip behavior" help="Hold keeps a tooltip attached to the word. Float fades it away." />
                  <form.Field name="translationTooltipBehavior">
                    {(field) => (
                      <div class="grid grid-cols-2 gap-1">
                        <For each={translationTooltipBehaviorOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="line spacing" help="Add vertical room between typing lines so tooltips do not cover nearby text." />
                  <form.Field name="translationLineSpacing">
                    {(field) => (
                      <div class="grid grid-cols-3 gap-1">
                        <For each={translationLineSpacingOptions}>
                          {(opt) => (
                            <Button
                              variant="button"
                              text={opt.label}
                              active={field().state.value === opt.value}
                              onClick={() => field().handleChange(opt.value)}
                            />
                          )}
                        </For>
                      </div>
                    )}
                  </form.Field>
                </div>

                <div class="grid gap-1">
                  <SettingHelpLabel label="float duration (ms)" help="How long floating translation tooltips remain visible." />
                  <form.Field name="translationDuration">
                    {(field) => (
                      <input
                        type="number"
                        min="500"
                        max="10000"
                        step="100"
                        placeholder="duration (ms)"
                        value={field().state.value}
                        onInput={(e) =>
                          field().handleChange(e.currentTarget.value)
                        }
                      />
                    )}
                  </form.Field>
                </div>

                <Separator />

                <div class="grid gap-2">
                  <SettingHelpLabel label="English pronunciation" help="Pronounce a matching English word or phrase when typing starts." />
                  <form.Field name="pronunciationEnabled">
                    {(field) => (
                      <Button
                        variant="button"
                        text={field().state.value ? "enabled" : "disabled"}
                        active={field().state.value}
                        onClick={() =>
                          field().handleChange(!field().state.value)
                        }
                      />
                    )}
                  </form.Field>

                  <div class="grid gap-1">
                    <SettingHelpLabel label="accent" help="Choose the preferred English system voice accent." />
                    <form.Field name="pronunciationAccent">
                      {(field) => (
                        <div class="grid grid-cols-2 gap-1">
                          <For each={pronunciationAccentOptions}>
                            {(opt) => (
                              <Button
                                variant="button"
                                text={opt.label}
                                active={field().state.value === opt.value}
                                onClick={() => field().handleChange(opt.value)}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <div class="grid gap-1">
                    <SettingHelpLabel label="speed" help="Choose how fast matching English words are pronounced." />
                    <form.Field name="pronunciationRate">
                      {(field) => (
                        <div class="grid grid-cols-3 gap-1">
                          <For each={pronunciationRateOptions}>
                            {(opt) => (
                              <Button
                                variant="button"
                                text={opt.label}
                                active={field().state.value === opt.value}
                                onClick={() => field().handleChange(opt.value)}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <div class="grid gap-1">
                    <SettingHelpLabel label="volume (%)" help="Set pronunciation volume from 0 to 100 percent." />
                    <form.Field name="pronunciationVolume">
                      {(field) => (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          placeholder="volume (%)"
                          value={field().state.value}
                          onInput={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        />
                      )}
                    </form.Field>
                  </div>
                </div>

                <Separator />

                <div class="grid gap-2">
                  <SettingHelpLabel
                    label="full text reader"
                    help="When enabled, reading starts automatically on your first typing key. Preview uses the current local system voice; no cloud TTS is used."
                  />
                  <form.Field name="textReaderEnabled">
                    {(field) => (
                      <Button
                        variant="button"
                        text={field().state.value ? "enabled" : "disabled"}
                        active={field().state.value}
                        onClick={() => {
                          const enabled = !field().state.value;
                          field().handleChange(enabled);
                          if (!enabled) stopTextReader();
                        }}
                      />
                    )}
                  </form.Field>

                  <div class="grid gap-1">
                    <SettingHelpLabel
                      label="reader language"
                      help="Auto detects Vietnamese marks; otherwise choose English or Vietnamese explicitly."
                    />
                    <form.Field name="textReaderLanguage">
                      {(field) => (
                        <div class="grid grid-cols-3 gap-1">
                          <For each={textReaderLanguageOptions}>
                            {(opt) => (
                              <Button
                                variant="button"
                                text={opt.label}
                                active={field().state.value === opt.value}
                                disabled={!formValues().textReaderEnabled}
                                onClick={() => {
                                  field().handleChange(opt.value);
                                  window.setTimeout(refreshTextReaderVoices, 0);
                                }}
                              />
                            )}
                          </For>
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <div class="grid gap-1">
                    <SettingHelpLabel
                      label="local voice"
                      help="Only voices reported by the browser as local system voices are offered."
                    />
                    <form.Field name="textReaderVoiceURI">
                      {(field) => (
                        <select
                          value={field().state.value}
                          disabled={!formValues().textReaderEnabled}
                          onChange={(e) =>
                            field().handleChange(e.currentTarget.value)
                          }
                        >
                          <option value="">local default</option>
                          <For each={textReaderVoices()}>
                            {(voice) => (
                              <option value={voice.voiceURI}>
                                {voice.name} ({voice.lang})
                              </option>
                            )}
                          </For>
                        </select>
                      )}
                    </form.Field>
                    <div class="text-[0.68rem] text-sub">
                      {textReaderVoices().length} local voice
                      {textReaderVoices().length === 1 ? "" : "s"} available
                    </div>
                  </div>

                  <div class="grid gap-1">
                    <SettingHelpLabel
                      label="reader speed"
                      help="Adjust full-text reading speed from 0.5x to 2.0x."
                    />
                    <form.Field name="textReaderRate">
                      {(field) => (
                        <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                          <input
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.05"
                            value={field().state.value}
                            disabled={!formValues().textReaderEnabled}
                            onInput={(e) =>
                              field().handleChange(e.currentTarget.valueAsNumber)
                            }
                          />
                          <span class="min-w-10 text-right text-sub">
                            {field().state.value.toFixed(2)}x
                          </span>
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <div class="grid gap-1">
                    <SettingHelpLabel
                      label="reader volume"
                      help="Adjust full-text reader volume without changing browser or system volume."
                    />
                    <form.Field name="textReaderVolume">
                      {(field) => (
                        <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={field().state.value}
                            disabled={!formValues().textReaderEnabled}
                            onInput={(e) =>
                              field().handleChange(e.currentTarget.valueAsNumber)
                            }
                          />
                          <span class="min-w-8 text-right text-sub">
                            {field().state.value}%
                          </span>
                        </div>
                      )}
                    </form.Field>
                  </div>

                  <div class="grid grid-cols-3 gap-1">
                    <Button
                      variant="button"
                      text={textReaderState() === "idle" ? "preview" : "restart"}
                      disabled={!formValues().textReaderEnabled}
                      onClick={handleTextReaderPlay}
                    />
                    <Button
                      variant="button"
                      text={textReaderState() === "paused" ? "resume" : "pause"}
                      disabled={
                        !formValues().textReaderEnabled ||
                        textReaderState() === "idle"
                      }
                      onClick={handleTextReaderPauseResume}
                    />
                    <Button
                      variant="button"
                      text="stop"
                      disabled={
                        !formValues().textReaderEnabled ||
                        textReaderState() === "idle"
                      }
                      onClick={stopTextReader}
                    />
                  </div>
                </div>
              </div>
            </SettingsGroup>

            <Separator />
            <div class="grid gap-2">
              <input
                ref={fileInputRef}
                type="file"
                class="hidden"
                accept=".txt"
                onChange={handleFileOpen}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-file-import" }}
                text="open file"
                onClick={() => fileInputRef.click()}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-filter" }}
                text="words filter"
                onClick={() => showModal("WordFilter")}
              />
              <Button
                variant="button"
                fa={{ icon: "fa-cogs" }}
                text="custom generator"
                onClick={() => showModal("CustomGenerator")}
              />
            </div>
            {/* <Separator /> */}
            <SettingsGroup
              title="Remove zero-width characters"
              icon="fa-text-width"
              sub="Fully remove zero-width characters."
            >
              <Button
                variant="button"
                text="apply"
                class="w-full"
                onClick={applyRemoveZeroWidth}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Remove fancy typography"
              icon="fa-pen-fancy"
              sub={
                'Standardises typography symbols (for example \u201c and \u201d become ")'
              }
            >
              <Button
                variant="button"
                text="apply"
                class="w-full"
                onClick={applyRemoveFancyTypography}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Replace control characters"
              icon="fa-code"
              sub="Replace control characters (\n becomes a new line and \t becomes a tab)"
            >
              <Button
                variant="button"
                text="apply"
                class="w-full"
                onClick={applyReplaceControlChars}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Replace new lines with spaces"
              icon="fa-level-down-alt"
              iconClass="fa-rotate-90"
              sub="Replace all new line characters with spaces. Can automatically add periods to the end of lines if you wish."
            >
              <div class="flex w-full gap-2">
                <Button
                  variant="button"
                  text="space"
                  class="flex-1"
                  onClick={() => applyReplaceNewlines("space")}
                />
                <Button
                  variant="button"
                  text="period + space"
                  class="flex-1"
                  onClick={() => applyReplaceNewlines("periodSpace")}
                />
              </div>
            </SettingsGroup>
          </div>
        </form>
      </AnimatedModal>
      <SaveCustomTextModal textToSave={textToSave} />
      <SavedTextsModal setChainedData={setIncomingChainedData} />
      <WordFilterModal setChainedData={setIncomingChainedData} />
      <CustomGeneratorModal setChainedData={setIncomingChainedData} />
    </>
  );
}

function SettingHelpLabel(props: {
  label: string;
  help: string;
}): JSXElement {
  return (
    <div class="flex items-center gap-1 text-sub">
      <span>{props.label}</span>
      <span class="group relative inline-flex">
        <span
          class="grid size-4 cursor-help place-items-center rounded-full border border-sub/30 text-[0.65rem] leading-none text-sub"
          tabIndex={0}
          aria-label={props.help}
        >
          ?
        </span>
        <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded bg-sub-alt px-2 py-1.5 text-left text-[0.68rem] leading-snug text-text opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {props.help}
        </span>
      </span>
    </div>
  );
}

function SettingsGroup(props: {
  title: string;
  icon: FaSolidIcon;
  iconClass?: string;
  sub: string;
  children: JSXElement;
}): JSXElement {
  return (
    <div class="grid w-full">
      <div class="flex items-center gap-2 text-sub lowercase">
        <Fa icon={props.icon} fixedWidth class={props.iconClass} />
        {props.title}
      </div>
      <div class="mt-1 mb-1.5 text-text">{props.sub}</div>
      {props.children}
    </div>
  );
}
