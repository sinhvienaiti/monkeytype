import { Config } from "../config/store";
import { restartTestEvent } from "../events/test";
import * as TestWords from "../test/test-words";
import {
  findDictionaryMatches,
  parseDictionary,
} from "../custom/en-vn-translation/dictionary";
import { getActiveDictionaryRaw } from "../custom/en-vn-translation/library";
import { getSettings } from "../custom/en-vn-translation/store";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const PARENT_ORIGIN = "https://typing-game.local";
const GAME_ID = "monkeytype";

type LearningAttemptEvent = {
  version: 1;
  entityType: "vocabulary";
  entityId: string;
  gameId: typeof GAME_ID;
  activityType: "typing" | "learn" | "recall" | "listen";
  result: "correct" | "wrong";
  occurredAt: string;
  responseMs?: number;
  hintUsed: boolean;
  replayUsed: boolean;
  userAnswer?: string;
  expectedAnswer?: string;
};

type LearningMatch = {
  key: string;
  source: string;
  startWordIndex: number;
  endWordIndex: number;
  expectedAnswer: string;
};

type AttemptState = {
  allCorrect: boolean;
  userParts: string[];
  presentedAt?: number;
  hintUsed: boolean;
  replayUsed: boolean;
};

let cachedDictionaryRaw = "";
let cachedWordCount = -1;
let cachedMatchesByWord = new Map<number, LearningMatch>();
let cachedMatchesByStart = new Map<number, LearningMatch>();
let attemptStates = new Map<string, AttemptState>();
let requestSequence = 0;

function resetCache(): void {
  cachedDictionaryRaw = "";
  cachedWordCount = -1;
  cachedMatchesByWord = new Map();
  cachedMatchesByStart = new Map();
  attemptStates = new Map();
}

function activeDictionaryRaw(): string {
  const settings = getSettings();
  return getActiveDictionaryRaw(
    settings.dictionarySource,
    settings.dictionary,
    settings.dictionaryTopicId,
    settings.dictionaryPosId,
    settings.dictionaryGrammarId,
  );
}

function rebuildMatchesIfNeeded(): void {
  const settings = getSettings();
  const dictionaryRaw = activeDictionaryRaw();
  const wordCount = TestWords.words.length;

  if (
    cachedDictionaryRaw === dictionaryRaw &&
    cachedWordCount === wordCount
  ) {
    return;
  }

  cachedDictionaryRaw = dictionaryRaw;
  cachedWordCount = wordCount;
  cachedMatchesByWord = new Map();
  cachedMatchesByStart = new Map();
  attemptStates = new Map();

  if (
    Config.mode !== "custom" ||
    !settings.enabled ||
    dictionaryRaw.trim() === ""
  ) {
    return;
  }

  const words = TestWords.words.get().map((word) => word.text);
  const matches = findDictionaryMatches(words, parseDictionary(dictionaryRaw));

  for (const match of matches) {
    const endWordIndex = match.startWordIndex + match.wordCount - 1;
    const learningMatch: LearningMatch = {
      key: `${match.startWordIndex}:${endWordIndex}:${match.source}`,
      source: match.source,
      startWordIndex: match.startWordIndex,
      endWordIndex,
      expectedAnswer: words
        .slice(match.startWordIndex, endWordIndex + 1)
        .join(" "),
    };

    cachedMatchesByStart.set(match.startWordIndex, learningMatch);
    for (let index = match.startWordIndex; index <= endWordIndex; index++) {
      cachedMatchesByWord.set(index, learningMatch);
    }
  }
}

function stateFor(match: LearningMatch): AttemptState {
  const existing = attemptStates.get(match.key);
  if (existing !== undefined) return existing;

  const state: AttemptState = {
    allCorrect: true,
    userParts: [],
    hintUsed: false,
    replayUsed: false,
  };
  attemptStates.set(match.key, state);
  return state;
}

function stripCommit(input: string, wordIndex: number): string {
  const commit = TestWords.words.get(wordIndex)?.commit ?? "";
  return commit !== "" && input.endsWith(commit)
    ? input.slice(0, -commit.length)
    : input;
}

function currentActivityType(): LearningAttemptEvent["activityType"] {
  const mode = getSettings().learningMode;
  if (mode === "learn" || mode === "recall" || mode === "listen") return mode;
  return "typing";
}

function postAttempt(event: LearningAttemptEvent): void {
  if (typeof window === "undefined" || window.parent === window) return;

  requestSequence++;
  window.parent.postMessage(
    {
      type: LEARNING_ATTEMPT_MESSAGE,
      requestId: `monkeytype-${Date.now().toString(36)}-${requestSequence.toString(36)}`,
      event,
    },
    PARENT_ORIGIN,
  );
}

export function markLearningMatchPresented(
  wordIndex: number,
  now = performance.now(),
): void {
  rebuildMatchesIfNeeded();
  const match = cachedMatchesByStart.get(wordIndex);
  if (match === undefined) return;

  const state = stateFor(match);
  state.presentedAt ??= now;
}

export function markLearningHintUsed(wordIndex: number): void {
  rebuildMatchesIfNeeded();
  const match = cachedMatchesByWord.get(wordIndex);
  if (match === undefined) return;
  stateFor(match).hintUsed = true;
}

export function markLearningReplayUsed(wordIndex: number): void {
  rebuildMatchesIfNeeded();
  const match = cachedMatchesByWord.get(wordIndex);
  if (match === undefined) return;
  stateFor(match).replayUsed = true;
}

export function recordLearningWordCompletion(options: {
  wordIndex: number;
  input: string;
  correct: boolean;
  now?: number;
}): LearningAttemptEvent | null {
  rebuildMatchesIfNeeded();

  const match = cachedMatchesByWord.get(options.wordIndex);
  if (match === undefined) return null;

  const state = stateFor(match);
  state.allCorrect &&= options.correct;
  state.userParts.push(stripCommit(options.input, options.wordIndex));

  if (options.wordIndex !== match.endWordIndex) return null;

  const now = options.now ?? performance.now();
  const responseMs =
    state.presentedAt === undefined
      ? undefined
      : Math.max(0, Math.round(now - state.presentedAt));

  const event: LearningAttemptEvent = {
    version: 1,
    entityType: "vocabulary",
    entityId: match.source,
    gameId: GAME_ID,
    activityType: currentActivityType(),
    result: state.allCorrect ? "correct" : "wrong",
    occurredAt: new Date().toISOString(),
    ...(responseMs === undefined ? {} : { responseMs }),
    hintUsed: state.hintUsed,
    replayUsed: state.replayUsed,
    userAnswer: state.userParts.join(" "),
    expectedAnswer: match.expectedAnswer,
  };

  attemptStates.delete(match.key);
  postAttempt(event);
  return event;
}

restartTestEvent.subscribe(() => {
  resetCache();
});

export const __testing = {
  reset: resetCache,
};
