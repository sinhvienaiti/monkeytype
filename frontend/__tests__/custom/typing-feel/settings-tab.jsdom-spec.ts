import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
  showNoticeNotification: vi.fn(),
}));
vi.mock("../../../src/ts/states/test", () => ({
  getActiveWordIndex: () => 0,
  isTestActive: () => false,
}));
vi.mock("../../../src/ts/test/test-words", () => ({
  words: { get: () => [], getCurrent: () => undefined, length: 0 },
}));

function group(title: string, tagged: boolean): string {
  return `<div class="grid w-full"${tagged ? ' data-custom-settings-group="true"' : ""}><div>${title}</div><div>sub</div></div>`;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  document.body.innerHTML = `
    <dialog id="CustomTextModal" open>
      <form class="contents">
        <div data-custom-settings-sidebar="true">
          <div data-custom-settings-scroll="true">
            ${group("Change the way words are generated", false)}
            ${group("EN-VN translation", false)}
            ${group("typing feel", true)}
          </div>
        </div>
      </form>
    </dialog>`;
});

const visible = (title: string): boolean => {
  const el = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-custom-settings-scroll] > div",
    ),
  ).find((g) => g.textContent?.includes(title));
  return el !== undefined && !el.classList.contains("hidden");
};

describe("custom settings tab", () => {
  it("shows tagged groups and EN-VN only under custom", async () => {
    await import("../../../src/ts/custom/en-vn-translation/runtime-enhancements");
    const tabs = document.querySelectorAll<HTMLButtonElement>(
      "button[data-settings-tab]",
    );
    expect(Array.from(tabs).map((t) => t.textContent)).toEqual([
      "default",
      "custom",
    ]);

    expect(visible("Change the way words are generated")).toBe(true);
    expect(visible("EN-VN translation")).toBe(false);
    expect(visible("typing feel")).toBe(false);

    tabs[1]?.click();
    expect(visible("Change the way words are generated")).toBe(false);
    expect(visible("EN-VN translation")).toBe(true);
    expect(visible("typing feel")).toBe(true);
    expect(localStorage.getItem("personalCustomTextSettingsTab")).toBe(
      "custom",
    );
  });
});
