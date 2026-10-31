import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FEEL_URL,
  feelFetch,
  sampleCatalogue,
  type FeelHost,
} from "./feel-fixture";

vi.mock("../../../src/ts/config/store", () => ({
  Config: { soundVolume: 0.5 },
  getConfig: { soundVolume: 0.5 },
}));

/** The build's TYPING_FEEL_URL (undefined: not set, as in CI) and the feel host's answers. */
function serve(
  url: string | undefined,
  host: FeelHost = {},
): ReturnType<typeof vi.fn> {
  vi.doMock("virtual:env-config", () => ({
    envConfig: { typingFeelUrl: url },
  }));
  const fetchSpy = vi.fn(feelFetch(host));
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

/** The player's save before the settings open. */
function saved(keyboardSound: string): void {
  localStorage.setItem(
    "personalTypingFeelSettings",
    JSON.stringify({
      keyboardSound,
      keyboardVolume: 100,
      letterEffect: "stamp",
      effectStrength: "normal",
    }),
  );
}

async function mount(): Promise<ReturnType<typeof render>> {
  const { TypingFeelSettings } =
    await import("../../../src/ts/custom/typing-feel/TypingFeelSettings");
  return render(() => <TypingFeelSettings />);
}

async function storedSound(): Promise<string> {
  const { getTypingFeel } =
    await import("../../../src/ts/custom/typing-feel/store");
  return getTypingFeel().keyboardSound;
}

const labels = (view: ReturnType<typeof render>): string[] =>
  view.getAllByRole("option").map((o) => o.textContent ?? "");

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  cleanup();
  vi.doUnmock("virtual:env-config");
  vi.unstubAllGlobals();
});

describe("typing feel settings", () => {
  it("without TYPING_FEEL_URL: no fetch, Off and the saved set kept as unavailable, no note", async () => {
    const fetchSpy = serve(undefined);
    saved("raindrop-tile");
    const view = await mount();
    await waitFor(() =>
      expect(labels(view)).toEqual(["Off", "Saved soundunavailable"]),
    );
    const kept = view.getByRole<HTMLButtonElement>("option", {
      name: /^Saved sound/,
    });
    expect(kept.disabled).toBe(true);
    expect(kept.getAttribute("aria-selected")).toBe("true");
    expect(view.queryByText("keyboard sounds unavailable")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await storedSound()).toBe("raindrop-tile");
  });

  it("without TYPING_FEEL_URL and no save: Off only, marked, no 'Saved sound' row, nothing saved", async () => {
    const fetchSpy = serve(undefined);
    const view = await mount();
    await waitFor(() =>
      expect(
        view
          .getByRole("option", { name: /^Off/ })
          .getAttribute("aria-selected"),
      ).toBe("true"),
    );
    expect(labels(view)).toEqual(["Off"]);
    expect(view.queryByText("keyboard sounds unavailable")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem("personalTypingFeelSettings")).toBeNull();
  });

  it("a player without a save gets the catalogue's default, unsaved until they pick", async () => {
    serve(FEEL_URL, {
      catalogue: { ...sampleCatalogue(), default: "hail-stone" },
    });
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
    const option = (name: string): HTMLButtonElement =>
      view.getByRole<HTMLButtonElement>("option", {
        name: new RegExp(`^${name}`),
      });
    await waitFor(() =>
      expect(option("Hail Stone").getAttribute("aria-selected")).toBe("true"),
    );
    expect(await storedSound()).toBe("hail-stone");
    expect(localStorage.getItem("personalTypingFeelSettings")).toBeNull();
    fireEvent.click(option("Bright Clack Velvet"));
    expect(await storedSound()).toBe("bright-clack");
    expect(
      JSON.parse(localStorage.getItem("personalTypingFeelSettings") ?? "null"),
    ).toMatchObject({ keyboardSound: "bright-clack" });
  });

  it("host down: the saved set kept, 'keyboard sounds unavailable' under the list, nothing saved", async () => {
    serve(FEEL_URL, { down: true });
    saved("hail-stone");
    const view = await mount();
    await waitFor(() =>
      expect(view.getByText("keyboard sounds unavailable").tagName).toBe("DIV"),
    );
    expect(labels(view)).toEqual(["Off", "Saved soundunavailable"]);
    expect(await storedSound()).toBe("hail-stone");
    expect(localStorage.getItem("personalTypingFeelSettings")).toContain(
      '"hail-stone"',
    );
  });

  it("shows the saved set as Loading… until the catalogue answers", async () => {
    vi.doMock("virtual:env-config", () => ({
      envConfig: { typingFeelUrl: FEEL_URL },
    }));
    let answer: (value: unknown) => void = () => undefined;
    const live = feelFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Promise((resolve) => {
            answer = (): void => resolve(live(url));
          }),
      ),
    );
    saved("warm");
    const view = await mount();
    await waitFor(() => expect(labels(view)).toEqual(["Off", "Loading…"]));
    answer(undefined);
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
  });

  it("ready: the 34 sets under seven family headings in a bounded list; a pick saves", async () => {
    const fetchSpy = serve(FEEL_URL);
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
    const groups = view.getAllByRole("group");
    expect(groups).toHaveLength(7);
    expect(
      groups.map((g) => g.querySelectorAll("[role=option]").length),
    ).toEqual([3, 6, 1, 3, 7, 4, 10]);
    // The owner's picks close their family, under their own name.
    for (const [family, pick] of [
      ["Solid", "Hail Stone"],
      ["Crisp", "Raindrop Tile"],
    ] as const) {
      const group = view.getByRole("group", { name: family });
      expect(
        [...group.querySelectorAll("[role=option]")]
          .at(-1)
          ?.textContent?.startsWith(pick),
      ).toBe(true);
    }
    expect(
      view.getByRole("option", { name: /^Off/ }).closest("[role=group]"),
    ).toBeNull();
    const box = view
      .getByRole("listbox", { name: "keyboard sound" })
      .closest<HTMLElement>("[data-keyboard-scroll]");
    expect(box?.className).toContain("overflow-y-auto");
    expect(box?.className).toMatch(/max-h-/);
    expect(view.queryByText("keyboard sounds unavailable")).toBeNull();

    const option = (name: string): HTMLButtonElement =>
      view.getByRole<HTMLButtonElement>("option", {
        name: new RegExp(`^${name}`),
      });
    expect(option("Bright Clack Velvet").getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(option("Warm Velvet"));
    expect(await storedSound()).toBe("warm");
    expect(option("Warm Velvet").getAttribute("aria-selected")).toBe("true");
    // Everything came from the feel origin.
    for (const [url] of fetchSpy.mock.calls) {
      expect(String(url).startsWith(`${FEEL_URL}/v1/keys/`)).toBe(true);
    }
  });

  it("repairs a retired id to the catalogue's default once it is in", async () => {
    serve(FEEL_URL);
    saved("creamy");
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
    await waitFor(async () => expect(await storedSound()).toBe("bright-clack"));
  });

  it("keeps a set that failed to load selectable, with a retry note", async () => {
    serve(FEEL_URL, { broken: ["warm"] });
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
    const warm = (): HTMLButtonElement =>
      view.getByRole<HTMLButtonElement>("option", { name: /^Warm Velvet/ });
    fireEvent.click(warm());
    await waitFor(() =>
      expect(warm().textContent).toContain("could not load, select to retry"),
    );
    expect(warm().disabled).toBe(false);
  });

  it("disables the volume with the sound off and letter effects with strength off", async () => {
    serve(FEEL_URL);
    const view = await mount();
    await waitFor(() => expect(view.getAllByRole("option")).toHaveLength(35));
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
