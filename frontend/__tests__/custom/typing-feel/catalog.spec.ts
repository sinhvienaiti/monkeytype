import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  defaultKeyboard,
  loadKeyboardChoices,
  restoreKeyboardChoice,
} from "../../../src/ts/custom/typing-feel/catalog";

const staticDir = resolve(__dirname, "../../../static");

/** Serves the tracked manifests from static/ the way the site does. */
async function fetchStatic(url: string): Promise<unknown> {
  const path = resolve(staticDir, url.replace(/^\//, ""));
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

describe("keyboard catalogue", () => {
  it("lists Off then the seven Firefly sets in the owner's order", async () => {
    const catalog = await loadKeyboardChoices(fetchStatic);
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
    const bright = catalog.options.find((c) => c.value === "bright-clack");
    expect(bright?.manifest).toBe(
      "/sounds/keys/bright-clack/keys-manifest.json",
    );
    expect(bright?.preview).toBe("/sounds/keys/bright-clack/preview.ogg");
  });

  it("names ten keys and three spaces in every tracked set manifest", async () => {
    const catalog = await loadKeyboardChoices(fetchStatic);
    for (const choice of catalog.options.slice(1)) {
      const manifest = (await fetchStatic(choice.manifest ?? "")) as {
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

  it("lists only Off when the sound files are not installed", async () => {
    const catalog = await loadKeyboardChoices(async () => {
      throw new Error("404");
    });
    expect(catalog.state).toBe("missing");
    expect(catalog.options.map((c) => c.value)).toEqual(["off"]);
  });

  it("repairs stale and legacy ids to Bright Clack and keeps Off", async () => {
    const catalog = await loadKeyboardChoices(fetchStatic);
    expect(restoreKeyboardChoice("creamy", catalog)).toBe("bright-clack");
    expect(restoreKeyboardChoice("thock", catalog)).toBe("bright-clack");
    expect(restoreKeyboardChoice("warm", catalog)).toBe("warm");
    expect(restoreKeyboardChoice("off", catalog)).toBe("off");
  });

  it("falls back to the first set when Bright Clack is missing or disabled", async () => {
    const catalog = await loadKeyboardChoices(fetchStatic);
    const withoutBright = {
      ...catalog,
      options: catalog.options.map((c) =>
        c.value === "bright-clack" ? { ...c, disabled: true } : c,
      ),
    };
    expect(defaultKeyboard(withoutBright.options)).toBe("deep");
    expect(restoreKeyboardChoice("creamy", withoutBright)).toBe("deep");
  });

  it("repairs nothing while the catalogue did not load", async () => {
    const catalog = await loadKeyboardChoices(async () => {
      throw new Error("offline");
    });
    expect(restoreKeyboardChoice("warm", catalog)).toBe("warm");
  });
});
