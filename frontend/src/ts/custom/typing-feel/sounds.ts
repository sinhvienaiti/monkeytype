import { Config } from "../../config/store";
import {
  fetchSample,
  fetchSetManifest,
  findChoice,
  loadKeyboardChoices,
  settleSaved,
} from "./catalog";
import {
  keyboardPreviewGain,
  TypingSounds,
  type KeyboardCatalog,
  type KeyboardLoad,
  type KeyboardSettlement,
} from "./kit/audio";
import {
  followKeyboardDefault,
  getTypingFeel,
  savedKeyboardSound,
  setTypingFeel,
  type TypingFeelSettings,
} from "./store";

let sounds: TypingSounds | null = null;
/**
 * Sets the gameplay player holds. "failed": a load found no playable file
 * (a network blip, a broken file, a hung host); Monkeytype's click plays and
 * the next sync or a click on the set retries. "missing": not in the
 * catalogue, Typing Feel unreachable or not set up (no TYPING_FEEL_URL); the
 * modal and startup retry.
 */
export type PackState = "ready" | "failed" | "missing";
const packs = new Map<string, PackState>();
const inflight = new Map<string, Promise<void>>();

/** One player for typing and the settings preview; its own AudioContext, made on the first resume(). */
export function gameplaySounds(): TypingSounds {
  sounds ??= new TypingSounds();
  return sounds;
}

export function packState(id: string): PackState | undefined {
  return packs.get(id);
}

export function markPack(result: KeyboardLoad): void {
  packs.set(result.id, result.state === "pending" ? "failed" : "ready");
}

/** A set is playing for keys: selected, loaded and not failed. */
export function ownsKeySoundFor(settings: TypingFeelSettings): boolean {
  return (
    settings.keyboardSound !== "off" &&
    packs.get(settings.keyboardSound) === "ready"
  );
}

/** Monkeytype's sound volume is the master; the keyboard slider sits under it. */
export function keyboardGain(settings: TypingFeelSettings): number {
  return keyboardPreviewGain({
    master: Config.soundVolume,
    keyboard: settings.keyboardVolume / 100,
  });
}

export function applyKeyboardLevels(settings: TypingFeelSettings): void {
  const player = gameplaySounds();
  const gain = keyboardGain(settings);
  player.muted = gain === 0 || settings.keyboardSound === "off";
  player.setVolume(gain);
  if (settings.keyboardSound === "off") player.use("off");
}

/** Restores the saved set without a preview; a late load never undoes a newer pick. */
export async function loadSavedKeyboard(
  catalog: KeyboardCatalog,
  current: () => string,
): Promise<void> {
  const id = current();
  const choice = findChoice(catalog, id);
  if (choice?.manifest === undefined || choice.disabled === true) {
    // Marked so keys do not refetch the catalogue; the modal and init retry.
    if (id !== "off") packs.set(id, "missing");
    return;
  }
  const player = gameplaySounds();
  if (packs.get(id) === "ready") {
    if (player.use(id)) return;
    // The kit releases a set when another one plays (the settings preview): load it again.
    packs.delete(id);
  }
  let job = inflight.get(id);
  if (job === undefined) {
    const manifest = choice.manifest;
    job = (async () => {
      try {
        markPack(
          await player.loadKeyboardManifest(
            manifest,
            id,
            choice.label,
            fetchSetManifest,
            fetchSample,
          ),
        );
      } catch {
        packs.set(id, "failed");
      }
    })();
    inflight.set(id, job);
    void job.finally(() => inflight.delete(id));
  }
  await job;
  if (packs.get(id) !== "ready") return;
  if (current() === id) {
    player.use(id);
  } else if (player.profile?.id !== id) {
    // A newer pick won while this loaded: free its 80-odd buffers.
    player.release(id);
    packs.delete(id);
  }
}

/**
 * The stored keyboard sound against a catalogue (parent repo
 * docs/games/TYPING_FEEL_SERVICE.md §4.5, §5.1 steps 4–5). A saved id stays
 * unless a ready catalogue repairs it, and only then is it saved. A player
 * without a save follows a ready catalogue's default, unsaved; without one
 * they keep the store's default (Off and Monkeytype's click show in the list).
 */
