import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareLevelPassages: vi.fn(),
  loadVocabularyGrammarIndex: vi.fn(),
}));

vi.mock("../../src/ts/custom/typing-text-library", () => ({
  prepareLevelPassages: mocks.prepareLevelPassages,
}));

vi.mock("../../src/ts/custom/en-vn-translation/library", () => ({
  loadVocabularyGrammarIndex: mocks.loadVocabularyGrammarIndex,
}));

import {
  buildContextClozeLearningEvent,
  contextClozeHint,
  maskContextTarget,
  prepareContextClozeExercises,
  validateContextClozeAnswer,
} from "../../src/ts/learning/context-cloze";

describe("Context / Cloze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareLevelPassages.mockResolvedValue({
      level: 1,
      cefr: "A1",
      passages: [
        {
          id: "L001-P001",
          topic: "school and travel",
          style: "daily narrative",
          setting: "town",
          tone: "calm",
          targetWords: ["school", "airport"],
          wordCount: 12,
          text: "I go to school today. Yesterday I went to the airport.",
        },
      ],
    });
    mocks.loadVocabularyGrammarIndex.mockResolvedValue({
      version: 1,
      primaryTimeGroups: ["time.present", "time.past", "time.future"],
      modules: [
        {
          id: "time.present",
          label: "Present",
          group: "present",
          focus: ["current states"],
          topicIds: ["education.school"],
          signalTokens: ["today"],
          signalEntries: [],
          missingSignalKeys: [],
        },
        {
          id: "time.past",
          label: "Past",
          group: "past",
          focus: ["completed events"],
          topicIds: ["travel.planning"],
          signalTokens: ["yesterday"],
          signalEntries: [],
          missingSignalKeys: [],
        },
      ],
    });
  });

  it("masks a whole vocabulary phrase without replacing a substring", () => {
    expect(
      maskContextTarget(
        "Dependency injection keeps dependency boundaries clear.",
        "dependency injection",
      ),
    ).toBe("____ keeps dependency boundaries clear.");
    expect(maskContextTarget("The schooling day.", "school")).toBeNull();
  });

  it("derives vocabulary and grammar exercises from shared passage/curriculum data", async () => {
    const exercises = await prepareContextClozeExercises(1, 1, 4);

    expect(mocks.prepareLevelPassages).toHaveBeenCalledWith(1, 1);
    expect(exercises).toHaveLength(4);
    expect(exercises.map((item) => [item.entityType, item.entityId])).toEqual([
      ["vocabulary", "school"],
      ["grammar", "time.present"],
      ["vocabulary", "airport"],
      ["grammar", "time.past"],
    ]);
    expect(exercises[0]?.maskedSentence).toBe("I go to ____ today.");
    expect(exercises[1]?.maskedSentence).toBe("I go to school ____.");
  });

  it("scores vocabulary cloze errors as spelling", async () => {
    const exercise = (await prepareContextClozeExercises(1, 1, 1))[0];
    if (exercise === undefined) throw new Error("Missing exercise");

    expect(validateContextClozeAnswer(exercise, "School")).toEqual({
      correct: true,
      normalizedAnswer: "school",
    });
    expect(validateContextClozeAnswer(exercise, "schol")).toEqual({
      correct: false,
      normalizedAnswer: "schol",
      errorType: "spelling",
    });
  });

  it("scores grammar cloze errors as wrong-form and emits a grammar event", async () => {
    const exercise = (await prepareContextClozeExercises(1, 1, 2))[1];
    if (exercise === undefined) throw new Error("Missing grammar exercise");

    const validation = validateContextClozeAnswer(exercise, "tomorrow");
    expect(validation.errorType).toBe("wrong-form");

    expect(
      buildContextClozeLearningEvent({
        exercise,
        answer: "tomorrow",
        validation,
        responseMs: 452.7,
        hintUsed: true,
        occurredAt: "2026-09-24T13:00:00.000Z",
      }),
    ).toMatchObject({
      version: 1,
      entityType: "grammar",
      entityId: "time.present",
      activityType: "cloze",
      result: "wrong",
      responseMs: 453,
      hintUsed: true,
      userAnswer: "tomorrow",
      expectedAnswer: "today",
      errorType: "wrong-form",
    });
  });

  it("reveals the target one Unicode character at a time", async () => {
    const exercise = (await prepareContextClozeExercises(1, 1, 1))[0];
    if (exercise === undefined) throw new Error("Missing exercise");

    const first = contextClozeHint(exercise, 0);
    const second = contextClozeHint(exercise, first.nextRevealedCharacters);

    expect(first).toEqual({
      revealed: "s",
      nextRevealedCharacters: 1,
    });
    expect(second).toEqual({
      revealed: "sc",
      nextRevealedCharacters: 2,
    });
  });
});
