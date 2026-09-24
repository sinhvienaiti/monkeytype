import { Config } from "../../config/store";
import { restartTestEvent } from "../../events/test";
import * as TestWords from "../../test/test-words";
import { showNoticeNotification } from "../../states/notifications";

import { findDictionaryMatch, parseDictionary } from "./dictionary";
import type { ParsedDictionary } from "./dictionary";
import { speakEnglish, stopEnglishSpeech } from "./speech";
import {
  getActiveDictionaryRaw,
  getCachedVocabularyEntry,
} from "./library";
import {
  getTextReaderState,
  startTextReader,
} from "./text-reader";
import { getSettings } from "./store";
import {
  markLearningHintUsed,
  markLearningMatchPresented,
  markLearningReplayUsed,
} from "../../learning/learning-memory";
import type {
  EnVnTranslationSettings,
  TranslationLineSpacing,
  TranslationPopupColor,
  TranslationPopupSize,
  TranslationPopupStyle,
} from "./store";

let cachedDictionarySource = "";
let cachedDictionary: ParsedDictionary = {
  translations: new Map(),
  maxWordCount: 1,
};

const shownTranslationMatches = new Set<string>();
let floatingTooltip: HTMLDivElement | null = null;
let floatingTooltipAnimation: Animation | null = null;
let textReaderAutoStarted = false;
let currentLearningAction:
  | {
      wordIndex: number;
      speechText: string;
      expectedText: string;
      revealedCount: number;
    }
  | null = null;
let topActionsBound = false;

const popupSizeClasses: Record<TranslationPopupSize, string> = {
  small: "text-[0.8rem]",
  medium: "text-[0.9rem]",
  large: "text-base",
};

const popupStyleClasses: Record<TranslationPopupStyle, string> = {
  bubble:
    "overflow-visible rounded-xl border bg-translation-surface/75 px-3 py-1.5 shadow-xl backdrop-blur-md",
  pill:
    "overflow-visible rounded-full border bg-translation-surface/75 px-3.5 py-1.5 shadow-xl backdrop-blur-md",
  soft:
    "overflow-visible rounded-lg border bg-translation-surface/70 px-3 py-1.5 shadow-lg backdrop-blur-sm",
  minimal: "px-2 py-1 drop-shadow-lg",
};

const popupAccentClasses: Record<TranslationPopupColor, string> = {
  auto: "border-sub/60",
  blue: "border-translation-blue/60",
  green: "border-translation-green/60",
  amber: "border-translation-amber/60",
  purple: "border-translation-purple/60",
};

const popupGlowClasses: Record<TranslationPopupColor, string> = {
  auto: "bg-text/15",
  blue: "bg-translation-blue/25",
  green: "bg-translation-green/25",
  amber: "bg-translation-amber/25",
  purple: "bg-translation-purple/25",
};

const lineSpacingClasses: Record<TranslationLineSpacing, string> = {
  normal: "en-vn-line-spacing-normal",
  comfortable: "en-vn-line-spacing-comfortable",
  wide: "en-vn-line-spacing-wide",
};

function isWordLearningMode(
  mode: EnVnTranslationSettings["learningMode"],
): boolean {
  return mode === "learn" || mode === "recall" || mode === "listen";
}

function getCurrentTestSpeechText(): string {
  const words: string[] = [];
  for (let index = 0; index < TestWords.words.length; index++) {
    const text = TestWords.words.get(index)?.text;
    if (text !== undefined && text !== "") words.push(text);
  }
  return words.join(" ");
}

function maybeStartTextReader(settings: EnVnTranslationSettings): void {
  if (!settings.textReaderEnabled || textReaderAutoStarted) return;

  textReaderAutoStarted = true;
  const result = startTextReader(getCurrentTestSpeechText(), settings, {
    onError: (message) =>
      showNoticeNotification(message, {
        durationMs: 5000,
      }),
  });

  if (!result.started && result.error !== undefined) {
    showNoticeNotification(result.error, {
      durationMs: 5000,
    });
  }
}

function getParsedDictionary(source: string): ParsedDictionary {
  if (source !== cachedDictionarySource) {
    cachedDictionarySource = source;
    cachedDictionary = parseDictionary(source);
  }

  return cachedDictionary;
}

