import { describe, expect, it } from "vitest";

import {
  buildSentenceBuilderLayout,
  buildSentenceBuilderLearningEvents,
  normalizeSentenceAnswer,
  parseSentenceBuilderExercise,
  sentenceBuilderHint,
  validateSentenceBuilderAnswer,
} from "../../src/ts/learning/sentence-builder";
import {
  draftToExercise,
  exerciseToDraft,
} from "../../src/ts/learning/sentence-builder-store";

const exercise = parseSentenceBuilderExercise({
  version: 1,
  sentenceId: "present-perfect-lived-here",
  grammarId: "present-perfect",
  prompt: "Build a natural sentence.",
  meaning: "Tôi đã sống ở đây từ năm 2020.",
  acceptedAnswers: [
    "I have lived here since 2020.",
    "Since 2020, I have lived here.",
  ],
  difficulty: "normal",
  distractors: ["yesterday"],
  grammarHint: "S + have/has + V3",
  classifiedAnswers: [
    {
      answer: "I lived here since 2020.",
      errorType: "wrong-tense",
    },
  ],
});

describe("Sentence Builder V1 engine", () => {
  it("normalizes Unicode, whitespace and capitalization without erasing punctuation", () => {
    expect(normalizeSentenceAnswer("  I   HAVE lived here since 2020. ")).toBe(
      "i have lived here since 2020.",
    );
    expect(normalizeSentenceAnswer("I have lived here since 2020")).not.toBe(
      normalizeSentenceAnswer("I have lived here since 2020."),
    );
  });

  it("accepts any authored acceptedAnswers entry", () => {
    expect(
      validateSentenceBuilderAnswer(
        exercise,
        "Since 2020, I have lived here.",
      ),
    ).toMatchObject({
      correct: true,
      matchedAnswer: "Since 2020, I have lived here.",
    });
  });

  it("uses authored grammar classifications before generic heuristics", () => {
    expect(
      validateSentenceBuilderAnswer(exercise, "I lived here since 2020."),
    ).toMatchObject({
      correct: false,
      errorType: "wrong-tense",
    });
  });

  it.each([
    [
      "have I lived here since 2020.",
      "word-order",
    ],
    [
      "I have lived here since.",
      "missing-word",
    ],
    [
      "I have lived here since 2020. yesterday",
      "extra-word",
    ],
    [
      "I have lved here since 2020.",
      "spelling",
    ],
    [
      "I have lived here since 2020",
      "punctuation",
    ],
  ] as const)("classifies %s as %s", (answer, expected) => {
    expect(validateSentenceBuilderAnswer(exercise, answer).errorType).toBe(
      expected,
    );
  });

  it("keeps a sentence-start cue in Easy", () => {
    const easy = { ...exercise, difficulty: "easy" as const };
    const layout = buildSentenceBuilderLayout(easy, () => 0);

    expect(layout.fixedStart).toBe("I");
    expect(layout.units).not.toContain("I");
    expect(layout.units).toHaveLength(5);
  });

  it("shuffles all required units in Normal", () => {
    const layout = buildSentenceBuilderLayout(exercise, () => 0);

    expect(layout.fixedStart).toBe("");
    expect([...layout.units].sort()).toEqual(
      ["I", "have", "lived", "here", "since", "2020."].sort(),
    );
  });

  it("adds distractors only in Hard", () => {
    const hard = { ...exercise, difficulty: "hard" as const };
    expect(buildSentenceBuilderLayout(hard, () => 0).units).toContain(
      "yesterday",
    );
    expect(buildSentenceBuilderLayout(exercise, () => 0).units).not.toContain(
      "yesterday",
    );
  });

  it("uses free production in Extreme", () => {
    const extreme = { ...exercise, difficulty: "extreme" as const };
    expect(buildSentenceBuilderLayout(extreme, () => 0)).toEqual({
      fixedStart: "",
      units: [],
    });
  });

  it("reveals the canonical answer one word at a time", () => {
    const first = sentenceBuilderHint(exercise, 0);
    const second = sentenceBuilderHint(exercise, first.nextRevealedWords);

    expect(first).toEqual({ prefix: "I", nextRevealedWords: 1 });
    expect(second).toEqual({ prefix: "I have", nextRevealedWords: 2 });
  });

  it("rejects duplicate accepted answers after normalization", () => {
    const parsed = parseSentenceBuilderExercise({
      version: 1,
      sentenceId: "multi-answer",
      acceptedAnswers: ["Hello world.", "  hello   world.  ", "World hello."],
      difficulty: "normal",
    });

    expect(parsed.acceptedAnswers).toEqual([
      "Hello world.",
      "World hello.",
    ]);
  });
  it("round-trips authored alternative answers and classified grammar errors", () => {
    const draft = exerciseToDraft(exercise);
    const restored = draftToExercise(draft);

    expect(restored.acceptedAnswers).toEqual(exercise.acceptedAnswers);
    expect(restored.classifiedAnswers).toEqual(exercise.classifiedAnswers);
    expect(draft.classifiedAnswers).toContain(
      "I lived here since 2020. => wrong-tense",
    );
  });

  it("rejects malformed classified-answer authoring syntax", () => {
    const draft = exerciseToDraft(exercise);
    draft.classifiedAnswers = "I lived here since 2020. wrong-tense";

    expect(() => draftToExercise(draft)).toThrow(
      "answer => error-type",
    );
  });

  it("emits one sentence event plus one grammar event with the same classified mistake", () => {
    const validation = validateSentenceBuilderAnswer(
      exercise,
      "I lived here since 2020.",
    );

    const events = buildSentenceBuilderLearningEvents({
      exercise,
      validation,
      answer: "I lived here since 2020.",
      responseMs: 1234.4,
      hintUsed: true,
      occurredAt: "2026-09-24T13:00:00.000Z",
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      entityType: "sentence",
      entityId: "present-perfect-lived-here",
      activityType: "sentence-builder",
      result: "wrong",
      responseMs: 1234,
      hintUsed: true,
      errorType: "wrong-tense",
    });
    expect(events[1]).toMatchObject({
      entityType: "grammar",
      entityId: "present-perfect",
      errorType: "wrong-tense",
    });
  });

  it("records the actually matched accepted answer for a valid alternative", () => {
    const answer = "Since 2020, I have lived here.";
    const validation = validateSentenceBuilderAnswer(exercise, answer);
    const events = buildSentenceBuilderLearningEvents({
      exercise,
      validation,
      answer,
      responseMs: 200,
      hintUsed: false,
      occurredAt: "2026-09-24T13:00:00.000Z",
    });

    expect(events[0]?.expectedAnswer).toBe(answer);
    expect(events[0]?.result).toBe("correct");
  });

});
