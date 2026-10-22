import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EverydaySession } from "../../src/ts/custom/everyday-sessions";

const { config, state, mocks, initialSession, nextSession } = vi.hoisted(() => {
  const initialSession: EverydaySession = {
    lessonId: 0,
    title: "Introduction",
    start: 0,
    end: 1,
    totalPassages: 4,
    text: "Original paragraph.",
    hasPrevious: false,
    hasNext: true,
  };
  const nextSession: EverydaySession = {
    lessonId: 2,
    title: "Dependency injection",
    start: 1,
    end: 3,
    totalPassages: 4,
    text: "Cache\u00a0entries keep their order.\n\nThe DI container loads Vendor_Module::service.\nRun `bin/magento cache:clean`.",
    hasPrevious: true,
    hasNext: true,
  };
  return {
    config: { mode: "custom" },
    state: {
      challenge: null as object | null,
      resultCalculating: false,
      testRestarting: false,
      testActive: false,
      noQuit: false,
      typingSettings: {
        source: "everyday",
        level: 4,
        passageCount: 2,
        everydayLesson: 0,
      },
      translation: {
        enabled: true,
        learningMode: "learn",
        dictionarySource: "library",
        dictionary: "cache = bộ nhớ đệm",
        pronunciationEnabled: true,
        pronunciationAccent: "en-GB",
        pronunciationRate: "slow",
        pronunciationVolume: 45,
        displayMode: "both",
        popupStyle: "soft",
        lineSpacing: "comfortable",
        textReaderEnabled: true,
        textReaderVoiceURI: "preferred-voice",
      },
    },
    mocks: {
      prepare: vi.fn<() => Promise<EverydaySession>>(),
      commit: vi.fn(),
      dictionary:
        vi.fn<
          (
            text: string,
            shouldApply: () => boolean,
          ) => Promise<{ entries: number; levels: number[] }>
        >(),
      saveTypingSettings: vi.fn(),
      setTranslation: vi.fn(),
      setMode: vi.fn(),
      setPipeDelimiter: vi.fn(),
      setText: vi.fn(),
      setLimitMode: vi.fn(),
      setLimitValue: vi.fn(),
      setIndicator: vi.fn(),
      setRepeated: vi.fn(),
      resetPractice: vi.fn(),
      restart: vi.fn(),
    },
    initialSession,
    nextSession,
  };
});

vi.mock("../../src/ts/config/store", () => ({ Config: config }));
vi.mock("../../src/ts/events/test", () => ({
  restartTestEvent: { dispatch: mocks.restart },
}));
vi.mock("../../src/ts/states/core", () => ({
  setCustomTextIndicator: mocks.setIndicator,
}));
vi.mock("../../src/ts/states/test", () => ({
  getLoadedChallenge: () => state.challenge,
  isResultCalculating: () => state.resultCalculating,
  isTestActive: () => state.testActive,
  isTestRestarting: () => state.testRestarting,
  setIsRepeated: mocks.setRepeated,
}));
vi.mock("../../src/ts/test/custom-text", () => ({
  setMode: mocks.setMode,
  setPipeDelimiter: mocks.setPipeDelimiter,
  setText: mocks.setText,
  setLimitMode: mocks.setLimitMode,
  setLimitValue: mocks.setLimitValue,
}));
vi.mock("../../src/ts/test/funbox/active", () => ({
  isFunboxActive: (id: string) => id === "no_quit" && state.noQuit,
}));
vi.mock("../../src/ts/test/practise-words", () => ({
  resetBefore: mocks.resetPractice,
}));
vi.mock("../../src/ts/custom/en-vn-translation/library", () => ({
  prepareLibraryDictionary: mocks.dictionary,
}));
vi.mock("../../src/ts/custom/en-vn-translation/store", () => ({
  getSettings: () => state.translation,
  setSettings: mocks.setTranslation,
}));
vi.mock("../../src/ts/custom/everyday-sessions", () => ({
  commitEverydaySession: mocks.commit,
  loadEverydaySession: () => initialSession,
  prepareEverydaySession: mocks.prepare,
}));
vi.mock("../../src/ts/custom/typing-text-library", () => ({
  loadTypingTextSettings: () => ({ ...state.typingSettings }),
  saveTypingTextSettings: mocks.saveTypingSettings,
}));

