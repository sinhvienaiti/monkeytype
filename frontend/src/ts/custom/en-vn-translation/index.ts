import { Config } from "../../config/store";
import * as TestUI from "../../test/test-ui";
import * as TestWords from "../../test/test-words";
import { getInputForWord } from "../../test/events/data";

import { normalizePhrase, parseDictionary } from "./dictionary";
import type { ParsedDictionary } from "./dictionary";
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

const popupSizeClasses: Record<TranslationPopupSize, string> = {
  small: "text-base",
  medium: "text-xl",
  large: "text-2xl",
};

const popupStyleClasses: Record<TranslationPopupStyle, string> = {
  pill: "rounded-full border px-3 py-1.5 shadow-lg backdrop-blur-sm",
  soft: "rounded border px-3 py-1.5 shadow-md backdrop-blur-sm",
  minimal: "px-1 font-bold drop-shadow-md",
};

const popupColorClasses: Record<TranslationPopupColor, string> = {
  auto: "border-sub/50 bg-sub-alt/95 text-text",
  blue: "border-translation-blue/40 bg-translation-blue/15 text-translation-blue",
  green:
    "border-translation-green/40 bg-translation-green/15 text-translation-green",
  amber:
    "border-translation-amber/40 bg-translation-amber/15 text-translation-amber",
  purple:
    "border-translation-purple/40 bg-translation-purple/15 text-translation-purple",
};

function getParsedDictionary(source: string): ParsedDictionary {
  if (source !== cachedDictionarySource) {
    cachedDictionarySource = source;
    cachedDictionary = parseDictionary(source);
  }

  return cachedDictionary;
}

function isWordTypedCorrectly(wordIndex: number): boolean {
  const word = TestWords.words.get(wordIndex);
  if (word === undefined) return false;

  return getInputForWord(wordIndex) === word.textWithCommit;
}

function findTranslation(
  completedWordIndex: number,
  dictionary: ParsedDictionary,
): string | null {
  const maxWordCount = Math.min(
    dictionary.maxWordCount,
    completedWordIndex + 1,
  );

  for (let wordCount = maxWordCount; wordCount >= 1; wordCount--) {
    const startIndex = completedWordIndex - wordCount + 1;
    const words: string[] = [];
    let allCorrect = true;

    for (let index = startIndex; index <= completedWordIndex; index++) {
      const word = TestWords.words.get(index);
      if (word === undefined || !isWordTypedCorrectly(index)) {
        allCorrect = false;
        break;
      }
      words.push(word.text);
    }

    if (!allCorrect) continue;

    const source = normalizePhrase(words.join(" "));
    const translation = dictionary.translations.get(source);
    if (translation !== undefined) {
      return translation;
    }
  }

  return null;
}

function showTranslation(
  translation: string,
  completedWordIndex: number,
  settings: EnVnTranslationSettings,
): void {
  const anchor = TestUI.getWordElement(completedWordIndex);
  if (anchor === null) return;

  const rect = anchor.native.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.dataset["personalEnVnTranslation"] = "true";
  popup.textContent = translation;

  popup.className = [
    "pointer-events-none fixed z-50 whitespace-nowrap font-(--font) font-semibold leading-tight tracking-wide",
    popupSizeClasses[settings.popupSize],
    popupStyleClasses[settings.popupStyle],
    popupColorClasses[settings.popupColor],
  ].join(" ");

  popup.style.left = `${rect.left + rect.width / 2}px`;
  popup.style.top = `${rect.top - 12}px`;

  document.body.append(popup);

  const animation = popup.animate(
    [
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(8px) scale(0.96)",
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(0) scale(1)",
        offset: 0.1,
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(-10px) scale(1)",
        offset: 0.82,
      },
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(-28px) scale(0.98)",
      },
    ],
    {
      duration: settings.durationMs,
      easing: "ease-out",
      fill: "forwards",
    },
  );

  void animation.finished.finally(() => popup.remove());
}

export function handleCompletedWord(completedWordIndex: number): void {
  if (Config.mode !== "custom") return;

  const settings = getSettings();
  if (!settings.enabled || settings.dictionary.trim() === "") return;

  const dictionary = getParsedDictionary(settings.dictionary);
  if (dictionary.translations.size === 0) return;

  const translation = findTranslation(completedWordIndex, dictionary);
  if (translation === null) return;

  showTranslation(translation, completedWordIndex, settings);
}
