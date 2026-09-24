import {
  parseSentenceBuilderExercise,
  type SentenceBuilderDifficulty,
  type SentenceBuilderExercise,
} from "./sentence-builder";

const STORAGE_KEY = "personalSentenceBuilderExerciseV1";

export type SentenceBuilderDraft = {
  sentenceId: string;
  grammarId: string;
  prompt: string;
  meaning: string;
  acceptedAnswers: string;
  difficulty: SentenceBuilderDifficulty;
  distractors: string;
  grammarHint: string;
  classifiedAnswers: string;
};

export function loadSentenceBuilderExercise(): SentenceBuilderExercise | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseSentenceBuilderExercise(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSentenceBuilderExercise(
  exercise: SentenceBuilderExercise,
): void {
  const parsed = parseSentenceBuilderExercise(exercise);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
}

export function exerciseToDraft(
  exercise: SentenceBuilderExercise | null,
): SentenceBuilderDraft {
  if (exercise === null) {
    return {
      sentenceId: "custom-sentence-1",
      grammarId: "",
      prompt: "Build a natural English sentence.",
      meaning: "",
      acceptedAnswers: "",
      difficulty: "normal",
      distractors: "",
      grammarHint: "",
      classifiedAnswers: "",
    };
  }

  return {
    sentenceId: exercise.sentenceId,
    grammarId: exercise.grammarId ?? "",
    prompt: exercise.prompt ?? "",
    meaning: exercise.meaning ?? "",
    acceptedAnswers: exercise.acceptedAnswers.join("\n"),
    difficulty: exercise.difficulty,
    distractors: (exercise.distractors ?? []).join(", "),
    grammarHint: exercise.grammarHint ?? "",
    classifiedAnswers: (exercise.classifiedAnswers ?? [])
      .map((item) => `${item.answer} => ${item.errorType}`)
      .join("\n"),
  };
}

export function draftToExercise(
  draft: SentenceBuilderDraft,
): SentenceBuilderExercise {
  return parseSentenceBuilderExercise({
    version: 1,
    sentenceId: draft.sentenceId,
    ...(draft.grammarId.trim() === "" ? {} : { grammarId: draft.grammarId }),
    ...(draft.prompt.trim() === "" ? {} : { prompt: draft.prompt }),
    ...(draft.meaning.trim() === "" ? {} : { meaning: draft.meaning }),
    acceptedAnswers: draft.acceptedAnswers
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean),
    difficulty: draft.difficulty,
    distractors: draft.distractors
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...(draft.grammarHint.trim() === ""
      ? {}
      : { grammarHint: draft.grammarHint }),
    classifiedAnswers: draft.classifiedAnswers
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.lastIndexOf("=>");
        if (separator < 0) {
          throw new TypeError(
            "Classified answers must use: answer => error-type",
          );
        }
        return {
          answer: line.slice(0, separator).trim(),
          errorType: line.slice(separator + 2).trim(),
        };
      }),
  });
}
