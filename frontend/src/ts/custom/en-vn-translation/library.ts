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

let lookupCache: VocabularyLookup | null = null;
let dictionaryRaw = "";

function readCachedDictionary(): string {
  if (dictionaryRaw !== "") return dictionaryRaw;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return "";
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data["dictionary"] === "string") {
      dictionaryRaw = data["dictionary"];
    }
  } catch {
    // Ignore malformed local cache; it can be rebuilt on the next submit.
  }

  return dictionaryRaw;
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

async function loadLevel(level: number): Promise<VocabularyLevel> {
  const file = String(level).padStart(3, "0");
  const response = await fetch(`${BASE_URL}/levels/${file}.json`, {
    cache: "no-cache",
  });
  if (!response.ok) {
    throw new Error(`Vocabulary level ${level} request failed: ${response.status}`);
  }

  const data = (await response.json()) as VocabularyLevel;
  if (data.version !== 1 || data.level !== level || !Array.isArray(data.entries)) {
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

export async function prepareLibraryDictionary(
  sourceText: string,
): Promise<{ entries: number; levels: number[] }> {
  const lookup = await loadLookup();
  const levels = [...findRequiredLevels(sourceText, lookup)].sort(
    (left, right) => left - right,
  );

  const documents = await Promise.all(levels.map(loadLevel));
  const lines: string[] = [];
  let entryCount = 0;

  for (const document of documents) {
    for (const entry of document.entries) {
      const key = normalizePhrase(entry.en);
      if (lookup.entries[key] !== document.level) continue;
      lines.push(`${entry.en} = ${entry.vi}`);
      entryCount++;
    }
  }

  dictionaryRaw = lines.join("\n");
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      dictionary: dictionaryRaw,
      levels,
    }),
  );

  return { entries: entryCount, levels };
}

export function getLibraryDictionaryRaw(): string {
  return readCachedDictionary();
}

export function getActiveDictionaryRaw(
  source: "library" | "custom",
  customDictionary: string,
): string {
  return source === "library" ? getLibraryDictionaryRaw() : customDictionary;
}
