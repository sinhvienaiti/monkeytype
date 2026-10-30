import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FxLayer,
  type FxDeps,
  type FxInput,
} from "../../../src/ts/custom/typing-feel/fx-layer";
import type { ParticlePool } from "../../../src/ts/custom/typing-feel/kit/pool";

type Rect = { left: number; top: number; width: number; height: number };

function setRect(el: Element, r: Rect): void {
  el.getBoundingClientRect = () => ({
    ...r,
    x: r.left,
    y: r.top,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => r,
  });
}

const texts: string[] = [];

/** A 2D context that records text and accepts every call (happy-dom has no canvas). */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "measureText") {
        return () => ({
          width: 10,
          fontBoundingBoxAscent: 24,
          fontBoundingBoxDescent: 8,
        });
      }
      if (prop === "createRadialGradient") {
        return () => ({ addColorStop: () => undefined });
      }
      if (prop === "fillText") return (text: string) => texts.push(text);
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const WRAPPER = { left: 100, top: 300, width: 900, height: 150 };
const WORDS = { left: 200, top: 300, width: 700, height: 150 };

function buildWords(): void {
  document.body.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.id = "wordsWrapper";
  const words = document.createElement("div");
  words.id = "words";
  wrapper.append(words);
  document.body.append(wrapper);
  setRect(wrapper, WRAPPER);
  setRect(words, WORDS);
  ["cat", "dog"].forEach((text, w) => {
    const word = document.createElement("div");
    word.className = "word";
    word.dataset["wordindex"] = String(w);
    Array.from(text).forEach((ch) => {
      const letter = document.createElement("letter");
      letter.textContent = ch;
      letter.style.fontSize = "20px";
      word.append(letter);
    });
    words.append(word);
  });
  moveText(0, 0);
}

/** Monkeytype moving the text (tape margin, line jump): every word and letter shifts, the boxes stay. */
function moveText(dx: number, dy: number): void {
  document.querySelectorAll("#words .word").forEach((word, w) => {
    const left = 220 + w * 80 + dx;
    const top = 320 + dy;
    const letters = word.querySelectorAll("letter");
    setRect(word, { left, top, width: letters.length * 12, height: 24 });
    letters.forEach((letter, i) => {
      setRect(letter, { left: left + i * 12, top, width: 12, height: 24 });
    });
  });
}

const frames: (() => void)[] = [];
let now = 1000;
let slow = false;

function makeLayer(patch: Partial<FxDeps> = {}): FxLayer {
  return new FxLayer({
    doc: document,
    now: () => now,
    theme: () => ({
      main: "#e2b714",
      text: "#d1d0c5",
      bg: "#323437",
      error: "#ca4754",
      caret: "#e2b714",
      sub: "#646669",
    }),
    slow: () => slow,
    reducedMotion: () => false,
    requestFrame: (fn) => frames.push(fn),
    cancelFrame: () => undefined,
    ...patch,
  });
}

const key = (patch: Partial<FxInput> = {}): FxInput => ({
  wordIndex: 0,
  charIndex: 1,
  data: "a",
  correct: true,
  commit: false,
  perfect: false,
  replaced: false,
  stopped: false,
  automatic: false,
  blind: false,
  streak: 0,
  ...patch,
});

const poolOf = (layer: FxLayer): ParticlePool =>
  (layer as unknown as { pool: ParticlePool }).pool;

/** kind: 1 key, 2 wrong, 3 light on a neighbour, 4 word flash. */
type GlyphView = { kind: number; x: number; y: number; base: number };
const glyphsOf = (layer: FxLayer): GlyphView[] =>
  (layer as unknown as { glyphs: GlyphView[] }).glyphs;

// The unit harness stubs document.querySelector; these tests need the real one.
Reflect.deleteProperty(document, "querySelector");

