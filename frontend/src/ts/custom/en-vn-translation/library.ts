import { normalizePhrase } from "./dictionary";

const BASE_URL = "https://typing-game.local/vocabulary";
const CACHE_KEY = "personalEnVnLibraryDictionaryCache";

type VocabularyLookup = {
  version: 1;
  totalEntries: number;
  maxWordCount: number;
  entries: Record<string, number>;
};

export type VocabularyEntry = {
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

export type VocabularyTopicEntry = {
  key: string;
  level: number;
};

export type VocabularyTopicMeta = {
  id: string;
  label: string;
  group: string;
  groupLabel?: string;
  levels: string[];
  count: number;
  keys: string[];
  entries?: VocabularyTopicEntry[];
};

export type VocabularyTopicIndex = {
  version: 1;
  totalGroups: number;
  totalTopics: number;
  uniqueVocabularyKeys: number;
  topics: VocabularyTopicMeta[];
};

export type VocabularyPosCategory = {
  id: string;
  tokens: string[];
  entries: VocabularyTopicEntry[];
  missing: string[];
};

export type VocabularyPosIndex = {
  version: 1;
  categories: VocabularyPosCategory[];
};

export type VocabularyGrammarModule = {
  id: string;
  label: string;
  group: string;
  focus: string[];
  topicIds: string[];
  signalTokens: string[];
  signalEntries: VocabularyTopicEntry[];
  missingSignalKeys: string[];
};

export type VocabularyGrammarIndex = {
  version: 1;
  primaryTimeGroups: string[];
  modules: VocabularyGrammarModule[];
};

let lookupCache: VocabularyLookup | null = null;
let topicIndexCache: VocabularyTopicIndex | null = null;
let posIndexCache: VocabularyPosIndex | null = null;
let grammarIndexCache: VocabularyGrammarIndex | null = null;
const levelCache = new Map<number, Promise<VocabularyLevel>>();
const entryMetadataCache = new Map<string, VocabularyEntry>();
let libraryDictionaryRaw = "";
let topicDictionaryRaw = "";
let topicDictionaryId = "";
let posDictionaryRaw = "";
let posDictionaryId = "";
let grammarDictionaryRaw = "";
let grammarDictionaryId = "";
let reviewDictionaryRaw = "";
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
    if (typeof data["posDictionary"] === "string") {
      posDictionaryRaw = data["posDictionary"];
    }
    if (typeof data["posId"] === "string") {
      posDictionaryId = data["posId"];
    }
    if (typeof data["grammarDictionary"] === "string") {
      grammarDictionaryRaw = data["grammarDictionary"];
    }
    if (typeof data["grammarId"] === "string") {
      grammarDictionaryId = data["grammarId"];
    }
    if (typeof data["reviewDictionary"] === "string") {
      reviewDictionaryRaw = data["reviewDictionary"];
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
      posDictionary: posDictionaryRaw,
      posId: posDictionaryId,
      grammarDictionary: grammarDictionaryRaw,
      grammarId: grammarDictionaryId,
      reviewDictionary: reviewDictionaryRaw,
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

function isReference(value: unknown): value is VocabularyTopicEntry {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["key"] === "string" &&
    item["key"].trim() !== "" &&
    typeof item["level"] === "number" &&
    Number.isInteger(item["level"]) &&
    item["level"] >= 1 &&
    item["level"] <= 100
  );
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
    (topic["groupLabel"] === undefined ||
      (typeof topic["groupLabel"] === "string" &&
        topic["groupLabel"].trim() !== "")) &&
    Array.isArray(topic["levels"]) &&
    Array.isArray(topic["keys"]) &&
    topic["keys"].every((key) => typeof key === "string" && key.trim() !== "") &&
    (topic["entries"] === undefined ||
      (Array.isArray(topic["entries"]) &&
        topic["entries"].every(isReference))) &&
    typeof topic["count"] === "number" &&
    Number.isInteger(topic["count"]) &&
    topic["count"] > 0 &&
    topic["keys"].length === topic["count"] &&
    (topic["entries"] === undefined ||
      topic["entries"].length === topic["count"])
  );
}

function isPosCategory(value: unknown): value is VocabularyPosCategory {
  if (value === null || typeof value !== "object") return false;
  const category = value as Record<string, unknown>;
  return (
    typeof category["id"] === "string" &&
    category["id"].trim() !== "" &&
    Array.isArray(category["tokens"]) &&
    category["tokens"].every((token) => typeof token === "string") &&
    Array.isArray(category["entries"]) &&
    category["entries"].every(isReference) &&
    Array.isArray(category["missing"]) &&
    category["missing"].every((token) => typeof token === "string")
  );
}

