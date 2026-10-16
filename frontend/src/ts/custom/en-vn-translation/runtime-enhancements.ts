import { Config } from "../../config/store";
import { restartTestEvent } from "../../events/test";
import { getActiveWordIndex, isTestActive } from "../../states/test";
import { showNoticeNotification } from "../../states/notifications";
import * as TestWords from "../../test/test-words";

import {
  getTextReaderState,
  startTextReader,
  stopTextReader,
} from "./text-reader";
import { getSettings } from "./store";
import type {
  EnVnTranslationSettings,
  TranslationPopupColor,
  TranslationPopupSize,
  TranslationPopupStyle,
} from "./store";

const SETTINGS_TAB_STORAGE_KEY = "personalCustomTextSettingsTab";
const CUSTOM_TEXT_MODAL_SELECTOR = "#CustomTextModal";

type SettingsTab = "default" | "custom";

type OpenDropdown = {
  host: HTMLDivElement;
  trigger: HTMLButtonElement;
  menu: HTMLDivElement;
};

let readerAutoStarted = false;
let readerGeneration = 0;
let scheduledRuntimeSync: number | null = null;
let lastRuntimeTooltipKey = "";
let floatingTooltip: HTMLDivElement | null = null;
let floatingTooltipAnimation: Animation | null = null;
let customSelectId = 0;
let openDropdown: OpenDropdown | null = null;

const popupSizeClasses: Record<TranslationPopupSize, string> = {
  small: "text-[0.8rem]",
  medium: "text-[0.9rem]",
  large: "text-base",
};

const popupStyleClasses: Record<TranslationPopupStyle, string> = {
  bubble:
    "overflow-visible rounded-xl border bg-translation-surface/90 px-3 py-1.5 shadow-xl backdrop-blur-md",
  pill:
    "overflow-visible rounded-full border bg-translation-surface/90 px-3.5 py-1.5 shadow-xl backdrop-blur-md",
  soft:
    "overflow-visible rounded-lg border bg-translation-surface/90 px-3 py-1.5 shadow-lg backdrop-blur-sm",
  minimal: "px-2 py-1 drop-shadow-lg",
};

const popupAccentClasses: Record<TranslationPopupColor, string> = {
  auto: "border-sub/60",
  blue: "border-translation-blue/60",
  green: "border-translation-green/60",
  amber: "border-translation-amber/60",
  purple: "border-translation-purple/60",
};

function getCurrentEnglishPassage(): string {
  const words: string[] = [];
  for (let index = 0; index < TestWords.words.length; index++) {
    const text = TestWords.words.get(index)?.text;
    if (text !== undefined && text.trim() !== "") words.push(text);
  }
  return words.join(" ");
}

function startGameplayTextReader(): void {
  if (readerAutoStarted || Config.mode !== "custom" || !isTestActive()) return;

  const settings = getSettings();
  if (!settings.textReaderEnabled) return;

  // The existing normal-mode integration may already have started the same
  // reader. Treat that as this session's single auto-start instead of
  // restarting it and losing the current position.
  if (getTextReaderState() !== "idle") {
    readerAutoStarted = true;
    return;
  }

  const source = getCurrentEnglishPassage();
  if (source.trim() === "") return;

  readerAutoStarted = true;
  const result = startTextReader(
    source,
    {
      ...settings,
      // Gameplay Full Text Reader always reads the English passage. The
      // language selector remains useful for the settings preview, but it must
      // never make an English typing session read with Vietnamese TTS.
      textReaderLanguage: "en-US",
    },
    {
      onError: (message) =>
        showNoticeNotification(message, {
          durationMs: 5000,
        }),
    },
  );

  if (!result.started && result.error !== undefined) {
    showNoticeNotification(result.error, {
      durationMs: 5000,
    });
  }
}

