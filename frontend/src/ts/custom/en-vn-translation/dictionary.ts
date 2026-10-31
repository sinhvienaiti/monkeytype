export type ParsedDictionary = {
  translations: Map<string, string>;
  maxWordCount: number;
};

export type DictionaryMatch = {
  source: string;
  translation: string;
  wordCount: number;
};

export type DictionaryMatchSpan = DictionaryMatch & {
  startWordIndex: number;
};

function normalizeWord(word: string): string {
  return word
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^[^\p{L}\p{N}+#-]+|[^\p{L}\p{N}+#-]+$/gu, "");
}

export function normalizePhrase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word !== "")
    .join(" ");
}

function splitDictionaryLine(
  line: string,
): { source: string; translation: string } | null {
  const separators = ["=>", "\t", "="];

  for (const separator of separators) {
    const index = line.indexOf(separator);
    if (index <= 0) continue;

    const source = line.slice(0, index).trim();
    const translation = line.slice(index + separator.length).trim();

    if (source !== "" && translation !== "") {
      return { source, translation };
    }
  }

  return null;
}

let cachedRaw: string | null = null;
let cachedParsed: ParsedDictionary | null = null;

export function parseDictionary(raw: string): ParsedDictionary {
  const translations = new Map<string, string>();
  let maxWordCount = 1;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;

    const pair = splitDictionaryLine(line);
    if (pair === null) continue;

    const source = normalizePhrase(pair.source);
    if (source === "") continue;

    translations.set(source, pair.translation);
    maxWordCount = Math.max(maxWordCount, source.split(" ").length);
  }

  return { translations, maxWordCount };
}

export function parseDictionaryCached(raw: string): ParsedDictionary {
  if (cachedRaw === raw && cachedParsed !== null) return cachedParsed;
  cachedRaw = raw;
  cachedParsed = parseDictionary(raw);
  return cachedParsed;
}

export function resetDictionaryCacheForTests(): void {
  cachedRaw = null;
  cachedParsed = null;
}

export function findDictionaryMatch(
  words: string[],
  startWordIndex: number,
  dictionary: ParsedDictionary,
): DictionaryMatch | null {
  const maxWordCount = Math.min(
    dictionary.maxWordCount,
    words.length - startWordIndex,
  );

  for (let wordCount = maxWordCount; wordCount >= 1; wordCount--) {
    const phrase = words
      .slice(startWordIndex, startWordIndex + wordCount)
      .join(" ");
    const source = normalizePhrase(phrase);
    const translation = dictionary.translations.get(source);

    if (translation !== undefined) {
      return { source, translation, wordCount };
    }
  }

  return null;
}

export function findDictionaryMatches(
  words: string[],
  dictionary: ParsedDictionary,
): DictionaryMatchSpan[] {
  const matches: DictionaryMatchSpan[] = [];

  for (let index = 0; index < words.length; ) {
    const match = findDictionaryMatch(words, index, dictionary);
    if (match === null) {
      index++;
      continue;
    }

    matches.push({
      ...match,
      startWordIndex: index,
    });
    index += match.wordCount;
  }

  return matches;
}
