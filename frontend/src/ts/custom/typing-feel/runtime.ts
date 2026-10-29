import { Config } from "../../config/store";
import { configEvent } from "../../events/config";
import * as SlowTimer from "../../legacy-states/slow-timer";
import { getTheme } from "../../states/theme";
import { FxLayer } from "./fx-layer";
import {
  applyKeyboardLevels,
  gameplaySounds,
  KeySoundRouter,
  ownsKeySoundFor,
  packState,
  syncSavedKeyboard,
} from "./sounds";
import {
  getTypingFeel,
  onTypingFeelChange,
  type TypingFeelSettings,
} from "./store";

/**
 * Typing feel's hooks into Monkeytype. Every hook returns at once on a
 * cached flag when its part is off, and catches its own errors: feedback
 * must never break typing or change what the scorer sees.
 */

export type ScorerInput = {
  wordIndex: number;
  charIndex: number;
  data: string;
  correct: boolean;
  commit: boolean;
  perfect: boolean;
  replaced: boolean;
  stopped: boolean;
  automatic: boolean;
};

let settings: TypingFeelSettings | null = null;
let soundOn = false;
let fxOn = false;
let streak = 0;
let fx: FxLayer | null = null;
let syncing = false;

const reducedQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function current(): TypingFeelSettings {
  if (settings === null) apply(getTypingFeel());
  return settings as TypingFeelSettings;
}

function apply(next: TypingFeelSettings): void {
  settings = next;
  soundOn = next.keyboardSound !== "off";
  fxOn = next.effectStrength !== "off";
  if (fxOn || fx !== null) {
    layer().configure(next.letterEffect, next.effectStrength);
  }
}

function layer(): FxLayer {
  fx ??= new FxLayer({
    doc: document,
    now: () => performance.now(),
    theme: getTheme,
    slow: () => SlowTimer.get(),
    reducedMotion: () => reducedQuery?.matches === true,
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id),
  });
  return fx;
}

const router = new KeySoundRouter({
  sink: gameplaySounds,
  owns: () => ownsKeySound(),
  errorSound: () => Config.playSoundOnError !== "off",
});

onTypingFeelChange((next) => {
  const before = settings;
  apply(next);
  if (
    before?.keyboardSound !== next.keyboardSound ||
    before.keyboardVolume !== next.keyboardVolume
  ) {
    applyKeyboardLevels(next);
  }
});

function sync(): void {
  if (syncing) return;
  syncing = true;
  void syncSavedKeyboard()
    .catch((error: unknown) => {
      console.error("typing feel: keyboard set not loaded", error);
    })
    .finally(() => {
      syncing = false;
    });
}

/** Called once the app is ready: levels follow Monkeytype's volume; the saved set loads when idle. */
export function init(): void {
  try {
    const s = current();
    applyKeyboardLevels(s);
    configEvent.subscribe(({ key }) => {
      if (key === "soundVolume" || key === "fullConfigChangeFinished") {
        applyKeyboardLevels(current());
      }
    });
    if (!soundOn) return;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(sync, { timeout: 3000 });
    } else {
      setTimeout(sync, 1500);
    }
  } catch (error) {
    console.error("typing feel: init failed", error);
  }
}

/** The words input's keydown, before Monkeytype handles it. */
export function noteKeydown(event: KeyboardEvent): void {
  current();
  if (!soundOn) return;
  try {
    router.keydown(event);
    const id = settings?.keyboardSound ?? "off";
    if (packState(id) === undefined) sync();
  } catch (error) {
    console.error("typing feel: keydown", error);
  }
}

/** A selected set is loaded: it replaces Monkeytype's click (not its error sound). */
export function ownsKeySound(): boolean {
  current();
  return soundOn && settings !== null && ownsKeySoundFor(settings);
}

/** Right after the scorer logged an insert; only observes. */
export function onScorerInput(input: ScorerInput): void {
  current();
  if (!soundOn && !fxOn) return;
  try {
    if (input.commit && !input.automatic) {
      streak = input.perfect ? streak + 1 : 0;
    }
    if (soundOn) {
      router.scorer({
        correct: input.correct,
        commit: input.commit,
        perfect: input.perfect,
        charIndex: input.charIndex,
        streak,
      });
    }
    if (fxOn) {
      layer().input({ ...input, blind: Config.blindMode, streak });
    }
  } catch (error) {
    console.error("typing feel: input", error);
  }
}

export function onDelete(): void {
  current();
  if (!soundOn) return;
  try {
    router.deleted();
  } catch (error) {
    console.error("typing feel: delete", error);
  }
}

export function start(): void {
  current();
  streak = 0;
  router.idle = false;
  if (!fxOn) return;
  try {
    layer().start();
  } catch (error) {
    console.error("typing feel: start", error);
  }
}

export function reset(): void {
  streak = 0;
  router.reset();
  router.idle = false;
  try {
    fx?.reset();
  } catch (error) {
    console.error("typing feel: reset", error);
  }
}

/** The result shows: no effect plays over it, stray keys stay silent. */
export function finish(): void {
  streak = 0;
  router.reset();
  router.idle = true;
  try {
    fx?.reset();
  } catch (error) {
    console.error("typing feel: finish", error);
  }
}
