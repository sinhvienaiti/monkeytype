import { Config } from "../../config/store";
import { restartTestEvent } from "../../events/test";
import * as TestUI from "../../test/test-ui";
import * as TestWords from "../../test/test-words";

import { normalizePhrase, parseDictionary } from "./dictionary";
import type { ParsedDictionary } from "./dictionary";
import { speakEnglish, stopEnglishSpeech } from "./speech";
import { getSettings } from "./store";
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
const heldTooltips = new Set<HTMLDivElement>();
let floatingTooltip: HTMLDivElement | null = null;
let floatingTooltipAnimation: Animation | null = null;

const popupSizeClasses: Record<TranslationPopupSize, string> = {
  small: "text-[0.9rem]",
  medium: "text-base",
  large: "text-lg",
};

const popupStyleClasses: Record<TranslationPopupStyle, string> = {
  bubble:
    "overflow-visible rounded-xl border bg-translation-surface/75 px-3.5 py-2 shadow-xl backdrop-blur-md",
  pill:
    "overflow-visible rounded-full border bg-translation-surface/75 px-4 py-2 shadow-xl backdrop-blur-md",
  soft:
    "overflow-visible rounded-lg border bg-translation-surface/70 px-3.5 py-2 shadow-lg backdrop-blur-sm",
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

const lineSpacingClasses: Record<TranslationLineSpacing, string | null> = {
  normal: null,
  comfortable: "en-vn-line-spacing-comfortable",
  wide: "en-vn-line-spacing-wide",
};

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
): { source: string; speechText: string; translation: string } | null {
  const maxWordCount = Math.min(
    dictionary.maxWordCount,
    TestWords.words.length - startWordIndex,
  );

  for (let wordCount = maxWordCount; wordCount >= 1; wordCount--) {
    const words: string[] = [];

    for (
      let index = startWordIndex;
      index < startWordIndex + wordCount;
      index++
    ) {
      const word = TestWords.words.get(index);
      if (word === undefined) break;
      words.push(word.text);
    }

    if (words.length !== wordCount) continue;

    const speechText = words.join(" ");
    const source = normalizePhrase(speechText);
    const translation = dictionary.translations.get(source);
    if (translation !== undefined) {
      return { source, speechText, translation };
    }
  }

  return null;
}

function removeFloatingTooltip(): void {
  floatingTooltipAnimation?.cancel();
  floatingTooltipAnimation = null;
  floatingTooltip?.remove();
  floatingTooltip = null;
}

function clearHeldTooltips(): void {
  for (const tooltip of heldTooltips) {
    tooltip.remove();
  }
  heldTooltips.clear();
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

function showTranslationTooltip(
  translation: string,
  wordIndex: number,
  settings: EnVnTranslationSettings,
): void {
  const anchor = TestUI.getWordElement(wordIndex);
  if (anchor === null) return;

  const popup = document.createElement("div");
  popup.dataset["personalEnVnTranslation"] =
    settings.tooltipBehavior === "hold" ? "held" : "floating";

  popup.className = [
    "pointer-events-none z-50 max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal font-(--font)",
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

  if (settings.tooltipBehavior === "hold") {
    popup.classList.add("absolute");
    popup.style.left = "50%";
    popup.style.bottom = "calc(100% + 0.55rem)";
    popup.style.transform = "translateX(-50%)";

    anchor.native.append(popup);
    heldTooltips.add(popup);

    const animation = popup.animate(
      [
        {
          opacity: 0,
          transform: "translateX(-50%) translateY(4px) scale(0.97)",
        },
        {
          opacity: 1,
          transform: "translateX(-50%) translateY(0) scale(1)",
        },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );

    animation.onfinish = () => {
      popup.style.opacity = "1";
      popup.style.transform = "translateX(-50%)";
    };
    return;
  }

  removeFloatingTooltip();

  const rect = anchor.native.getBoundingClientRect();
  popup.classList.add("fixed");
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

  display.classList.remove("visible");
  display.classList.add("hidden");
  display.setAttribute("aria-hidden", "true");
}

function showTopDisplay(translation: string, source: string): void {
  const display = getTopDisplay();
  if (display === null) return;

  const vietnamese = display.querySelector<HTMLElement>(".translationVietnamese");
  const english = display.querySelector<HTMLElement>(".translationEnglish");
  if (vietnamese === null || english === null) return;

  vietnamese.textContent = translation;
  english.textContent = source;

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
    "en-vn-line-spacing-comfortable",
    "en-vn-line-spacing-wide",
  );

  const shouldApply =
    Config.mode === "custom" &&
    settings.enabled &&
    settings.dictionary.trim() !== "";

  if (!shouldApply) {
    wordsWrapper.classList.remove("en-vn-learning");
    clearTopDisplay();
    return;
  }

  wordsWrapper.classList.add("en-vn-learning");

  const spacingClass = lineSpacingClasses[settings.lineSpacing];
  if (spacingClass !== null) {
    words.classList.add(spacingClass);
  }
}

export function handleStartedWord(wordIndex: number): void {
  if (Config.mode !== "custom") return;

  const settings = getSettings();
  applyLearningAppearance(settings);

  if (!settings.enabled || settings.dictionary.trim() === "") return;

  const dictionary = getParsedDictionary(settings.dictionary);
  if (dictionary.translations.size === 0) return;

  const match = findTranslationStartingAt(wordIndex, dictionary);
  if (match === null) return;

  const matchId = `${wordIndex}:${match.source}`;
  if (shownTranslationMatches.has(matchId)) return;

  shownTranslationMatches.add(matchId);

  if (settings.displayMode === "tooltip" || settings.displayMode === "both") {
    showTranslationTooltip(match.translation, wordIndex, settings);
  }

  if (settings.displayMode === "top" || settings.displayMode === "both") {
    showTopDisplay(match.translation, match.speechText);
  }

  speakEnglish(match.speechText, settings);
}

restartTestEvent.subscribe(() => {
  shownTranslationMatches.clear();
  removeFloatingTooltip();
  clearHeldTooltips();
  clearTopDisplay();
  stopEnglishSpeech();
  applyLearningAppearance();
});
