import { normalizePhrase } from "../custom/en-vn-translation/dictionary";
import {
  loadVocabularyGrammarIndex,
  type VocabularyGrammarIndex,
} from "../custom/en-vn-translation/library";
import {
  prepareLevelPassages,
  type TypingTextPassage,
} from "../custom/typing-text-library";

export type ContextClozeEntityType = "vocabulary" | "grammar";

export type ContextClozeExercise = {
  version: 1;
  id: string;
  passageId: string;
  level: number;
  cefr: string;
  topic: string;
  sentence: string;
  maskedSentence: string;
  target: string;
  entityType: ContextClozeEntityType;
  entityId: string;
  grammarId?: string;
};

export type ContextClozeValidation = {
  correct: boolean;
  normalizedAnswer: string;
  errorType?: "spelling" | "wrong-form";
};

export type ContextClozeLearningEvent = {
  version: 1;
  entityType: ContextClozeEntityType;
  entityId: string;
  gameId: "monkeytype";
  activityType: "cloze";
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs: number;
  hintUsed: boolean;
  replayUsed: false;
  userAnswer: string;
  expectedAnswer: string;
  errorType?: "spelling" | "wrong-form";
};

function sentenceChunks(text: string): string[] {
  return (
    text
      .normalize("NFC")
      .match(/[^.!?]+(?:[.!?]+|$)/gu)
      ?.map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
}

function targetRegExp(target: string): RegExp {
  const escaped = escapeRegExp(target.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
}

export function maskContextTarget(
  sentence: string,
  target: string,
): string | null {
  const match = targetRegExp(target).exec(sentence);
  if (match === null || match.index === undefined) return null;

  const prefix = match[1] ?? "";
  const matchedTarget = match[2] ?? "";
  if (matchedTarget === "") return null;

  const targetStart = match.index + prefix.length;
  return (
    sentence.slice(0, targetStart) +
    "____" +
    sentence.slice(targetStart + matchedTarget.length)
  );
}

function vocabularyExercises(
  passage: TypingTextPassage,
  level: number,
  cefr: string,
): ContextClozeExercise[] {
  const sentences = sentenceChunks(passage.text);
  const exercises: ContextClozeExercise[] = [];

  for (const rawTarget of passage.targetWords) {
    const target = normalizePhrase(rawTarget);
    if (target === "") continue;

    for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
      const sentence = sentences[sentenceIndex];
      if (sentence === undefined) continue;
      const maskedSentence = maskContextTarget(sentence, target);
      if (maskedSentence === null) continue;

      exercises.push({
        version: 1,
        id: `${passage.id}:vocab:${target}:${sentenceIndex}`,
        passageId: passage.id,
        level,
        cefr,
        topic: passage.topic,
        sentence,
        maskedSentence,
        target,
        entityType: "vocabulary",
        entityId: target,
      });
      break;
    }
  }

  return exercises;
}

function grammarTokenMap(
  grammar: VocabularyGrammarIndex,
): Array<{ token: string; grammarId: string }> {
  const order = new Map(
    grammar.primaryTimeGroups.map((id, index) => [id, index]),
  );

  return grammar.modules
    .flatMap((module, moduleIndex) =>
      module.signalTokens.map((rawToken) => ({
        token: normalizePhrase(rawToken),
        grammarId: module.id,
        rank:
          order.get(module.id) ??
          grammar.primaryTimeGroups.length + moduleIndex,
      })),
    )
    .filter((item) => item.token !== "")
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        right.token.length - left.token.length ||
        left.token.localeCompare(right.token),
    );
}

