import { cn } from "../../utils/cn";
import {
  DEFAULT_PALETTE,
  FxCanvas,
  mixHex,
  type TypingFxPalette,
} from "./kit/draw";
import {
  comboParticles,
  comboSize,
  INTENSITY,
  levelFor,
  PRIORITY,
  wordPriority,
  type IntensityLevel,
} from "./kit/intensity";
import { ParticlePool, PK } from "./kit/pool";
import type { TypingFxIntensity, TypingFxStyle } from "./kit/settings";
import {
  newPose,
  popEnvelope,
  spawnWrongBeat,
  STYLES,
  TONE,
  WRONG_MS,
  wrongPose,
  type GlyphPose,
  type SpawnCtx,
  type StyleRecipe,
  type WordCtx,
} from "./kit/styles";

/**
 * Letter effects for Monkeytype's words, drawn on two canvases fixed to the
 * body: particles behind the text (as the kit's strip draws them, so no
 * splat ever covers a letter) and glyph poses (the hot glow, the stamp's
 * falling copy, a wrong key's twitch) above it. Monkeytype's own <letter>
 * nodes are only read, never changed: it rebuilds them every frame and
 * measures the caret on them. When Monkeytype moves the text (a tape
 * scroll, a line jump), live effects move with it: the last word an effect
 * was read on is the anchor, checked every frame and on each #words change.
 */

export type FxTheme = {
  readonly main: string;
  readonly text: string;
  readonly bg: string;
  readonly error: string;
  readonly caret: string;
  readonly sub: string;
};

export type FxInput = {
  wordIndex: number;
  charIndex: number;
  data: string;
  correct: boolean;
  commit: boolean;
  perfect: boolean;
  replaced: boolean;
  stopped: boolean;
  automatic: boolean;
  blind: boolean;
  streak: number;
};

export type FxDeps = {
  readonly doc: Document;
  readonly now: () => number;
  readonly theme: () => FxTheme;
  readonly slow: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly requestFrame: (fn: () => void) => number;
  readonly cancelFrame: (id: number) => void;
};

const KEY = 1;
const WRONG = 2;
const LIT = 3;
const FLASH = 4;
const LIT_MS = 220;
const FLASH_MS = 165;
const MAX_LETTERS = 64;

type Glyph = {
  kind: number;
  at: number;
  /** Canvas px: the letter's centre, its baseline, its box. */
  x: number;
  y: number;
  base: number;
  w: number;
  hh: number;
  ch: string;
  owner: number;
  phase: number;
  glyph: number;
  amount: number;
  /** The word cache entry and letter this glyph sits on (a style's light spills onto its neighbours). */
  word: number;
  index: number;
};

type Box = { left: number; top: number; width: number; height: number };

/** A word element and its start edge in canvas px when last read. */
type Anchor = { el: Element; x: number; y: number };

/** A rune trace word layer as last given to FxCanvas. */
type Trace = { text: string; xs: Float32Array; len: number; base: number };

const emptyTrace = (): Trace => ({
  text: "",
  xs: new Float32Array(MAX_LETTERS),
  len: 0,
  base: 0,
});

type WordCache = {
  index: number;
  set: number;
  el: Element;
  xs: Float32Array;
  ys: Float32Array;
  chars: string[];
  len: number;
};

const parseClip = (clip: string): [number, number][] => {
  const points: [number, number][] = [];
  for (const m of clip.matchAll(/(-?[\d.]+)%\s+(-?[\d.]+)%/g)) {
    points.push([Number(m[1]) / 100, Number(m[2]) / 100]);
  }
  return points;
};

