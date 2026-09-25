import { Config } from "../config/store";
import { restartTestEvent } from "../events/test";
import * as TestWords from "../test/test-words";
import {
  findDictionaryMatches,
  parseDictionaryCached,
} from "../custom/en-vn-translation/dictionary";
import { getActiveDictionaryRaw } from "../custom/en-vn-translation/library";
import { getSettings } from "../custom/en-vn-translation/store";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const GAME_ID = "monkeytype";
const PARENT_ORIGIN = "https://typing-game.local";
const PARENT_ORIGIN = "https://typing-game.local";

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
let cachedDictionary: ReturnType<typeof parseDictionary> | null = null;
let cachedWordCount = -1;
let cachedWords: string[] = [];
let cachedMatchesByWord = new Map<number, LearningMatch>();
let cachedMatchesByStart = new Map<number, LearningMatch>();
let attemptStates = new Map<string, AttemptState>();
let requestSequence = 0;

function resetCache(): void {
  cachedDictionaryRaw = "";
  cachedDictionary = null;
  cachedWordCount = -1;
  cachedWords = [];
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

function addMatchesFrom(
  words: string[],
  startWordIndex: number,
): void {
  if (cachedDictionary === null) return;

  const suffixMatches = findDictionaryMatches(
    words.slice(startWordIndex),
    cachedDictionary,
  );

  for (const match of suffixMatches) {
    const absoluteStart = startWordIndex + match.startWordIndex;
    const endWordIndex = absoluteStart + match.wordCount - 1;
    const learningMatch: LearningMatch = {
      key: `${absoluteStart}:${endWordIndex}:${match.source}`,
      source: match.source,
      startWordIndex: absoluteStart,
      endWordIndex,
      expectedAnswer: words.slice(absoluteStart, endWordIndex + 1).join(" "),
    };

    cachedMatchesByStart.set(absoluteStart, learningMatch);
    for (let index = absoluteStart; index <= endWordIndex; index++) {
      cachedMatchesByWord.set(index, learningMatch);
    }
  }
}

function rebuildMatchesIfNeeded(): void {
  const settings = getSettings();
  const dictionaryRaw = activeDictionaryRaw();
  const words = TestWords.words.get().map((word) => word.text);
  const wordCount = words.length;
  const dictionaryChanged = cachedDictionaryRaw !== dictionaryRaw;

  const enabled =
    Config.mode === "custom" &&
    settings.enabled &&
    dictionaryRaw.trim() !== "";

  if (!enabled) {
    cachedDictionaryRaw = dictionaryRaw;
    cachedDictionary = null;
    cachedWordCount = wordCount;
    cachedWords = words;
    cachedMatchesByWord = new Map();
    cachedMatchesByStart = new Map();
    attemptStates = new Map();
    return;
  }

  if (dictionaryChanged) {
    cachedDictionaryRaw = dictionaryRaw;
    cachedDictionary = parseDictionary(dictionaryRaw);
    cachedWordCount = -1;
    cachedWords = [];
    cachedMatchesByWord = new Map();
    cachedMatchesByStart = new Map();
    attemptStates = new Map();
  } else if (cachedDictionary === null) {
    cachedDictionary = parseDictionary(dictionaryRaw);
  }

  const sameWords =
    cachedWords.length === wordCount &&
    cachedWords.every((word, index) => word === words[index]);
  if (sameWords) return;

  const appendOnly =
    cachedWordCount >= 0 &&
    wordCount >= cachedWordCount &&
    cachedWords.every((word, index) => word === words[index]);

  if (!appendOnly) {
    cachedMatchesByWord = new Map();
    cachedMatchesByStart = new Map();
    attemptStates = new Map();
    addMatchesFrom(words, 0);
  } else {
    const maxWordCount = cachedDictionary?.maxWordCount ?? 1;
    const boundary = Math.max(0, cachedWordCount - maxWordCount + 1);
    let recomputeStart = boundary;

    for (const match of cachedMatchesByStart.values()) {
      if (match.endWordIndex >= boundary) {
        recomputeStart = Math.min(recomputeStart, match.startWordIndex);
      }
    }

    for (const [index, match] of [...cachedMatchesByWord]) {
      if (index >= recomputeStart || match.endWordIndex >= recomputeStart) {
        cachedMatchesByWord.delete(index);
      }
    }
    for (const [index, match] of [...cachedMatchesByStart]) {
      if (index >= recomputeStart || match.endWordIndex >= recomputeStart) {
        cachedMatchesByStart.delete(index);
      }
    }

    addMatchesFrom(words, recomputeStart);

    const validKeys = new Set(
      [...cachedMatchesByStart.values()].map((match) => match.key),
    );
    for (const key of [...attemptStates.keys()]) {
      if (!validKeys.has(key)) attemptStates.delete(key);
    }
  }

  cachedWordCount = wordCount;
  cachedWords = words;
}

export function getLearningRecallTargetInfo(): {
  targets: Set<number>;
  starts: Set<number>;
} {
  rebuildMatchesIfNeeded();
  return {
    targets: new Set(cachedMatchesByWord.keys()),
    starts: new Set(cachedMatchesByStart.keys()),
  };
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