function findTranslationStartingAt(
  startWordIndex: number,
  dictionary: ParsedDictionary,
): {
  source: string;
  speechText: string;
  translation: string;
  wordCount: number;
} | null {
  const words: string[] = [];
  for (let index = 0; index < TestWords.words.length; index++) {
    words.push(TestWords.words.get(index)?.text ?? "");
  }

  const match = findDictionaryMatch(words, startWordIndex, dictionary);
  if (match === null) return null;

  return {
    ...match,
    speechText: words
      .slice(startWordIndex, startWordIndex + match.wordCount)
      .join(" "),
  };
}

function removeFloatingTooltip(): void {
  floatingTooltipAnimation?.cancel();
  floatingTooltipAnimation = null;
  floatingTooltip?.remove();
  floatingTooltip = null;
}

const heldTooltipClasses = [
  "en-vn-held-tooltip",
  "en-vn-tooltip-size-small",
  "en-vn-tooltip-size-medium",
  "en-vn-tooltip-size-large",
  "en-vn-tooltip-style-bubble",
  "en-vn-tooltip-style-pill",
  "en-vn-tooltip-style-soft",
  "en-vn-tooltip-style-minimal",
  "en-vn-tooltip-color-auto",
  "en-vn-tooltip-color-blue",
  "en-vn-tooltip-color-green",
  "en-vn-tooltip-color-amber",
  "en-vn-tooltip-color-purple",
];

function clearHeldTooltips(): void {
  const tooltips = document.querySelectorAll<HTMLElement>(
    "#words .word[data-en-vn-held-tooltip='true']",
  );

  for (const word of tooltips) {
    delete word.dataset["enVnHeldTooltip"];
    delete word.dataset["enVnTranslation"];
    word.classList.remove(...heldTooltipClasses);
  }
}

function showHeldTranslationTooltip(
  anchor: HTMLElement,
  translation: string,
  settings: EnVnTranslationSettings,
): void {
  anchor.dataset["enVnHeldTooltip"] = "true";
  anchor.dataset["enVnTranslation"] = translation;
  anchor.classList.add(
    "en-vn-held-tooltip",
    `en-vn-tooltip-size-${settings.popupSize}`,
    `en-vn-tooltip-style-${settings.popupStyle}`,
    `en-vn-tooltip-color-${settings.popupColor}`,
  );
}

function createTooltipContent(
  popup: HTMLDivElement,
  translation: string,
  color: TranslationPopupColor,
  style: TranslationPopupStyle,
): void {
  if (style !== "minimal") {
    const glow = document.createElement("div");
    glow.className = [
      "pointer-events-none absolute -top-4 left-1/2 h-8 w-24 -translate-x-1/2 rounded-full blur-xl",
      popupGlowClasses[color],
    ].join(" ");
    popup.append(glow);

    const highlight = document.createElement("div");
    highlight.className =
      "pointer-events-none absolute inset-x-4 top-px h-px bg-translation-text/25";
    popup.append(highlight);
  }

  const text = document.createElement("span");
  text.className =
    "relative z-10 block text-center font-bold leading-[1.2] tracking-[0.01em] text-translation-text";
  text.textContent = translation;
  popup.append(text);

  if (style !== "minimal") {
    const pointer = document.createElement("div");
    pointer.className = [
      "absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-translation-surface/75",
      popupAccentClasses[color],
    ].join(" ");
    popup.append(pointer);
  }
}

function getWordElement(wordIndex: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `#words .word[data-wordindex="${wordIndex}"]`,
  );
}

function isRecallMatchStart(wordIndex: number): boolean {
  return (
    getWordElement(wordIndex)?.classList.contains("en-vn-recall-start") === true
  );
}

function showTranslationTooltip(
  translation: string,
  wordIndex: number,
  settings: EnVnTranslationSettings,
): void {
  const anchor = getWordElement(wordIndex);
  if (anchor === null) return;

  if (settings.tooltipBehavior === "hold") {
    showHeldTranslationTooltip(anchor, translation, settings);
    return;
  }

  removeFloatingTooltip();

  const rect = anchor.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.dataset["personalEnVnTranslation"] = "floating";

  popup.className = [
    "pointer-events-none fixed z-50 max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal font-(--font)",
    popupSizeClasses[settings.popupSize],
    popupStyleClasses[settings.popupStyle],
    popupAccentClasses[settings.popupColor],
  ].join(" ");

  createTooltipContent(
    popup,
    translation,
    settings.popupColor,
    settings.popupStyle,
  );
  document.body.append(popup);

  const popupRect = popup.getBoundingClientRect();
  const halfWidth = popupRect.width / 2;
  const desiredCenter = rect.left + rect.width / 2;
  const center = Math.min(
    window.innerWidth - halfWidth - 12,
    Math.max(halfWidth + 12, desiredCenter),
  );

  popup.style.left = `${center}px`;
  popup.style.top = `${rect.top - 8}px`;
  popup.style.transform = "translate(-50%, -100%)";

  floatingTooltip = popup;
  const animation = popup.animate(
    [
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(6px) scale(0.96)",
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(0) scale(1)",
        offset: 0.07,
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(-8px) scale(1)",
        offset: 0.72,
      },
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(-36px) scale(1.01)",
      },
    ],
    {
      duration: settings.durationMs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );
  floatingTooltipAnimation = animation;

  animation.onfinish = () => {
    if (floatingTooltip === popup) {
      floatingTooltip = null;
      floatingTooltipAnimation = null;
    }
    popup.remove();
  };
}

