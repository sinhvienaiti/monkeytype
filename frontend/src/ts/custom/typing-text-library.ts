import {
  PassageShuffleBag,
  type PassageShuffleState,
} from "./typing-text-shuffle";

const BASE_URL = "https://typing-game.local/typing-texts";
const SETTINGS_KEY = "personalTypingTextLibrarySettings";
const PROGRESS_KEY = "personalTypingTextLibraryProgress";

export type TypingTextSource = "custom" | "level";

export type TypingTextSettings = {
  source: TypingTextSource;
  level: number;
  passageCount: number;
};

export type TypingTextLevelMeta = {
  level: number;
  cefr: string;
  file: string;
  passageCount: number;
  wordCount: number;
};

export type TypingTextIndex = {
  version: 1;
  plannedLevels: number;
  availableLevels: number;
  totalPassages: number;
  totalWords: number;
  levels: TypingTextLevelMeta[];
};

type TypingTextPassage = {
  id: string;
  topic: string;
  style: string;
  setting: string;
  tone: string;
  targetWords: string[];
  wordCount: number;
  text: string;
};

type TypingTextLevel = {
  version: 1;
  level: number;
  cefr: string;
  passages: TypingTextPassage[];
};

type SavedLevelProgress = PassageShuffleState & {
  signature: string;
};

type ProgressStore = {
  version: 1;
  levels: Record<string, SavedLevelProgress>;
};

const defaultSettings: TypingTextSettings = {
  source: "custom",
  level: 1,
  passageCount: 1,
};

let indexCache: TypingTextIndex | null = null;
const levelCache = new Map<number, TypingTextLevel>();

function validInteger(
  value: unknown,
  min: number,
  max: number,
): number | null {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  )
    ? value
    : null;
}

export function loadTypingTextSettings(): TypingTextSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return { ...defaultSettings };

    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      source: data["source"] === "level" ? "level" : "custom",
      level: validInteger(data["level"], 1, 100) ?? defaultSettings.level,
      passageCount:
        validInteger(data["passageCount"], 1, 15) ??
        defaultSettings.passageCount,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveTypingTextSettings(
  settings: TypingTextSettings,
): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function isLevelMeta(value: unknown): value is TypingTextLevelMeta {
  if (value === null || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;

  return (
    validInteger(data["level"], 1, 100) !== null &&
    typeof data["cefr"] === "string" &&
    typeof data["file"] === "string" &&
    validInteger(data["passageCount"], 0, 1000) !== null &&
    validInteger(data["wordCount"], 0, 1000000) !== null
  );
}

export async function loadTypingTextIndex(): Promise<TypingTextIndex> {
  if (indexCache !== null) return indexCache;

  const response = await fetch(`${BASE_URL}/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(
      `Typing-text index request failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as TypingTextIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.levels) ||
    !data.levels.every(isLevelMeta)
  ) {
    throw new Error("Typing-text index is invalid");
  }

  indexCache = data;
  return data;
}

function isPassage(value: unknown): value is TypingTextPassage {
  if (value === null || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;

  return (
    typeof data["id"] === "string" &&
    data["id"].trim() !== "" &&
    Array.isArray(data["targetWords"]) &&
    typeof data["wordCount"] === "number" &&
    typeof data["text"] === "string" &&
    data["text"].trim() !== ""
  );
}

async function loadTypingTextLevel(
  level: number,
  index: TypingTextIndex,
): Promise<TypingTextLevel> {
  const cached = levelCache.get(level);
  if (cached !== undefined) return cached;

  const metadata = index.levels.find((item) => item.level === level);
  if (metadata === undefined) {
    throw new Error(
      `Typing-text level ${level} is unavailable`,
    );
  }

  const response = await fetch(`${BASE_URL}/${metadata.file}`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(
      `Typing-text level request failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as TypingTextLevel;
  if (
    data.version !== 1 ||
    data.level !== level ||
    !Array.isArray(data.passages) ||
    !data.passages.every(isPassage)
  ) {
    throw new Error(
      `Typing-text level ${level} is invalid`,
    );
  }

  const uniqueIds = new Set(
    data.passages.map((passage) => passage.id),
  );
  if (uniqueIds.size !== data.passages.length) {
    throw new Error(
      `Typing-text level ${level} has duplicate passage ids`,
    );
  }

  levelCache.set(level, data);
  return data;
}

function emptyProgress(): ProgressStore {
  return { version: 1, levels: {} };
}

function loadProgress(): ProgressStore {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw === null) return emptyProgress();

    const data = JSON.parse(raw) as Partial<ProgressStore>;
    if (
      data.version !== 1 ||
      data.levels === null ||
      typeof data.levels !== "object"
    ) {
      return emptyProgress();
    }

    return {
      version: 1,
      levels: data.levels,
    };
  } catch {
    return emptyProgress();
  }
}

function saveProgress(progress: ProgressStore): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function passageSignature(document: TypingTextLevel): string {
  return document.passages
    .map((passage) => passage.id)
    .join("|");
}

export async function prepareLevelPassageText(
  level: number,
  passageCount: number,
): Promise<{
  level: number;
  passageIds: string[];
  text: string;
}> {
  const index = await loadTypingTextIndex();
  const document = await loadTypingTextLevel(level, index);

  if (document.passages.length === 0) {
    throw new Error(
      `Typing-text level ${level} has no passages`,
    );
  }

  const count = Math.min(
    15,
    document.passages.length,
    Math.max(1, Math.floor(passageCount)),
  );
  const ids = document.passages.map((passage) => passage.id);
  const signature = passageSignature(document);
  const progress = loadProgress();
  const key = String(level);
  const saved = progress.levels[key];
  const state =
    saved?.signature === signature
      ? {
          remainingIds: saved.remainingIds,
          lastId: saved.lastId,
        }
      : undefined;

  const bag = new PassageShuffleBag(ids, state);
  const passageIds = bag.take(count);
  const passageById = new Map(
    document.passages.map((passage) => [
      passage.id,
      passage,
    ]),
  );
  const passages = passageIds
    .map((id) => passageById.get(id))
    .filter(
      (passage): passage is TypingTextPassage =>
        passage !== undefined,
    );

  if (passages.length !== count) {
    throw new Error("Typing-text passage selection is incomplete");
  }

  progress.levels[key] = {
    signature,
    ...bag.snapshot(),
  };
  saveProgress(progress);

  return {
    level,
    passageIds,
    text: passages.map((passage) => passage.text).join(" "),
  };
}
