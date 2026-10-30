import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  defaultKeyboard,
  INSTALLED_URL,
  loadKeyboardChoices,
  NOT_INSTALLED,
  restoreKeyboardChoice,
} from "../../../src/ts/custom/typing-feel/catalog";

const staticDir = resolve(__dirname, "../../../static");
const ALL = [
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
  it("lists Off then the seven Firefly sets in the owner's order once synced", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    expect(catalog.state).toBe("ready");
    expect(catalog.options.map((c) => c.label)).toEqual([
      "Off",
      "Deep",
      "Warm",
      "Rounded",
      "Solid",
      "Crisp",
      "Clear",
      "Bright Clack",
    ]);
    expect(catalog.options.some((c) => c.disabled === true)).toBe(false);
    const bright = catalog.options.find((c) => c.value === "bright-clack");
    expect(bright?.manifest).toBe(
      "/sounds/keys/bright-clack/keys-manifest.json",
    );
    expect(bright?.preview).toBe("/sounds/keys/bright-clack/preview.ogg");
  });

  it("names ten keys and three spaces in every tracked set manifest", async () => {
    const catalog = await loadKeyboardChoices(fetchSynced());
    for (const choice of catalog.options.slice(1)) {
      const manifest = (await fetchTracked(choice.manifest ?? "")) as {
        id: string;
        files: string[];
        preview: string;
      };
      expect(manifest.id).toBe(choice.value);
      expect(manifest.files.filter((f) => f.startsWith("key-"))).toHaveLength(
        10,
      );
      expect(manifest.files.filter((f) => f.startsWith("space-"))).toHaveLength(
        3,
      );
      expect(manifest.preview).toBe("preview.ogg");
      expect(JSON.stringify(manifest)).not.toContain(".wav");
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
