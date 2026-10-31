import { cn } from "../../utils/cn";
import type { EnVnTranslationSettings, TranslationPosition } from "./store";

type AnchorBounds = Pick<
  DOMRect,
  "left" | "right" | "top" | "bottom" | "width"
>;
type PopupBounds = Pick<DOMRect, "width" | "height">;

const heldTooltips = new Map<HTMLElement, HTMLDivElement>();
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let pendingFrame: number | null = null;

export function positionTranslationPanel(
  panel: HTMLElement,
  wordsWrapper: HTMLElement,
  position: TranslationPosition,
  reservePanel = false,
): void {
  panel.dataset["translationPosition"] = position;
  panel.dataset["translationReserved"] = String(
    position === "bottom" && reservePanel,
  );
  wordsWrapper.dataset["translationPosition"] = position;
  if (position === "bottom") {
    if (wordsWrapper.nextElementSibling !== panel) wordsWrapper.after(panel);
  } else if (wordsWrapper.previousElementSibling !== panel) {
    wordsWrapper.before(panel);
  }
}

export function getTooltipPlacement(
  anchor: AnchorBounds,
  popup: PopupBounds,
  preferred: TranslationPosition,
  viewport: { width: number; height: number },
): { left: number; top: number; position: TranslationPosition } {
  const edge = 16;
  const gap = 8;
  const above = anchor.top - gap - popup.height;
  const below = anchor.bottom + gap;
  const fitsTop = above >= edge;
  const fitsBottom = below + popup.height <= viewport.height - edge;
  const position =
    preferred === "top"
      ? !fitsTop && fitsBottom
        ? "bottom"
        : "top"
      : !fitsBottom && fitsTop
        ? "top"
        : "bottom";
  const halfWidth = popup.width / 2;
  return {
    left: Math.max(
      edge + halfWidth,
      Math.min(
        viewport.width - edge - halfWidth,
        anchor.left + anchor.width / 2,
      ),
    ),
    top: Math.max(
      edge,
      Math.min(
        viewport.height - edge - popup.height,
        position === "top" ? above : below,
      ),
    ),
    position,
  };
}

