export function notifyParentSpeech(active: boolean): void {
  if (typeof window === "undefined") return;
  window.parent?.postMessage(
    { type: "typing-game:speech", active },
    "*",
  );
}
