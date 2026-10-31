import { envConfig } from "virtual:env-config";

import {
  KEYBOARD_CATALOG_TIMEOUT_MS,
  loadKeyboardCatalog,
  settleKeyboardChoice,
  timedJson,
  typingFeelKeysBase,
  type KeyboardCatalog,
  type KeyboardSettlement,
  type KeyboardSoundChoice,
} from "./kit/audio";
import { DEFAULT_KEYBOARD_SOUND } from "./store";

/**
 * The keyboard sets come from Typing Feel at run time (parent repo,
 * docs/games/TYPING_FEEL_SERVICE.md §5.1): the catalogue at
 * `<TYPING_FEEL_URL>/v1/keys/keys-manifest.json`, each set's manifest and
 * samples in its own versioned folder under it. Nothing is copied into this
 * repo. Without TYPING_FEEL_URL (CI, a plain clone) nothing is fetched and
 * Monkeytype's own click sounds play.
 */

type FetchJson = (url: string) => Promise<unknown>;

/**
 * Off: no Typing Feel keys, Monkeytype's own click plays (when it is on). It
 * is this game's built-in sound for the kit's settleKeyboardChoice.
 */
export const OFF_CHOICE: KeyboardSoundChoice = { value: "off", label: "Off" };
/** Under the list when Typing Feel is set up but its catalogue did not load (§5.3). */
export const UNAVAILABLE = "keyboard sounds unavailable";

/**
 * Set manifests sit at versioned, immutable URLs: the HTTP cache may answer,
 * and a host that hangs still gives up after 3 s (the set then counts as
 * failed and Monkeytype's click plays).
 */
export const fetchSetManifest: FetchJson = timedJson(
  KEYBOARD_CATALOG_TIMEOUT_MS,
  { cache: "default" },
);

/** Longest wait for one sample or preview file. */
export const SAMPLE_TIMEOUT_MS = 10_000;

/**
 * A bounded fetch of a file's bytes, for samples and previews (versioned,
 * immutable URLs: the HTTP cache may answer). It rejects on a non-OK status,
 * an HTML page (an SPA fallback) and no answer in `timeoutMs` (aborting the
 * request), so a host that hangs on samples makes the file count as missing:
 * the set ends as failed and Monkeytype's click plays, instead of the set
 * staying pending for the whole session.
 */
