import { normalizeVietnameseCommittedText } from "./normalization";

export type VietnameseCommitTransaction = {
  wordIndex: number;
  start: number;
  deleteCount: number;
  insertText: string;
  before: string;
  after: string;
  source: "composition" | "direct";
};

function commonPrefixLength(a: string[], b: string[]): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index++;
  }
  return index;
}

function commonSuffixLength(
  a: string[],
  b: string[],
  prefixLength: number,
): number {
  let suffix = 0;
  while (
    suffix < a.length - prefixLength &&
    suffix < b.length - prefixLength &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  return suffix;
}

export function createVietnameseCommitTransaction(options: {
  wordIndex: number;
  before: string;
  after: string;
  source: VietnameseCommitTransaction["source"];
}): VietnameseCommitTransaction | null {
  const before = normalizeVietnameseCommittedText(options.before);
  const after = normalizeVietnameseCommittedText(options.after);
  if (before === after) return null;

  const beforeChars = Array.from(before);
  const afterChars = Array.from(after);
  const start = commonPrefixLength(beforeChars, afterChars);
  const suffix = commonSuffixLength(beforeChars, afterChars, start);

  return {
    wordIndex: options.wordIndex,
    start,
    deleteCount: beforeChars.length - start - suffix,
    insertText: afterChars.slice(start, afterChars.length - suffix).join(""),
    before,
    after,
    source: options.source,
  };
}
