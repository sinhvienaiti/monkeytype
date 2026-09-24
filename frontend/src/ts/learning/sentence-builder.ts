export type SentenceBuilderDifficulty =
  | "easy"
  | "normal"
  | "hard"
  | "extreme";

export type SentenceBuilderErrorType =
  | "word-order"
  | "wrong-tense"
  | "missing-word"
  | "extra-word"
  | "wrong-form"
  | "spelling"
  | "punctuation";

export type SentenceBuilderClassifiedAnswer = {
  answer: string;
  errorType: SentenceBuilderErrorType;
};

export type SentenceBuilderExercise = {
  version: 1;
  sentenceId: string;
  grammarId?: string;
  prompt?: string;
  meaning?: string;
  acceptedAnswers: string[];
  difficulty: SentenceBuilderDifficulty;
  distractors?: string[];
  grammarHint?: string;
  classifiedAnswers?: SentenceBuilderClassifiedAnswer[];
};

export type SentenceBuilderLayout = {
  fixedStart: string;
  units: string[];
};

export type SentenceBuilderValidation = {
  correct: boolean;
  matchedAnswer?: string;
  errorType?: SentenceBuilderErrorType;
  normalizedAnswer: string;
};

export type SentenceBuilderLearningEvent = {
  version: 1;
  entityType: "sentence" | "grammar";
  entityId: string;
  gameId: "monkeytype";
  activityType: "sentence-builder";
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: false;
  userAnswer: string;
  expectedAnswer: string;
  errorType?: SentenceBuilderErrorType;
};

const ERROR_TYPES = new Set<SentenceBuilderErrorType>([
  "word-order",
  "wrong-tense",
  "missing-word",
  "extra-word",
  "wrong-form",
  "spelling",
  "punctuation",
]);

function nonEmpty(value: unknown, field: string, max = 600): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  const result = value.normalize("NFC").trim();
  if (result.length > max) throw new TypeError(`${field} is too long`);
  return result;
}

function optionalText(
  value: unknown,
  field: string,
  max = 600,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return nonEmpty(value, field, max);
}

export function normalizeSentenceAnswer(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .toLocaleLowerCase("en-US");
}

function withoutPunctuation(value: string): string {
  return normalizeSentenceAnswer(value)
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lexicalTokens(value: string): string[] {
  const normalized = withoutPunctuation(value);
  return normalized === "" ? [] : normalized.split(" ");
}

function tokenCounts(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

function sameMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = tokenCounts(left);
  for (const token of right) {
    const count = counts.get(token) ?? 0;
    if (count <= 0) return false;
    if (count === 1) counts.delete(token);
    else counts.set(token, count - 1);
  }
  return counts.size === 0;
}

function multisetContains(
  container: readonly string[],
  subset: readonly string[],
): boolean {
  const counts = tokenCounts(container);
  for (const token of subset) {
    const count = counts.get(token) ?? 0;
    if (count <= 0) return false;
    counts.set(token, count - 1);
  }
  return true;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        substitution,
      );
    }
    for (let j = 0; j <= right.length; j++) {
      previous[j] = current[j] ?? 0;
    }
  }

  return previous[right.length] ?? Math.max(left.length, right.length);
}

function normalizeAnswers(values: unknown): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 12) {
    throw new TypeError("acceptedAnswers must contain 1 to 12 answers");
  }

  const answers: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const answer = nonEmpty(value, "acceptedAnswers[]");
    const normalized = normalizeSentenceAnswer(answer);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    answers.push(answer);
  }

  if (answers.length === 0) {
    throw new TypeError("acceptedAnswers must not normalize to empty");
  }
  return answers;
}

export function parseSentenceBuilderExercise(
  value: unknown,
): SentenceBuilderExercise {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("sentence builder exercise must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input["version"] !== 1) {
    throw new TypeError("sentence builder exercise version must be 1");
  }

  const difficulty = input["difficulty"];
  if (
    difficulty !== "easy" &&
    difficulty !== "normal" &&
    difficulty !== "hard" &&
    difficulty !== "extreme"
  ) {
    throw new TypeError("sentence builder difficulty is invalid");
  }

  const distractors =
    input["distractors"] === undefined
      ? undefined
      : Array.isArray(input["distractors"])
        ? input["distractors"].map((item) => nonEmpty(item, "distractors[]", 80))
        : (() => {
            throw new TypeError("distractors must be an array");
          })();

  const classifiedAnswers =
    input["classifiedAnswers"] === undefined
      ? undefined
      : Array.isArray(input["classifiedAnswers"])
        ? input["classifiedAnswers"].map((item) => {
            if (
              item === null ||
              typeof item !== "object" ||
              Array.isArray(item)
            ) {
              throw new TypeError("classifiedAnswers[] must be an object");
            }
            const candidate = item as Record<string, unknown>;
            const errorType = candidate["errorType"];
            if (
              typeof errorType !== "string" ||
              !ERROR_TYPES.has(errorType as SentenceBuilderErrorType)
            ) {
              throw new TypeError("classifiedAnswers[].errorType is invalid");
            }
            return {
              answer: nonEmpty(candidate["answer"], "classifiedAnswers[].answer"),
              errorType: errorType as SentenceBuilderErrorType,
            };
          })
        : (() => {
            throw new TypeError("classifiedAnswers must be an array");
          })();

  return {
    version: 1,
    sentenceId: nonEmpty(input["sentenceId"], "sentenceId", 200),
    ...(optionalText(input["grammarId"], "grammarId", 200) === undefined
      ? {}
      : { grammarId: optionalText(input["grammarId"], "grammarId", 200) }),
    ...(optionalText(input["prompt"], "prompt") === undefined
      ? {}
      : { prompt: optionalText(input["prompt"], "prompt") }),
    ...(optionalText(input["meaning"], "meaning") === undefined
      ? {}
      : { meaning: optionalText(input["meaning"], "meaning") }),
    acceptedAnswers: normalizeAnswers(input["acceptedAnswers"]),
    difficulty,
    ...(distractors === undefined ? {} : { distractors }),
    ...(optionalText(input["grammarHint"], "grammarHint") === undefined
      ? {}
      : { grammarHint: optionalText(input["grammarHint"], "grammarHint") }),
    ...(classifiedAnswers === undefined ? {} : { classifiedAnswers }),
  };
}

