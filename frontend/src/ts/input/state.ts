let correctShiftUsed = true;
let incorrectShiftsInARow = 0;
let awaitingNextWord = false;
let lastBailoutAttempt = -1;
let lastInsertCompositionTextData = "";
let activePhysicalKeyCode: string | null = null;
let pendingVietnameseCompositionSeparator: string | null = null;
let lastBackspaceIntentAt = Number.NEGATIVE_INFINITY;

export function isCorrectShiftUsed(): boolean {
  return correctShiftUsed;
}

export function setCorrectShiftUsed(value: boolean): void {
  correctShiftUsed = value;
}

export function getIncorrectShiftsInARow(): number {
  return incorrectShiftsInARow;
}

export function setIncorrectShiftsInARow(value: number): void {
  incorrectShiftsInARow = value;
}

export function incrementIncorrectShiftsInARow(): void {
  incorrectShiftsInARow++;
}

export function resetIncorrectShiftsInARow(): void {
  incorrectShiftsInARow = 0;
}

export function isAwaitingNextWord(): boolean {
  return awaitingNextWord;
}

export function setAwaitingNextWord(value: boolean): void {
  awaitingNextWord = value;
}

export function getLastBailoutAttempt(): number {
  return lastBailoutAttempt;
}

export function setLastBailoutAttempt(value: number): void {
  lastBailoutAttempt = value;
}

export function getLastInsertCompositionTextData(): string {
  return lastInsertCompositionTextData;
}

export function setLastInsertCompositionTextData(value: string): void {
  lastInsertCompositionTextData = value;
}

export function getActivePhysicalKeyCode(): string | null {
  return activePhysicalKeyCode;
}

export function setActivePhysicalKeyCode(value: string | null): void {
  activePhysicalKeyCode = value;
}

export function clearActivePhysicalKeyCode(code: string): void {
  if (activePhysicalKeyCode === code) {
    activePhysicalKeyCode = null;
  }
}

export function getPendingVietnameseCompositionSeparator(): string | null {
  return pendingVietnameseCompositionSeparator;
}

export function setPendingVietnameseCompositionSeparator(
  value: string | null,
): void {
  pendingVietnameseCompositionSeparator = value;
}

const BACKSPACE_INTENT_WINDOW_MS = 750;

export function markBackspaceIntent(now: number): void {
  lastBackspaceIntentAt = now;
}

export function hasRecentBackspaceIntent(now: number): boolean {
  return (
    Number.isFinite(now) &&
    now >= lastBackspaceIntentAt &&
    now - lastBackspaceIntentAt <= BACKSPACE_INTENT_WINDOW_MS
  );
}

export function clearBackspaceIntent(): void {
  lastBackspaceIntentAt = Number.NEGATIVE_INFINITY;
}