function getTopDisplay(): HTMLElement | null {
  return document.getElementById("enVnTranslationTopDisplay");
}

function clearTopDisplay(): void {
  const display = getTopDisplay();
  if (display === null) return;

  currentLearningAction = null;
  const hint = display.querySelector<HTMLElement>(".translationHint");
  if (hint !== null) hint.textContent = "";
  display.classList.remove("visible");
  display.classList.add("hidden");
  display.setAttribute("aria-hidden", "true");
}

function ensureTopActionsBound(): void {
  if (topActionsBound) return;
  const display = getTopDisplay();
  if (display === null) return;

  const replay = display.querySelector<HTMLButtonElement>(
    "[data-learning-action='replay']",
  );
  const reveal = display.querySelector<HTMLButtonElement>(
    "[data-learning-action='reveal']",
  );
  const hint = display.querySelector<HTMLElement>(".translationHint");
  if (replay === null || reveal === null || hint === null) return;

  replay.addEventListener("click", () => {
    const action = currentLearningAction;
    if (action === null) return;
    markLearningReplayUsed(action.wordIndex);
    speakEnglish(action.speechText, getSettings());
  });

  reveal.addEventListener("click", () => {
    const action = currentLearningAction;
    if (action === null) return;
    const characters = Array.from(action.expectedText);
    action.revealedCount = Math.min(
      characters.length,
      action.revealedCount + 1,
    );
    markLearningHintUsed(action.wordIndex);
    const revealed = characters.slice(0, action.revealedCount).join("");
    hint.textContent =
      action.revealedCount >= characters.length
        ? `Revealed: ${revealed}`
        : `Revealed: ${revealed}…`;
  });

  topActionsBound = true;
}

function showTopDisplay(options: {
  translation: string;
  source: string;
  ipa: string;
  hideSource: boolean;
  hideIpa: boolean;
  showListenActions: boolean;
  wordIndex: number;
  speechText: string;
}): void {
  const display = getTopDisplay();
  if (display === null) return;

  ensureTopActionsBound();

  const vietnamese = display.querySelector<HTMLElement>(
    ".translationVietnamese",
  );
  const english = display.querySelector<HTMLElement>(".translationEnglish");
  const ipa = display.querySelector<HTMLElement>(".translationIpa");
  const hint = display.querySelector<HTMLElement>(".translationHint");
  const actions = display.querySelector<HTMLElement>(".translationActions");
  if (
    vietnamese === null ||
    english === null ||
    ipa === null ||
    hint === null ||
    actions === null
  ) {
    return;
  }

  vietnamese.textContent = options.translation;
  english.textContent = options.hideSource ? "" : options.source;
  english.classList.toggle("hidden", options.hideSource);
  ipa.textContent = options.hideIpa ? "" : options.ipa;
  ipa.classList.toggle("hidden", options.hideIpa || options.ipa === "");
  hint.textContent = "";
  actions.classList.toggle("hidden", !options.showListenActions);

  currentLearningAction = options.showListenActions
    ? {
        wordIndex: options.wordIndex,
        speechText: options.speechText,
        expectedText: options.source,
        revealedCount: 0,
      }
    : null;

  display.classList.remove("hidden");
  display.setAttribute("aria-hidden", "false");

  if (!display.classList.contains("visible")) {
    requestAnimationFrame(() => display.classList.add("visible"));
    return;
  }

  display.animate(
    [
      { opacity: 0.55, transform: "translate(-50%, 0.15rem) scale(0.99)" },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)" },
    ],
    { duration: 160, easing: "ease-out" },
  );
}