export class FxLayer {
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private fx: FxCanvas | null = null;
  private frontCtx: CanvasRenderingContext2D | null = null;
  private frontPainted = false;
  /** No 2D canvas: effects stay off for the session. */
  broken = false;
  private readonly pool = new ParticlePool(INTENSITY.ultra.cap);
  private readonly glyphs: Glyph[] = [];
  private readonly pose: GlyphPose = newPose();
  private recipe: StyleRecipe = STYLES.stamp;
  private strength: TypingFxIntensity = "normal";
  private level: IntensityLevel = INTENSITY.normal;
  private still = false;
  private box: Box | null = null;
  private frame = 0;
  private placeDirty = false;
  private serial = 0;
  private lastKeyOwner = -1;
  private streak = 0;
  private theme: FxTheme | null = null;
  private tones = {
    accent: DEFAULT_PALETTE.accent,
    hot: DEFAULT_PALETTE.hot,
    ink: DEFAULT_PALETTE.ink,
    warn: DEFAULT_PALETTE.warn,
    ghost: mixHex(DEFAULT_PALETTE.accent, "#ffffff", 0.62),
  };
  private font = "400 32px monospace";
  private fontPx = 32;
  private fontStale = true;
  /** Baseline below a letter box's centre, px. */
  private baseShift = 11;
  private word: WordCache | null = null;
  private wordSet = 0;
  private readonly sx = new Float32Array(MAX_LETTERS);
  private readonly ctx: SpawnCtx;
  private readonly wctx: WordCtx;
  private aim: Glyph | null = null;
  private anchor: Anchor | null = null;
  /** Right-to-left text: a word's start edge is its right side. */
  private rtl = false;
  private readonly traces: [Trace, Trace] = [emptyTrace(), emptyTrace()];
  private observer: MutationObserver | null = null;
  private observed: Element | null = null;
  private listening = false;
  private clipA: [number, number][] = [];
  private clipB: [number, number][] = [];
  readonly stats = { keys: 0, words: 0, wrongs: 0, frames: 0 };

  private readonly deps: FxDeps;

  constructor(deps: FxDeps) {
    this.deps = deps;
    this.ctx = {
      pool: this.pool,
      owner: 0,
      prio: PRIORITY.key,
      x: 0,
      y: 0,
      h: 32,
      glyph: 0,
      now: 0,
      mult: 1,
      size: 1,
      still: false,
      random: Math.random,
      light: (offset, amount) => this.light(offset, amount),
      key: 0,
    };
    this.wctx = {
      pool: this.pool,
      owner: 0,
      prio: 0,
      gold: false,
      cx: 0,
      cy: 0,
      rowW: 0,
      h: 32,
      len: 0,
      sx: this.sx,
      now: 0,
      mult: 1,
      still: false,
      random: Math.random,
    };
  }

  get active(): boolean {
    return this.level.fx && !this.broken;
  }

  get liveParticles(): number {
    return this.pool.count;
  }

  get liveGlyphs(): number {
    return this.glyphs.length;
  }

  get canvases(): readonly HTMLCanvasElement[] {
    return this.back === null || this.front === null
      ? []
      : [this.back, this.front];
  }

  configure(style: TypingFxStyle, strength: TypingFxIntensity): void {
    this.recipe = STYLES[style];
    this.strength = strength;
    const clip = this.recipe.clip;
    this.clipA = clip === null ? [] : parseClip(clip[0]);
    this.clipB = clip === null ? [] : parseClip(clip[1]);
    this.refreshLevel();
    if (!this.level.fx) this.destroy();
  }

  /** A test starts: the theme, the letter font and the words box are read again. */
  start(): void {
    this.streak = 0;
    this.refreshLevel();
    if (!this.active) return;
    this.theme = null;
    this.fontStale = true;
    this.placeDirty = true;
  }

  /** Restart or finish: every effect goes at once. */
  reset(): void {
    this.streak = 0;
    this.drop();
    if (this.frame !== 0) this.deps.cancelFrame(this.frame);
    this.frame = 0;
    if (this.fx !== null) this.fx.draw(this.pool, this.deps.now(), this.still);
    this.clearFront();
  }

  /** Every live effect and the letters it was read on. */
  private drop(): void {
    this.word = null;
    this.anchor = null;
    this.lastKeyOwner = -1;
    this.pool.clear();
    this.glyphs.length = 0;
    for (const trace of this.traces) trace.len = 0;
  }

  destroy(): void {
    this.reset();
    this.back?.remove();
    this.front?.remove();
    this.back = null;
    this.front = null;
    this.fx = null;
    this.frontCtx = null;
    this.box = null;
    this.observer?.disconnect();
    this.observed = null;
    if (this.listening) {
      const view = this.deps.doc.defaultView;
      view?.removeEventListener("resize", this.onMove);
      view?.removeEventListener("scroll", this.onMove, true);
      this.listening = false;
    }
  }

  /** One scorer event (already logged); returns false when it drew nothing. */
  input(e: FxInput): boolean {
    if (!this.active || e.replaced || e.automatic || e.stopped || e.blind) {
      return false;
    }
    if (this.deps.slow()) return false;
    this.streak = e.streak;
    if (!this.ensure()) return false;
    // Effects already live follow the text first: new ones are read where it is now.
    this.track();
    const now = this.deps.now();
    this.refreshPalette();
    // A wrong space (short or misspelt word) moves on too: it gets the wrong pose, never a word release.
    if (!e.correct) return this.wrong(e, now);
    return e.commit ? this.complete(e, now) : this.key(e, now);
  }