function removeFloatingTooltip(): void {
  floatingTooltipAnimation?.cancel();
  floatingTooltipAnimation = null;
  floatingTooltip?.remove();
  floatingTooltip = null;
}

function showHeldTooltip(
  anchor: HTMLElement,
  translation: string,
  settings: EnVnTranslationSettings,
): void {
  anchor.dataset["enVnHeldTooltip"] = "true";
  anchor.dataset["enVnTranslation"] = translation;
  anchor.classList.add(
    "en-vn-held-tooltip",
    `en-vn-tooltip-size-${settings.popupSize}`,
    `en-vn-tooltip-style-${settings.popupStyle}`,
    `en-vn-tooltip-color-${settings.popupColor}`,
  );
}

function showFloatingTooltip(
  anchor: HTMLElement,
  translation: string,
  settings: EnVnTranslationSettings,
): void {
  removeFloatingTooltip();

  const popup = document.createElement("div");
  popup.dataset["personalEnVnTranslationRuntime"] = "floating";
  popup.className = [
    "pointer-events-none fixed z-50 max-w-[min(24rem,calc(100vw-2rem))] whitespace-normal font-(--font)",
    popupSizeClasses[settings.popupSize],
    popupStyleClasses[settings.popupStyle],
    popupAccentClasses[settings.popupColor],
  ].join(" ");

  const text = document.createElement("span");
  text.className =
    "relative z-10 block text-center font-bold leading-[1.2] tracking-[0.01em] text-translation-text";
  text.textContent = translation;
  popup.append(text);

  if (settings.popupStyle !== "minimal") {
    const pointer = document.createElement("div");
    pointer.className = [
      "absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-translation-surface/90",
      popupAccentClasses[settings.popupColor],
    ].join(" ");
    popup.append(pointer);
  }

  document.body.append(popup);
  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const halfWidth = popupRect.width / 2;
  const desiredCenter = anchorRect.left + anchorRect.width / 2;
  const center = Math.min(
    window.innerWidth - halfWidth - 12,
    Math.max(halfWidth + 12, desiredCenter),
  );

  popup.style.left = `${center}px`;
  popup.style.top = `${anchorRect.top - 8}px`;
  popup.style.transform = "translate(-50%, -100%)";

  floatingTooltip = popup;
  const animation = popup.animate(
    [
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(6px) scale(0.96)",
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(0) scale(1)",
        offset: 0.08,
      },
      {
        opacity: 1,
        transform: "translate(-50%, -100%) translateY(-8px) scale(1)",
        offset: 0.72,
      },
      {
        opacity: 0,
        transform: "translate(-50%, -100%) translateY(-36px) scale(1.01)",
      },
    ],
    {
      duration: settings.durationMs,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    },
  );
  floatingTooltipAnimation = animation;
  animation.onfinish = () => {
    if (floatingTooltip === popup) {
      floatingTooltip = null;
      floatingTooltipAnimation = null;
    }
    popup.remove();
  };
}

function syncLearningModeTooltip(): void {
  const settings = getSettings();
  if (
    Config.mode !== "custom" ||
    !settings.enabled ||
    settings.learningMode === "normal" ||
    settings.learningMode === "sentence-builder" ||
    settings.learningMode === "context-cloze" ||
    settings.learningMode === "smart-review"
  ) {
    return;
  }

  if (
    settings.displayMode !== "tooltip" &&
    settings.displayMode !== "both"
  ) {
    removeFloatingTooltip();
    return;
  }

  const topDisplay = document.getElementById("enVnTranslationTopDisplay");
  if (
    topDisplay === null ||
    topDisplay.classList.contains("hidden") ||
    topDisplay.getAttribute("aria-hidden") === "true"
  ) {
    return;
  }

  const translation =
    topDisplay.querySelector<HTMLElement>(".translationVietnamese")?.textContent?.trim() ??
    "";
  if (translation === "") return;

  const wordIndex = getActiveWordIndex();
  const anchor = document.querySelector<HTMLElement>(
    `#words .word[data-wordindex="${wordIndex}"]`,
  );
  if (anchor === null) return;

  const tooltipKey = [
    String(wordIndex),
    translation,
    settings.tooltipBehavior,
    settings.popupStyle,
    settings.popupSize,
    settings.popupColor,
    String(settings.durationMs),
  ].join(":");
  if (tooltipKey === lastRuntimeTooltipKey) return;
  lastRuntimeTooltipKey = tooltipKey;

  if (settings.tooltipBehavior === "hold") {
    showHeldTooltip(anchor, translation, settings);
  } else {
    showFloatingTooltip(anchor, translation, settings);
  }
}

