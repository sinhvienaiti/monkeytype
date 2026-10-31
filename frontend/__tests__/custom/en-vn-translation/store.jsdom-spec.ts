import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));

const storageKey = "personalEnVnTranslationSettings";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("translation position settings", () => {
  it("migrates old preferences without resetting the dictionary or learning controls", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        enabled: false,
        dictionary: "cache = bộ nhớ đệm",
        learningMode: "listen",
        displayMode: "tooltip",
        popupSize: "large",
        pronunciationAccent: "en-GB",
        textReaderRate: 1.5,
      }),
    );

    const { getSettings } =
      await import("../../../src/ts/custom/en-vn-translation/store");
    expect(getSettings()).toMatchObject({
      position: "top",
      enabled: false,
      dictionary: "cache = bộ nhớ đệm",
      learningMode: "listen",
      displayMode: "tooltip",
      popupSize: "large",
      pronunciationAccent: "en-GB",
      textReaderRate: 1.5,
    });
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
      position: "top",
    });
  });

  it("persists bottom across a fresh settings load", async () => {
    const { getSettings, setSettings } =
      await import("../../../src/ts/custom/en-vn-translation/store");
    expect(setSettings({ ...getSettings(), position: "bottom" })).toBe(true);
    vi.resetModules();
    const reloaded =
      await import("../../../src/ts/custom/en-vn-translation/store");
    expect(reloaded.getSettings().position).toBe("bottom");
  });

  it("falls back to top for invalid position while preserving recall migration", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        position: "sideways",
        recallModeEnabled: true,
        dictionary: "page = trang",
      }),
    );
    const { getSettings } =
      await import("../../../src/ts/custom/en-vn-translation/store");
    expect(getSettings()).toMatchObject({
      position: "top",
      learningMode: "recall",
      recallModeEnabled: true,
      dictionary: "page = trang",
    });
  });
});
