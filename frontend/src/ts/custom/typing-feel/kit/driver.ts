// Source: new for the kit: turns a game's typing events into feedback calls (TYPING_FEEDBACK_REVIEW.md §5.7, §8)
/**
 * Feedback never decides what is right or wrong. A game's typing core
 * already did; the game hands the result here as a progress snapshot
 * (which word, how many letters are in, what the key did), and the driver
 * turns the change since the last snapshot into calls on its sinks (the
 * focus strip, the key sounds). Calls, not event objects: nothing is
 * allocated per key.
 */

/** Whatever shows or plays typing feedback. Every method is optional but `key`. */
export type TypingFxSink = {
  /** A new active word (a lock, a switch, the next word); `typed` letters are already in; `mask` bit i hides letter i. */
  setWord?(text: string, meaning: string, typed: number, now: number, mask: number): void;
  /** The word's hidden letters changed (a wrong key revealed one). */
  mask?(hidden: number, now: number): void;
  /** The letter at `index` was typed right. */
  key(index: number, now: number): void;
  /** A wrong key while the letter at `index` was due. */
  wrong?(index: number, now: number, key?: string): void;
  /** A key that started nothing (no word locked). */
  stray?(now: number): void;
  /** Letters taken back: `typed` remain. */
  back?(typed: number, now: number): void;
  /** The word is typed: one effect for the whole word, upgraded by `perfect` and the combo. */
  complete?(perfect: boolean, combo: number, now: number): void;
  /** The word left unfinished (its target gone, an unlock). */
  clear?(now: number): void;
};

/**
 * What a key did, in the games' own words (dragon-hold's `word-progress.key`);
 * "show": a word becomes active with no key (a target's next word that comes
 * locked, Wordwoven's calls), "release": it left unfinished.
 */
export type TypingFxKind = "show" | "lock" | "advance" | "done" | "wrong" | "switch" | "stray" | "back" | "release";

/** One snapshot; a game may keep one object and refill it every key. */
export type TypingFxProgress = {
  kind: TypingFxKind;
  /** The game's id of the word (slot, call id…); a new id means a new word. */
  word: number;
  text: string;
  meaning: string;
  /** Letters typed on the word after this key. */
  typed: number;
  /** Words in a row (the game's chain); 0 when the game has none. */
  combo: number;
  /** The game's grade; when unset the driver counts wrong keys on the word itself. */
  perfect?: boolean;
  /** Letters the game hides (bit i: letter i shows as "_" until typed or revealed); unset: none. */
  mask?: number;
  /** A wrong key: what the player typed (the strip drops it away under the row); unset: not shown. */
  key?: string;
};

/**
 * The kit typing router's KEY codes (typing/router.ts) as kinds; null: no
 * feedback (an open tier-2 pair, a forgiven stray). Kept as numbers so this
 * module does not import typing/ (a game may sync feedback without typing);
 * driver.test.ts checks them against KEY.
 */
const KIT_KINDS: readonly (TypingFxKind | null)[] = ["stray", "lock", "advance", "done", "wrong", "switch", null, null];

export function kitKind(result: number): TypingFxKind | null {
  return KIT_KINDS[result] ?? null;
}

export class TypingFxDriver {
  /** The word shown (−1 none), letters shown in, wrong keys on it. */
  word = -1;
  typed = 0;
  errors = 0;
  length = 0;
  hidden = 0;

  constructor(readonly sinks: readonly TypingFxSink[]) {}

  progress(p: TypingFxProgress, now: number = nowMs()): void {
    const sinks = this.sinks;
    if (p.kind === "stray") {
      for (const sink of sinks) sink.stray?.(now);
      return;
    }
    if (p.kind === "release") {
      if (p.word === this.word) this.reset(now);
      return;
    }
    if (p.word !== this.word) {
      // A new word: a lock's own letter (or a tier-2 pair's two) plays as keys; a word met
      // further in (a game switching to a half-typed target) shows what it had, then this key.
      const keyed = p.kind === "lock" || p.kind === "switch" || p.kind === "advance" || p.kind === "done";
      const before = !keyed ? Math.max(0, p.typed) : p.typed <= 2 ? 0 : p.typed - 1;
      this.word = p.word;
      this.typed = before;
      this.errors = 0;
      this.length = p.text.length;
      this.hidden = p.mask ?? 0;
      for (const sink of sinks) sink.setWord?.(p.text, p.meaning, before, now, this.hidden);
    } else if (p.mask !== undefined && p.mask !== this.hidden) {
      this.hidden = p.mask;
      for (const sink of sinks) sink.mask?.(p.mask, now);
    }
    if (p.kind === "wrong") {
      this.errors += 1;
      for (const sink of sinks) sink.wrong?.(Math.min(p.typed, Math.max(0, this.length - 1)), now, p.key);
      return;
    }
    if (p.typed < this.typed) {
      this.typed = Math.max(0, p.typed);
      for (const sink of sinks) sink.back?.(this.typed, now);
      if (this.typed === 0 && p.kind === "back") this.word = -1;
      return;
    }
    // One key may put in more than one letter (a tier-2 pair resolving): each plays.
    while (this.typed < p.typed && this.typed < this.length) {
      for (const sink of sinks) sink.key(this.typed, now);
      this.typed += 1;
    }
    if (p.kind === "done") {
      const perfect = p.perfect ?? this.errors === 0;
      for (const sink of sinks) sink.complete?.(perfect, p.combo, now);
      this.word = -1;
      this.typed = 0;
      this.errors = 0;
    }
  }

  private reset(now: number): void {
    this.word = -1;
    this.typed = 0;
    this.errors = 0;
    for (const sink of this.sinks) sink.clear?.(now);
  }
}

const nowMs = (): number => (typeof performance === "undefined" ? Date.now() : performance.now());
