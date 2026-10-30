import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testing } from "../../../src/ts/config/testing";
import {
  applyKeyboardLevels,
  gameplaySounds,
  keyboardGain,
  KeySoundRouter,
  loadSavedKeyboard,
  markPack,
  syncSavedKeyboard,
  ownsKeySoundFor,
  packState,
  type KeydownLike,
  type KeySoundSink,
} from "../../../src/ts/custom/typing-feel/sounds";
import {
  getTypingFeel,
  setTypingFeel,
  type TypingFeelSettings,
} from "../../../src/ts/custom/typing-feel/store";
import {
  BASE,
  CATALOGUE_URL,
  FEEL_URL,
  feelFetch,
  sampleCatalogue,
} from "./feel-fixture";

const settings = (
  patch: Partial<TypingFeelSettings> = {},
): TypingFeelSettings => ({
  keyboardSound: "bright-clack",
  keyboardVolume: 100,
  letterEffect: "stamp",
  effectStrength: "normal",
  ...patch,
});

function fakeSink(): KeySoundSink & { plays: string[] } {
  const plays: string[] = [];
  return {
    plays,
    key: vi.fn((i: number) => plays.push(`key:${i}`)),
    wrong: vi.fn(() => plays.push("wrong")),
    stray: vi.fn(() => plays.push("stray")),
    space: vi.fn(() => plays.push("space")),
    complete: vi.fn((perfect: boolean, combo: number) =>
      plays.push(`complete:${perfect}:${combo}`),
    ),
    resume: vi.fn(() => ({}) as AudioContext),
  };
}

const keydown = (
  key: string,
  patch: Partial<KeydownLike> = {},
): KeydownLike => ({
  key,
  code:
    key === " "
      ? "Space"
      : key === "Backspace"
        ? "Backspace"
        : `Key${key.toUpperCase()}`,
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...patch,
});

const scorer = {
  correct: true,
  commit: false,
  perfect: false,
  charIndex: 0,
  streak: 0,
};

function setup(options: { owns?: boolean; errorSound?: boolean } = {}): {
  router: KeySoundRouter;
  sink: ReturnType<typeof fakeSink>;
} {
  const sink = fakeSink();
  const router = new KeySoundRouter({
    sink: () => sink,
    owns: () => options.owns ?? true,
    errorSound: () => options.errorSound ?? false,
  });
  return { router, sink };
}

