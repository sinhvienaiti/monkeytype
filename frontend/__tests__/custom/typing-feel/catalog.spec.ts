import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configuredBase,
  fetchSample,
  groupByFamily,
  loadKeyboardChoices,
  SAMPLE_TIMEOUT_MS,
  settleSaved,
  timedBytes,
  typingFeelBase,
} from "../../../src/ts/custom/typing-feel/catalog";
import {
  keyboardFiles,
  type KeyboardCatalog,
  type KeyboardSoundChoice,
} from "../../../src/ts/custom/typing-feel/kit/audio";
import {
  ALL,
  BASE,
  CATALOGUE_URL,
  FAMILIES,
  feelFetch,
  reply,
  sampleCatalogue,
  setManifest,
} from "./feel-fixture";

/**
 * Sets the owner picked by ear: `score: null` and `ownerPick: true` (the 218
 * metric penalises the long tails he wants), their own name and sample count
 * instead of the scored sets' family-prefixed names and 70-80 keys.
 */
const OWNER_PICKS: Readonly<
  Record<string, { name: string; family: string; keys: number }>
> = {
  "hail-stone": { name: "Hail Stone", family: "Solid", keys: 25 },
  "raindrop-tile": { name: "Raindrop Tile", family: "Crisp", keys: 17 },
};

/** The kit's catalogue read through a fetch spy on the sample host. */
async function readyCatalogue(catalogue?: unknown): Promise<KeyboardCatalog> {
  const fetchJson = vi.fn(async (url: string) =>
    (await feelFetch({ catalogue })(url)).json(),
  );
  return loadKeyboardChoices({ base: BASE, fetchJson });
}

const savedUnavailable = (id: string): KeyboardSoundChoice => ({
  value: id,
  label: "Saved sound",
  note: "unavailable",
  disabled: true,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TYPING_FEEL_URL", () => {
  const page = "http://127.0.0.1:3000";

  it("is the Typing Feel root: an origin, a path prefix kept, /v1/ optional", () => {
    expect(typingFeelBase("https://feel.typing-game.local", page)).toBe(
      "https://feel.typing-game.local/v1/keys/",
    );
    expect(typingFeelBase(" https://feel.typing-game.local/ ", page)).toBe(
      "https://feel.typing-game.local/v1/keys/",
    );
    expect(typingFeelBase("https://feel.typing-game.local/v1/", page)).toBe(
      "https://feel.typing-game.local/v1/keys/",
    );
    expect(typingFeelBase("https://cdn.example/feel", page)).toBe(
      "https://cdn.example/feel/v1/keys/",
    );
  });

  it("reads a same-origin path (the feel:mirror copy) against the page", () => {
    expect(typingFeelBase("/typing-feel", page)).toBe(
      "http://127.0.0.1:3000/typing-feel/v1/keys/",
    );
    expect(typingFeelBase("/typing-feel/v1/", page)).toBe(
      "http://127.0.0.1:3000/typing-feel/v1/keys/",
    );
    // No page origin to read it against (outside a browser).
    expect(typingFeelBase("/typing-feel", "")).toBeNull();
  });

  it("is off when unset, blank or not a plain http(s) root", () => {
    for (const value of [
      undefined,
      "",
      "   ",
      "typing-feel",
      "//feel.example",
      "ftp://feel.example",
      "https://user:pass@feel.example",
      "https://feel.example/?v=1",
      "https://feel.example/#x",
    ]) {
      expect(typingFeelBase(value, page)).toBeNull();
    }
  });

  it("is unset in the test build, as in CI: Typing Feel off, no secret", () => {
    expect(configuredBase()).toBeNull();
  });
});

