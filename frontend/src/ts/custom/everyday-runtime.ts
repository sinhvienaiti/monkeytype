import { createSignal } from "solid-js";

import { Config } from "../config/store";
import { restartTestEvent } from "../events/test";
import { setCustomTextIndicator } from "../states/core";
import {
  getLoadedChallenge,
  isResultCalculating,
  isTestActive,
  isTestRestarting,
  setIsRepeated,
} from "../states/test";
import * as CustomText from "../test/custom-text";
import { isFunboxActive } from "../test/funbox/active";
import * as PractiseWords from "../test/practise-words";
import { prepareLibraryDictionary } from "./en-vn-translation/library";
import { getSettings } from "./en-vn-translation/store";
import {
  commitEverydaySession,
  loadEverydaySession,
  prepareEverydaySession,
  type EverydaySession,
} from "./everyday-sessions";
import {
  loadTypingTextSettings,
  saveTypingTextSettings,
} from "./typing-text-library";

export const [getEverydaySession, setEverydaySession] =
  createSignal<EverydaySession | null>(loadEverydaySession());

export const [isEverydayLoading, setEverydayLoading] = createSignal(false);

export function activateEverydaySession(session: EverydaySession): void {
  commitEverydaySession(session);
  setEverydaySession(session);
}

export function canNavigateEveryday(): boolean {
  const learningMode = getSettings().learningMode;
  return (
    Config.mode === "custom" &&
    loadTypingTextSettings().source === "everyday" &&
    learningMode !== "sentence-builder" &&
    learningMode !== "context-cloze" &&
    learningMode !== "smart-review" &&
    getLoadedChallenge() === null &&
    !isTestRestarting() &&
    !isResultCalculating() &&
    !(isTestActive() && isFunboxActive("no_quit"))
  );
}

export async function navigateEveryday(
  direction: "next" | "prev" | "current",
): Promise<void> {
  if (isEverydayLoading() || !canNavigateEveryday()) return;
  setEverydayLoading(true);
  try {
    const settings = loadTypingTextSettings();
    const previousSession = getEverydaySession();
    const isCurrent = (): boolean =>
      canNavigateEveryday() &&
      getEverydaySession() === previousSession &&
      JSON.stringify(loadTypingTextSettings()) === JSON.stringify(settings);
    const session = await prepareEverydaySession(
      settings.everydayLesson,
      settings.passageCount,
      direction,
    );
    if (!isCurrent()) {
      return;
    }
    const translation = getSettings();
    if (translation.enabled && translation.dictionarySource === "library") {
      await prepareLibraryDictionary(session.text, isCurrent);
    }

    // A result or mode switch can occur while a lesson/dictionary is loading.
    if (!isCurrent()) {
      return;
    }

    const words = session.text
      .normalize()
      .replace(/[\u2000-\u200A\u202F\u205F\u00A0]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    CustomText.setMode("repeat");
    CustomText.setPipeDelimiter(false);
    CustomText.setText(words);
    CustomText.setLimitMode("word");
    CustomText.setLimitValue(words.length);
    saveTypingTextSettings({ ...settings, everydayLesson: session.lessonId });
    PractiseWords.resetBefore();
    setCustomTextIndicator(undefined);
    setIsRepeated(false);
    activateEverydaySession(session);
    restartTestEvent.dispatch();
  } finally {
    setEverydayLoading(false);
  }
}

export async function replayEveryday(): Promise<void> {
  await navigateEveryday("current");
}