describe("one sound per physical key", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("plays once for a key whose scorer replays three events (an IME burst)", () => {
    const { router, sink } = setup();
    router.keydown(keydown("a"));
    router.scorer({ ...scorer, charIndex: 0 });
    router.scorer({ ...scorer, charIndex: 1 });
    router.scorer({ ...scorer, charIndex: 2 });
    vi.runAllTimers();
    expect(sink.plays).toEqual(["key:0"]);
    expect(sink.resume).toHaveBeenCalledTimes(1);
  });

  it("plays one neutral sound by code when no scorer event claims the key", () => {
    const { router, sink } = setup();
    router.keydown(keydown("Process", { code: "KeyA" }));
    vi.runAllTimers();
    router.keydown(keydown(" "));
    vi.runAllTimers();
    router.keydown(keydown("Backspace"));
    vi.runAllTimers();
    expect(sink.plays).toEqual(["key:0", "space", "stray"]);
  });

  it("is silent for scorer events without a key (automatic inserts)", () => {
    const { router, sink } = setup();
    router.scorer(scorer);
    router.deleted();
    expect(sink.plays).toEqual([]);
  });

  it("ignores key repeats, shortcuts and non-typing keys", () => {
    const { router, sink } = setup();
    expect(router.keydown(keydown("a", { repeat: true }))).toBe(false);
    expect(router.keydown(keydown("c", { ctrlKey: true }))).toBe(false);
    expect(router.keydown(keydown("v", { metaKey: true }))).toBe(false);
    expect(router.keydown(keydown("Tab"))).toBe(false);
    expect(router.keydown(keydown("Shift"))).toBe(false);
    // AltGr is Ctrl+Alt on Windows; Ctrl+Backspace deletes a word.
    expect(router.keydown(keydown("ą", { ctrlKey: true, altKey: true }))).toBe(
      true,
    );
    expect(router.keydown(keydown("Backspace", { ctrlKey: true }))).toBe(true);
    vi.runAllTimers();
    expect(sink.plays).toEqual(["key:0", "stray"]);
  });

  it("leaves wrong keys to Monkeytype's error sound when it is on", () => {
    const withError = setup({ errorSound: true });
    withError.router.keydown(keydown("x"));
    withError.router.scorer({ ...scorer, correct: false });
    vi.runAllTimers();
    expect(withError.sink.plays).toEqual([]);

    const without = setup({ errorSound: false });
    without.router.keydown(keydown("x"));
    without.router.scorer({ ...scorer, correct: false });
    expect(without.sink.plays).toEqual(["wrong"]);
  });

  it("plays a word for a commit, never also the spacebar", () => {
    const { router, sink } = setup();
    router.keydown(keydown(" "));
    router.scorer({ ...scorer, commit: true, perfect: true, streak: 10 });
    vi.runAllTimers();
    expect(sink.plays).toEqual(["complete:true:10"]);
    expect(sink.space).not.toHaveBeenCalled();
  });

  it("leaves a wrong space (a short or misspelt word) to Monkeytype's error sound", () => {
    const { router, sink } = setup({ errorSound: true });
    router.keydown(keydown(" "));
    router.scorer({ ...scorer, correct: false, commit: true });
    vi.runAllTimers();
    expect(sink.plays).toEqual([]);
  });

  it("plays the wrong cue, never a word, for a wrong space with error sounds off", () => {
    const { router, sink } = setup({ errorSound: false });
    router.keydown(keydown(" "));
    router.scorer({ ...scorer, correct: false, commit: true, streak: 4 });
    vi.runAllTimers();
    expect(sink.plays).toEqual(["wrong"]);
    expect(sink.complete).not.toHaveBeenCalled();
  });

  it("plays the quieter stray for a delete", () => {
    const { router, sink } = setup();
    router.keydown(keydown("Backspace"));
    router.deleted();
    vi.runAllTimers();
    expect(sink.plays).toEqual(["stray"]);
  });

  it("stays silent when no set owns the keys, and after a finish", () => {
    const off = setup({ owns: false });
    off.router.keydown(keydown("a"));
    off.router.scorer(scorer);
    vi.runAllTimers();
    expect(off.sink.plays).toEqual([]);

    const done = setup();
    done.router.idle = true;
    done.router.keydown(keydown("a"));
    vi.runAllTimers();
    expect(done.sink.plays).toEqual([]);
  });

  it("drops a pending key on reset", () => {
    const { router, sink } = setup();
    router.keydown(keydown("a"));
    router.reset();
    vi.runAllTimers();
    router.scorer(scorer);
    expect(sink.plays).toEqual([]);
  });
});