function syncGameplayEnhancements(): void {
  startGameplayTextReader();
  syncLearningModeTooltip();
}

function scheduleGameplayEnhancements(): void {
  if (scheduledRuntimeSync !== null) return;
  const generation = readerGeneration;
  scheduledRuntimeSync = window.setTimeout(() => {
    scheduledRuntimeSync = null;
    if (generation !== readerGeneration) return;
    syncGameplayEnhancements();
  }, 0);
}

function onDocumentInput(event: Event): void {
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest(CUSTOM_TEXT_MODAL_SELECTOR) !== null
  ) {
    return;
  }
  scheduleGameplayEnhancements();
}

function readSettingsTab(): SettingsTab {
  try {
    return window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY) === "custom"
      ? "custom"
      : "default";
  } catch {
    return "default";
  }
}

function writeSettingsTab(tab: SettingsTab): void {
  try {
    window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts. The
    // tabs still work for the current modal session.
  }
}

function findSettingsSidebar(modal: HTMLElement): HTMLElement | null {
  const form = modal.querySelector<HTMLFormElement>("form.contents");
  if (form === null) return null;

  return (
    Array.from(form.children).find((child) => {
      if (!(child instanceof HTMLElement)) return false;
      const text = child.textContent?.toLowerCase() ?? "";
      return (
        text.includes("change the way words are generated") &&
        text.includes("en-vn translation")
      );
    }) ?? null
  );
}

function isCustomSettingsGroup(element: Element): boolean {
  return (element.textContent?.toLowerCase() ?? "").includes(
    "en-vn translation",
  );
}

function applySettingsTab(
  sidebar: HTMLElement,
  tabbar: HTMLElement,
  tab: SettingsTab,
): void {
  for (const child of Array.from(sidebar.children)) {
    if (!(child instanceof HTMLElement) || child === tabbar) continue;
    const custom = isCustomSettingsGroup(child);
    child.classList.toggle("hidden", tab === "custom" ? !custom : custom);
  }

  for (const button of Array.from(
    tabbar.querySelectorAll<HTMLButtonElement>("button[data-settings-tab]"),
  )) {
    const active = button.dataset["settingsTab"] === tab;
    button.classList.toggle("bg-main", active);
    button.classList.toggle("text-bg", active);
    button.classList.toggle("text-sub", !active);
    button.setAttribute("aria-selected", String(active));
  }

  sidebar.dataset["activeSettingsTab"] = tab;
  writeSettingsTab(tab);
}

function enhanceSettingsTabs(modal: HTMLElement): void {
  const sidebar = findSettingsSidebar(modal);
  if (sidebar === null) return;

  let tabbar = sidebar.querySelector<HTMLElement>(
    ":scope > [data-custom-settings-tabs='true']",
  );
  if (tabbar === null) {
    tabbar = document.createElement("div");
    tabbar.dataset["customSettingsTabs"] = "true";
    tabbar.className =
      "sticky top-0 z-20 mb-2 grid grid-cols-2 gap-1 rounded-lg bg-bg/95 p-1 shadow-sm ring-1 ring-sub-alt backdrop-blur";
    tabbar.setAttribute("role", "tablist");
    tabbar.setAttribute("aria-label", "Custom text settings sections");

    for (const tab of ["default", "custom"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["settingsTab"] = tab;
      button.className =
        "rounded-md px-3 py-2 text-center font-medium transition-colors hover:text-text";
      button.textContent = tab;
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => {
        applySettingsTab(sidebar, tabbar as HTMLElement, tab);
      });
      tabbar.append(button);
    }

    sidebar.prepend(tabbar);
  }

  applySettingsTab(sidebar, tabbar, readSettingsTab());
}

