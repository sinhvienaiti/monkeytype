import {
  loadKeyboardCatalog,
  type KeyboardCatalog,
  type KeyboardSoundChoice,
} from "./kit/audio";
import { DEFAULT_KEYBOARD_SOUND } from "./store";

/** Filled by `pnpm sync-keys` from the Audio Lab; audio is never in Git. */
export const KEYS_BASE = "/sounds/keys/";
/**
 * Written last by `pnpm sync-keys` and ignored by Git, unlike the tracked
 * catalogue and set manifests: it is the only sign the audio is here.
 */
export const INSTALLED_URL = `${KEYS_BASE}installed.json`;
export const NOT_INSTALLED = "sound files not installed";

type FetchJson = (url: string) => Promise<unknown>;

let pending: Promise<KeyboardCatalog> | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/** The set ids `pnpm sync-keys` copied, or null when it never ran here. */
export async function loadInstalledSets(
  getJson: FetchJson = fetchJson,
): Promise<ReadonlySet<string> | null> {
  try {
    const raw: unknown = await getJson(INSTALLED_URL);
    const sets =
      raw !== null && typeof raw === "object"
        ? (raw as { sets?: unknown }).sets
        : undefined;
    if (!Array.isArray(sets)) return null;
    return new Set(sets.filter((id): id is string => typeof id === "string"));
  } catch {
    // A 404, or a server's HTML fallback page: not installed.
    return null;
  }
}

/**
 * The tracked catalogue against what was synced: nothing synced lists only
 * Off (state "missing"), a set the sync did not copy is disabled.
 */
export function markInstalled(
  catalog: KeyboardCatalog,
  installed: ReadonlySet<string> | null,
): KeyboardCatalog {
  if (catalog.state !== "ready") return catalog;
  if (installed === null) {
    return {
      options: catalog.options.filter((c) => c.value === "off"),
      state: "missing",
    };
  }
  return {
    ...catalog,
    options: catalog.options.map((c) =>
      c.value === "off" || installed.has(c.value)
        ? c
        : { ...c, disabled: true, note: NOT_INSTALLED },
    ),
  };
}

async function load(getJson?: FetchJson): Promise<KeyboardCatalog> {
  const [catalog, installed] = await Promise.all([
    loadKeyboardCatalog(
      KEYS_BASE,
      getJson === undefined
        ? { fallback: [] }
        : { fallback: [], fetchJson: getJson },
    ),
    loadInstalledSets(getJson),
  ]);
  return markInstalled(catalog, installed);
}

/** The root catalogue and the install marker (2 KB); samples and previews stay lazy. Memoised. */
export async function loadKeyboardChoices(
  getJson?: FetchJson,
): Promise<KeyboardCatalog> {
  if (getJson !== undefined) return load(getJson);
  if (pending === null) {
    pending = load();
    // Not installed or not loaded: retried the next time the settings open.
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
 * stay (one not installed yet plays once synced), a stale or legacy id (a
 * renamed set, the kit's "creamy") becomes Bright Clack, or the first
 * usable set when that is not. A catalogue that did not load, or audio that
 * was never synced, repairs nothing, so the choice is never lost.
 */
export function restoreKeyboardChoice(
  id: string,
  catalog: KeyboardCatalog,
): string {
  if (id === "off" || catalog.state !== "ready") return id;
  if (catalog.options.some((c) => c.value === id)) return id;
  return defaultKeyboard(catalog.options);
}

export function findChoice(
  catalog: KeyboardCatalog | undefined,
  id: string,
): KeyboardSoundChoice | undefined {
  return catalog?.options.find((c) => c.value === id);
}
