export type ParsedDictionary = {
  translations: Map<string, string>;
  maxWordCount: number;
};

function normalizeWord(word: string): string {
  return word
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^[^\\p{L}\\p{N}+#-]+|[^\\p{L}\\p{N}+#-]+$/gu, "");
}

export function normalizePhrase(phrase: string): string {
  return phrase
    .split(/\\s+/)
    .map(normalizeWord)
    .filter((word) => word !== "")
    .join(" ");
}

function splitDictionaryLine(
  line: string,
): { source: string; translation: string } | null {
  const separators = ["=>", "\\t", "="];

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

export function parseDictionary(raw: string): ParsedDictionary {
  const translations = new Map<string, string>();
  let maxWordCount = 1;

  for (const rawLine of raw.split(/\\r?\\n/)) {
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
