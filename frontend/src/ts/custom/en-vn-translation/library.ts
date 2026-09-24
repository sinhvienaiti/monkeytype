import { normalizePhrase } from "./dictionary";

const BASE_URL = "https://typing-game.local/vocabulary";
const CACHE_KEY = "personalEnVnLibraryDictionaryCache";

type VocabularyLookup = {
  version: 1;
  totalEntries: number;
  maxWordCount: number;
  entries: Record<string, number>;
};

type VocabularyEntry = {
  id: string;
  en: string;
  vi: string;
  ipa: string;
};

type VocabularyLevel = {
  version: 1;
  level: number;
  label: string;
  entries: VocabularyEntry[];
};

export type VocabularyTopicMeta = {
  id: string;
  label: string;
  group: string;
  levels: string[];
  count: number;
  keys: string[];
};

export type VocabularyTopicIndex = {
  version: 1;
  totalGroups: number;
  totalTopics: number;
  uniqueVocabularyKeys: number;
  topics: VocabularyTopicMeta[];
};

let lookupCache: VocabularyLookup | null = null;
let topicIndexCache: VocabularyTopicIndex | null = null;
let libraryDictionaryRaw = "";
let topicDictionaryRaw = "";
let topicDictionaryId = "";
let cacheLoaded = false;

function readCachedDictionaries(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return;
    const data = JSON.parse(raw) as Record<string, unknown>;

    // Backward compatibility with the old single Library cache.
    if (typeof data["dictionary"] === "string") {
      libraryDictionaryRaw = data["dictionary"];
    }
    if (typeof data["libraryDictionary"] === "string") {
      libraryDictionaryRaw = data["libraryDictionary"];
    }
    if (typeof data["topicDictionary"] === "string") {
      topicDictionaryRaw = data["topicDictionary"];
    }
    if (typeof data["topicId"] === "string") {
      topicDictionaryId = data["topicId"];
    }
  } catch {
    // Ignore malformed local cache; it can be rebuilt on the next submit.
  }
}

function writeCachedDictionaries(): void {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      libraryDictionary: libraryDictionaryRaw,
      topicDictionary: topicDictionaryRaw,
      topicId: topicDictionaryId,
    }),
  );
}

async function loadLookup(): Promise<VocabularyLookup> {
  if (lookupCache !== null) return lookupCache;

  const response = await fetch(`${BASE_URL}/lookup.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary lookup request failed: ${response.status}`);
  }

  const data = (await response.json()) as VocabularyLookup;
  if (
    data.version !== 1 ||
    typeof data.maxWordCount !== "number" ||
    data.entries === null ||
    typeof data.entries !== "object"
  ) {
    throw new Error("Vocabulary lookup is invalid");
  }

  lookupCache = data;
  return data;
}

function isTopicMeta(value: unknown): value is VocabularyTopicMeta {
  if (value === null || typeof value !== "object") return false;
  const topic = value as Record<string, unknown>;
  return (
    typeof topic["id"] === "string" &&
    topic["id"].trim() !== "" &&
    typeof topic["label"] === "string" &&
    topic["label"].trim() !== "" &&
    typeof topic["group"] === "string" &&
    Array.isArray(topic["levels"]) &&
    Array.isArray(topic["keys"]) &&
    topic["keys"].every((key) => typeof key === "string" && key.trim() !== "") &&
    typeof topic["count"] === "number" &&
    Number.isInteger(topic["count"]) &&
    topic["count"] > 0
  );
}

export async function loadVocabularyTopicIndex(): Promise<VocabularyTopicIndex> {
  if (topicIndexCache !== null) return topicIndexCache;

  const response = await fetch(`${BASE_URL}/topics/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(
      `Vocabulary topic index request failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as VocabularyTopicIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.topics) ||
    data.topics.length === 0 ||
    !data.topics.every(isTopicMeta)
  ) {
    throw new Error("Vocabulary topic index is invalid");
  }

  topicIndexCache = data;
  return data;
}