export function settleStoredKeyboard(
  catalog: KeyboardCatalog,
): KeyboardSettlement {
  const saved = savedKeyboardSound();
  const settled = settleSaved(saved, catalog);
  if (saved === null) {
    if (catalog.state === "ready") followKeyboardDefault(settled.id);
  } else if (settled.repaired && settled.id !== saved) {
    setTypingFeel({ ...getTypingFeel(), keyboardSound: settled.id });
  }
  return settled;
}

/**
 * Catalogue, the stored id settled against it, then that set. A host that
 * is down keeps the saved id. Safe to call again.
 */
export async function syncSavedKeyboard(): Promise<void> {
  if (getTypingFeel().keyboardSound === "off") return;
  const catalog = await loadKeyboardChoices();
  settleStoredKeyboard(catalog);
  // A set the catalogue lacks is marked missing there, so keys stop asking.
  await loadSavedKeyboard(catalog, () => getTypingFeel().keyboardSound);
}

export type KeySoundSink = Pick<
  TypingSounds,
  "key" | "wrong" | "stray" | "space" | "complete" | "resume"
>;

export type KeydownLike = Pick<
  KeyboardEvent,
  "key" | "code" | "repeat" | "ctrlKey" | "metaKey" | "altKey"
>;

export type ScorerSound = {
  correct: boolean;
  commit: boolean;
  perfect: boolean;
  charIndex: number;
  streak: number;
};

function typingKey(event: KeydownLike): boolean {
  if (event.repeat) return false;
  const key = event.key;
  // Backspace keeps its word-delete modifiers; other shortcuts stay silent (AltGr is Ctrl+Alt).
  if (key === "Backspace") return true;
  if ((event.ctrlKey || event.metaKey) && !event.altKey) return false;
  return (
    key === "Process" ||
    key === "Unidentified" ||
    key === "Enter" ||
    Array.from(key).length === 1
  );
}

/**
 * One sound per physical key. A keydown waits as "pending"; the scorer's
 * first event for it decides the sound (word, letter, wrong), later events
 * of the same key (an IME replay) are silent, and a key no scorer event
 * claims by the end of its task (IME buffering, a blocked character) plays
 * one neutral sound by its code.
 */
export type KeySoundRouterDeps = {
  readonly sink: () => KeySoundSink;
  readonly owns: () => boolean;
  readonly errorSound: () => boolean;
  readonly schedule?: (fn: () => void) => void;
};

export class KeySoundRouter {
  private pending: { seq: number; code: string; key: string } | null = null;
  private seq = 0;
  /** After a finish: stray keys on the result screen stay silent. */
  idle = false;
  private readonly deps: KeySoundRouterDeps;

  constructor(deps: KeySoundRouterDeps) {
    this.deps = deps;
  }

  keydown(event: KeydownLike): boolean {
    if (!typingKey(event)) return false;
    // A keydown is a user gesture: the context may start.
    this.deps.sink().resume();
    // A key still unclaimed when the next one arrives plays now: none is lost.
    if (this.pending !== null) this.flush(this.pending.seq);
    const seq = (this.seq += 1);
    this.pending = { seq, code: event.code, key: event.key };
    (this.deps.schedule ?? ((fn) => setTimeout(fn, 0)))(() => this.flush(seq));
    return true;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  scorer(info: ScorerSound): void {
    if (!this.take() || !this.deps.owns()) return;
    const sink = this.deps.sink();
    // A wrong space (short or misspelt word) still moves on: it is an error, never a word.
    if (info.correct && info.commit) sink.complete(info.perfect, info.streak);
    else if (info.correct) sink.key(info.charIndex);
    // Monkeytype's error sound plays for errors when it is on: never both.
    else if (!this.deps.errorSound()) sink.wrong();
  }

  deleted(): void {
    if (!this.take() || !this.deps.owns()) return;
    this.deps.sink().stray();
  }

  reset(): void {
    this.pending = null;
  }

  private take(): boolean {
    const had = this.pending !== null;
    this.pending = null;
    return had;
  }

  private flush(seq: number): void {
    const pending = this.pending;
    if (pending?.seq !== seq) return;
    this.pending = null;
    if (this.idle || pending.key === "Enter" || !this.deps.owns()) return;
    const sink = this.deps.sink();
    if (pending.code === "Space" || pending.key === " ") sink.space();
    else if (pending.key === "Backspace") sink.stray();
    else sink.key(0);
  }
}