export function positionTranslationTooltip(
  popup: HTMLDivElement,
  anchor: HTMLElement,
  preferred: TranslationPosition,
  packedCenter?: number,
): TranslationPosition {
  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const placement = getTooltipPlacement(anchorRect, popupRect, preferred, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  if (packedCenter !== undefined) placement.left = packedCenter;
  popup.style.left = `${placement.left}px`;
  popup.style.top = `${placement.top}px`;
  popup.style.transform = "translateX(-50%)";
  popup.dataset["translationPosition"] = placement.position;

  const pointer = popup.querySelector<HTMLElement>(
    "[data-translation-tooltip-pointer]",
  );
  if (pointer !== null) {
    pointer.style.left = `${Math.max(12, Math.min(popupRect.width - 12, anchorRect.left + anchorRect.width / 2 - placement.left + popupRect.width / 2))}px`;
  }
  return placement.position;
}

export function packTooltipRow(
  items: { left: number; width: number }[],
  viewportWidth: number,
): { left: number; width: number }[] {
  if (items.length === 0) return [];
  const edge = 16;
  const available = viewportWidth - edge * 2;
  const gap = Math.min(8, available / (items.length * 4));
  const contentSpace = available - gap * (items.length - 1);
  let widths = items.map((item) => item.width);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  if (totalWidth > contentSpace) {
    const minimums = widths.map((width) =>
      Math.min(width, 64, contentSpace / items.length),
    );
    const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
    const scale = (contentSpace - minimumTotal) / (totalWidth - minimumTotal);
    widths = widths.map((width, index) => {
      const minimum = minimums[index] ?? 0;
      return minimum + (width - minimum) * scale;
    });
  }
  const packed: { left: number; width: number }[] = [];
  let nextLeft = edge;
  for (const [index, item] of items.entries()) {
    const width = widths[index] ?? item.width;
    const left = Math.max(
      nextLeft,
      Math.min(viewportWidth - edge - width, item.left - width / 2),
    );
    packed.push({ left, width });
    nextLeft = left + width + gap;
  }
  let rightEdge = viewportWidth - edge;
  for (let index = packed.length - 1; index >= 0; index--) {
    const item = packed[index];
    if (item === undefined) continue;
    item.left = Math.min(item.left, rightEdge - item.width);
    rightEdge = item.left - gap;
  }
  return packed.map((item) => ({ ...item, left: item.left + item.width / 2 }));
}

export function floatingTooltipKeyframes(
  position: TranslationPosition,
): Keyframe[] {
  const direction = position === "top" ? -1 : 1;
  const transform = (offset: number, scale = 1): string =>
    `translateX(-50%) translateY(${direction * offset}px) scale(${scale})`;
  return [
    { opacity: 0, transform: transform(-4, 0.96) },
    { opacity: 1, transform: transform(0), offset: 0.08 },
    { opacity: 1, transform: transform(0), offset: 0.72 },
    { opacity: 0, transform: transform(4, 1.01) },
  ];
}

function updateHeldTooltips(): void {
  const wrapper = document.getElementById("wordsWrapper");
  const wrapperRect = wrapper?.getBoundingClientRect();
  if (
    wrapperRect === undefined ||
    wrapperRect.width === 0 ||
    wrapperRect.height === 0
  ) {
    clearHeldTranslationTooltips();
    return;
  }
  const rows: {
    top: number;
    entries: {
      anchor: HTMLElement;
      popup: HTMLDivElement;
      rect: DOMRect;
      width: number;
    }[];
  }[] = [];
  for (const [anchor, popup] of heldTooltips) {
    if (!anchor.isConnected || anchor.dataset["enVnHeldTooltip"] !== "true") {
      popup.remove();
      heldTooltips.delete(anchor);
      continue;
    }
    const rect = anchor.getBoundingClientRect();
    const visible =
      wrapperRect !== undefined &&
      rect.width > 0 &&
      rect.bottom > wrapperRect.top &&
      rect.top < wrapperRect.bottom &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight;
    popup.hidden = !visible;
    if (visible) {
      popup.style.maxWidth = "";
      const row = rows.find(
        (entry) => Math.abs(entry.top - rect.top) < rect.height / 2,
      );
      const entry = {
        anchor,
        popup,
        rect,
        width: popup.getBoundingClientRect().width,
      };
      if (row === undefined) rows.push({ top: rect.top, entries: [entry] });
      else row.entries.push(entry);
    }
  }
  for (const row of rows) {
    row.entries.sort((a, b) => a.rect.left - b.rect.left);
    const packed = packTooltipRow(
      row.entries.map((entry) => ({
        left: entry.rect.left + entry.rect.width / 2,
        width: entry.width,
      })),
      window.innerWidth,
    );
    for (const [index, entry] of row.entries.entries()) {
      const placement = packed[index];
      if (placement === undefined) continue;
      entry.popup.style.maxWidth = `${placement.width}px`;
      positionTranslationTooltip(
        entry.popup,
        entry.anchor,
        entry.anchor.dataset["enVnTooltipPosition"] === "bottom"
          ? "bottom"
          : "top",
        placement.left,
      );
    }
  }
  if (heldTooltips.size === 0) stopTrackingHeldTooltips();
}

function scheduleHeldTooltips(): void {
  if (pendingFrame !== null) return;
  pendingFrame = window.requestAnimationFrame(() => {
    pendingFrame = null;
    updateHeldTooltips();
  });
}

function stopTrackingHeldTooltips(): void {
  mutationObserver?.disconnect();
  mutationObserver = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", scheduleHeldTooltips);
  document.removeEventListener("scroll", scheduleHeldTooltips, true);
  if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
  pendingFrame = null;
}

function trackHeldTooltips(): void {
  if (mutationObserver !== null) return;
  const wrapper = document.getElementById("wordsWrapper");
  if (wrapper === null) return;
  mutationObserver = new MutationObserver(scheduleHeldTooltips);
  mutationObserver.observe(wrapper.parentElement?.parentElement ?? wrapper, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  resizeObserver = new ResizeObserver(scheduleHeldTooltips);
  resizeObserver.observe(wrapper);
  window.addEventListener("resize", scheduleHeldTooltips, { passive: true });
  document.addEventListener("scroll", scheduleHeldTooltips, {
    passive: true,
    capture: true,
  });
}

export function showHeldTranslationTooltip(
  anchor: HTMLElement,
  translation: string,
  settings: EnVnTranslationSettings,
): void {
  const popup = heldTooltips.get(anchor) ?? document.createElement("div");
  anchor.dataset["enVnHeldTooltip"] = "true";
  anchor.dataset["enVnTranslation"] = translation;
  anchor.dataset["enVnTooltipPosition"] = settings.position;
  popup.dataset["personalEnVnTranslation"] = "held";
  const sizes = {
    small: "text-[0.8rem]",
    medium: "text-[0.9rem]",
    large: "text-base",
  };
  const styles = {
    bubble:
      "rounded-xl border bg-translation-surface/90 px-3 py-1.5 shadow-xl backdrop-blur-md",
    pill: "rounded-full border bg-translation-surface/90 px-3.5 py-1.5 shadow-xl backdrop-blur-md",
    soft: "rounded-lg border bg-translation-surface/90 px-3 py-1.5 shadow-lg backdrop-blur-sm",
    minimal: "px-2 py-1 drop-shadow-lg",
  };
  const colors = {
    auto: "border-sub/60",
    blue: "border-translation-blue/60",
    green: "border-translation-green/60",
    amber: "border-translation-amber/60",
    purple: "border-translation-purple/60",
  };
  popup.className = cn(
    "pointer-events-none fixed z-50 w-max max-w-[min(24rem,calc(100vw-2rem))] font-(--font) text-center font-bold leading-[1.2] wrap-anywhere whitespace-normal text-translation-text",
    sizes[settings.popupSize],
    styles[settings.popupStyle],
    colors[settings.popupColor],
  );
  popup.replaceChildren(document.createTextNode(translation));
  if (settings.popupStyle !== "minimal") {
    const pointer = document.createElement("div");
    pointer.dataset["translationTooltipPointer"] = "true";
    pointer.className = cn(
      "absolute h-3 w-3 border-r border-b bg-translation-surface/90",
      colors[settings.popupColor],
    );
    popup.append(pointer);
  }
  heldTooltips.set(anchor, popup);
  if (!popup.isConnected) document.body.append(popup);
  updateHeldTooltips();
  if (heldTooltips.size > 0) trackHeldTooltips();
}

export function clearHeldTranslationTooltips(): void {
  for (const [anchor, popup] of heldTooltips) {
    popup.remove();
    delete anchor.dataset["enVnHeldTooltip"];
    delete anchor.dataset["enVnTranslation"];
    delete anchor.dataset["enVnTooltipPosition"];
  }
  heldTooltips.clear();
  stopTrackingHeldTooltips();
}
