import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/config/store", () => ({
  Config: { soundVolume: 0.5 },
  getConfig: { soundVolume: 0.5 },
}));

const staticDir = resolve(__dirname, "../../../static");

/** fetch for the site: tracked manifests always (bar `broken`), installed.json only after a sync. */
function serve(installed: readonly string[] | null, broken = ""): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (broken !== "" && url.includes(`/${broken}/`)) {
        return { ok: false, status: 503, json: async () => null };
      }
      if (url.endsWith("/installed.json")) {
        return installed === null
          ? { ok: false, status: 404, json: async () => null }
          : { ok: true, status: 200, json: async () => ({ sets: installed }) };
      }
      if (url.endsWith(".json")) {
        const path = resolve(staticDir, url.replace(/^\//, ""));
        const body = JSON.parse(readFileSync(path, "utf8")) as unknown;
        return { ok: true, status: 200, json: async () => body };
      }
      return { ok: false, status: 404, json: async () => null };
    }),
  );
}

async function mount(): Promise<ReturnType<typeof render>> {
  const { TypingFeelSettings } =
    await import("../../../src/ts/custom/typing-feel/TypingFeelSettings");
  return render(() => <TypingFeelSettings />);
}

const labels = (view: ReturnType<typeof render>): string[] =>
  view
    .getAllByRole("option")
    .map((o) => o.textContent?.replace(/sound files.*$/, "") ?? "");

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("typing feel settings", () => {
  it("lists only Off with the note when sync-keys never ran", async () => {
    serve(null);
    const view = await mount();
    await waitFor(() =>
      expect(view.getByText("sound files not installed").tagName).toBe("DIV"),
    );
    expect(labels(view)).toEqual(["Off"]);
  });

  it("lists the synced sets, disables one not copied, and saves a pick", async () => {
    serve(["deep", "warm", "bright-clack"]);
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(8));
    // Per-set notes only: the whole-list note is for nothing synced.
    const notes = view.queryAllByText("sound files not installed");
    expect(notes.every((n) => n.closest("[role=option]") !== null)).toBe(true);
    const option = (name: string): HTMLButtonElement =>
      view.getByRole<HTMLButtonElement>("option", {
        name: new RegExp(`^${name}`),
      });
    expect(option("Crisp").disabled).toBe(true);
    expect(option("Crisp").textContent).toContain("sound files not installed");
    expect(option("Bright Clack").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(option("Warm"));
    const { getTypingFeel } =
      await import("../../../src/ts/custom/typing-feel/store");
    expect(getTypingFeel().keyboardSound).toBe("warm");
    expect(option("Warm").getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a set that failed to load selectable, with a retry note", async () => {
    serve(["deep", "warm"], "warm");
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(8));
    const warm = (): HTMLButtonElement =>
      view.getByRole<HTMLButtonElement>("option", { name: /^Warm/ });
    fireEvent.click(warm());
    await waitFor(() =>
      expect(warm().textContent).toContain("could not load, select to retry"),
    );
    expect(warm().disabled).toBe(false);
    expect(warm().textContent).not.toContain("not installed");
  });

  it("disables the volume with the sound off and letter effects with strength off", async () => {
    serve(["deep"]);
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(8));
    const volume = view.getByLabelText<HTMLInputElement>("keyboard volume");
    expect(volume.disabled).toBe(false);
    fireEvent.click(view.getByRole("option", { name: /^Off/ }));
    expect(volume.disabled).toBe(true);

    const stamp = view.getByRole<HTMLButtonElement>("button", {
      name: "stamp",
    });
    expect(stamp.disabled).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "off" }));
    expect(stamp.disabled).toBe(true);
  });
});
