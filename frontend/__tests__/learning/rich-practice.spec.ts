import { describe, expect, it } from "vitest";

import {
  buildRichPracticeLearningEvents,
  exerciseToRichPracticeItem,
  grammarToRichPracticeLesson,
  richPracticeHint,
  validateRichPracticeAnswer,
} from "../../src/ts/learning/rich-practice";

describe("Rich practice engine", () => {
  it("maps grammar lessons without losing bilingual concepts", () => {
    const lesson = grammarToRichPracticeLesson({
      schemaVersion: 1,
      id: "gr.a1.present-simple-routines",
      cefr: "A1",
      title: "Present Simple",
      objective: "Describe repeated routines clearly.",
      concept: {
        en: "Use it for repeated actions.",
        vi: "Dùng cho hành động lặp lại.",
      },
      formulae: ["Subject + base verb."],
      forms: { positive: ["I work at home."] },
    });

    expect(lesson).toMatchObject({
      kind: "lesson",
      id: "gr.a1.present-simple-routines",
      conceptVi: "Dùng cho hành động lặp lại.",
    });
    expect(lesson.examples).toEqual(["I work at home."]);
  });

  it("validates authored translation alternatives and emits stable events", () => {
    const item = exerciseToRichPracticeItem(
      {
        schemaVersion: 1,
        id: "ex.translation.00000001",
        type: "translation",
        prompt: "Dịch sang tiếng Anh.",
        targetIds: ["gr.a1.present-simple-routines"],
        acceptedAnswers: ["I work at home.", "I work from home."],
        sourceSentenceIds: ["sent.00000001"],
        cefr: "A1",
      },
      "translation",
    );
    const validation = validateRichPracticeAnswer(item, "I work from home.");
    const events = buildRichPracticeLearningEvents({
      item,
      answer: "I work from home.",
      validation,
      responseMs: 420.4,
      hintUsed: false,
      replayUsed: false,
      occurredAt: "2026-10-03T00:00:00.000Z",
    });

    expect(validation.correct).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      entityType: "grammar",
      entityId: "gr.a1.present-simple-routines",
      activityType: "translation",
      result: "correct",
      expectedAnswer: "I work from home.",
      responseMs: 420,
    });
    expect(events[1]).toMatchObject({
      entityType: "sentence",
      entityId: "sent.00000001",
    });
  });

  it("classifies listening mistakes as spelling and reveals Unicode safely", () => {
    const item = exerciseToRichPracticeItem(
      {
        schemaVersion: 1,
        id: "ex.listening.00000001",
        type: "listening-typing",
        prompt: "Listen and type.",
        targetIds: ["gr.a1.present-simple-routines"],
        acceptedAnswers: ["She works here."],
        sourceSentenceIds: ["sent.00000002"],
      },
      "sentence-listening",
    );

    expect(validateRichPracticeAnswer(item, "She work here.")).toMatchObject({
      correct: false,
      errorType: "spelling",
    });
    expect(richPracticeHint(item, 0)).toEqual({
      revealed: "S",
      nextRevealedCharacters: 1,
    });
  });
});