function closeOpenDropdown(): void {
  if (openDropdown === null) return;
  openDropdown.menu.classList.add("hidden");
  openDropdown.trigger.setAttribute("aria-expanded", "false");
  openDropdown = null;
}

function getSelectLabel(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent?.trim() ?? "select";
}

function optionButtonClass(selected: boolean, disabled: boolean): string {
  if (disabled) {
    return "w-full cursor-not-allowed rounded px-3 py-2 text-left text-sub opacity-40";
  }
  if (selected) {
    return "w-full rounded bg-main px-3 py-2 text-left text-bg";
  }
  return "w-full rounded px-3 py-2 text-left text-text hover:bg-sub-alt";
}

function buildCustomSelectMenu(
  select: HTMLSelectElement,
  menu: HTMLDivElement,
  trigger: HTMLButtonElement,
): HTMLButtonElement[] {
  menu.replaceChildren();
  const optionButtons: HTMLButtonElement[] = [];

  const appendOption = (option: HTMLOptionElement): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(option.selected));
    button.dataset["selectValue"] = option.value;
    button.disabled = option.disabled;
    button.className = optionButtonClass(option.selected, option.disabled);
    button.textContent = option.textContent?.trim() ?? option.value;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      trigger.textContent = getSelectLabel(select);
      closeOpenDropdown();
      trigger.focus();
    });
    menu.append(button);
    if (!option.disabled) optionButtons.push(button);
  };

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const groupLabel = document.createElement("div");
      groupLabel.className =
        "sticky top-0 bg-bg px-3 py-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-sub";
      groupLabel.textContent = child.label;
      menu.append(groupLabel);
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) appendOption(option);
      }
    } else if (child instanceof HTMLOptionElement) {
      appendOption(child);
    }
  }

  return optionButtons;
}

function openCustomSelect(
  select: HTMLSelectElement,
  host: HTMLDivElement,
  trigger: HTMLButtonElement,
  menu: HTMLDivElement,
  focusDirection: "selected" | "first" | "last" = "selected",
): void {
  if (select.disabled) return;
  if (openDropdown?.host === host) {
    closeOpenDropdown();
    return;
  }

  closeOpenDropdown();
  trigger.textContent = getSelectLabel(select);
  const buttons = buildCustomSelectMenu(select, menu, trigger);
  menu.classList.remove("hidden");
  trigger.setAttribute("aria-expanded", "true");
  openDropdown = { host, trigger, menu };

  const selectedButton = buttons.find(
    (button) => button.dataset["selectValue"] === select.value,
  );
  const focusTarget =
    focusDirection === "first"
      ? buttons[0]
      : focusDirection === "last"
        ? buttons.at(-1)
        : (selectedButton ?? buttons[0]);
  focusTarget?.focus();
}