describe("keyboard levels and ownership", () => {
  beforeEach(() => {
    __testing.replaceConfig({ soundVolume: 0.5 });
  });

  it("is Monkeytype's sound volume times the keyboard volume", () => {
    expect(keyboardGain(settings({ keyboardVolume: 60 }))).toBeCloseTo(0.3);
    __testing.replaceConfig({ soundVolume: 0 });
    expect(keyboardGain(settings())).toBe(0);
  });

  it("mutes the player for Off or a zero level", () => {
    const player = gameplaySounds();
    applyKeyboardLevels(settings({ keyboardSound: "off" }));
    expect(player.muted).toBe(true);
    applyKeyboardLevels(settings({ keyboardVolume: 0 }));
    expect(player.muted).toBe(true);
    applyKeyboardLevels(settings());
    expect(player.muted).toBe(false);
  });

  it("marks a set the catalogue does not list, so keys stop asking for it", async () => {
    await loadSavedKeyboard({ options: [], state: "missing" }, () => "deep");
    expect(packState("deep")).toBe("missing");
    expect(ownsKeySoundFor(settings({ keyboardSound: "deep" }))).toBe(false);
  });

  it("marks a disabled set without fetching it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await loadSavedKeyboard(
      {
        options: [
          { value: "off", label: "Off" },
          {
            value: "solid",
            label: "Solid",
            manifest: `${BASE}sets/solid/0123456789ab/keys-manifest.json`,
            disabled: true,
            note: "unavailable",
          },
        ],
        state: "ready",
      },
      () => "solid",
    );
    vi.unstubAllGlobals();
    expect(packState("solid")).toBe("missing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads a set again when the player released it after another one played", async () => {
    // Ready from an earlier load, then released by the kit when the settings preview switched sets.
    markPack({ id: "clear", state: "ready", keys: 70, spaces: 8, missing: [] });
    expect(gameplaySounds().use("clear")).toBe(false);
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => null,
    }));
    vi.stubGlobal("fetch", fetchSpy);
    await loadSavedKeyboard(
      {
        options: [
          { value: "off", label: "Off" },
          {
            value: "clear",
            label: "Clear Velvet",
            family: "Clear",
            manifest: `${BASE}sets/clear/0123456789ab/keys-manifest.json`,
            preview: `${BASE}sets/clear/0123456789ab/preview.ogg`,
          },
        ],
        state: "ready",
      },
      () => "clear",
    );
    vi.unstubAllGlobals();
    // Set manifests are immutable: the HTTP cache may answer, the wait is bounded.
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}sets/clear/0123456789ab/keys-manifest.json`,
      expect.objectContaining({ cache: "default" }),
    );
    // Nothing loaded this time: keys go back to Monkeytype's click, not silence.
    expect(packState("clear")).toBe("failed");
    expect(ownsKeySoundFor(settings({ keyboardSound: "clear" }))).toBe(false);
  });

  it("owns key sounds only for a selected, loaded set", () => {
    expect(ownsKeySoundFor(settings({ keyboardSound: "warm" }))).toBe(false);
    markPack({ id: "warm", state: "ready", keys: 10, spaces: 3, missing: [] });
    expect(ownsKeySoundFor(settings({ keyboardSound: "warm" }))).toBe(true);
    expect(ownsKeySoundFor(settings({ keyboardSound: "off" }))).toBe(false);
    markPack({
      id: "crisp",
      state: "pending",
      keys: 0,
      spaces: 0,
      missing: [],
    });
    expect(ownsKeySoundFor(settings({ keyboardSound: "crisp" }))).toBe(false);
  });
});

describe("the saved set without Typing Feel", () => {
  it("keeps the saved id and lets Monkeytype's click play when TYPING_FEEL_URL is not set", async () => {
    localStorage.clear();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(setTypingFeel(settings({ keyboardSound: "raindrop-tile" }))).toBe(
      true,
    );
    await syncSavedKeyboard();
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getTypingFeel().keyboardSound).toBe("raindrop-tile");
    expect(packState("raindrop-tile")).toBe("missing");
    expect(ownsKeySoundFor(settings({ keyboardSound: "raindrop-tile" }))).toBe(
      false,
    );
  });

  it("leaves a player without a save unsaved, and marks the default missing so keys stop asking", async () => {
    localStorage.clear();
    vi.resetModules();
    const fresh = await import("../../../src/ts/custom/typing-feel/sounds");
    const store = await import("../../../src/ts/custom/typing-feel/store");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await fresh.syncSavedKeyboard();
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("personalTypingFeelSettings")).toBeNull();
    expect(store.getTypingFeel().keyboardSound).toBe("bright-clack");
    expect(fresh.packState("bright-clack")).toBe("missing");
  });
});

describe("the saved set with TYPING_FEEL_URL set", () => {
  afterEach(() => {
    vi.doUnmock("virtual:env-config");
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function withFeel(): Promise<{
    sounds: typeof import("../../../src/ts/custom/typing-feel/sounds");
    store: typeof import("../../../src/ts/custom/typing-feel/store");
  }> {
    localStorage.clear();
    vi.resetModules();
    vi.doMock("virtual:env-config", () => ({
      envConfig: { typingFeelUrl: FEEL_URL },
    }));
    return {
      sounds: await import("../../../src/ts/custom/typing-feel/sounds"),
      store: await import("../../../src/ts/custom/typing-feel/store"),
    };
  }

  it("keeps the saved id when the host is down; Monkeytype's click plays", async () => {
    const { sounds, store } = await withFeel();
    const fetchSpy = vi.fn(feelFetch({ down: true }));
    vi.stubGlobal("fetch", fetchSpy);
    store.setTypingFeel(settings({ keyboardSound: "hail-stone" }));
    await sounds.syncSavedKeyboard();
    expect(fetchSpy).toHaveBeenCalledWith(
      CATALOGUE_URL,
      expect.objectContaining({ cache: "no-cache" }),
    );
    expect(store.getTypingFeel().keyboardSound).toBe("hail-stone");
    expect(sounds.packState("hail-stone")).toBe("missing");
    expect(
      sounds.ownsKeySoundFor(settings({ keyboardSound: "hail-stone" })),
    ).toBe(false);
  });

  it("lets a player without a save follow the catalogue's default, unsaved, samples bounded", async () => {
    const { sounds, store } = await withFeel();
    const kit = await import("../../../src/ts/custom/typing-feel/kit/audio");
    const catalog = await import("../../../src/ts/custom/typing-feel/catalog");
    const load = vi.spyOn(kit.TypingSounds.prototype, "loadKeyboardManifest");
    const catalogue = { ...sampleCatalogue(), default: "hail-stone" };
    const fetchSpy = vi.fn(feelFetch({ catalogue }));
    vi.stubGlobal("fetch", fetchSpy);
    await sounds.syncSavedKeyboard();
    expect(store.getTypingFeel().keyboardSound).toBe("hail-stone");
    expect(localStorage.getItem("personalTypingFeelSettings")).toBeNull();
    const row = catalogue.profiles.find((p) => p.id === "hail-stone");
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}${row?.manifest}`,
      expect.objectContaining({ cache: "default" }),
    );
    // Samples go through the bounded fetch, so a hung host gives up.
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toBe(`${BASE}${row?.manifest}`);
    expect(load.mock.calls[0]?.[3]).toBe(catalog.fetchSetManifest);
    expect(load.mock.calls[0]?.[4]).toBe(catalog.fetchSample);
    load.mockRestore();
    // Nothing decodes here (no audio in the test DOM): Monkeytype's click plays.
    expect(sounds.packState("hail-stone")).toBe("failed");
  });

  it("keeps a saved set when the catalogue's default is another one", async () => {
    const { sounds, store } = await withFeel();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        feelFetch({
          catalogue: { ...sampleCatalogue(), default: "hail-stone" },
        }),
      ),
    );
    store.setTypingFeel(settings({ keyboardSound: "bright-clack" }));
    await sounds.syncSavedKeyboard();
    expect(store.getTypingFeel().keyboardSound).toBe("bright-clack");
    expect(
      JSON.parse(localStorage.getItem("personalTypingFeelSettings") ?? "null"),
    ).toMatchObject({ keyboardSound: "bright-clack" });
  });

  it("repairs a retired id to the catalogue default and loads it from the feel host", async () => {
    const { sounds, store } = await withFeel();
    const fetchSpy = vi.fn(feelFetch());
    vi.stubGlobal("fetch", fetchSpy);
    store.setTypingFeel(settings({ keyboardSound: "creamy" }));
    await sounds.syncSavedKeyboard();
    expect(store.getTypingFeel().keyboardSound).toBe("bright-clack");
    const row = sampleCatalogue().profiles.find((p) => p.id === "bright-clack");
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}${row?.manifest}`,
      expect.objectContaining({ cache: "default" }),
    );
    // Every request went to the feel host.
    for (const [url] of fetchSpy.mock.calls) {
      expect(url.startsWith(`${FEEL_URL}/v1/keys/`)).toBe(true);
    }
  });
});