function grammarExercises(
  passage: TypingTextPassage,
  level: number,
  cefr: string,
  grammar: VocabularyGrammarIndex,
): ContextClozeExercise[] {
  const sentences = sentenceChunks(passage.text);
  const exercises: ContextClozeExercise[] = [];
  const seenSentenceTargets = new Set<string>();

  for (let sentenceIndex = 0; sentenceIndex < sentences.length; sentenceIndex++) {
    const sentence = sentences[sentenceIndex];
    if (sentence === undefined) continue;

    for (const item of grammarTokenMap(grammar)) {
      const maskedSentence = maskContextTarget(sentence, item.token);
      if (maskedSentence === null) continue;

      const key = `${sentenceIndex}:${item.token}`;
      if (seenSentenceTargets.has(key)) continue;
      seenSentenceTargets.add(key);

      exercises.push({
        version: 1,
        id: `${passage.id}:grammar:${item.grammarId}:${item.token}:${sentenceIndex}`,
        passageId: passage.id,
        level,
        cefr,
        topic: passage.topic,
        sentence,
        maskedSentence,
        target: item.token,
        entityType: "grammar",
        entityId: item.grammarId,
        grammarId: item.grammarId,
      });
    }
  }

  return exercises;
}

function interleave(
  vocabulary: readonly ContextClozeExercise[],
  grammar: readonly ContextClozeExercise[],
  maxExercises: number,
): ContextClozeExercise[] {
  const result: ContextClozeExercise[] = [];
  let vocabularyIndex = 0;
  let grammarIndex = 0;

  while (
    result.length < maxExercises &&
    (vocabularyIndex < vocabulary.length || grammarIndex < grammar.length)
  ) {
    if (vocabularyIndex < vocabulary.length && result.length < maxExercises) {
      const item = vocabulary[vocabularyIndex++];
      if (item !== undefined) result.push(item);
    }
    if (grammarIndex < grammar.length && result.length < maxExercises) {
      const item = grammar[grammarIndex++];
      if (item !== undefined) result.push(item);
    }
  }

  return result;
}

export async function prepareContextClozeExercises(
  level: number,
  passageCount = 1,
  maxExercises = 12,
): Promise<ContextClozeExercise[]> {
  const [prepared, grammar] = await Promise.all([
    prepareLevelPassages(level, passageCount),
    loadVocabularyGrammarIndex(),
  ]);

  const vocabulary = prepared.passages.flatMap((passage) =>
    vocabularyExercises(passage, prepared.level, prepared.cefr),
  );
  const grammarForPassages = prepared.passages.flatMap((passage) =>
    grammarExercises(passage, prepared.level, prepared.cefr, grammar),
  );

  const limit = Math.min(40, Math.max(1, Math.floor(maxExercises)));
  const exercises = interleave(vocabulary, grammarForPassages, limit);
  if (exercises.length === 0) {
    throw new Error(
      `No Context/Cloze exercises could be derived for typing-text level ${level}`,
    );
  }
  return exercises;
}

export function validateContextClozeAnswer(
  exercise: ContextClozeExercise,
  answer: string,
): ContextClozeValidation {
  const normalizedAnswer = normalizePhrase(answer);
  const correct = normalizedAnswer === normalizePhrase(exercise.target);
  return {
    correct,
    normalizedAnswer,
    ...(correct
      ? {}
      : {
          errorType:
            exercise.entityType === "grammar"
              ? ("wrong-form" as const)
              : ("spelling" as const),
        }),
  };
}

export function buildContextClozeLearningEvent(options: {
  exercise: ContextClozeExercise;
  answer: string;
  validation: ContextClozeValidation;
  responseMs: number;
  hintUsed: boolean;
  occurredAt?: string;
}): ContextClozeLearningEvent {
  return {
    version: 1,
    entityType: options.exercise.entityType,
    entityId: options.exercise.entityId,
    gameId: "monkeytype",
    activityType: "cloze",
    result: options.validation.correct ? "correct" : "wrong",
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    responseMs: Math.max(0, Math.round(options.responseMs)),
    hintUsed: options.hintUsed,
    replayUsed: false,
    userAnswer: options.answer,
    expectedAnswer: options.exercise.target,
    ...(options.validation.errorType === undefined
      ? {}
      : { errorType: options.validation.errorType }),
  };
}

export function contextClozeHint(
  exercise: ContextClozeExercise,
  revealedCharacters: number,
): { revealed: string; nextRevealedCharacters: number } {
  const characters = Array.from(exercise.target);
  const next = Math.min(
    characters.length,
    Math.max(0, revealedCharacters) + 1,
  );
  return {
    revealed: characters.slice(0, next).join(""),
    nextRevealedCharacters: next,
  };
}
