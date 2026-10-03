import {
  loadPublishedGrammarLessons,
  loadPublishedPracticeExercises,
  type PublishedEnglishExercise,
  type PublishedEnglishExerciseType,
  type PublishedGrammarTopic,
} from "./rich-content";

export type RichPracticeMode =
  | "grammar-lesson"
  | "translation"
  | "correction"
  | "transformation"
  | "sentence-listening";

export type RichPracticeExerciseItem = {
  kind: "exercise";
  id: string;
  mode: Exclude<RichPracticeMode, "grammar-lesson">;
  title: string;
  prompt: string;
  acceptedAnswers: string[];
  targetIds: string[];
  sourceSentenceIds: string[];
  cefr?: string;
};

export type RichPracticeLessonItem = {
  kind: "lesson";
  id: string;
  mode: "grammar-lesson";
  title: string;
  objective: string;
  conceptEn: string;
  conceptVi: string;
  formulae: string[];
  whenToUse: string[];
  examples: string[];
  cefr: string;
};

export type RichPracticeItem =
  | RichPracticeExerciseItem
  | RichPracticeLessonItem;

export type RichPracticeValidation = {
  correct: boolean;
  matchedAnswer?: string;
  normalizedAnswer: string;
  errorType?: string;
};

export type RichPracticeLearningEvent = {
  version: 1;
  entityType: "grammar" | "sentence";
  entityId: string;
  gameId: "monkeytype";
  activityType:
    | "translation"
    | "error-correction"
    | "transformation"
    | "listening-typing";
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: boolean;
  userAnswer: string;
  expectedAnswer: string;
  errorType?: string;
};

const exerciseTypeByMode: Record<
  Exclude<RichPracticeMode, "grammar-lesson">,
  PublishedEnglishExerciseType
> = {
  translation: "translation",
  correction: "error-correction",
  transformation: "transformation",
  "sentence-listening": "listening-typing",
};

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .toLocaleLowerCase("en-US");
}

function exerciseTitle(mode: RichPracticeExerciseItem["mode"]): string {
  if (mode === "translation") return "Translation";
  if (mode === "correction") return "Error correction";
  if (mode === "transformation") return "Sentence transformation";
  return "Listen and type";
}

export function exerciseToRichPracticeItem(
  exercise: PublishedEnglishExercise,
  mode: RichPracticeExerciseItem["mode"],
): RichPracticeExerciseItem {
  return {
    kind: "exercise",
    id: exercise.id,
    mode,
    title: exerciseTitle(mode),
    prompt: exercise.prompt,
    acceptedAnswers: [...exercise.acceptedAnswers],
    targetIds: [...exercise.targetIds],
    sourceSentenceIds: [...exercise.sourceSentenceIds],
    ...(exercise.cefr === undefined ? {} : { cefr: exercise.cefr }),
  };
}

export function grammarToRichPracticeLesson(
  topic: PublishedGrammarTopic,
): RichPracticeLessonItem {
  const examples = [
    ...(topic.forms?.positive ?? []),
    ...(topic.forms?.negative ?? []),
    ...(topic.forms?.question ?? []),
  ];
  return {
    kind: "lesson",
    id: topic.id,
    mode: "grammar-lesson",
    title: topic.title,
    objective: topic.objective,
    conceptEn: topic.concept?.en ?? "",
    conceptVi: topic.concept?.vi ?? "",
    formulae: [...(topic.formulae ?? [])],
    whenToUse: [...(topic.whenToUse ?? [])],
    examples,
    cefr: topic.cefr,
  };
}

export async function prepareRichPracticeItems(
  mode: RichPracticeMode,
  cefr?: string,
  limit = 20,
): Promise<RichPracticeItem[]> {
  const bounded = Math.min(40, Math.max(1, Math.floor(limit)));
  if (mode === "grammar-lesson") {
    return (await loadPublishedGrammarLessons(cefr, bounded)).map(
      grammarToRichPracticeLesson,
    );
  }

  const type = exerciseTypeByMode[mode];
  return (
    await loadPublishedPracticeExercises([type], cefr, bounded)
  ).map((exercise) => exerciseToRichPracticeItem(exercise, mode));
}

export function validateRichPracticeAnswer(
  item: RichPracticeExerciseItem,
  answer: string,
): RichPracticeValidation {
  const normalizedAnswer = normalizeAnswer(answer);
  const matchedAnswer = item.acceptedAnswers.find(
    (candidate) => normalizeAnswer(candidate) === normalizedAnswer,
  );
  if (matchedAnswer !== undefined) {
    return { correct: true, matchedAnswer, normalizedAnswer };
  }

  const errorType =
    item.mode === "translation"
      ? "translation"
      : item.mode === "correction"
        ? "correction"
        : item.mode === "sentence-listening"
          ? "spelling"
          : "wrong-form";
  return { correct: false, normalizedAnswer, errorType };
}

function activityType(
  mode: RichPracticeExerciseItem["mode"],
): RichPracticeLearningEvent["activityType"] {
  if (mode === "correction") return "error-correction";
  if (mode === "sentence-listening") return "listening-typing";
  return mode;
}

export function buildRichPracticeLearningEvents(options: {
  item: RichPracticeExerciseItem;
  answer: string;
  validation: RichPracticeValidation;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: boolean;
  occurredAt?: string;
}): RichPracticeLearningEvent[] {
  const expectedAnswer =
    options.validation.matchedAnswer ?? options.item.acceptedAnswers[0];
  if (expectedAnswer === undefined) {
    throw new Error("Rich practice item has no accepted answer");
  }

  const common = {
    version: 1 as const,
    gameId: "monkeytype" as const,
    activityType: activityType(options.item.mode),
    result: options.validation.correct ? ("correct" as const) : ("wrong" as const),
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    responseMs: Math.max(0, Math.round(options.responseMs)),
    hintUsed: options.hintUsed,
    replayUsed: options.replayUsed,
    userAnswer: options.answer,
    expectedAnswer,
    ...(options.validation.errorType === undefined
      ? {}
      : { errorType: options.validation.errorType }),
  };

  const events: RichPracticeLearningEvent[] = [];
  const grammarIds = options.item.targetIds.filter((id) =>
    id.startsWith("gr."),
  );
  for (const id of grammarIds) {
    events.push({ ...common, entityType: "grammar", entityId: id });
  }

  const sentenceId = options.item.sourceSentenceIds[0];
  if (sentenceId !== undefined) {
    events.push({
      ...common,
      entityType: "sentence",
      entityId: sentenceId,
    });
  }

  if (events.length === 0) {
    events.push({
      ...common,
      entityType: "sentence",
      entityId: options.item.id,
    });
  }
  return events;
}

export function richPracticeHint(
  item: RichPracticeExerciseItem,
  revealedCharacters: number,
): { revealed: string; nextRevealedCharacters: number } {
  const target = item.acceptedAnswers[0] ?? "";
  const characters = Array.from(target);
  const next = Math.min(
    characters.length,
    Math.max(0, revealedCharacters) + 1,
  );
  return {
    revealed: characters.slice(0, next).join(""),
    nextRevealedCharacters: next,
  };
}