  // ── Canvas and layout ──────────────────────────────────────────────────

  private refreshLevel(): void {
    this.still = this.deps.reducedMotion();
    this.level = levelFor(this.strength, this.still);
    this.pool.cap = this.level.cap;
  }

  private readonly onMove = (): void => {
    this.placeDirty = true;
  };

  private ensure(): boolean {
    if (this.broken) return false;
    if (this.back === null) {
      const doc = this.deps.doc;
      const back = doc.createElement("canvas");
      const front = doc.createElement("canvas");
      back.className = cn("pointer-events-none fixed top-0 left-0 -z-1");
      front.className = cn("pointer-events-none fixed top-0 left-0 z-3");
      back.setAttribute("aria-hidden", "true");
      front.setAttribute("aria-hidden", "true");
      back.dataset["typingFeel"] = "back";
      front.dataset["typingFeel"] = "front";
      try {
        this.fx = new FxCanvas(back);
        this.frontCtx = front.getContext("2d");
        if (this.frontCtx === null) throw new Error("typing-fx: no 2D canvas");
      } catch {
        this.fx = null;
        this.frontCtx = null;
        this.broken = true;
        return false;
      }
      doc.body.append(back, front);
      this.back = back;
      this.front = front;
      this.box = null;
      this.placeDirty = true;
      const view = doc.defaultView;
      if (view !== null && !this.listening) {
        view.addEventListener("resize", this.onMove, { passive: true });
        view.addEventListener("scroll", this.onMove, {
          passive: true,
          capture: true,
        });
        this.listening = true;
      }
    }
    if (this.fontStale) this.readFont(null);
    return this.place();
  }

  /** The words box grown by a bleed, inside the viewport; canvases move and resize when it changed. */
  private place(): boolean {
    const doc = this.deps.doc;
    const wrapper = doc.getElementById("wordsWrapper");
    const words = doc.getElementById("words");
    if (wrapper === null || words === null) return false;
    this.watch(words);
    const w = wrapper.getBoundingClientRect();
    const x = words.getBoundingClientRect();
    if (w.height <= 0 || x.width <= 0) return false;
    const view = doc.defaultView;
    const vw = view?.innerWidth ?? x.right;
    const vh = view?.innerHeight ?? w.bottom;
    const bleed = Math.max(48, 2 * this.fontPx);
    const left = Math.max(0, Math.floor(x.left - bleed));
    const top = Math.max(0, Math.floor(w.top - bleed));
    const right = Math.min(vw, Math.ceil(x.right + bleed));
    const bottom = Math.min(vh, Math.ceil(w.bottom + bleed));
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return false;
    this.placeDirty = false;
    const b = this.box;
    if (
      b?.left === left &&
      b.top === top &&
      b.width === width &&
      b.height === height
    ) {
      return true;
    }
    this.box = { left, top, width, height };
    const dpr = Math.max(1, Math.min(2, view?.devicePixelRatio ?? 1));
    for (const canvas of [this.back, this.front]) {
      if (canvas === null) continue;
      canvas.style.transform = `translate(${left}px, ${top}px)`;
    }
    this.fx?.resize(width, height, dpr);
    if (this.front !== null) {
      this.front.width = Math.round(width * dpr);
      this.front.height = Math.round(height * dpr);
      this.front.style.width = `${width}px`;
      this.front.style.height = `${height}px`;
    }
    // Live effects are in canvas px: the track() that follows every place() shifts them.
    return true;
  }