function sentenceUnits(answer: string): string[] {
  return answer
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function buildSentenceBuilderLayout(
  exerciseInput: SentenceBuilderExercise,
  random: () => number = Math.random,
): SentenceBuilderLayout {
  const exercise = parseSentenceBuilderExercise(exerciseInput);
  const units = sentenceUnits(exercise.acceptedAnswers[0] as string);

  if (exercise.difficulty === "extreme") {
    return { fixedStart: "", units: [] };
  }

  if (exercise.difficulty === "easy") {
    return {
      fixedStart: units[0] ?? "",
      units: shuffle(units.slice(1), random),
    };
  }

  const pool =
    exercise.difficulty === "hard"
      ? [...units, ...(exercise.distractors ?? [])]
      : units;
  return { fixedStart: "", units: shuffle(pool, random) };
}

export function validateSentenceBuilderAnswer(
  exerciseInput: SentenceBuilderExercise,
  answer: string,
): SentenceBuilderValidation {
  const exercise = parseSentenceBuilderExercise(exerciseInput);
  const normalizedAnswer = normalizeSentenceAnswer(answer);

  for (const accepted of exercise.acceptedAnswers) {
    if (normalizedAnswer === normalizeSentenceAnswer(accepted)) {
      return {
        correct: true,
        matchedAnswer: accepted,
        normalizedAnswer,
      };
    }
  }

  for (const classified of exercise.classifiedAnswers ?? []) {
    if (normalizedAnswer === normalizeSentenceAnswer(classified.answer)) {
      return {
        correct: false,
        errorType: classified.errorType,
        normalizedAnswer,
      };
    }
  }

  const answerWithoutPunctuation = withoutPunctuation(answer);
  for (const accepted of exercise.acceptedAnswers) {
    if (
      answerWithoutPunctuation !== "" &&
      answerWithoutPunctuation === withoutPunctuation(accepted)
    ) {
      return { correct: false, errorType: "punctuation", normalizedAnswer };
    }
  }

  const userTokens = lexicalTokens(answer);
  let missingCandidate = false;
  let extraCandidate = false;
  let spellingCandidate = false;

  for (const accepted of exercise.acceptedAnswers) {
    const expectedTokens = lexicalTokens(accepted);
    if (sameMultiset(userTokens, expectedTokens)) {
      return { correct: false, errorType: "word-order", normalizedAnswer };
    }
    if (
      userTokens.length < expectedTokens.length &&
      multisetContains(expectedTokens, userTokens)
    ) {
      missingCandidate = true;
    }
    if (
      userTokens.length > expectedTokens.length &&
      multisetContains(userTokens, expectedTokens)
    ) {
      extraCandidate = true;
    }
    if (userTokens.length === expectedTokens.length) {
      const totalDistance = userTokens.reduce(
        (sum, token, index) =>
          sum + editDistance(token, expectedTokens[index] ?? ""),
        0,
      );
      if (totalDistance > 0 && totalDistance <= Math.max(2, userTokens.length)) {
        spellingCandidate = true;
      }
    }
  }

  return {
    correct: false,
    errorType: missingCandidate
      ? "missing-word"
      : extraCandidate
        ? "extra-word"
        : spellingCandidate
          ? "spelling"
          : "wrong-form",
    normalizedAnswer,
  };
}

export function buildSentenceBuilderLearningEvents(options: {
  exercise: SentenceBuilderExercise;
  validation: SentenceBuilderValidation;
  answer: string;
  responseMs: number;
  hintUsed: boolean;
  occurredAt?: string;
}): SentenceBuilderLearningEvent[] {
  const exercise = parseSentenceBuilderExercise(options.exercise);
  const result = options.validation.correct ? "correct" : "wrong";
  const expectedAnswer =
    options.validation.matchedAnswer ?? (exercise.acceptedAnswers[0] as string);
  const occurredAt =
    options.occurredAt ?? new Date().toISOString();

  const common = {
    version: 1 as const,
    gameId: "monkeytype" as const,
    activityType: "sentence-builder" as const,
    result,
    occurredAt,
    responseMs: Math.max(0, Math.round(options.responseMs)),
    hintUsed: options.hintUsed,
    replayUsed: false as const,
    userAnswer: options.answer,
    expectedAnswer,
    ...(options.validation.errorType === undefined
      ? {}
      : { errorType: options.validation.errorType }),
  };

  const events: SentenceBuilderLearningEvent[] = [
    {
      ...common,
      entityType: "sentence",
      entityId: exercise.sentenceId,
    },
  ];

  if (exercise.grammarId !== undefined) {
    events.push({
      ...common,
      entityType: "grammar",
      entityId: exercise.grammarId,
    });
  }

  return events;
}

export function sentenceBuilderHint(
  exerciseInput: SentenceBuilderExercise,
  revealedWords: number,
): { prefix: string; nextRevealedWords: number } {
  const exercise = parseSentenceBuilderExercise(exerciseInput);
  const words = sentenceUnits(exercise.acceptedAnswers[0] as string);
  const next = Math.min(words.length, Math.max(0, revealedWords) + 1);
  return {
    prefix: words.slice(0, next).join(" "),
    nextRevealedWords: next,
  };
}
