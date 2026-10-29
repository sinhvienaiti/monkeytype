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
    Array.from(text).forEach((ch, i) => {
      const letter = document.createElement("letter");
      letter.textContent = ch;
      letter.style.fontSize = "20px";
      setRect(letter, {
        left: 220 + w * 80 + i * 12,
        top: 320,
        width: 12,
        height: 24,
      });
      word.append(letter);
    });
    words.append(word);
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