import {
  canNavigateEveryday,
  getEverydaySession,
  isEverydayLoading,
  navigateEveryday,
  replayEveryday,
  setEverydayLoading,
  setEverydaySession,
} from "../../src/ts/custom/everyday-runtime";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function expectUnchangedSession(expectedSession = initialSession): void {
  for (const mock of [
    mocks.setMode,
    mocks.setPipeDelimiter,
    mocks.setText,
    mocks.setLimitMode,
    mocks.setLimitValue,
    mocks.saveTypingSettings,
    mocks.commit,
    mocks.resetPractice,
    mocks.setIndicator,
    mocks.setRepeated,
    mocks.restart,
  ]) {
    expect(mock).not.toHaveBeenCalled();
  }
  expect(getEverydaySession()).toEqual(expectedSession);
}

describe("Everyday runtime navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockReset().mockResolvedValue(nextSession);
    mocks.dictionary.mockReset().mockResolvedValue({ entries: 3, levels: [1] });
    config.mode = "custom";
    Object.assign(state, {
      challenge: null,
      resultCalculating: false,
      testRestarting: false,
      testActive: false,
      noQuit: false,
    });
    state.typingSettings = {
      source: "everyday",
      level: 4,
      passageCount: 2,
      everydayLesson: 0,
    };
    Object.assign(state.translation, {
      enabled: true,
      learningMode: "learn",
      dictionarySource: "library",
    });
    setEverydaySession(initialSession);
    setEverydayLoading(false);
  });

  it("applies every word in order, refreshes learning data and preserves learning preferences", async () => {
    const translationBefore = structuredClone(state.translation);
    await navigateEveryday("next");

    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(0, 2, "next");
    expect(mocks.dictionary).toHaveBeenCalledExactlyOnceWith(
      nextSession.text,
      expect.any(Function),
    );
    expect(mocks.setText).toHaveBeenCalledExactlyOnceWith([
      "Cache",
      "entries",
      "keep",
      "their",
      "order.",
      "The",
      "DI",
      "container",
      "loads",
      "Vendor_Module::service.",
      "Run",
      "`bin/magento",
      "cache:clean`.",
    ]);
    expect(mocks.setMode).toHaveBeenCalledExactlyOnceWith("repeat");
    expect(mocks.setPipeDelimiter).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.setLimitMode).toHaveBeenCalledExactlyOnceWith("word");
    expect(mocks.setLimitValue).toHaveBeenCalledExactlyOnceWith(13);
    expect(mocks.saveTypingSettings).toHaveBeenCalledExactlyOnceWith({
      source: "everyday",
      level: 4,
      passageCount: 2,
      everydayLesson: 2,
    });
    expect(mocks.resetPractice).toHaveBeenCalledOnce();
    expect(mocks.setIndicator).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(mocks.setRepeated).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(nextSession);
    expect(getEverydaySession()).toEqual(nextSession);
    expect(mocks.restart).toHaveBeenCalledOnce();
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.restart.mock.invocationCallOrder[0] as number,
    );
    expect(state.translation).toEqual(translationBefore);
    expect(mocks.setTranslation).not.toHaveBeenCalled();
    expect(isEverydayLoading()).toBe(false);
  });

  it("replays the completed final session with its full original text and unchanged passage range", async () => {
    const completedSession: EverydaySession = {
      ...nextSession,
      lessonId: 180,
      start: 2,
      end: 4,
      hasNext: false,
    };
    const replaySession = { ...completedSession };
    state.typingSettings.everydayLesson = completedSession.lessonId;
    setEverydaySession(completedSession);
    mocks.prepare.mockResolvedValueOnce(replaySession);
    const settingsBefore = structuredClone(state.typingSettings);
    const translationBefore = structuredClone(state.translation);

    // A completed result is no longer active or being calculated. Replay
    // must remain available even when this is the final passage group.
    state.testActive = false;
    state.resultCalculating = false;
    await replayEveryday();

    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(180, 2, "current");
    expect(mocks.setText).toHaveBeenCalledExactlyOnceWith([
      "Cache",
      "entries",
      "keep",
      "their",
      "order.",
      "The",
      "DI",
      "container",
      "loads",
      "Vendor_Module::service.",
      "Run",
      "`bin/magento",
      "cache:clean`.",
    ]);
    expect(mocks.setMode).toHaveBeenCalledExactlyOnceWith("repeat");
    expect(mocks.setPipeDelimiter).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.setLimitMode).toHaveBeenCalledExactlyOnceWith("word");
    expect(mocks.setLimitValue).toHaveBeenCalledExactlyOnceWith(13);
    expect(mocks.dictionary).toHaveBeenCalledExactlyOnceWith(
      completedSession.text,
      expect.any(Function),
    );
    expect(mocks.saveTypingSettings).toHaveBeenCalledExactlyOnceWith(
      settingsBefore,
    );
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(replaySession);
    expect(getEverydaySession()).toEqual(completedSession);
    expect(mocks.resetPractice).toHaveBeenCalledOnce();
    expect(mocks.setRepeated).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.restart).toHaveBeenCalledOnce();
    for (const reset of [
      mocks.resetPractice,
      mocks.setRepeated,
      mocks.commit,
    ]) {
      expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.restart.mock.invocationCallOrder[0] as number,
      );
    }
    expect(state.translation).toEqual(translationBefore);
    expect(mocks.setTranslation).not.toHaveBeenCalled();
    expect(isEverydayLoading()).toBe(false);
  });

  it("keeps a completed session available when replay dictionary loading fails and retries the same range", async () => {
    mocks.prepare.mockResolvedValue(initialSession);
    mocks.dictionary.mockRejectedValueOnce(new Error("Vocabulary unavailable"));

    await expect(replayEveryday()).rejects.toThrow("Vocabulary unavailable");
    expectUnchangedSession();
    expect(isEverydayLoading()).toBe(false);

    await replayEveryday();
    expect(mocks.prepare.mock.calls).toEqual([
      [0, 2, "current"],
      [0, 2, "current"],
    ]);
    expect(mocks.setText).toHaveBeenCalledExactlyOnceWith([
      "Original",
      "paragraph.",
    ]);
    expect(mocks.setLimitValue).toHaveBeenCalledExactlyOnceWith(2);
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(initialSession);
    expect(getEverydaySession()).toEqual(initialSession);
    expect(mocks.restart).toHaveBeenCalledOnce();
  });

  it.each(["custom", "topic", "word-type", "grammar"])(
    "preserves the selected %s dictionary while navigating backwards",
    async (source) => {
      state.translation.dictionarySource = source;
      const translationBefore = structuredClone(state.translation);
      await navigateEveryday("prev");
      expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(0, 2, "prev");
      expect(mocks.dictionary).not.toHaveBeenCalled();
      expect(state.translation).toEqual(translationBefore);
      expect(mocks.setTranslation).not.toHaveBeenCalled();
      expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(nextSession);
    },
  );

  it("does not load a disabled translation dictionary", async () => {
    state.translation.enabled = false;
    await navigateEveryday("next");
    expect(mocks.dictionary).not.toHaveBeenCalled();
    expect(mocks.restart).toHaveBeenCalledOnce();
  });

  it("keeps the old content and progress if its dictionary cannot load, and permits retry", async () => {
    mocks.dictionary.mockRejectedValueOnce(new Error("Vocabulary unavailable"));
    await expect(navigateEveryday("next")).rejects.toThrow(
      "Vocabulary unavailable",
    );
    expectUnchangedSession();
    expect(isEverydayLoading()).toBe(false);

    await navigateEveryday("next");
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(nextSession);
  });

  it("keeps the old content and unlocks navigation after a lesson failure", async () => {
    mocks.prepare.mockRejectedValueOnce(new Error("Lesson unavailable"));
    await expect(navigateEveryday("next")).rejects.toThrow(
      "Lesson unavailable",
    );
    expect(mocks.dictionary).not.toHaveBeenCalled();
    expectUnchangedSession();
    expect(isEverydayLoading()).toBe(false);
  });

  it.each([
    [
      "mode",
      () => {
        config.mode = "words";
      },
    ],
    [
      "text source",
      () => {
        state.typingSettings.source = "custom";
      },
    ],
    [
      "challenge",
      () => {
        state.challenge = {};
      },
    ],
    [
      "restart",
      () => {
        state.testRestarting = true;
      },
    ],
    [
      "result calculation",
      () => {
        state.resultCalculating = true;
      },
    ],
    [
      "active no_quit",
      () => {
        state.testActive = true;
        state.noQuit = true;
      },
    ],
    [
      "sentence-builder",
      () => {
        state.translation.learningMode = "sentence-builder";
      },
    ],
    [
      "context-cloze",
      () => {
        state.translation.learningMode = "context-cloze";
      },
    ],
    [
      "smart-review",
      () => {
        state.translation.learningMode = "smart-review";
      },
    ],
  ] as const)(
    "does not prepare or mutate a session during %s",
    async (_label, block) => {
      block();
      expect(canNavigateEveryday()).toBe(false);
      await navigateEveryday("next");
      await replayEveryday();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.dictionary).not.toHaveBeenCalled();
      expectUnchangedSession();
    },
  );

  it("permits navigation with no_quit before a test starts", async () => {
    state.noQuit = true;
    expect(canNavigateEveryday()).toBe(true);
    await navigateEveryday("next");
    expect(mocks.restart).toHaveBeenCalledOnce();
  });

  it("ignores concurrent clicks until the pending navigation finishes", async () => {
    const pendingLesson = deferred<EverydaySession>();
    mocks.prepare.mockReturnValueOnce(pendingLesson.promise);
    const first = navigateEveryday("next");
    expect(isEverydayLoading()).toBe(true);
    await navigateEveryday("next");
    await navigateEveryday("prev");
    await replayEveryday();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expectUnchangedSession();

    pendingLesson.resolve(nextSession);
    await first;
    expect(mocks.commit).toHaveBeenCalledOnce();
    expect(mocks.restart).toHaveBeenCalledOnce();
    expect(isEverydayLoading()).toBe(false);
  });

  it.each([
    [
      "typing mode",
      () => {
        config.mode = "words";
      },
    ],
    [
      "text source",
      () => {
        state.typingSettings.source = "level";
      },
    ],
    [
      "passage count",
      () => {
        state.typingSettings.passageCount = 1;
      },
    ],
    [
      "selected lesson",
      () => {
        state.typingSettings.everydayLesson = 5;
      },
    ],
    [
      "learning mode",
      () => {
        state.translation.learningMode = "smart-review";
      },
    ],
    [
      "result",
      () => {
        state.resultCalculating = true;
      },
    ],
  ] as const)(
    "does not commit when %s changes during dictionary loading",
    async (_label, switchMode) => {
      const pendingDictionary = deferred<{
        entries: number;
        levels: number[];
      }>();
      mocks.dictionary.mockReturnValueOnce(pendingDictionary.promise);
      const navigation = navigateEveryday("next");
      await Promise.resolve();
      expect(mocks.dictionary).toHaveBeenCalledOnce();
      const shouldApply = mocks.dictionary.mock.calls[0]?.[1];
      expect(shouldApply?.()).toBe(true);
      switchMode();
      expect(shouldApply?.()).toBe(false);
      pendingDictionary.resolve({ entries: 3, levels: [1] });
      await navigation;
      expectUnchangedSession();
      expect(isEverydayLoading()).toBe(false);
    },
  );

  it("does not overwrite a session activated while an older navigation loads", async () => {
    const pendingLesson = deferred<EverydaySession>();
    mocks.prepare.mockReturnValueOnce(pendingLesson.promise);
    const navigation = navigateEveryday("next");
    const replacement = { ...initialSession, text: "A newly selected lesson." };
    setEverydaySession(replacement);
    pendingLesson.resolve(nextSession);
    await navigation;
    expect(mocks.dictionary).not.toHaveBeenCalled();
    expectUnchangedSession(replacement);
    expect(isEverydayLoading()).toBe(false);
  });
});