async function loadLevel(level: number): Promise<VocabularyLevel> {
  const file = String(level).padStart(3, "0");
  const response = await fetch(`${BASE_URL}/levels/${file}.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(
      `Vocabulary level ${level} request failed: ${response.status}`,
    );
  }

  const data = (await response.json()) as VocabularyLevel;
  if (
    data.version !== 1 ||
    data.level !== level ||
    !Array.isArray(data.entries)
  ) {
    throw new Error(`Vocabulary level ${level} is invalid`);
  }
  return data;
}

function findRequiredLevels(
  sourceText: string,
  lookup: VocabularyLookup,
): Set<number> {
  const words = normalizePhrase(sourceText.replaceAll("|", " "))
    .split(" ")
    .filter(Boolean);
  const levels = new Set<number>();

  for (let index = 0; index < words.length; ) {
    let matched = false;
    const max = Math.min(lookup.maxWordCount, words.length - index);

    for (let count = max; count >= 1; count--) {
      const phrase = words.slice(index, index + count).join(" ");
      const level = lookup.entries[phrase];
      if (level === undefined) continue;

      levels.add(level);
      index += count;
      matched = true;
      break;
    }

    if (!matched) index++;
  }

  return levels;
}

function dictionaryLinesForKeys(
  keys: readonly string[],
  documents: readonly VocabularyLevel[],
): string[] {
  const byKey = new Map<string, VocabularyEntry>();

  for (const document of documents) {
    for (const entry of document.entries) {
      byKey.set(normalizePhrase(entry.en), entry);
    }
  }

  return keys.flatMap((key) => {
    const entry = byKey.get(normalizePhrase(key));
    return entry === undefined ? [] : [`${entry.en} = ${entry.vi}`];
  });
}

export async function prepareLibraryDictionary(
  sourceText: string,
): Promise<{ entries: number; levels: number[] }> {
  const lookup = await loadLookup();
  const levels = [...findRequiredLevels(sourceText, lookup)].sort(
    (left, right) => left - right,
  );

  const documents = await Promise.all(levels.map(loadLevel));
  const keys = documents.flatMap((document) =>
    document.entries
      .map((entry) => normalizePhrase(entry.en))
      .filter((key) => lookup.entries[key] === document.level),
  );
  const lines = dictionaryLinesForKeys(keys, documents);

  readCachedDictionaries();
  libraryDictionaryRaw = lines.join("\n");
  writeCachedDictionaries();

  return { entries: lines.length, levels };
}

export async function prepareTopicDictionary(
  topicId: string,
): Promise<{ entries: number; levels: number[]; label: string }> {
  const [lookup, topicIndex] = await Promise.all([
    loadLookup(),
    loadVocabularyTopicIndex(),
  ]);
  const topic = topicIndex.topics.find((item) => item.id === topicId);
  if (topic === undefined) {
    throw new Error(`Vocabulary topic ${topicId} is unavailable`);
  }

  const levels = [
    ...new Set(
      topic.keys
        .map((key) => lookup.entries[normalizePhrase(key)])
        .filter((level): level is number => Number.isInteger(level)),
    ),
  ].sort((left, right) => left - right);

  const documents = await Promise.all(levels.map(loadLevel));
  const lines = dictionaryLinesForKeys(topic.keys, documents);
  if (lines.length === 0) {
    throw new Error(`Vocabulary topic ${topicId} has no available entries`);
  }

  readCachedDictionaries();
  topicDictionaryRaw = lines.join("\n");
  topicDictionaryId = topic.id;
  writeCachedDictionaries();

  return { entries: lines.length, levels, label: topic.label };
}

export function getLibraryDictionaryRaw(): string {
  readCachedDictionaries();
  return libraryDictionaryRaw;
}

export function getTopicDictionaryRaw(topicId: string): string {
  readCachedDictionaries();
  return topicDictionaryId === topicId ? topicDictionaryRaw : "";
}

export function getActiveDictionaryRaw(
  source: "library" | "topic" | "custom",
  customDictionary: string,
  topicId = "",
): string {
  if (source === "library") return getLibraryDictionaryRaw();
  if (source === "topic") return getTopicDictionaryRaw(topicId);
  return customDictionary;
}
