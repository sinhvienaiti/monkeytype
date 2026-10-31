import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));

const storageKey = "personalTypingFeelSettings";
const load = async (): Promise<
  typeof import("../../../src/ts/custom/typing-feel/store")
> => import("../../../src/ts/custom/typing-feel/store");

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("typing feel settings", () => {
  it("defaults to Bright Clack, full keyboard volume, Stamp at Normal", async () => {
    const { getTypingFeel } = await load();
    expect(getTypingFeel()).toEqual({
      keyboardSound: "bright-clack",
      keyboardVolume: 100,
      letterEffect: "stamp",
      effectStrength: "normal",
    });
  });

  it("repairs each bad field on its own and writes the repaired save back", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        keyboardSound: "Bright Clack!",
        keyboardVolume: 37.6,
        letterEffect: "rune",
        effectStrength: "loud",
        playSoundOnClick: "1",
      }),
    );
    const { getTypingFeel } = await load();
    expect(getTypingFeel()).toEqual({
      keyboardSound: "bright-clack",
      keyboardVolume: 38,
      letterEffect: "rune",
      effectStrength: "normal",
    });
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual(
      getTypingFeel(),
    );
  });

  it("clamps the keyboard volume and keeps a legacy set id for the catalogue to repair", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ keyboardSound: "creamy", keyboardVolume: 250 }),
    );
    const { getTypingFeel } = await load();
    expect(getTypingFeel()).toMatchObject({
      keyboardSound: "creamy",
      keyboardVolume: 100,
    });
    localStorage.setItem(storageKey, JSON.stringify({ keyboardVolume: -4 }));
    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.getTypingFeel().keyboardVolume).toBe(0);
  });

  it("falls back to the defaults for a save that is not an object", async () => {
    localStorage.setItem(storageKey, JSON.stringify(["warm"]));
    const { getTypingFeel } = await load();
    expect(getTypingFeel().keyboardSound).toBe("bright-clack");
  });

  it("persists a change across a fresh load and tells listeners", async () => {
    const { getTypingFeel, setTypingFeel, onTypingFeelChange } = await load();
    const heard = vi.fn();
    onTypingFeelChange(heard);
    expect(
      setTypingFeel({
        ...getTypingFeel(),
        keyboardSound: "off",
        effectStrength: "ultra",
      }),
    ).toBe(true);
    expect(heard).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardSound: "off",
        effectStrength: "ultra",
      }),
    );
    vi.resetModules();
    const reloaded = await load();
    expect(reloaded.getTypingFeel()).toMatchObject({
      keyboardSound: "off",
      effectStrength: "ultra",
    });
  });

  it("refuses an invalid change and keeps the saved value", async () => {
    const { getTypingFeel, setTypingFeel } = await load();
    expect(
      setTypingFeel({ ...getTypingFeel(), letterEffect: "sparkle" as never }),
    ).toBe(false);
    expect(getTypingFeel().letterEffect).toBe("stamp");
  });
});

describe("a player without a save (§4.5)", () => {
  it("follows the catalogue default unsaved, until any change saves the sound they had", async () => {
    const store = await load();
    const heard: string[] = [];
    store.onTypingFeelChange((s) => heard.push(s.keyboardSound));
    expect(store.savedKeyboardSound()).toBeNull();
    store.followKeyboardDefault("hail-stone");
    expect(store.getTypingFeel().keyboardSound).toBe("hail-stone");
    expect(heard).toEqual(["hail-stone"]);
    expect(store.hasTypingFeelSave()).toBe(false);
    expect(localStorage.getItem(storageKey)).toBeNull();

    expect(
      store.setTypingFeel({ ...store.getTypingFeel(), letterEffect: "flare" }),
    ).toBe(true);
    expect(store.savedKeyboardSound()).toBe("hail-stone");
    // A later catalogue default no longer moves them.
    store.followKeyboardDefault("deep");
    expect(store.getTypingFeel().keyboardSound).toBe("hail-stone");
    expect(heard).toEqual(["hail-stone", "hail-stone"]);
  });

  it("never lets a followed default override a save", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        keyboardSound: "warm",
        keyboardVolume: 100,
        letterEffect: "stamp",
        effectStrength: "normal",
      }),
    );
    const store = await load();
    store.followKeyboardDefault("hail-stone");
    expect(store.getTypingFeel().keyboardSound).toBe("warm");
    expect(store.savedKeyboardSound()).toBe("warm");
  });

  it("writes a first save even when it equals the store's defaults", async () => {
    const store = await load();
    store.followKeyboardDefault("hail-stone");
    // The player picks Bright Clack, the store's own default.
    expect(
      store.setTypingFeel({
        ...store.getTypingFeel(),
        keyboardSound: "bright-clack",
      }),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    ).toMatchObject({ keyboardSound: "bright-clack" });
    expect(store.getTypingFeel().keyboardSound).toBe("bright-clack");
  });
});
