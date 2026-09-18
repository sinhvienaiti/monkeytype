import { Config } from "../../config/store";
import * as TestUI from "../../test/test-ui";
import * as TestWords from "../../test/test-words";
import { getInputForWord } from "../../test/events/data";

import { normalizePhrase, parseDictionary, ParsedDictionary } from "./dictionary";
import { getSettings } from "./store";

let cachedDictionarySource = "";
let cachedDictionary: ParsedDictionary = {
  translations: new Map(),
  maxWordCount: 1,
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
  durationMs: number,
): void {
  const anchor = TestUI.getWordElement(completedWordIndex) as HTMLElement | null;
  if (anchor === null) return;

  const rect = anchor.getBoundingClientRect();
  const popup = document.createElement("div");
  popup.dataset.personalEnVnTranslation = "true";
  popup.textContent = translation;

  Object.assign(popup.style, {
    position: "fixed",
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top - 8}px`,
    zIndex: "9999",
    pointerEvents: "none",
    color: "var(--main-color)",
    fontFamily: "var(--font)",
    fontSize: "1rem",
    fontWeight: "600",
    lineHeight: "1.2",
    whiteSpace: "nowrap",
    textShadow: "0 1px 4px var(--bg-color)",
    transform: "translate(-50%, -100%)",
  });

  document.body.append(popup);

  const animation = popup.animate(
    [
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(6px)",
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(0)",
        offset: 0.1,
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(-10px)",
        offset: 0.8,
      },
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(-24px)",
      },
    ],
    {
      duration: durationMs,
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

  showTranslation(translation, completedWordIndex, settings.durationMs);
}
