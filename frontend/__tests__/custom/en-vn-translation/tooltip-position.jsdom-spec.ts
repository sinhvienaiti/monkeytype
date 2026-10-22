import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHeldTranslationTooltips,
  getTooltipPlacement,
  packTooltipRow,
  positionTranslationPanel,
  positionTranslationTooltip,
  showHeldTranslationTooltip,
} from "../../../src/ts/custom/en-vn-translation/tooltip-position";
import { getSettings } from "../../../src/ts/custom/en-vn-translation/store";

vi.mock("../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return new DOMRect(left, top, width, height);
}

const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  disconnect.mockClear();
  document.body.innerHTML =
    '<div><div id="typingTest"><div id="panel"></div><div id="wordsWrapper"><div class="word">page</div></div><div id="monkey"></div><button id="restart"></button></div></div>';
});

afterEach(() => {
  clearHeldTranslationTooltips();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("translation placement", () => {
  it("separates adjacent held labels while keeping both inside the viewport", () => {
    const packed = packTooltipRow(
      [
        { left: 98, width: 48 },
        { left: 182, width: 172 },
      ],
      390,
    );
    const first = packed[0];
    const second = packed[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(
      (first?.left ?? 0) + (first?.width ?? 0) / 2 + 8,
    ).toBeLessThanOrEqual((second?.left ?? 0) - (second?.width ?? 0) / 2);
    expect((second?.left ?? 0) + (second?.width ?? 0) / 2).toBeLessThanOrEqual(
      374,
    );
  });

  it("allocates wrap widths when a row of long labels cannot fit naturally", () => {
    const packed = packTooltipRow(
      [
        { left: 60, width: 220 },
        { left: 150, width: 320 },
        { left: 280, width: 180 },
      ],
      390,
    );
    for (const [index, item] of packed.entries()) {
      expect(item.left - item.width / 2).toBeGreaterThanOrEqual(15.999);
      expect(item.left + item.width / 2).toBeLessThanOrEqual(374.001);
      const next = packed[index + 1];
      if (next !== undefined) {
        expect(item.left + item.width / 2 + 8).toBeLessThanOrEqual(
          next.left - next.width / 2 + 0.001,
        );
      }
    }
    expect(packed.every((item) => item.width < 180)).toBe(true);
  });

  it("uses the requested side with a gap from the word", () => {
    const anchor = rect(100, 200, 80, 40);
    const popup = rect(0, 0, 120, 32);
    const viewport = { width: 390, height: 844 };
    expect(getTooltipPlacement(anchor, popup, "top", viewport)).toEqual({
      left: 140,
      top: 160,
      position: "top",
    });
    expect(getTooltipPlacement(anchor, popup, "bottom", viewport)).toEqual({
      left: 140,
      top: 248,
      position: "bottom",
    });
  });

  it("keeps long popups inside both edges and flips when the preferred side has no room", () => {
    const popup = rect(0, 0, 358, 80);
    const viewport = { width: 390, height: 400 };
    expect(
      getTooltipPlacement(rect(0, 20, 30, 40), popup, "top", viewport),
    ).toEqual({ left: 195, top: 68, position: "bottom" });
    expect(
      getTooltipPlacement(rect(360, 350, 30, 40), popup, "bottom", viewport),
    ).toEqual({ left: 195, top: 262, position: "top" });
  });

  it("positions the pointer toward its word after horizontal clamping", () => {
    const popup = document.createElement("div");
    popup.innerHTML = "<div data-translation-tooltip-pointer></div>";
    const anchor = document.createElement("div");
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(
      rect(0, 200, 30, 40),
    );
    vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 200, 32),
    );
    expect(positionTranslationTooltip(popup, anchor, "bottom")).toBe("bottom");
    expect(popup.style.top).toBe("248px");
    expect(
      popup.querySelector<HTMLElement>("[data-translation-tooltip-pointer]")
        ?.style.left,
    ).toBe("12px");
  });

  it("puts the bottom panel in flow before the monkey and keeps the same action nodes", () => {
    const panel = document.getElementById("panel") as HTMLElement;
    const wrapper = document.getElementById("wordsWrapper") as HTMLElement;
    const replay = document.createElement("button");
    panel.append(replay);
    positionTranslationPanel(panel, wrapper, "bottom", true);
    expect(wrapper.nextElementSibling).toBe(panel);
    expect(panel.nextElementSibling?.id).toBe("monkey");
    expect(panel.firstChild).toBe(replay);
    expect(panel.dataset["translationReserved"]).toBe("true");
    positionTranslationPanel(panel, wrapper, "top");
    expect(wrapper.previousElementSibling).toBe(panel);
    expect(panel.firstChild).toBe(replay);
    expect(panel.dataset["translationReserved"]).toBe("false");
  });

  it("tracks visible held labels, hides scrolled labels, and clears overlays and observers", async () => {
    const wrapper = document.getElementById("wordsWrapper") as HTMLElement;
    const anchor = wrapper.querySelector<HTMLElement>(".word") as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(
      rect(0, 150, 390, 200),
    );
    const anchorBounds = vi
      .spyOn(anchor, "getBoundingClientRect")
      .mockReturnValue(rect(0, 200, 80, 40));
    showHeldTranslationTooltip(anchor, "trang sách", {
      ...getSettings(),
      position: "bottom",
    });
    const popup = document.querySelector<HTMLElement>(
      '[data-personal-en-vn-translation="held"]',
    );
    expect(popup?.hidden).toBe(false);
    expect(popup?.dataset["translationPosition"]).toBe("bottom");
    expect(anchor.textContent).toBe("page");

    anchorBounds.mockReturnValue(rect(0, 20, 80, 40));
    anchor.setAttribute("style", "top: -180px");
    await vi.waitFor(() => expect(popup?.hidden).toBe(true));

    clearHeldTranslationTooltips();
    expect(
      document.querySelector('[data-personal-en-vn-translation="held"]'),
    ).toBeNull();
    expect(anchor.dataset["enVnHeldTooltip"]).toBeUndefined();
    expect(disconnect).toHaveBeenCalled();
  });
});