describe("keyboard catalogue from Typing Feel", () => {
  it("without TYPING_FEEL_URL fetches nothing and lists Off only", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const catalog = await loadKeyboardChoices();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(catalog.state).toBe("missing");
    expect(catalog.options).toEqual([{ value: "off", label: "Off" }]);
    // The saved set stays saved, shown as unavailable; nothing to persist.
    expect(settleSaved("raindrop-tile", catalog)).toEqual({
      id: "raindrop-tile",
      options: [
        { value: "off", label: "Off" },
        savedUnavailable("raindrop-tile"),
      ],
      repaired: false,
    });
    expect(settleSaved("off", catalog).options).toHaveLength(1);
    // A player who never saved a sound sees Off, not a "Saved sound" row.
    expect(settleSaved(null, catalog)).toEqual({
      id: "off",
      options: [{ value: "off", label: "Off" }],
      repaired: false,
    });
  });

  it("fetches the catalogue from <root>/v1/keys/ with no-cache and a bounded wait", async () => {
    const fetchSpy = vi.fn(feelFetch());
    vi.stubGlobal("fetch", fetchSpy);
    const catalog = await loadKeyboardChoices({ base: BASE });
    expect(catalog.state).toBe("ready");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      CATALOGUE_URL,
      expect.objectContaining({ cache: "no-cache" }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("lists Off then the 34 sets in the owner's order, each under its family", async () => {
    const catalog = await readyCatalogue();
    expect(catalog.state).toBe("ready");
    expect(catalog.revision).toBe("r1");
    expect(catalog.defaultId).toBe("bright-clack");
    expect(catalog.options.map((c) => c.value)).toEqual(["off", ...ALL]);
    for (const [family, ids] of FAMILIES) {
      for (const id of ids) {
        const choice = catalog.options.find((c) => c.value === id);
        expect(choice?.family).toBe(family);
        expect(choice?.label).toMatch(/^[A-Za-z ]+$/);
        expect(choice?.manifest).toMatch(
          new RegExp(`^${BASE}sets/${id}/[0-9a-f]{12}/keys-manifest\\.json$`),
        );
        expect(choice?.preview).toBe(
          choice?.manifest?.replace("keys-manifest.json", "preview.ogg"),
        );
        const pick = OWNER_PICKS[id];
        if (pick === undefined) {
          expect(choice?.label.startsWith(family)).toBe(true);
          expect(choice?.score).toBeGreaterThan(6);
        } else {
          // No invented score for an owner's pick.
          expect(choice?.label).toBe(pick.name);
          expect(choice?.score).toBeUndefined();
        }
      }
    }
    const sections = groupByFamily(catalog.options);
    expect(sections.map((s) => s.family)).toEqual([
      undefined,
      ...FAMILIES.map(([family]) => family),
    ]);
    expect(
      sections.slice(1).map((s) => s.items.map((i) => i.choice.value)),
    ).toEqual(FAMILIES.map(([, ids]) => ids));
    for (const section of sections) {
      for (const item of section.items) {
        expect(catalog.options[item.index]).toBe(item.choice);
      }
    }
  });

  it("reads every sample of a set manifest in its versioned folder", async () => {
    const catalog = await readyCatalogue();
    const rows = sampleCatalogue().profiles;
    for (const choice of catalog.options.slice(1)) {
      const row = rows.find((r) => r.id === choice.value);
      if (row === undefined) throw new Error(choice.value);
      const folder = (choice.manifest ?? "").replace("keys-manifest.json", "");
      const files = keyboardFiles(setManifest(row), folder);
      const pick = OWNER_PICKS[choice.value];
      if (pick === undefined) {
        expect(files.key.length).toBeGreaterThanOrEqual(70);
        expect(files.key.length).toBeLessThanOrEqual(80);
      } else {
        expect(files.key).toHaveLength(pick.keys);
      }
      expect(files.space).toHaveLength(8);
      expect(files.key[0]).toBe(`${folder}key-01.ogg`);
    }
  });

  it("keeps a listed set and Off, repairs a retired or legacy id to the catalogue default", async () => {
    const catalog = await readyCatalogue();
    expect(settleSaved("warm", catalog)).toMatchObject({
      id: "warm",
      repaired: false,
    });
    expect(settleSaved("off", catalog)).toMatchObject({
      id: "off",
      repaired: false,
    });
    expect(settleSaved("creamy", catalog)).toMatchObject({
      id: "bright-clack",
      repaired: true,
    });
    // A ready list has no "Saved sound" row.
    expect(
      settleSaved("creamy", catalog).options.some((c) => c.disabled === true),
    ).toBe(false);
    const warmDefault = await readyCatalogue({
      ...sampleCatalogue(),
      default: "warm",
    });
    expect(settleSaved("thock", warmDefault)).toMatchObject({
      id: "warm",
      repaired: true,
    });
    // No save yet: the catalogue's default, nothing to save (§4.5).
    expect(settleSaved(null, warmDefault)).toMatchObject({
      id: "warm",
      repaired: false,
    });
    expect(settleSaved(null, catalog)).toMatchObject({
      id: "bright-clack",
      repaired: false,
    });
  });

  it("falls back to Bright Clack, then the first set, when the default is not listed", async () => {
    const base = sampleCatalogue();
    const noDefault = await readyCatalogue({ ...base, default: "gone" });
    expect(noDefault.defaultId).toBeUndefined();
    expect(settleSaved("creamy", noDefault).id).toBe("bright-clack");
    const noBright = await readyCatalogue({
      ...base,
      default: "gone",
      profiles: base.profiles.filter((p) => p.id !== "bright-clack"),
    });
    expect(settleSaved("creamy", noBright).id).toBe("deep");
  });

  it("keeps the saved id while the host fails: down, 404, an HTML page, a hang", async () => {
    const failures: [string, () => Promise<unknown>][] = [
      [
        "down",
        async () => {
          throw new TypeError("Failed to fetch");
        },
      ],
      ["404", async () => reply(404, "not found", "text/plain")],
      [
        "html",
        async () => reply(200, "<!doctype html><html></html>", "text/html"),
      ],
      ["not json", async () => reply(200, "<!doctype html>", "text/plain")],
    ];
    for (const [name, fetchImpl] of failures) {
      vi.stubGlobal("fetch", vi.fn(fetchImpl));
      const catalog = await loadKeyboardChoices({ base: BASE });
      expect(catalog.state, name).toBe("missing");
      expect(settleSaved("hail-stone", catalog), name).toEqual({
        id: "hail-stone",
        options: [
          { value: "off", label: "Off" },
          savedUnavailable("hail-stone"),
        ],
        repaired: false,
      });
    }

    vi.useFakeTimers();
    const hung = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    vi.stubGlobal("fetch", hung);
    let settled = false;
    const job = loadKeyboardChoices({ base: BASE }).then((catalog) => {
      settled = true;
      return catalog;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const catalog = await job;
    expect(catalog.state).toBe("missing");
    expect(settleSaved("hail-stone", catalog).id).toBe("hail-stone");
    expect(hung.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("calls a catalogue with no usable set invalid and repairs nothing with it", async () => {
    for (const body of [
      { schema: "typing-feel/catalogue-3" },
      { ...sampleCatalogue(), profiles: [] },
      {
        ...sampleCatalogue(),
        profiles: sampleCatalogue().profiles.map((p) => ({
          ...p,
          manifest: `../${p.manifest}`,
        })),
      },
    ]) {
      const catalog = await readyCatalogue(body);
      expect(catalog.state).toBe("invalid");
      expect(catalog.options).toEqual([{ value: "off", label: "Off" }]);
      expect(settleSaved("warm", catalog)).toMatchObject({
        id: "warm",
        repaired: false,
      });
    }
  });

  it("drops a single malformed row and keeps the others", async () => {
    const body = sampleCatalogue();
    const [first] = body.profiles;
    if (first === undefined) throw new Error("empty sample");
    first.manifest = "/absolute/keys-manifest.json";
    const catalog = await readyCatalogue(body);
    expect(catalog.state).toBe("ready");
    expect(catalog.options).toHaveLength(34);
    expect(catalog.options.some((c) => c.value === first.id)).toBe(false);
  });
});

describe("sample and preview files", () => {
  const url = `${BASE}sets/deep/0123456789ab/key-01.ogg`;

  it("reads the bytes through the HTTP cache with an abort signal", async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
      reply(200, "OggS", "audio/ogg"),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const bytes = await fetchSample(url);
    expect(new TextDecoder().decode(bytes)).toBe("OggS");
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.cache).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(SAMPLE_TIMEOUT_MS).toBe(10_000);
  });

  it("refuses a 404 and an HTML page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(404, "not found", "text/plain")),
    );
    await expect(fetchSample(url)).rejects.toThrow(/404/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, "<!doctype html>", "text/html")),
    );
    await expect(fetchSample(url)).rejects.toThrow(/HTML/);
  });

  it("gives up on a host that never answers, aborting the request", async () => {
    vi.useFakeTimers();
    const hung = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    vi.stubGlobal("fetch", hung);
    let failed: unknown;
    const job = timedBytes(500)(url).catch((error: unknown) => {
      failed = error;
    });
    await vi.advanceTimersByTimeAsync(499);
    expect(failed).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await job;
    expect(String(failed)).toMatch(/no answer in 500 ms/);
    expect(hung.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

describe("loadKeyboardChoices with TYPING_FEEL_URL set", () => {
  afterEach(() => {
    vi.doUnmock("virtual:env-config");
    vi.resetModules();
  });

  it("reads the build's URL, keeps a ready catalogue and fetches again after a failure", async () => {
    vi.resetModules();
    vi.doMock("virtual:env-config", () => ({
      envConfig: { typingFeelUrl: "https://feel.test" },
    }));
    const catalogModule =
      await import("../../../src/ts/custom/typing-feel/catalog");
    expect(catalogModule.configuredBase()).toBe(BASE);

    vi.stubGlobal("fetch", vi.fn(feelFetch({ down: true })));
    expect((await catalogModule.loadKeyboardChoices()).state).toBe("missing");
    const live = vi.fn(feelFetch());
    vi.stubGlobal("fetch", live);
    const ready = await catalogModule.loadKeyboardChoices();
    expect(ready.state).toBe("ready");
    expect(await catalogModule.loadKeyboardChoices()).toBe(ready);
    expect(live).toHaveBeenCalledTimes(1);
  });
});

describe("family grouping", () => {
  const set = (value: string, family?: string): KeyboardSoundChoice =>
    family === undefined
      ? { value, label: value }
      : { value, label: value, family };

  it("keeps catalogue order: a family that comes back starts a new section", () => {
    const sections = groupByFamily([
      set("off"),
      set("a", "Deep"),
      set("b", "Deep"),
      set("c", "Warm"),
      set("d", "Deep"),
    ]);
    expect(sections.map((s) => [s.family, s.items.length])).toEqual([
      [undefined, 1],
      ["Deep", 2],
      ["Warm", 1],
      ["Deep", 1],
    ]);
  });

  it("never groups Off, and trims or drops a blank family", () => {
    const sections = groupByFamily([
      set("off", "Deep"),
      set("a", " Deep "),
      set("b", "Deep"),
      set("c", "  "),
      set("d"),
    ]);
    expect(sections.map((s) => s.family)).toEqual([
      undefined,
      "Deep",
      undefined,
    ]);
    expect(sections[2]?.items.map((i) => i.index)).toEqual([3, 4]);
  });

  it("is empty for no options", () => {
    expect(groupByFamily([])).toEqual([]);
  });
});