function isGrammarModule(value: unknown): value is VocabularyGrammarModule {
  if (value === null || typeof value !== "object") return false;
  const module = value as Record<string, unknown>;
  return (
    typeof module["id"] === "string" &&
    module["id"].trim() !== "" &&
    typeof module["label"] === "string" &&
    module["label"].trim() !== "" &&
    typeof module["group"] === "string" &&
    Array.isArray(module["focus"]) &&
    module["focus"].every((item) => typeof item === "string") &&
    Array.isArray(module["topicIds"]) &&
    module["topicIds"].every((item) => typeof item === "string") &&
    Array.isArray(module["signalTokens"]) &&
    module["signalTokens"].every((item) => typeof item === "string") &&
    Array.isArray(module["signalEntries"]) &&
    module["signalEntries"].every(isReference) &&
    Array.isArray(module["missingSignalKeys"]) &&
    module["missingSignalKeys"].every((item) => typeof item === "string")
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


export async function loadVocabularyPosIndex(): Promise<VocabularyPosIndex> {
  if (posIndexCache !== null) return posIndexCache;
  const response = await fetch(`${BASE_URL}/parts-of-speech/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary word-type index request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyPosIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.categories) ||
    data.categories.length === 0 ||
    !data.categories.every(isPosCategory)
  ) {
    throw new Error("Vocabulary word-type index is invalid");
  }
  posIndexCache = data;
  return data;
}

export async function loadVocabularyGrammarIndex(): Promise<VocabularyGrammarIndex> {
  if (grammarIndexCache !== null) return grammarIndexCache;
  const response = await fetch(`${BASE_URL}/grammar/index.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary grammar index request failed: ${response.status}`);
  }
  const data = (await response.json()) as VocabularyGrammarIndex;
  if (
    data.version !== 1 ||
    !Array.isArray(data.primaryTimeGroups) ||
    !Array.isArray(data.modules) ||
    data.modules.length === 0 ||
    !data.modules.every(isGrammarModule)
  ) {
    throw new Error("Vocabulary grammar index is invalid");
  }
  grammarIndexCache = data;
  return data;
}

async function loadLevel(level: number): Promise<VocabularyLevel> {
  let pending = levelCache.get(level);
  if (pending === undefined) {
    pending = (async (): Promise<VocabularyLevel> => {
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
      for (const entry of data.entries) {
        entryMetadataCache.set(normalizePhrase(entry.en), entry);
      }
      return data;
    })();
    levelCache.set(level, pending);
  }

  try {
    return await pending;
  } catch (error) {
    if (levelCache.get(level) === pending) levelCache.delete(level);
    throw error;
  }
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

async function topicReferences(
  topic: VocabularyTopicMeta,
): Promise<VocabularyTopicEntry[]> {
  if (topic.entries !== undefined) return topic.entries;
  const lookup = await loadLookup();
  return topic.keys.flatMap((key) => {
    const level = lookup.entries[normalizePhrase(key)];
    return level !== undefined && Number.isInteger(level)
      ? [{ key, level }]
      : [];
  });
}

async function dictionaryForReferences(
  references: readonly VocabularyTopicEntry[],
  keys: readonly string[],
): Promise<{ raw: string; entries: number; levels: number[] }> {
  const levels = [
    ...new Set(references.map((entry) => entry.level)),
  ].sort((left, right) => left - right);
  const documents = await Promise.all(levels.map(loadLevel));
  const lines = dictionaryLinesForKeys(keys, documents);
  if (lines.length === 0) {
    throw new Error("Selected curriculum item has no available entries");
  }
  return { raw: lines.join("\n"), entries: lines.length, levels };
}

export async function prepareTopicDictionary(
  topicId: string,
): Promise<{ entries: number; levels: number[]; label: string }> {
  const topicIndex = await loadVocabularyTopicIndex();
  const topic = topicIndex.topics.find((item) => item.id === topicId);
  if (topic === undefined) {
    throw new Error(`Vocabulary topic ${topicId} is unavailable`);
  }

  const result = await dictionaryForReferences(
    await topicReferences(topic),
    topic.keys,
  );

  readCachedDictionaries();
  topicDictionaryRaw = result.raw;
  topicDictionaryId = topic.id;
  writeCachedDictionaries();

  return { entries: result.entries, levels: result.levels, label: topic.label };
}

export async function preparePosDictionary(
  posId: string,
): Promise<{ entries: number; levels: number[]; label: string }> {
  const index = await loadVocabularyPosIndex();
  const category = index.categories.find((item) => item.id === posId);
  if (category === undefined) {
    throw new Error(`Vocabulary word type ${posId} is unavailable`);
  }

  const result = await dictionaryForReferences(
    category.entries,
    category.entries.map((entry) => entry.key),
  );
  readCachedDictionaries();
  posDictionaryRaw = result.raw;
  posDictionaryId = category.id;
  writeCachedDictionaries();

  const label = category.id
    .split("-")
    .map((part) => part === "" ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return { entries: result.entries, levels: result.levels, label };
}

export async function prepareGrammarDictionary(
  grammarId: string,
): Promise<{ entries: number; levels: number[]; label: string }> {
  const [grammarIndex, topicIndex] = await Promise.all([
    loadVocabularyGrammarIndex(),
    loadVocabularyTopicIndex(),
  ]);
  const module = grammarIndex.modules.find((item) => item.id === grammarId);
  if (module === undefined) {
    throw new Error(`Vocabulary grammar module ${grammarId} is unavailable`);
  }

  const references: VocabularyTopicEntry[] = [...module.signalEntries];
  const keys = module.signalEntries.map((entry) => entry.key);
  for (const topicId of module.topicIds) {
    const topic = topicIndex.topics.find((item) => item.id === topicId);
    if (topic === undefined) continue;
    references.push(...(await topicReferences(topic)));
    keys.push(...topic.keys);
  }

  const result = await dictionaryForReferences(references, keys);
  readCachedDictionaries();
  grammarDictionaryRaw = result.raw;
  grammarDictionaryId = module.id;
  writeCachedDictionaries();

  return { entries: result.entries, levels: result.levels, label: module.label };
}

export async function prepareReviewDictionary(
  entityIds: readonly string[],
): Promise<{ entries: number; levels: number[] }> {
  const lookup = await loadLookup();
  const keys = [
    ...new Set(
      entityIds
        .map((value) => normalizePhrase(value))
        .filter((value) => value !== ""),
    ),
  ];
  const references = keys.flatMap((key) => {
    const level = lookup.entries[key];
    return level === undefined ? [] : [{ key, level }];
  });
  const levels = [
    ...new Set(references.map((entry) => entry.level)),
  ].sort((left, right) => left - right);
  const documents = await Promise.all(levels.map(loadLevel));
  const lines = dictionaryLinesForKeys(keys, documents);

  readCachedDictionaries();
  reviewDictionaryRaw = lines.join("\n");
  writeCachedDictionaries();

  return { entries: lines.length, levels };
}

export function getCachedVocabularyEntry(
  key: string,
): VocabularyEntry | null {
  return entryMetadataCache.get(normalizePhrase(key)) ?? null;
}

export function getLibraryDictionaryRaw(): string {
  readCachedDictionaries();
  return libraryDictionaryRaw;
}

export function getTopicDictionaryRaw(topicId: string): string {
  readCachedDictionaries();
  return topicDictionaryId === topicId ? topicDictionaryRaw : "";
}

export function getPosDictionaryRaw(posId: string): string {
  readCachedDictionaries();
  return posDictionaryId === posId ? posDictionaryRaw : "";
}

export function getGrammarDictionaryRaw(grammarId: string): string {
  readCachedDictionaries();
  return grammarDictionaryId === grammarId ? grammarDictionaryRaw : "";
}

export function getReviewDictionaryRaw(): string {
  readCachedDictionaries();
  return reviewDictionaryRaw;
}

export function getActiveDictionaryRaw(
  source:
    | "library"
    | "topic"
    | "word-type"
    | "grammar"
    | "review"
    | "custom",
  customDictionary: string,
  topicId = "",
  posId = "",
  grammarId = "",
): string {
  if (source === "library") return getLibraryDictionaryRaw();
  if (source === "topic") return getTopicDictionaryRaw(topicId);
  if (source === "word-type") return getPosDictionaryRaw(posId);
  if (source === "grammar") return getGrammarDictionaryRaw(grammarId);
  if (source === "review") return getReviewDictionaryRaw();
  return customDictionary;
}
