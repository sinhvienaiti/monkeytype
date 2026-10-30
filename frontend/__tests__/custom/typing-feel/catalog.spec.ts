import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  defaultKeyboard,
  groupByFamily,
  INSTALLED_URL,
  loadKeyboardChoices,
  NOT_INSTALLED,
  restoreKeyboardChoice,
} from "../../../src/ts/custom/typing-feel/catalog";
import {
  keyboardFiles,
  type KeyboardSoundChoice,
} from "../../../src/ts/custom/typing-feel/kit/audio";

const staticDir = resolve(__dirname, "../../../static");
/** Owner 30/10/2026: 32 Firefly sets in seven families, in the catalogue's order. */
const FAMILIES: readonly (readonly [string, readonly string[]])[] = [
  ["Deep", ["deep", "deep-amber", "deep-cedar"]],
  [
    "Warm",
    [
      "warm",
      "warm-amber",
      "warm-cedar",
      "warm-pebble",
      "warm-slate",
      "warm-silk",
    ],
  ],
  ["Rounded", ["rounded"]],
  ["Solid", ["solid", "solid-amber"]],
  [
    "Crisp",
    [
      "crisp",
      "crisp-amber",
      "crisp-cedar",
      "crisp-pebble",
      "crisp-slate",
      "crisp-silk",
    ],
  ],
  ["Clear", ["clear", "clear-amber", "clear-cedar", "clear-pebble"]],
  [
    "Bright Clack",
    [
      "bright-clack",
      "bright-clack-amber",
      "bright-clack-cedar",
      "bright-clack-pebble",
      "bright-clack-slate",
      "bright-clack-silk",
      "bright-clack-copper",
      "bright-clack-walnut",
      "bright-clack-moss",
      "bright-clack-ember",
    ],
  ],
];
const ALL = FAMILIES.flatMap(([, ids]) => ids);
/** The first seven ids, kept by the 32-set catalogue so saved picks survive. */
const FIRST_SEVEN = [
  "deep",
  "warm",
  "rounded",
  "solid",
  "crisp",
  "clear",
  "bright-clack",
];

