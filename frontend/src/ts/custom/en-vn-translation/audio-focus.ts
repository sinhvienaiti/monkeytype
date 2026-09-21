export function notifyParentSpeech(active: boolean): void {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent?.postMessage(
    { type: "typing-game:speech", active },
    "*",
  );
}
