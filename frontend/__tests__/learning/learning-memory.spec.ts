import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  config: {
    mode: "custom",
  },
  dictionaryRaw: "hello = xin chào",
  settings: {
    enabled: true,
    learningMode: "normal",
    recallModeEnabled: false,
    dictionarySource: "custom",
    dictionaryTopicId: "everyday.routine",
    dictionaryPosId: "noun",
    dictionaryGrammarId: "time.present",
    dictionary: "hello = xin chào",
  },
  words: [
    {
      text: "hello",
      textWithCommit: "hello ",
      commit: " ",
      display: "hello",
      sectionIndex: 0,
    },
  ],
}));

vi.mock("../../src/ts/config/store", () => ({
  Config: mockState.config,
}));

vi.mock("../../src/ts/events/test", () => ({
  restartTestEvent: {
    subscribe: vi.fn(),
  },
}));

vi.mock("../../src/ts/test/test-words", () => ({
  words: {
    get(index?: number) {
      if (index === undefined) return [...mockState.words];
      return mockState.words[index];
    },
    get length() {
      return mockState.words.length;
    },
  },
}));

vi.mock("../../src/ts/custom/en-vn-translation/library", () => ({
  getActiveDictionaryRaw: () => mockState.dictionaryRaw,
}));

vi.mock("../../src/ts/custom/en-vn-translation/store", () => ({
  getSettings: () => mockState.settings,
}));

import {
  __testing,
  markLearningHintUsed,
  markLearningMatchPresented,
  markLearningReplayUsed,
  recordLearningWordCompletion,
} from "../../src/ts/learning/learning-memory";

describe("Monkeytype shared learning memory", () => {
  beforeEach(() => {
    mockState.config.mode = "custom";
    mockState.dictionaryRaw = "hello = xin chào";
    mockState.settings.enabled = true;
    mockState.settings.learningMode = "normal";
    mockState.settings.recallModeEnabled = false;
    mockState.settings.dictionary = mockState.dictionaryRaw;
    mockState.words = [
      {
        text: "hello",
        textWithCommit: "hello ",
        commit: " ",
        display: "hello",
        sectionIndex: 0,
      },
    ];
    __testing.reset();
  });

  it("emits one completed vocabulary attempt instead of per-key events", () => {
    markLearningMatchPresented(0, 100);

    const event = recordLearningWordCompletion({
      wordIndex: 0,
      input: "hello ",
      correct: true,
      now: 725,
    });

    expect(event).toMatchObject({
      version: 1,
      entityType: "vocabulary",
      entityId: "hello",
      gameId: "monkeytype",
      activityType: "typing",
      result: "correct",
      responseMs: 625,
      hintUsed: false,
      replayUsed: false,
      userAnswer: "hello",
      expectedAnswer: "hello",
    });
  });

  it("aggregates a greedy multi-word match into one attempt", () => {
    mockState.dictionaryRaw =
      "dependency = sự phụ thuộc\ndependency injection = tiêm phụ thuộc\ninjection = tiêm";
    mockState.settings.dictionary = mockState.dictionaryRaw;
    mockState.words = [
      {
        text: "dependency",
        textWithCommit: "dependency ",
        commit: " ",
        display: "dependency",
        sectionIndex: 0,
      },
      {
        text: "injection",
        textWithCommit: "injection ",
        commit: " ",
        display: "injection",
        sectionIndex: 0,
      },
    ];
    __testing.reset();

    markLearningMatchPresented(0, 50);
    expect(
      recordLearningWordCompletion({
        wordIndex: 0,
        input: "dependency ",
        correct: true,
        now: 300,
      }),
    ).toBeNull();

    const event = recordLearningWordCompletion({
      wordIndex: 1,
      input: "injecton ",
      correct: false,
      now: 900,
    });

    expect(event).toMatchObject({
      entityId: "dependency injection",
      result: "wrong",
      responseMs: 850,
      userAnswer: "dependency injecton",
      expectedAnswer: "dependency injection",
    });
  });

  it("labels existing Recall mode attempts separately", () => {
    mockState.settings.learningMode = "recall";
    mockState.settings.recallModeEnabled = true;
    __testing.reset();

    markLearningMatchPresented(0, 10);
    const event = recordLearningWordCompletion({
      wordIndex: 0,
      input: "hello ",
      correct: true,
      now: 110,
    });

    expect(event?.activityType).toBe("recall");
  });

  it.each([
    ["learn", "learn"],
    ["listen", "listen"],
  ] as const)("labels %s mode attempts separately", (mode, expected) => {
    mockState.settings.learningMode = mode;
    __testing.reset();

    markLearningMatchPresented(0, 10);
    const event = recordLearningWordCompletion({
      wordIndex: 0,
      input: "hello ",
      correct: true,
      now: 110,
    });

    expect(event?.activityType).toBe(expected);
  });

  it("carries hint and replay dependence only when those actions are marked", () => {
    markLearningMatchPresented(0, 10);
    markLearningHintUsed(0);
    markLearningReplayUsed(0);

    const event = recordLearningWordCompletion({
      wordIndex: 0,
      input: "hello ",
      correct: true,
      now: 110,
    });

    expect(event?.hintUsed).toBe(true);
    expect(event?.replayUsed).toBe(true);
  });

  it("stays inactive outside Custom learning mode", () => {
    mockState.config.mode = "words";
    __testing.reset();

    expect(
      recordLearningWordCompletion({
        wordIndex: 0,
        input: "hello ",
        correct: true,
        now: 100,
      }),
    ).toBeNull();
  });
});