export function timedBytes(
  timeoutMs: number,
): (url: string) => Promise<ArrayBuffer> {
  return async (url) => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only rejects once the timer fires; Promise.race below always handles it.
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${url}: no answer in ${timeoutMs} ms`));
        abort.abort();
      }, timeoutMs);
    });
    const read = (async (): Promise<ArrayBuffer> => {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      if (/html/i.test(response.headers?.get("content-type") ?? "")) {
        throw new Error(`${url}: HTML, not audio`);
      }
      return response.arrayBuffer();
    })();
    try {
      return await Promise.race([read, expired]);
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Samples and previews of the sets: timedBytes(SAMPLE_TIMEOUT_MS). */
export const fetchSample = timedBytes(SAMPLE_TIMEOUT_MS);

function pageOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

/**
 * The kit's keys base from TYPING_FEEL_URL, the Typing Feel root (what comes
 * before /v1/):
 * - an http(s) origin, a path prefix kept: `https://feel.typing-game.local`
 *   reads `https://feel.typing-game.local/v1/keys/`;
 * - a same-origin path that starts with one "/": `/typing-feel` (the
 *   `pnpm feel:mirror` copy in static/typing-feel/) reads
 *   `<page origin>/typing-feel/v1/keys/`;
 * - a trailing `/v1` or `/v1/` is dropped, so `/typing-feel/v1/` works too.
 * Unset, blank or anything else (a relative path without "/", `//host`,
 * credentials, a query or fragment): null, Typing Feel off.
 */
export function typingFeelBase(
  value: string | undefined,
  origin: string | undefined = pageOrigin(),
): string | null {
  let text = value?.trim() ?? "";
  if (text === "") return null;
  if (text.startsWith("/") && !text.startsWith("//")) {
    if (origin === undefined) return null;
    text = origin + text;
  }
  return typingFeelKeysBase(text.replace(/\/v1\/?$/, ""));
}

/** The keys base this build reads, or null when TYPING_FEEL_URL is not set. */
export function configuredBase(): string | null {
  return typingFeelBase(envConfig.typingFeelUrl);
}

export type CatalogSource = {
  /** The keys base; default: configuredBase(). null: Typing Feel off, no fetch. */
  readonly base?: string | null;
  /** Default: the kit's timedJson(3000) (no-cache, refuses HTML, gives up on a hung host). */
  readonly fetchJson?: FetchJson;
};

let pending: Promise<KeyboardCatalog> | null = null;

async function load(source: CatalogSource): Promise<KeyboardCatalog> {
  const base = source.base === undefined ? configuredBase() : source.base;
  return loadKeyboardCatalog(base, {
    // No game sound to add: Off already stands for Monkeytype's click.
    fallback: [],
    fetchJson: source.fetchJson ?? timedJson(KEYBOARD_CATALOG_TIMEOUT_MS),
  });
}

/**
 * The Typing Feel catalogue (a few KB; samples and previews stay lazy).
 * Without a source it reads TYPING_FEEL_URL and is memoised; a catalogue that
 * did not load is fetched again on the next call (the settings opening).
 */
export async function loadKeyboardChoices(
  source?: CatalogSource,
): Promise<KeyboardCatalog> {
  if (source !== undefined) return load(source);
  if (pending === null) {
    const job = load({});
    pending = job;
    void job.then((catalog) => {
      if (catalog.state !== "ready" && pending === job) pending = null;
    });
  }
  return pending;
}

/**
 * The saved id against the catalogue, by the kit's rule for every game
 * (§4.6, §5.3). A catalogue that did not load (the host is down, or
 * TYPING_FEEL_URL is not set) keeps the id and lists it as a disabled
 * "Saved sound · unavailable", so one failed fetch never loses the player's
 * set. A ready one keeps a listed set and Off, and repairs anything else (a
 * retired set, the kit's old "creamy") to the catalogue's default, then
 * Bright Clack, then the first set, with `repaired: true`: only then does
 * the caller save. Null (no save yet, §4.5): that default when the
 * catalogue is ready, else Off; `repaired: false`, nothing to save.
 */
export function settleSaved(
  savedId: string | null,
  catalog: KeyboardCatalog,
): KeyboardSettlement {
  return settleKeyboardChoice(
    savedId,
    catalog,
    OFF_CHOICE,
    DEFAULT_KEYBOARD_SOUND,
  );
}

/** A run of catalogue rows of one family; Off and rows without a family have none. */
export type KeyboardSection = {
  readonly family: string | undefined;
  readonly items: readonly {
    readonly choice: KeyboardSoundChoice;
    readonly index: number;
  }[];
};

/**
 * The list's sections in catalogue order (the kit's grouping): neighbouring
 * rows of one family share a heading, a family that recurs later starts a
 * new section, and `index` is the row's place in `options`.
 */
export function groupByFamily(
  options: readonly KeyboardSoundChoice[],
): KeyboardSection[] {
  const sections: {
    family: string | undefined;
    items: { choice: KeyboardSoundChoice; index: number }[];
  }[] = [];
  options.forEach((choice, index) => {
    const name = choice.family?.trim();
    const family =
      choice.value === "off" || name === undefined || name === ""
        ? undefined
        : name;
    const last = sections.at(-1);
    if (last !== undefined && last.family === family) {
      last.items.push({ choice, index });
    } else {
      sections.push({ family, items: [{ choice, index }] });
    }
  });
  return sections;
}

export function findChoice(
  catalog: KeyboardCatalog | undefined,
  id: string,
): KeyboardSoundChoice | undefined {
  return catalog?.options.find((c) => c.value === id);
}
