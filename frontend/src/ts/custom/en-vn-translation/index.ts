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

const popupSizeClasses: Record<TranslationPopupSize, string> = {
  small: "text-lg",
  medium: "text-xl",
  large: "text-2xl",
};

const popupStyleClasses: Record<TranslationPopupStyle, string> = {
  bubble:
    "overflow-hidden rounded-[2rem] border bg-translation-surface/65 px-5 py-3 shadow-2xl backdrop-blur-md",
  pill:
    "rounded-full border bg-translation-surface/70 px-4 py-2 shadow-xl backdrop-blur-sm",
  soft:
    "rounded-xl border bg-translation-surface/70 px-4 py-2 shadow-lg backdrop-blur-sm",
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
  auto: "bg-text/20",
  blue: "bg-translation-blue/35",
  green: "bg-translation-green/35",
  amber: "bg-translation-amber/35",
  purple: "bg-translation-purple/35",
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

function createBubbleContent(
  popup: HTMLDivElement,
  translation: string,
  color: TranslationPopupColor,
  style: TranslationPopupStyle,
): void {
  if (style === "bubble") {
    const glow = document.createElement("div");
    glow.className = [
      "pointer-events-none absolute -top-5 left-1/2 h-12 w-32 -translate-x-1/2 rounded-full blur-xl",
      popupGlowClasses[color],
    ].join(" ");
    popup.append(glow);

    const highlight = document.createElement("div");
    highlight.className =
      "pointer-events-none absolute inset-x-6 top-1 h-px bg-translation-text/35";
    popup.append(highlight);
  }

  const text = document.createElement("span");
  text.className =
    "relative z-10 block text-center font-semibold leading-tight tracking-wide text-translation-text";
  text.textContent = translation;
  popup.append(text);
}

function showTranslation(
  translation: string,
  wordIndex: number,
  settings: EnVnTranslationSettings,
): boolean {
  const anchor = TestUI.getWordElement(wordIndex);
  if (anchor === null) return false;

  const rect = anchor.native.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.dataset["personalEnVnTranslation"] = "true";

  popup.className = [
    "pointer-events-none fixed z-50 max-w-[calc(100vw-2rem)] whitespace-normal font-(--font)",
    popupSizeClasses[settings.popupSize],
    popupStyleClasses[settings.popupStyle],
    popupAccentClasses[settings.popupColor],
  ].join(" ");

  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top - 10}px`;

  createBubbleContent(
    popup,
    translation,
    settings.popupColor,
    settings.popupStyle,
  );
  document.body.append(popup);

  const animation = popup.animate(
    [
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(10px) scale(0.88)",
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(0) scale(1)",
        offset: 0.08,
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(-22px) scale(1)",
        offset: 0.76,
      },
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(-58px) scale(1.03)",
      },
    ],
    {
      duration: settings.durationMs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );

  void animation.finished.finally(() => popup.remove());
  return true;
}

export function handleStartedWord(wordIndex: number): void {
  if (Config.mode !== "custom") return;

  const settings = getSettings();
  if (!settings.enabled || settings.dictionary.trim() === "") return;

  const dictionary = getParsedDictionary(settings.dictionary);
  if (dictionary.translations.size === 0) return;

  const match = findTranslationStartingAt(wordIndex, dictionary);
  if (match === null) return;

  const matchId = `${wordIndex}:${match.source}`;
  if (shownTranslationMatches.has(matchId)) return;

  if (showTranslation(match.translation, wordIndex, settings)) {
    shownTranslationMatches.add(matchId);
    speakEnglish(match.speechText, settings);
  }
}

restartTestEvent.subscribe(() => {
  shownTranslationMatches.clear();
  stopEnglishSpeech();
});
