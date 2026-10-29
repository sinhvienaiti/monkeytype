import {
  loadKeyboardCatalog,
  type KeyboardCatalog,
  type KeyboardSoundChoice,
} from "./kit/audio";
import { DEFAULT_KEYBOARD_SOUND } from "./store";

/** Filled by `pnpm sync-keys` from the Audio Lab; audio is never in Git. */
export const KEYS_BASE = "/sounds/keys/";

let pending: Promise<KeyboardCatalog> | null = null;

/** The root catalogue only (1.5 KB); samples and previews stay lazy. Memoised. */
export async function loadKeyboardChoices(
  fetchJson?: (url: string) => Promise<unknown>,
): Promise<KeyboardCatalog> {
  if (fetchJson !== undefined) {
    return loadKeyboardCatalog(KEYS_BASE, { fallback: [], fetchJson });
  }
  if (pending === null) {
    pending = loadKeyboardCatalog(KEYS_BASE, { fallback: [] });
    // A missing catalogue is retried the next time the settings open.
    void pending.then((catalog) => {
      if (catalog.state !== "ready") pending = null;
    });
  }
  return pending;
}

export function defaultKeyboard(
  choices: readonly KeyboardSoundChoice[],
): string {
  const usable = (c: KeyboardSoundChoice): boolean =>
    c.manifest !== undefined && c.disabled !== true;
  return (
    choices.find((c) => c.value === DEFAULT_KEYBOARD_SOUND && usable(c))
      ?.value ??
    choices.find(usable)?.value ??
    "off"
  );
}

/**
 * The saved id repaired against a loaded catalogue: "off" and listed sets
 * stay, a stale or legacy id (a renamed set, the kit's "creamy") becomes
 * Bright Clack, or the first set when that is missing. A catalogue that did
 * not load repairs nothing, so a network blip never loses the choice.
 */
export function restoreKeyboardChoice(
  id: string,
  catalog: KeyboardCatalog,
): string {
  if (id === "off" || catalog.state !== "ready") return id;
  if (catalog.options.some((c) => c.value === id && c.disabled !== true)) {
    return id;
  }
  return defaultKeyboard(catalog.options);
}

export function findChoice(
  catalog: KeyboardCatalog | undefined,
  id: string,
): KeyboardSoundChoice | undefined {
  return catalog?.options.find((c) => c.value === id);
}
