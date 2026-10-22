const compositionState = {
  composing: false,
  data: "",
  revision: 0,
};

export function getComposing(): boolean {
  return compositionState.composing;
}

export function setComposing(isComposing: boolean): void {
  compositionState.composing = isComposing;
}

export function setData(data: string): void {
  compositionState.data = data;
}

export function getData(): string {
  return compositionState.data;
}

export function getRevision(): number {
  return compositionState.revision;
}

/**
 * Invalidate the browser IME session after an explicit edit such as Backspace.
 * The monotonic revision lets a later compositionend prove that it belongs to
 * an older DOM/scorer state even if the user has already retyped the same text.
 */
export function invalidate(): void {
  compositionState.composing = false;
  compositionState.data = "";
  compositionState.revision++;
}