  /**
   * Monkeytype moves the text in its own frame, after ours (scrollTape sets
   * #words' margin, a line jump removes the top line): a style or child
   * change on #words moves live effects before that frame paints.
   */
  private watch(words: Element): void {
    if (this.observed === words) return;
    const Observer = this.deps.doc.defaultView?.MutationObserver;
    if (Observer === undefined) return;
    this.observer ??= new Observer(this.onMutate);
    this.observer.disconnect();
    this.observer.observe(words, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
    });
    this.observed = words;
  }

  private readonly onMutate = (): void => {
    if (this.glyphs.length === 0 && this.pool.count === 0) return;
    try {
      if (!this.track()) return;
      const now = this.deps.now();
      this.fx?.draw(this.pool, now, this.still);
      this.drawFront(now);
    } catch (error) {
      console.error("typing feel effects stopped", error);
      this.reset();
    }
  };

  /** A word's start edge (left, or right in right-to-left text) and top, in canvas px. */
  private edge(el: Element, box: Box): [number, number] {
    const r = el.getBoundingClientRect();
    return [(this.rtl ? r.right : r.left) - box.left, r.top - box.top];
  }

  private anchorOn(el: Element, box: Box): void {
    const [x, y] = this.edge(el, box);
    this.anchor = { el, x, y };
  }

  /**
   * Moves every live effect by how far its anchor word moved since it was
   * last read (a tape scroll, a line jump, a resize, the canvas box itself);
   * true when something moved. A word Monkeytype removed takes them away.
   */
  private track(): boolean {
    const a = this.anchor;
    const box = this.box;
    if (a === null || box === null) return false;
    if (!a.el.isConnected) {
      this.drop();
      return true;
    }
    const [x, y] = this.edge(a.el, box);
    const dx = x - a.x;
    const dy = y - a.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;
    a.x = x;
    a.y = y;
    this.shift(dx, dy);
    return true;
  }

  private shift(dx: number, dy: number): void {
    for (const g of this.glyphs) {
      g.x += dx;
      g.y += dy;
      g.base += dy;
    }
    const pool = this.pool;
    for (let i = 0; i < pool.count; i += 1) {
      pool.x[i] = (pool.x[i] ?? 0) + dx;
      pool.y[i] = (pool.y[i] ?? 0) + dy;
    }
    const cache = this.word;
    if (cache !== null) {
      for (let i = 0; i < cache.len; i += 1) {
        cache.xs[i] = (cache.xs[i] ?? 0) + dx;
        cache.ys[i] = (cache.ys[i] ?? 0) + dy;
      }
    }
    this.traces.forEach((trace, set) => {
      if (trace.len === 0) return;
      for (let i = 0; i < trace.len; i += 1) {
        trace.xs[i] = (trace.xs[i] ?? 0) + dx;
      }
      trace.base += dy;
      this.pushTrace(set);
    });
  }

  private pushTrace(set: number): void {
    const trace = this.traces[set & 1] as Trace;
    this.fx?.setGlyphs(
      set,
      trace.text,
      trace.xs.subarray(0, trace.len),
      trace.base,
      this.font,
    );
  }

  private readFont(letter: Element | null): void {
    const doc = this.deps.doc;
    const el = letter ?? doc.querySelector("#words .word letter");
    const view = doc.defaultView;
    if (el === null || view === null) return;
    const style = view.getComputedStyle(el);
    const px = Number.parseFloat(style.fontSize);
    if (!Number.isFinite(px) || px <= 0) return;
    this.fontStale = false;
    this.fontPx = px;
    this.rtl = style.direction === "rtl";
    this.font = `${style.fontStyle || "normal"} ${style.fontWeight || "400"} ${px}px ${style.fontFamily || "monospace"}`;
    this.baseShift = 0.32 * px;
    const ctx = this.frontCtx;
    if (ctx !== null && typeof ctx.measureText === "function") {
      ctx.font = this.font;
      const m = ctx.measureText("Hg");
      const asc = m.fontBoundingBoxAscent;
      const desc = m.fontBoundingBoxDescent;
      if (Number.isFinite(asc) && Number.isFinite(desc) && asc > 0) {
        this.baseShift = (asc - desc) / 2;
      }
    }
  }

  private refreshPalette(): void {
    const theme = this.deps.theme();
    if (theme === this.theme) return;
    this.theme = theme;
    const accent = this.hex(theme.main, DEFAULT_PALETTE.accent);
    const palette: TypingFxPalette = {
      accent,
      hot: this.hex(theme.text, DEFAULT_PALETTE.hot),
      ink: this.hex(theme.bg, DEFAULT_PALETTE.ink),
      warn: this.hex(theme.error, DEFAULT_PALETTE.warn),
      gold: this.hex(theme.caret, DEFAULT_PALETTE.gold),
      pending: this.hex(theme.sub, DEFAULT_PALETTE.pending),
      meaning: this.hex(theme.sub, DEFAULT_PALETTE.meaning),
    };
    this.fx?.setPalette(palette);
    this.tones = {
      accent,
      hot: palette.hot,
      ink: palette.ink,
      warn: palette.warn,
      ghost: mixHex(accent, "#ffffff", 0.62),
    };
  }

  /** Any CSS colour as #rrggbb (FxCanvas turns other forms into white). */
  private hex(color: string, fallback: string): string {
    const ctx = this.frontCtx;
    if (ctx === null) return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = color;
    const out = ctx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(out)) return out.toLowerCase();
    const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(out);
    if (m === null) return fallback;
    const part = (v: string | undefined): string =>
      Math.max(0, Math.min(255, Number(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${part(m[1])}${part(m[2])}${part(m[3])}`;
  }

  // ── Letters ─────────────────────────────────────────────────────────────

  private wordEl(index: number): Element | null {
    if (this.word?.index === index && this.word.el.isConnected) {
      return this.word.el;
    }
    return this.deps.doc.querySelector(
      `#words .word[data-wordindex='${index}']`,
    );
  }

  /** Every letter centre of a word (one read per letter), and the rune trace's glyphs. */
  private readWord(index: number, el: Element): WordCache {
    const box = this.box;
    const letters = el.querySelectorAll("letter");
    const len = Math.min(MAX_LETTERS, letters.length);
    const cache: WordCache =
      this.word?.index === index
        ? this.word
        : {
            index,
            set: (this.wordSet = this.wordSet ^ 1),
            el,
            xs: new Float32Array(MAX_LETTERS),
            ys: new Float32Array(MAX_LETTERS),
            chars: [],
            len: 0,
          };
    cache.el = el;
    cache.len = len;
    cache.chars.length = 0;
    for (let i = 0; i < len; i += 1) {
      const letter = letters[i] as Element;
      const r = letter.getBoundingClientRect();
      cache.xs[i] = r.left + r.width / 2 - (box?.left ?? 0);
      cache.ys[i] = r.top + r.height / 2 - (box?.top ?? 0);
      cache.chars.push(letter.textContent ?? "");
    }
    this.word = cache;
    if (len > 0) {
      const trace = this.traces[cache.set & 1] as Trace;
      trace.text = cache.chars.join("");
      trace.xs.set(cache.xs.subarray(0, len));
      trace.len = len;
      trace.base = (cache.ys[0] ?? 0) + this.baseShift;
      this.pushTrace(cache.set);
    }
    return cache;
  }

  /** Where letter `charIndex` of word `wordIndex` is (canvas px), or null when the word is not shown. */
  private locate(wordIndex: number, charIndex: number): Glyph | null {
    const el = this.wordEl(wordIndex);
    const box = this.box;
    if (el === null || box === null) return null;
    this.anchorOn(el, box);
    let cache = this.word;
    if (cache?.index !== wordIndex || cache.el !== el) {
      cache = this.readWord(wordIndex, el);
    }
    const letters = el.querySelectorAll("letter");
    const g: Glyph = {
      kind: KEY,
      at: 0,
      x: 0,
      y: 0,
      base: 0,
      w: this.fontPx * 0.6,
      hh: this.fontPx,
      ch: "",
      owner: 0,
      phase: 0,
      glyph: 0,
      amount: 0,
      word: wordIndex,
      index: charIndex,
    };
    const letter = letters[charIndex];
    if (letter !== undefined) {
      const r = letter.getBoundingClientRect();
      g.x = r.left + r.width / 2 - box.left;
      g.y = r.top + r.height / 2 - box.top;
      g.w = r.width;
      g.hh = r.height;
      g.ch = letter.textContent ?? "";
      // The word moved (a wrap, a resize): read it again for the trace and the lights.
      if (
        charIndex < cache.len &&
        (Math.abs((cache.xs[charIndex] ?? 0) - g.x) > 0.5 ||
          Math.abs((cache.ys[charIndex] ?? 0) - g.y) > 0.5)
      ) {
        this.readWord(wordIndex, el);
      }
    } else {
      // An extra letter (not drawn yet), zen mode, or an empty word: the word's right edge.
      const last = letters[letters.length - 1];
      if (last !== undefined) {
        const r = last.getBoundingClientRect();
        g.x = r.right + r.width / 2 - box.left;
        g.y = r.top + r.height / 2 - box.top;
        g.w = r.width;
        g.hh = r.height;
      } else {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) return null;
        g.x = r.right - box.left;
        g.y = r.top + r.height / 2 - box.top;
      }
    }
    g.base = g.y + this.baseShift;
    g.glyph = (this.word?.set ?? 0) * 64 + Math.min(63, charIndex);
    return g;
  }

  // ── Events ──────────────────────────────────────────────────────────────

  private key(e: FxInput, now: number): boolean {
    const g = this.locate(e.wordIndex, e.charIndex);
    if (g === null) return false;
    this.stats.keys += 1;
    this.serial += 1;
    g.kind = KEY;
    g.at = now;
    g.owner = this.serial;
    if (g.ch === "") g.ch = e.data;
    this.lastKeyOwner = this.serial;
    this.glyphs.push(g);
    // Frame 0 now: particles that start at 0 ms, before the next paint.
    this.step(g, now);
    this.run();
    return true;
  }

  private wrong(e: FxInput, now: number): boolean {
    const g = this.locate(e.wordIndex, e.charIndex);
    if (g === null) return false;
    this.stats.wrongs += 1;
    this.serial += 1;
    g.kind = WRONG;
    g.at = now;
    g.owner = this.serial;
    if (g.ch === "") g.ch = e.data;
    this.glyphs.push(g);
    if (this.level.particles > 0) {
      this.aimAt(g, now, PRIORITY.key);
      this.ctx.key = e.data.length > 0 ? (e.data.codePointAt(0) ?? 0) : 0;
      this.recipe.spawnWrong(this.ctx);
      spawnWrongBeat(this.ctx);
      this.ctx.key = 0;
    }
    this.run();
    return true;
  }

  private complete(e: FxInput, now: number): boolean {
    const el = this.wordEl(e.wordIndex);
    const box = this.box;
    if (el === null || box === null) return false;
    const letters = el.querySelectorAll("letter");
    const len = Math.min(MAX_LETTERS, letters.length);
    if (len === 0) return false;
    this.anchorOn(el, box);
    this.stats.words += 1;
    const prio = wordPriority(e.perfect, e.streak);
    const gold = prio >= PRIORITY.perfect;
    // The word effect replaces the last letter's particles (no double burst).
    if (this.lastKeyOwner >= 0) this.pool.killOwner(this.lastKeyOwner);
    this.lastKeyOwner = -1;
    for (let i = this.glyphs.length - 1; i >= 0; i -= 1) {
      if (this.glyphs[i]?.word === e.wordIndex) this.glyphs.splice(i, 1);
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let cy = 0;
    const xs = new Float32Array(len);
    for (let i = 0; i < len; i += 1) {
      const letter = letters[i] as Element;
      const r = letter.getBoundingClientRect();
      minX = Math.min(minX, r.left - box.left);
      maxX = Math.max(maxX, r.right - box.left);
      xs[i] = r.left + r.width / 2 - box.left;
      if (i === 0) cy = r.top + r.height / 2 - box.top;
      // Every letter flashes (T3), stronger on a perfect word.
      this.glyphs.push({
        kind: FLASH,
        at: now,
        x: xs[i] ?? 0,
        y: r.top + r.height / 2 - box.top,
        base: r.top + r.height / 2 - box.top + this.baseShift,
        w: r.width,
        hh: r.height,
        ch: letter.textContent ?? "",
        owner: 0,
        phase: 0,
        glyph: 0,
        amount: gold ? 1 : 0.9,
        word: -1,
        index: i,
      });
    }
    const cx = (minX + maxX) / 2;
    for (let i = 0; i < len; i += 1) this.sx[i] = (xs[i] ?? cx) - cx;
    if (this.level.particles > 0) {
      this.spawnWord(prio, gold, cx, cy, maxX - minX, len, now);
    }
    this.run();
    return true;
  }

  /** The kit strip's word release: the style's own, then the shared shock, ring and sparks. */
  private spawnWord(
    prio: number,
    gold: boolean,
    cx: number,
    cy: number,
    rowW: number,
    len: number,
    now: number,
  ): void {
    const pool = this.pool;
    const h = this.fontPx;
    this.serial += 1;
    const owner = this.serial;
    const w = this.wctx;
    w.owner = owner;
    w.prio = prio;
    w.gold = gold;
    w.cx = cx;
    w.cy = cy;
    w.rowW = rowW;
    w.h = h;
    w.len = len;
    w.now = now;
    w.mult = this.level.particles;
    w.still = this.still;
    this.recipe.spawnRelease(w);
    const milestone = prio === PRIORITY.milestone;
    const shock = pool.spawn(
      PK.shock,
      owner,
      prio,
      cx,
      cy,
      now,
      milestone ? 320 : 240,
    );
    if (shock >= 0) {
      pool.tone[shock] = gold ? TONE.gold : TONE.hot;
      pool.size[shock] = rowW / 2 + 0.3 * h;
      pool.size2[shock] = 0.78 * h;
      pool.rot[shock] = (milestone ? 0.11 : 0.075) * h;
      pool.aux[shock] = milestone
        ? 0.42
        : prio === PRIORITY.perfect
          ? 0.26
          : 0.18;
    }
    if (milestone || this.level.shock) {
      const ring = pool.spawn(PK.ring, owner, prio, cx, cy, now, 340);
      if (ring >= 0) {
        pool.tone[ring] = gold ? TONE.gold : TONE.light;
        pool.size[ring] = rowW / 2;
        pool.size2[ring] = this.still ? rowW / 2 : rowW / 2 + 1.5 * h;
        pool.aux[ring] = 0.09 * h;
      }
    }
    const per =
      (milestone ? 4 : prio === PRIORITY.perfect ? 3 : 2) *
      this.level.particles;
    const total = Math.min(milestone ? 32 : 24, Math.round(per * len));
    for (let k = 0; k < total; k += 1) {
      const i = pool.spawn(
        PK.spark,
        owner,
        prio,
        (this.sx[k % len] ?? 0) + cx,
        cy,
        now,
        200 + Math.random() * 120,
      );
      if (i < 0) break;
      pool.tone[i] = gold
        ? k % 2 === 0
          ? TONE.gold
          : TONE.hot
        : k % 2 === 0
          ? TONE.accent
          : TONE.hot;
      pool.aux[i] = 0.4 * h;
      pool.size[i] = 0.07 * h;
      const a = ((-90 + (Math.random() * 2 - 1) * 70) * Math.PI) / 180;
      if (this.still) {
        pool.rot[i] = a;
      } else {
        const speed = (18 + Math.random() * 14) * h;
        pool.vx[i] = Math.cos(a) * speed;
        pool.vy[i] = Math.sin(a) * speed;
        pool.drag[i] = 8;
      }
    }
  }

  private aimAt(g: Glyph, now: number, prio: number): void {
    const c = this.ctx;
    c.x = g.x;
    c.y = g.y;
    c.h = this.fontPx;
    c.glyph = g.glyph;
    c.now = now;
    c.owner = g.owner;
    c.prio = prio;
    c.mult = this.level.particles * comboParticles(this.streak);
    c.size = comboSize(this.streak);
    c.still = this.still;
    this.aim = g;
  }

  /** A style's light spilling onto the letter `offset` places away (SpawnCtx.light). */
  private light(offset: number, amount: number): void {
    const g = this.aim;
    const cache = this.word;
    if (g === null || cache?.index !== g.word) return;
    const i = g.index + offset;
    if (i < 0 || i >= cache.len) return;
    this.glyphs.push({
      kind: LIT,
      at: this.ctx.now,
      x: cache.xs[i] ?? 0,
      y: cache.ys[i] ?? 0,
      base: (cache.ys[i] ?? 0) + this.baseShift,
      w: g.w,
      hh: g.hh,
      ch: cache.chars[i] ?? "",
      owner: 0,
      phase: 0,
      glyph: 0,
      amount: Math.max(0, Math.min(1, amount)),
      word: g.word,
      index: i,
    });
  }

  // ── Frames ──────────────────────────────────────────────────────────────

  /** Runs a key's particle phases due by `now`; false once its pose is over. */
  private step(g: Glyph, now: number): boolean {
    const age = now - g.at;
    if (g.kind === KEY) {
      const recipe = this.recipe;
      if (this.level.particles > 0) {
        const phases = recipe.phases;
        while (g.phase < phases.length && age >= (phases[g.phase] ?? 0)) {
          this.aimAt(g, g.at + (phases[g.phase] ?? 0), PRIORITY.key);
          recipe.spawnKey(g.phase, this.ctx);
          g.phase += 1;
        }
      }
      return age < recipe.keyMs;
    }
    if (g.kind === WRONG) return age < WRONG_MS;
    if (g.kind === LIT) return age < LIT_MS;
    return age < FLASH_MS;
  }

  private run(): void {
    if (this.frame === 0) {
      this.frame = this.deps.requestFrame(this.tick);
    }
  }

  private readonly tick = (): void => {
    this.frame = 0;
    try {
      this.render(this.deps.now());
    } catch (error) {
      console.error("typing feel effects stopped", error);
      this.reset();
      return;
    }
    if (this.pool.count > 0 || this.glyphs.length > 0) this.run();
  };

  /** One frame at `now`: phases, particle expiry, the back canvas, then the poses in front. */
  render(now: number): void {
    if (this.placeDirty) this.place();
    this.track();
    for (let i = this.glyphs.length - 1; i >= 0; i -= 1) {
      const g = this.glyphs[i] as Glyph;
      if (!this.step(g, now)) this.glyphs.splice(i, 1);
    }
    this.pool.expire(now);
    this.fx?.draw(this.pool, now, this.still);
    this.drawFront(now);
    this.stats.frames += 1;
  }

  private clearFront(): void {
    const ctx = this.frontCtx;
    const canvas = this.front;
    if (ctx === null || canvas === null || !this.frontPainted) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.frontPainted = false;
  }

  private drawFront(now: number): void {
    const ctx = this.frontCtx;
    const canvas = this.front;
    if (ctx === null || canvas === null) return;
    this.clearFront();
    if (this.glyphs.length === 0) return;
    const dpr = this.box === null ? 1 : canvas.width / this.box.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = this.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    this.frontPainted = true;
    const m = this.level.motion;
    for (const g of this.glyphs) {
      const age = now - g.at;
      if (age < 0 || g.ch === "") continue;
      if (g.kind === KEY) {
        this.drawPose(ctx, g, this.recipe.keyPose(age, m, this.pose), false);
      } else if (g.kind === WRONG) {
        this.drawPose(ctx, g, wrongPose(age, m, this.pose), true);
      } else if (g.kind === LIT) {
        const a = g.amount * Math.exp(-age / 70);
        if (a > 0.01) this.drawHot(ctx, g, a, 0, 0, 0, 1, 1);
      } else {
        const a = popEnvelope(age, 55) * g.amount;
        if (a > 0.01) this.drawHot(ctx, g, a, 0, 0, 0, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private drawPose(
    ctx: CanvasRenderingContext2D,
    g: Glyph,
    p: GlyphPose,
    wrong: boolean,
  ): void {
    const em = this.fontPx;
    const sx = p.scale * (1 + 0.6 * p.squash);
    const sy = p.scale * (1 - p.squash);
    const moved =
      p.scale !== 1 ||
      p.rot !== 0 ||
      p.dx !== 0 ||
      p.dy !== 0 ||
      p.squash !== 0;
    if (p.bOn) {
      const shadow = this.recipe.id === "stamp" && !wrong;
      this.drawText(
        ctx,
        g,
        shadow ? this.tones.ink : this.ghostColor(),
        p.bAlpha * (shadow ? 0.9 : 1),
        p.bDx * em,
        p.bDy * em,
        p.bRot,
        p.bScale,
        p.bScale,
        this.clipB,
        0,
      );
    }
    if (p.alpha > 0.01 && moved) {
      this.drawText(
        ctx,
        g,
        wrong ? this.tones.warn : this.tones.hot,
        p.alpha,
        p.dx * em,
        p.dy * em,
        p.rot,
        sx,
        sy,
        [],
        0,
      );
    }
    if (p.hot > 0.01) this.drawHot(ctx, g, p.hot, p.dx, p.dy, p.rot, sx, sy);
    if (p.aOn) {
      this.drawText(
        ctx,
        g,
        this.ghostColor(),
        p.aAlpha,
        p.aDx * em,
        p.aDy * em,
        p.aRot,
        p.aScale,
        p.aScale,
        this.clipA,
        0.3 * em,
      );
    }
  }

  private ghostColor(): string {
    return this.recipe.ghost === "hot" ? this.tones.hot : this.tones.ghost;
  }

  private drawHot(
    ctx: CanvasRenderingContext2D,
    g: Glyph,
    alpha: number,
    dx: number,
    dy: number,
    rot: number,
    sx: number,
    sy: number,
  ): void {
    const em = this.fontPx;
    this.drawText(
      ctx,
      g,
      this.tones.hot,
      Math.min(1, alpha),
      dx * em,
      dy * em,
      rot,
      sx,
      sy,
      [],
      0.28 * em,
    );
  }

  /** A copy of the glyph about its centre: offsets in px, rotation in degrees, an optional clip (box shares). */
  private drawText(
    ctx: CanvasRenderingContext2D,
    g: Glyph,
    color: string,
    alpha: number,
    dx: number,
    dy: number,
    rotDeg: number,
    sx: number,
    sy: number,
    clip: readonly [number, number][],
    glow: number,
  ): void {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(g.x + dx, g.y + dy);
    if (rotDeg !== 0) ctx.rotate((rotDeg * Math.PI) / 180);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (clip.length > 2) {
      ctx.beginPath();
      clip.forEach(([px, py], k) => {
        const x = -g.w / 2 + px * g.w;
        const y = -g.hh / 2 + py * g.hh;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.clip();
    }
    if (glow > 0) {
      ctx.shadowColor = this.tones.accent;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.fillText(g.ch, 0, g.base - g.y);
    ctx.restore();
  }
}