export function applyLearningAppearance(
  settings: EnVnTranslationSettings = getSettings(),
): void {
  const words = document.getElementById("words");
  const wordsWrapper = document.getElementById("wordsWrapper");
  if (words === null || wordsWrapper === null) return;

  words.classList.remove(
    "en-vn-line-spacing-normal",
    "en-vn-line-spacing-comfortable",
    "en-vn-line-spacing-wide",
    "en-vn-recall-mode",
  );

  const dictionaryRaw = getActiveDictionaryRaw(
    settings.dictionarySource,
    settings.dictionary,
    settings.dictionaryTopicId,
    settings.dictionaryPosId,
    settings.dictionaryGrammarId,
  );
  const shouldApply =
    Config.mode === "custom" &&
    settings.enabled &&
    settings.learningMode !== "sentence-builder" &&
    dictionaryRaw.trim() !== "";

  if (!shouldApply) {
    wordsWrapper.classList.remove("en-vn-learning");
    clearTopDisplay();
    return;
  }

  wordsWrapper.classList.add("en-vn-learning");
  words.classList.toggle(
    "en-vn-recall-mode",
    settings.learningMode === "recall" || settings.learningMode === "listen",
  );

  words.classList.add(lineSpacingClasses[settings.lineSpacing]);
}

function showLearningMatch(
  wordIndex: number,
  settings: EnVnTranslationSettings,
): void {
  const dictionaryRaw = getActiveDictionaryRaw(
    settings.dictionarySource,
    settings.dictionary,
    settings.dictionaryTopicId,
    settings.dictionaryPosId,
    settings.dictionaryGrammarId,
  );
  if (!settings.enabled || dictionaryRaw.trim() === "") return;

  const dictionary = getParsedDictionary(dictionaryRaw);
  if (dictionary.translations.size === 0) return;

  const match = findTranslationStartingAt(wordIndex, dictionary);
  if (match === null) return;

  const matchId = `${wordIndex}:${match.source}`;
  if (shownTranslationMatches.has(matchId)) return;

  shownTranslationMatches.add(matchId);
  markLearningMatchPresented(wordIndex);

  const learningMode = settings.learningMode;
  const metadata = getCachedVocabularyEntry(match.source);
  const ipa = metadata?.ipa ?? "";

  if (
    learningMode === "normal" &&
    (settings.displayMode === "tooltip" || settings.displayMode === "both")
  ) {
    showTranslationTooltip(match.translation, wordIndex, settings);
  }

  const shouldShowTop =
    learningMode !== "normal" ||
    settings.displayMode === "top" ||
    settings.displayMode === "both";
  if (shouldShowTop) {
    showTopDisplay({
      translation: match.translation,
      source: match.speechText,
      ipa,
      hideSource:
        learningMode === "recall" || learningMode === "listen",
      hideIpa: learningMode === "listen" || learningMode === "normal",
      showListenActions: learningMode === "listen",
      wordIndex,
      speechText: match.speechText,
    });
  }

  // Full-text reading takes precedence while it is active. Per-word
  // pronunciation resumes normally once the reader finishes or is stopped.
  if (getTextReaderState() === "idle") {
    speakEnglish(match.speechText, settings);
  }
}

export function handleActiveWord(wordIndex: number): void {
  if (Config.mode !== "custom") return;

  const settings = getSettings();
  if (!isWordLearningMode(settings.learningMode)) return;
  if (!isRecallMatchStart(wordIndex)) return;

  applyLearningAppearance(settings);
  showLearningMatch(wordIndex, settings);
}

export function handleStartedWord(wordIndex: number): void {
  if (Config.mode !== "custom") return;

  const settings = getSettings();

  // The full-text reader belongs to the existing normal typing experience.
  // Learn / Recall / Listen use item-level pronunciation instead.
  if (settings.learningMode === "normal") {
    maybeStartTextReader(settings);
  } else if (
    !isWordLearningMode(settings.learningMode) ||
    !isRecallMatchStart(wordIndex)
  ) {
    return;
  }

  applyLearningAppearance(settings);
  showLearningMatch(wordIndex, settings);
}

restartTestEvent.subscribe(() => {
  textReaderAutoStarted = false;
  currentLearningAction = null;
  shownTranslationMatches.clear();
  removeFloatingTooltip();
  clearHeldTooltips();
  clearTopDisplay();
  stopEnglishSpeech();
  applyLearningAppearance();
});
