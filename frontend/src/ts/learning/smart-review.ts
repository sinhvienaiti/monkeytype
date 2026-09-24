import { normalizePhrase } from "../custom/en-vn-translation/dictionary";
import {
  getCachedVocabularyEntry,
  loadVocabularyGrammarIndex,
  prepareReviewDictionary,
  type VocabularyEntry,
  type VocabularyGrammarModule,
} from "../custom/en-vn-translation/library";
import {
  buildSentenceBuilderLayout,
  validateSentenceBuilderAnswer,
  type SentenceBuilderErrorType,
  type SentenceBuilderExercise,
} from "./sentence-builder";

export type SmartReviewGoal =
  | "remember-words"
  | "spelling"
  | "listening"
  | "grammar"
  | "sentence-building"
  | "mixed";

export type SmartReviewEntityType = "vocabulary" | "grammar" | "sentence";

export type SmartReviewContext = {
  activityType?: string;
  expectedAnswer?: string;
  userAnswer?: string;
  errorType?: string;
};

export type SmartReviewDatasetItem = {
  entityType: SmartReviewEntityType;
  entityId: string;
  mastery?: number;
  reviewPriority?: number;
  acceptedAnswers?: string[];
  reviewContext?: SmartReviewContext;
};

export type SmartReviewDataset = {
  version: 1;
  type: "typing-game:learning:v1:review-dataset";
  requestId: string;
  createdAt?: string;
  goal: SmartReviewGoal;
  items: SmartReviewDatasetItem[];
};

export type SmartReviewActivity =
  | "remember"
  | "spelling"
  | "listening"
  | "grammar"
  | "sentence-building";

export type SmartReviewPreparedItem = {
  source: SmartReviewDatasetItem;
  activity: SmartReviewActivity;
  title: string;
  prompt: string;
  secondary: string;
  expectedAnswers: string[];
  vocabulary?: VocabularyEntry;
  grammar?: VocabularyGrammarModule;
  sentenceExercise?: SentenceBuilderExercise;
};

export type SmartReviewValidation = {
  correct: boolean;
  matchedAnswer?: string;
  errorType?: string;
};

export type SmartReviewLearningEvent = {
  version: 1;
  entityType: SmartReviewEntityType;
  entityId: string;
  gameId: "monkeytype";
  activityType: string;
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: boolean;
  userAnswer: string;
  expectedAnswer: string;
  errorType?: string;
};

const GOALS = new Set<SmartReviewGoal>([
  "remember-words",
  "spelling",
  "listening",
  "grammar",
  "sentence-building",
  "mixed",
]);

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown, max = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFC").trim();
  if (normalized === "" || normalized.length > max) return undefined;
  return normalized;
}

function normalizeAcceptedAnswers(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) {
    throw new TypeError("review acceptedAnswers is invalid");
  }
  const values: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const answer = optionalString(raw);
    if (answer === undefined) {
      throw new TypeError("review acceptedAnswers contains invalid text");
    }
    const key = answer.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(answer);
  }
  return values.length === 0 ? undefined : values;
}

function parseReviewContext(value: unknown): SmartReviewContext | undefined {
  if (value === undefined) return undefined;
  if (!plainObject(value)) {
    throw new TypeError("reviewContext is invalid");
  }

  const activityType = optionalString(value["activityType"], 64);
  const expectedAnswer = optionalString(value["expectedAnswer"]);
  const userAnswer = optionalString(value["userAnswer"]);
  const errorType = optionalString(value["errorType"], 64);

  return {
    ...(activityType === undefined ? {} : { activityType }),
    ...(expectedAnswer === undefined ? {} : { expectedAnswer }),
    ...(userAnswer === undefined ? {} : { userAnswer }),
    ...(errorType === undefined ? {} : { errorType }),
  };
}

function goalSupportsEntity(
  goal: SmartReviewGoal,
  entityType: SmartReviewEntityType,
): boolean {
  if (
    goal === "remember-words" ||
    goal === "spelling" ||
    goal === "listening"
  ) {
    return entityType === "vocabulary";
  }
  if (goal === "grammar") return entityType === "grammar";
  if (goal === "sentence-building") return entityType === "sentence";
  return true;
}