function enhanceSelect(select: HTMLSelectElement): void {
  if (select.dataset["customDarkSelect"] === "true") {
    const host = select.nextElementSibling;
    const trigger = host?.querySelector<HTMLButtonElement>(
      "[data-custom-select-trigger='true']",
    );
    if (trigger !== null && trigger !== undefined) {
      trigger.disabled = select.disabled;
      trigger.textContent = getSelectLabel(select);
    }
    return;
  }

  select.dataset["customDarkSelect"] = "true";
  select.style.display = "none";
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;

  const host = document.createElement("div");
  host.className = "relative w-full";
  host.dataset["customSelectHost"] = "true";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.dataset["customSelectTrigger"] = "true";
  trigger.className =
    "flex min-h-9 w-full items-center justify-between gap-2 rounded bg-sub-alt px-3 py-2 text-left text-text ring-1 ring-transparent transition hover:ring-sub focus:outline-none focus:ring-2 focus:ring-main disabled:cursor-not-allowed disabled:opacity-40";
  trigger.textContent = getSelectLabel(select);
  trigger.disabled = select.disabled;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  const menuId = `customTextSelectMenu${++customSelectId}`;
  menu.id = menuId;
  menu.setAttribute("role", "listbox");
  menu.className =
    "absolute right-0 left-0 z-50 mt-1 hidden max-h-72 overflow-y-auto rounded-lg bg-bg p-1 text-xs shadow-2xl ring-2 ring-sub-alt";
  trigger.setAttribute("aria-controls", menuId);

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openCustomSelect(select, host, trigger, menu);
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openCustomSelect(select, host, trigger, menu, "selected");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openCustomSelect(select, host, trigger, menu, "last");
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeOpenDropdown();
    }
  });

  menu.addEventListener("keydown", (event) => {
    const buttons = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeOpenDropdown();
      trigger.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + delta + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  });

  select.addEventListener("change", () => {
    trigger.textContent = getSelectLabel(select);
  });

  select.after(host);
  host.append(trigger, menu);
}

function enhanceCustomSelects(modal: HTMLElement): void {
  for (const select of Array.from(
    modal.querySelectorAll<HTMLSelectElement>("select"),
  )) {
    enhanceSelect(select);
  }
}

function enhanceCustomTextModal(modal: HTMLElement): void {
  enhanceSettingsTabs(modal);
  enhanceCustomSelects(modal);
}

let modalEnhancementScheduled = false;
function scheduleModalEnhancement(modal: HTMLElement): void {
  if (modalEnhancementScheduled) return;
  modalEnhancementScheduled = true;
  window.requestAnimationFrame(() => {
    modalEnhancementScheduled = false;
    if (modal.isConnected) enhanceCustomTextModal(modal);
  });
}

function attachCustomTextModalEnhancer(): void {
  const existing = document.querySelector<HTMLElement>(CUSTOM_TEXT_MODAL_SELECTOR);
  if (existing !== null) {
    enhanceCustomTextModal(existing);
    const modalObserver = new MutationObserver(() => {
      scheduleModalEnhancement(existing);
    });
    modalObserver.observe(existing, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "value"],
    });
    return;
  }

  const root = document.body ?? document.documentElement;
  const rootObserver = new MutationObserver(() => {
    const modal = document.querySelector<HTMLElement>(CUSTOM_TEXT_MODAL_SELECTOR);
    if (modal === null) return;
    rootObserver.disconnect();
    enhanceCustomTextModal(modal);
    const modalObserver = new MutationObserver(() => {
      scheduleModalEnhancement(modal);
    });
    modalObserver.observe(modal, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "value"],
    });
  });
  rootObserver.observe(root, { childList: true, subtree: true });
}

document.addEventListener("input", onDocumentInput, true);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || getTextReaderState() === "idle") return;
  readerGeneration++;
  readerAutoStarted = true;
  stopTextReader();
});
document.addEventListener("pointerdown", (event) => {
  if (openDropdown === null) return;
  const target = event.target;
  if (target instanceof Node && openDropdown.host.contains(target)) return;
  closeOpenDropdown();
});

restartTestEvent.subscribe(() => {
  readerGeneration++;
  readerAutoStarted = false;
  lastRuntimeTooltipKey = "";
  if (scheduledRuntimeSync !== null) {
    window.clearTimeout(scheduledRuntimeSync);
    scheduledRuntimeSync = null;
  }
  removeFloatingTooltip();
  stopTextReader();
});

attachCustomTextModalEnhancer();
