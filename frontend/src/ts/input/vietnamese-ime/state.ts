export type VietnameseImeSession = {
  id: number;
  revision: number;
  wordIndex: number;
  committedPrefix: string;
};

export type VietnameseImeDirectPreview = {
  wordIndex: number;
  scorerPrefix: string;
  domValue: string;
};

let nextSessionId = 1;
let revision = 0;
let session: VietnameseImeSession | null = null;
let directPreview: VietnameseImeDirectPreview | null = null;
let queuedSeparator: string | null = null;

export function beginVietnameseImeSession(options: {
  wordIndex: number;
  committedPrefix: string;
}): VietnameseImeSession {
  session = {
    id: nextSessionId++,
    revision,
    wordIndex: options.wordIndex,
    committedPrefix: options.committedPrefix,
  };
  directPreview = null;
  queuedSeparator = null;
  return session;
}

export function getVietnameseImeSession(): VietnameseImeSession | null {
  return session;
}

export function invalidateVietnameseImeSession(): void {
  revision++;
  session = null;
  directPreview = null;
  queuedSeparator = null;
}

export function finishVietnameseImeSession(): void {
  session = null;
}

export function setVietnameseImeDirectPreview(
  value: VietnameseImeDirectPreview,
): void {
  directPreview = value;
}

export function getVietnameseImeDirectPreview(): VietnameseImeDirectPreview | null {
  return directPreview;
}

export function clearVietnameseImeDirectPreview(): void {
  directPreview = null;
}

export function getVietnameseImeRevision(): number {
  return revision;
}

export function queueVietnameseImeSeparator(value: string): void {
  queuedSeparator = value;
}

export function getVietnameseImeQueuedSeparator(): string | null {
  return queuedSeparator;
}

export function takeVietnameseImeSeparator(): string | null {
  const value = queuedSeparator;
  queuedSeparator = null;
  return value;
}