export function parseSmartReviewDataset(value: unknown): SmartReviewDataset | null {
  if (
    !plainObject(value) ||
    value["type"] !== "typing-game:learning:v1:review-dataset"
  ) {
    return null;
  }

  if (value["version"] !== 1) {
    throw new TypeError("review dataset version is invalid");
  }

  const requestId = value["requestId"];
  if (
    typeof requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId)
  ) {
    throw new TypeError("review requestId is invalid");
  }

  const goal = value["goal"];
  if (typeof goal !== "string" || !GOALS.has(goal as SmartReviewGoal)) {
    throw new TypeError("review goal is invalid");
  }
  const typedGoal = goal as SmartReviewGoal;

  const rawItems = value["items"];
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 100) {
    throw new TypeError("review items must contain 1 to 100 items");
  }

  const items: SmartReviewDatasetItem[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    if (!plainObject(raw)) throw new TypeError("review item is invalid");

    const entityType = raw["entityType"];
    if (
      entityType !== "vocabulary" &&
      entityType !== "grammar" &&
      entityType !== "sentence"
    ) {
      throw new TypeError("review entityType is invalid");
    }
    if (!goalSupportsEntity(typedGoal, entityType)) {
      throw new TypeError(
        `review goal ${typedGoal} does not support ${entityType}`,
      );
    }

    const entityId = optionalString(raw["entityId"], 200);
    if (entityId === undefined) {
      throw new TypeError("review entityId is invalid");
    }

    const canonicalEntityId =
      entityType === "vocabulary" ? normalizePhrase(entityId) : entityId;
    const key = `${entityType}:${canonicalEntityId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const mastery =
      typeof raw["mastery"] === "number" && Number.isFinite(raw["mastery"])
        ? raw["mastery"]
        : undefined;
    const reviewPriority =
      typeof raw["reviewPriority"] === "number" &&
      Number.isFinite(raw["reviewPriority"])
        ? raw["reviewPriority"]
        : undefined;

    items.push({
      entityType,
      entityId: canonicalEntityId,
      ...(mastery === undefined ? {} : { mastery }),
      ...(reviewPriority === undefined ? {} : { reviewPriority }),
      ...(normalizeAcceptedAnswers(raw["acceptedAnswers"]) === undefined
        ? {}
        : { acceptedAnswers: normalizeAcceptedAnswers(raw["acceptedAnswers"]) }),
      ...(parseReviewContext(raw["reviewContext"]) === undefined
        ? {}
        : { reviewContext: parseReviewContext(raw["reviewContext"]) }),
    });
  }

  if (items.length === 0) throw new TypeError("review dataset is empty");

  const createdAt = optionalString(value["createdAt"], 80);
  return {
    version: 1,
    type: "typing-game:learning:v1:review-dataset",
    requestId,
    ...(createdAt === undefined ? {} : { createdAt }),
    goal: typedGoal,
    items,
  };
}

function mixedVocabularyActivity(item: SmartReviewDatasetItem): SmartReviewActivity {
  const activity = item.reviewContext?.activityType?.toLowerCase() ?? "";
  const errorType = item.reviewContext?.errorType?.toLowerCase() ?? "";
  if (activity.includes("listen")) return "listening";
  if (errorType === "spelling") return "spelling";
  return "remember";
}

export function activityForReviewItem(
  goal: SmartReviewGoal,
  item: SmartReviewDatasetItem,
): SmartReviewActivity {
  if (item.entityType === "grammar") return "grammar";
  if (item.entityType === "sentence") return "sentence-building";

  if (goal === "listening") return "listening";
  if (goal === "spelling") return "spelling";
  if (goal === "remember-words") return "remember";
  return mixedVocabularyActivity(item);
}

function grammarAnswers(
  item: SmartReviewDatasetItem,
  grammar: VocabularyGrammarModule,
): string[] {
  const expected = item.reviewContext?.expectedAnswer;
  if (expected !== undefined) return [expected];

  const answers = grammar.signalTokens
    .map((value) => normalizePhrase(value))
    .filter(Boolean);
  if (answers.length === 0) {
    throw new Error(
      `Grammar module ${grammar.id} has no reviewable shared signal tokens`,
    );
  }
  return answers;
}

function sentenceAnswers(item: SmartReviewDatasetItem): string[] {
  const answers = [...(item.acceptedAnswers ?? [])];
  const expected = item.reviewContext?.expectedAnswer;
  if (expected !== undefined) answers.push(expected);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const normalized = answer
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("en-US");
    if (normalized === "" || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(answer);
  }

  if (unique.length === 0) {
    throw new Error(
      `Sentence ${item.entityId} has no accepted answer in learning memory`,
    );
  }
  return unique;
}

export async function prepareSmartReviewItems(
  dataset: SmartReviewDataset,
): Promise<SmartReviewPreparedItem[]> {
  const vocabularyIds = dataset.items
    .filter((item) => item.entityType === "vocabulary")
    .map((item) => item.entityId);

  if (vocabularyIds.length > 0) {
    const prepared = await prepareReviewDictionary(vocabularyIds);
    if (prepared.entries !== vocabularyIds.length) {
      throw new Error(
        `Shared vocabulary resolved ${prepared.entries}/${vocabularyIds.length} Smart Review items`,
      );
    }
  }

  const grammarIndex = dataset.items.some(
    (item) => item.entityType === "grammar",
  )
    ? await loadVocabularyGrammarIndex()
    : null;
  const grammarById = new Map(
    (grammarIndex?.modules ?? []).map((module) => [module.id, module]),
  );

  return dataset.items.map((item): SmartReviewPreparedItem => {
    const activity = activityForReviewItem(dataset.goal, item);

    if (item.entityType === "vocabulary") {
      const vocabulary = getCachedVocabularyEntry(item.entityId);
      if (vocabulary === null) {
        throw new Error(`Shared vocabulary metadata missing for ${item.entityId}`);
      }
      return {
        source: item,
        activity,
        title:
          activity === "listening"
            ? "Listen and type"
            : activity === "spelling"
              ? "Spelling"
              : "Remember the word",
        prompt:
          activity === "listening"
            ? "Listen to the pronunciation and type the English word."
            : vocabulary.vi,
        secondary: vocabulary.ipa,
        expectedAnswers: [vocabulary.en],
        vocabulary,
      };
    }

    if (item.entityType === "grammar") {
      const grammar = grammarById.get(item.entityId);
      if (grammar === undefined) {
        throw new Error(`Shared grammar module not found: ${item.entityId}`);
      }
      const expectedAnswers = grammarAnswers(item, grammar);
      const prior = item.reviewContext?.userAnswer;
      return {
        source: item,
        activity: "grammar",
        title: `Grammar · ${grammar.label}`,
        prompt:
          prior === undefined
            ? `Type one correct form or signal for: ${grammar.focus.join(", ")}`
            : `Correct your previous answer: ${prior}`,
        secondary: grammar.focus.join(" · "),
        expectedAnswers,
        grammar,
      };
    }

    const expectedAnswers = sentenceAnswers(item);
    const classifiedAnswers =
      item.reviewContext?.userAnswer !== undefined &&
      item.reviewContext?.errorType !== undefined
        ? [
            {
              answer: item.reviewContext.userAnswer,
              errorType: item.reviewContext.errorType as SentenceBuilderErrorType,
            },
          ]
        : undefined;
    const sentenceExercise: SentenceBuilderExercise = {
      version: 1,
      sentenceId: item.entityId,
      acceptedAnswers: expectedAnswers,
      difficulty: "normal",
      ...(classifiedAnswers === undefined ? {} : { classifiedAnswers }),
    };
    const layout = buildSentenceBuilderLayout(sentenceExercise);

    return {
      source: item,
      activity: "sentence-building",
      title: "Sentence building",
      prompt:
        item.reviewContext?.userAnswer === undefined
          ? "Build a valid sentence from the shuffled units."
          : `Rebuild after this previous answer: ${item.reviewContext.userAnswer}`,
      secondary:
        layout.units.length === 0
          ? ""
          : `${layout.units.length} shuffled units`,
      expectedAnswers,
      sentenceExercise,
    };
  });
}

export function smartReviewSentenceUnits(
  item: SmartReviewPreparedItem,
  random: () => number = Math.random,
): string[] {
  if (item.sentenceExercise === undefined) return [];
  return buildSentenceBuilderLayout(item.sentenceExercise, random).units;
}

export function validateSmartReviewAnswer(
  item: SmartReviewPreparedItem,
  answer: string,
): SmartReviewValidation {
  if (item.sentenceExercise !== undefined) {
    const validation = validateSentenceBuilderAnswer(
      item.sentenceExercise,
      answer,
    );
    return {
      correct: validation.correct,
      ...(validation.matchedAnswer === undefined
        ? {}
        : { matchedAnswer: validation.matchedAnswer }),
      ...(validation.errorType === undefined
        ? {}
        : { errorType: validation.errorType }),
    };
  }

  const normalizedAnswer = normalizePhrase(answer);
  const matchedAnswer = item.expectedAnswers.find(
    (expected) => normalizePhrase(expected) === normalizedAnswer,
  );
  if (matchedAnswer !== undefined) {
    return { correct: true, matchedAnswer };
  }

  if (item.source.entityType === "grammar") {
    return {
      correct: false,
      errorType:
        item.source.reviewContext?.errorType ??
        (item.source.entityId.startsWith("time.")
          ? "wrong-tense"
          : "wrong-form"),
    };
  }

  return {
    correct: false,
    ...(item.activity === "spelling" ? { errorType: "spelling" } : {}),
  };
}

function activityTypeFor(item: SmartReviewPreparedItem): string {
  if (item.activity === "remember") return "recall";
  if (item.activity === "spelling") return "typing";
  if (item.activity === "listening") return "listen";
  if (item.activity === "grammar") return "cloze";
  return "sentence-builder";
}

export function buildSmartReviewLearningEvent(options: {
  item: SmartReviewPreparedItem;
  answer: string;
  validation: SmartReviewValidation;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: boolean;
  occurredAt?: string;
}): SmartReviewLearningEvent {
  const expectedAnswer =
    options.validation.matchedAnswer ?? options.item.expectedAnswers[0];
  if (expectedAnswer === undefined) {
    throw new Error("Smart Review item has no expected answer");
  }

  return {
    version: 1,
    entityType: options.item.source.entityType,
    entityId: options.item.source.entityId,
    gameId: "monkeytype",
    activityType: activityTypeFor(options.item),
    result: options.validation.correct ? "correct" : "wrong",
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
}

export function smartReviewHint(
  item: SmartReviewPreparedItem,
  revealedCharacters: number,
): { revealed: string; nextRevealedCharacters: number } {
  const target = item.expectedAnswers[0] ?? "";
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