describe("typing feel letter effects", () => {
  beforeEach(() => {
    buildWords();
    frames.length = 0;
    texts.length = 0;
    now = 1000;
    slow = false;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      fakeContext(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates nothing while the strength is off", () => {
    const layer = makeLayer();
    layer.configure("stamp", "off");
    expect(layer.input(key())).toBe(false);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });

  it("switches effects off without throwing when there is no 2D canvas", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const layer = makeLayer();
    layer.configure("stamp", "normal");
    expect(() => layer.input(key())).not.toThrow();
    expect(layer.broken).toBe(true);
    expect(layer.input(key())).toBe(false);
  });

  it("places the canvases on the words box grown by the bleed", () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    expect(layer.input(key())).toBe(true);
    const [back, front] = layer.canvases;
    // bleed = max(48, 2 × 20 px)
    expect(back?.style.transform).toBe("translate(152px, 252px)");
    expect(front?.style.transform).toBe("translate(152px, 252px)");
    expect(back?.className).toContain("-z-1");
    expect(front?.className).toContain("pointer-events-none");
  });

  it("spawns at the typed letter's centre in canvas px", () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    layer.input(key({ charIndex: 1 }));
    const pool = poolOf(layer);
    expect(pool.count).toBeGreaterThan(0);
    // letter 1: left 232, width 12 → centre 238; canvas left 152 → 86. Top 320 + 12 − 252 → 80.
    expect(pool.x[0]).toBeCloseTo(86);
    expect(pool.y[0]).toBeCloseTo(80);
  });

  it("puts an extra letter half a letter past the word's last letter", () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    layer.input(key({ charIndex: 5, data: "x" }));
    // last letter: left 244, right 256, width 12 → 262; canvas left 152 → 110.
    expect(poolOf(layer).x[0]).toBeCloseTo(110);
  });

  it("releases a finished word around its centre and drops the last key's particles", () => {
    const layer = makeLayer();
    layer.configure("smash", "high");
    layer.input(key({ charIndex: 2, data: "t" }));
    const before = poolOf(layer).count;
    expect(before).toBeGreaterThan(0);
    layer.input(key({ charIndex: 3, data: " ", commit: true, perfect: true }));
    const pool = poolOf(layer);
    // word 0: 220 … 256 → centre 238 → canvas 86.
    expect(pool.x[0]).toBeCloseTo(86);
    expect(layer.stats.words).toBe(1);
  });

  it("gives a wrong space the wrong pose, never a word release", () => {
    const layer = makeLayer();
    layer.configure("smash", "high");
    layer.input(key({ charIndex: 2, data: "t" }));
    const keyParticles = poolOf(layer).count;
    // "ca " for "cat": the space lands on the missed letter and moves on.
    expect(
      layer.input(
        key({ charIndex: 2, data: " ", commit: true, correct: false }),
      ),
    ).toBe(true);
    expect(layer.stats.words).toBe(0);
    expect(layer.stats.wrongs).toBe(1);
    // The last key keeps its particles (a release would replace them), no letter flashes.
    expect(poolOf(layer).count).toBeGreaterThanOrEqual(keyParticles);
    const kinds = glyphsOf(layer).map((g) => g.kind);
    expect(kinds.filter((k) => k === 1)).toHaveLength(1);
    expect(kinds.filter((k) => k === 2)).toHaveLength(1);
    expect(kinds).not.toContain(4);
  });

  it("keeps live effects on their letters when the tape scrolls", () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    layer.input(key({ charIndex: 1 }));
    const pool = poolOf(layer);
    const glyph = glyphsOf(layer).find((g) => g.kind === 1);
    expect(pool.x[0]).toBeCloseTo(86);
    expect(glyph?.x).toBeCloseTo(86);
    // Tape "letter" mode: #words slides one letter left after each key.
    moveText(-12, 0);
    now += 16;
    frames.shift()?.();
    expect(pool.x[0]).toBeCloseTo(74);
    expect(glyph?.x).toBeCloseTo(74);
    // A new key is read where the text is now, the old one stays on its letter.
    layer.input(key({ charIndex: 2, data: "t" }));
    const keys = glyphsOf(layer).filter((g) => g.kind === 1);
    expect(keys.map((g) => g.x)).toEqual([74, 86]);
  });

  it("moves a word release up with a line jump", () => {
    const layer = makeLayer();
    layer.configure("smash", "high");
    layer.input(key({ charIndex: 3, data: " ", commit: true, perfect: true }));
    const flash = glyphsOf(layer)[0];
    const y = flash?.y ?? 0;
    expect(y).toBeCloseTo(80);
    moveText(0, -24);
    now += 16;
    frames.shift()?.();
    expect(flash?.y).toBeCloseTo(56);
    expect(flash?.base).toBeCloseTo((flash?.y ?? 0) + 8);
    expect(poolOf(layer).y[0]).toBeCloseTo(56);
  });

  it("follows a #words change before Monkeytype's frame paints", async () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    layer.input(key({ charIndex: 1 }));
    moveText(-12, 0);
    document.getElementById("words")?.style.setProperty("margin-left", "-12px");
    await new Promise((done) => setTimeout(done, 0));
    // No frame ran: the observer moved it.
    expect(poolOf(layer).x[0]).toBeCloseTo(74);
    expect(glyphsOf(layer).find((g) => g.kind === 1)?.x).toBeCloseTo(74);
  });

  it("drops effects whose word Monkeytype removed", () => {
    const layer = makeLayer();
    layer.configure("flare", "normal");
    layer.input(key({ charIndex: 1 }));
    expect(poolOf(layer).count).toBeGreaterThan(0);
    document.querySelector("#words .word")?.remove();
    now += 16;
    frames.shift()?.();
    expect(poolOf(layer).count).toBe(0);
    expect(layer.liveGlyphs).toBe(0);
  });

  it("skips IME replacements, automatic, stopped, blind and slow input", () => {
    const layer = makeLayer();
    layer.configure("flare", "ultra");
    expect(layer.input(key({ replaced: true }))).toBe(false);
    expect(layer.input(key({ automatic: true }))).toBe(false);
    expect(layer.input(key({ stopped: true }))).toBe(false);
    expect(layer.input(key({ blind: true }))).toBe(false);
    slow = true;
    expect(layer.input(key())).toBe(false);
    expect(poolOf(layer).count).toBe(0);
  });

  it("moves only the letter at Low: poses, no particles", () => {
    const layer = makeLayer();
    layer.configure("minimal", "low");
    expect(layer.input(key())).toBe(true);
    expect(poolOf(layer).count).toBe(0);
    expect(layer.liveGlyphs).toBe(1);
    now += 16;
    frames.shift()?.();
    expect(texts).toContain("a");
  });

  it("runs Stamp's landing particles at 50 ms in the frame loop, then stops", () => {
    const layer = makeLayer();
    layer.configure("stamp", "normal");
    layer.input(key());
    expect(poolOf(layer).count).toBe(0);
    now += 50;
    frames.shift()?.();
    expect(poolOf(layer).count).toBeGreaterThan(0);
    for (let i = 0; i < 100 && frames.length > 0; i += 1) {
      now += 16;
      frames.shift()?.();
    }
    expect(frames).toHaveLength(0);
    expect(poolOf(layer).count).toBe(0);
    expect(layer.liveGlyphs).toBe(0);
  });

  it("clears every effect on reset", () => {
    const layer = makeLayer();
    layer.configure("shatter", "ultra");
    layer.input(key());
    layer.input(key({ correct: false, data: "z" }));
    expect(poolOf(layer).count).toBeGreaterThan(0);
    layer.reset();
    expect(poolOf(layer).count).toBe(0);
    expect(layer.liveGlyphs).toBe(0);
  });
});