/** The site on a fresh clone: Git's tracked manifests only; installed.json and the .ogg files 404. */
async function fetchTracked(url: string): Promise<unknown> {
  if (url === INSTALLED_URL || url.endsWith(".ogg")) throw new Error("404");
  const path = resolve(staticDir, url.replace(/^\//, ""));
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

/** The site after `pnpm sync-keys` copied `sets`. */
const fetchSynced =
  (sets: readonly string[] = ALL) =>
  async (url: string): Promise<unknown> =>
    url === INSTALLED_URL ? { sets } : fetchTracked(url);

describe("keyboard catalogue", () => {
  it("lists Off then the 32 Firefly sets in the owner's order once synced", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    expect(catalog.state).toBe("ready");
    expect(catalog.options).toHaveLength(33);
    expect(catalog.options.map((c) => c.value)).toEqual(["off", ...ALL]);
    expect(catalog.options.some((c) => c.disabled === true)).toBe(false);
    for (const id of FIRST_SEVEN) {
      expect(catalog.options.some((c) => c.value === id)).toBe(true);
    }
    const bright = catalog.options.find((c) => c.value === "bright-clack");
    expect(bright).toMatchObject({
      label: "Bright Clack Velvet",
      family: "Bright Clack",
      manifest: "/sounds/keys/bright-clack/keys-manifest.json",
      preview: "/sounds/keys/bright-clack/preview.ogg",
    });
    expect(defaultKeyboard(catalog.options)).toBe("bright-clack");
  });

  it("gives every set a family, an English name and a score", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    for (const [family, ids] of FAMILIES) {
      for (const id of ids) {
        const choice = catalog.options.find((c) => c.value === id);
        expect(choice?.family).toBe(family);
        expect(choice?.label.startsWith(family)).toBe(true);
        expect(choice?.label).toMatch(/^[A-Za-z ]+$/);
        expect(choice?.score).toBeGreaterThan(6);
      }
    }
  });

  it("names 70 to 80 keys and 8 spaces, OGG only, in every tracked set manifest", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    for (const choice of catalog.options.slice(1)) {
      const manifest = (await fetchTracked(choice.manifest ?? "")) as {
        id: string;
        name: string;
        family: string;
        files: string[];
        preview: string;
      };
      expect(manifest.id).toBe(choice.value);
      expect(manifest.name).toBe(choice.label);
      expect(manifest.family).toBe(choice.family);
      const keys = manifest.files.filter((f) => f.startsWith("key-"));
      const spaces = manifest.files.filter((f) => f.startsWith("space-"));
      expect(keys.length).toBeGreaterThanOrEqual(70);
      expect(keys.length).toBeLessThanOrEqual(80);
      expect(spaces).toHaveLength(8);
      expect(keys.length + spaces.length).toBe(manifest.files.length);
      expect(new Set(manifest.files).size).toBe(manifest.files.length);
      expect(manifest.preview).toBe("preview.ogg");
      expect(JSON.stringify(manifest)).not.toContain(".wav");
      // What the kit's player reads from it: every file, in number order.
      const files = keyboardFiles(manifest, `/sounds/keys/${manifest.id}/`);
      expect(files.key).toHaveLength(keys.length);
      expect(files.space).toHaveLength(8);
      expect(files.key[0]).toBe(`/sounds/keys/${manifest.id}/key-01.ogg`);
      expect(files.key.at(-1)).toBe(
        `/sounds/keys/${manifest.id}/key-${String(keys.length).padStart(2, "0")}.ogg`,
      );
    }
  });

  it("groups the 32 sets under seven family headings, Off on its own", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    const sections = groupByFamily(catalog.options);
    expect(sections.map((s) => s.family)).toEqual([
      undefined,
      ...FAMILIES.map(([family]) => family),
    ]);
    expect(sections[0]?.items.map((i) => i.choice.value)).toEqual(["off"]);
    expect(
      sections.slice(1).map((s) => s.items.map((i) => i.choice.value)),
    ).toEqual(FAMILIES.map(([, ids]) => ids));
    // Indexes point back into the flat list the keyboard moves through.
    for (const section of sections) {
      for (const item of section.items) {
        expect(catalog.options[item.index]).toBe(item.choice);
      }
    }
  });

  it("lists only Off on a clone that never ran sync-keys, though the manifests are tracked", async () => {
    const fetched = vi.fn(fetchTracked);
    const catalog = await loadKeyboardChoices(fetched);
    // The tracked catalogue itself loads; only the ignored marker is absent.
    await expect(
      fetchTracked("/sounds/keys/keys-manifest.json"),
    ).resolves.toBeTruthy();
    expect(fetched).toHaveBeenCalledWith("/sounds/keys/keys-manifest.json");
    expect(fetched).toHaveBeenCalledWith(INSTALLED_URL);
    expect(catalog.state).toBe("missing");
    expect(catalog.options.map((c) => c.value)).toEqual(["off"]);
  });

  it("treats a server's HTML fallback for the marker as not installed", async () => {
    const catalog = await loadKeyboardChoices(async (url) =>
      url === INSTALLED_URL ? "<!doctype html>" : fetchTracked(url),
    );
    expect(catalog.state).toBe("missing");
  });

  it("disables a set the sync did not copy", async () => {
    const catalog = await loadKeyboardChoices(
      fetchSynced(["deep", "bright-clack"]),
    );
    expect(catalog.state).toBe("ready");
    const warm = catalog.options.find((c) => c.value === "warm");
    expect(warm).toMatchObject({ disabled: true, note: NOT_INSTALLED });
    expect(
      catalog.options.find((c) => c.value === "deep")?.disabled,
    ).toBeUndefined();
  });

  it("records in the tracked keys.sha256 one sha256 per OGG the set manifests name, sorted", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    const expected: string[] = [];
    for (const choice of catalog.options.slice(1)) {
      const manifest = (await fetchTracked(choice.manifest ?? "")) as {
        files: string[];
        preview: string;
      };
      for (const file of [...manifest.files, manifest.preview]) {
        expected.push(`${choice.value}/${file}`);
      }
    }
    const lines = readFileSync(
      resolve(staticDir, "sounds/keys/keys.sha256"),
      "utf8",
    )
      .split("\n")
      .filter((line) => line !== "");
    for (const line of lines) expect(line).toMatch(/^[0-9a-f]{64} {2}\S+$/);
    const paths = lines.map((line) => line.slice(66));
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual([...expected].sort());
    // Tracked, unlike the audio it describes.
    const repo = resolve(staticDir, "..");
    expect(() =>
      execFileSync(
        "git",
        ["check-ignore", "-q", "static/sounds/keys/keys.sha256"],
        { cwd: repo },
      ),
    ).toThrow();
  });

  it("keeps installed.json out of Git while the manifests are tracked", () => {
    const repo = resolve(staticDir, "..");
    const ignored = execFileSync(
      "git",
      ["check-ignore", "static/sounds/keys/installed.json"],
      { cwd: repo, encoding: "utf8" },
    );
    expect(ignored.trim()).toBe("static/sounds/keys/installed.json");
  });

  it("repairs stale and legacy ids to Bright Clack and keeps Off", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    expect(restoreKeyboardChoice("creamy", catalog)).toBe("bright-clack");
    expect(restoreKeyboardChoice("thock", catalog)).toBe("bright-clack");
    expect(restoreKeyboardChoice("warm", catalog)).toBe("warm");
    expect(restoreKeyboardChoice("off", catalog)).toBe("off");
  });

  it("keeps a listed set that is not installed yet", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced(["deep"]));
    expect(restoreKeyboardChoice("warm", catalog)).toBe("warm");
    expect(restoreKeyboardChoice("creamy", catalog)).toBe("deep");
  });

  it("falls back to the first set when Bright Clack is missing or disabled", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    const withoutBright = {
      ...catalog,
      options: catalog.options.map((c) =>
        c.value === "bright-clack" ? { ...c, disabled: true } : c,
      ),
    };
    expect(defaultKeyboard(withoutBright.options)).toBe("deep");
    expect(restoreKeyboardChoice("creamy", withoutBright)).toBe("deep");
  });

  it("repairs nothing while the catalogue did not load or was never synced", async () => {
    const offline = await loadKeyboardChoices(async () => {
      throw new Error("offline");
    });
    expect(restoreKeyboardChoice("warm", offline)).toBe("warm");
    const clone = await loadKeyboardChoices(fetchTracked);
    expect(restoreKeyboardChoice("creamy", clone)).toBe("creamy");
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
