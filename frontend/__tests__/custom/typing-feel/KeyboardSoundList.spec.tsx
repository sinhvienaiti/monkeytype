import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KeyboardSoundList } from "../../../src/ts/custom/typing-feel/KeyboardSoundList";
import {
  KeyboardSoundPreview,
  type KeyboardSoundChoice,
  type TypingSounds,
} from "../../../src/ts/custom/typing-feel/kit/audio";

const choices: KeyboardSoundChoice[] = [
  { value: "off", label: "Off" },
  {
    value: "deep",
    label: "Deep",
    manifest: "/sounds/keys/deep/keys-manifest.json",
    preview: "/sounds/keys/deep/preview.ogg",
  },
  {
    value: "warm",
    label: "Warm",
    disabled: true,
    note: "sound files not installed",
  },
  {
    value: "bright-clack",
    label: "Bright Clack",
    manifest: "/sounds/keys/bright-clack/keys-manifest.json",
    preview: "/sounds/keys/bright-clack/preview.ogg",
  },
];

function mount(value = "bright-clack"): {
  onSelect: ReturnType<typeof vi.fn>;
  onPreview: ReturnType<typeof vi.fn>;
  onStop: ReturnType<typeof vi.fn>;
  option: (label: string) => HTMLElement;
  view: ReturnType<typeof render>;
} {
  const onSelect = vi.fn();
  const onPreview = vi.fn();
  const onStop = vi.fn();
  const view = render(() => (
    <KeyboardSoundList
      options={choices}
      value={value}
      onSelect={onSelect}
      onPreview={onPreview}
      onStop={onStop}
    />
  ));
  const option = (label: string): HTMLElement =>
    view.getByRole("option", { name: new RegExp(`^${label}`) });
  return { onSelect, onPreview, onStop, option, view };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("keyboard sound list", () => {
  it("is a listbox of options with the saved one selected and focusable", () => {
    const { view, option } = mount();
    expect(view.getByRole("listbox", { name: "keyboard sound" })).toBeTruthy();
    expect(option("Bright Clack")).toHaveAttribute("aria-selected", "true");
    expect(option("Bright Clack")).toHaveAttribute("tabindex", "0");
    expect(option("Deep")).toHaveAttribute("tabindex", "-1");
    expect(option("Warm")).toBeDisabled();
    expect(option("Warm")).toHaveTextContent("sound files not installed");
  });

  it("previews on a mouse hover, not a touch, and stops on leave", () => {
    const { option, onPreview, onStop } = mount();
    fireEvent.pointerEnter(option("Deep"), { pointerType: "touch" });
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.pointerEnter(option("Deep"), { pointerType: "mouse" });
    expect(onPreview).toHaveBeenCalledWith(choices[1]);
    fireEvent.pointerLeave(option("Deep"), { pointerType: "mouse" });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("previews on keyboard focus but not on a pointer's focus", () => {
    const { option, onPreview, onStop } = mount();
    fireEvent.focus(option("Deep"));
    expect(onPreview).toHaveBeenCalledTimes(1);
    fireEvent.blur(option("Deep"));
    expect(onStop).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(option("Deep"));
    fireEvent.focus(option("Deep"));
    expect(onPreview).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(option("Deep"));
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it("has no preview for Off: hovering it only stops", () => {
    const { option, onPreview, onStop } = mount();
    fireEvent.pointerEnter(option("Off"), { pointerType: "mouse" });
    expect(onPreview).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("selects with a click, Enter or Space, but not on key repeat", () => {
    const { option, onSelect } = mount();
    fireEvent.click(option("Deep"));
    fireEvent.keyDown(option("Deep"), { key: "Enter" });
    fireEvent.keyDown(option("Deep"), { key: " " });
    fireEvent.keyDown(option("Deep"), { key: "Enter", repeat: true });
    fireEvent.click(option("Warm"));
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledWith(choices[1]);
  });

  it("moves with arrows, Home and End, clamped, skipping disabled rows", () => {
    const { option } = mount();
    option("Deep").focus();
    fireEvent.keyDown(option("Deep"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("Bright Clack"));
    fireEvent.keyDown(option("Bright Clack"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("Bright Clack"));
    fireEvent.keyDown(option("Bright Clack"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(option("Deep"));
    fireEvent.keyDown(option("Deep"), { key: "Home" });
    expect(document.activeElement).toBe(option("Off"));
    fireEvent.keyDown(option("Off"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(option("Off"));
    fireEvent.keyDown(option("Off"), { key: "End" });
    expect(document.activeElement).toBe(option("Bright Clack"));
  });

  it("puts Listen buttons beside the list, never inside an option", () => {
    const { view, onPreview, onStop } = mount();
    const listen = view.getByRole("button", { name: "Listen to Deep" });
    expect(listen.closest("[role=option]")).toBeNull();
    expect(listen.closest("[role=listbox]")).toBeNull();
    expect(view.queryByRole("button", { name: "Listen to Warm" })).toBeNull();
    expect(view.queryByRole("button", { name: "Listen to Off" })).toBeNull();
    fireEvent.click(listen);
    expect(onPreview).toHaveBeenCalledWith(choices[1], 0);
    fireEvent.blur(listen);
    expect(onStop).toHaveBeenCalled();
  });
});

const grouped: KeyboardSoundChoice[] = [
  { value: "off", label: "Off" },
  ...[
    ["deep", "Deep Velvet", "Deep"],
    ["deep-amber", "Deep Amber", "Deep"],
    ["warm", "Warm Velvet", "Warm"],
    ["warm-amber", "Warm Amber", "Warm"],
    ["solid", "Solid Velvet", "Solid"],
    ["bright-clack", "Bright Clack Velvet", "Bright Clack"],
    ["bright-clack-amber", "Bright Clack Amber", "Bright Clack"],
  ].map(([value, label, family]) => ({
    value: value ?? "",
    label: label ?? "",
    family: family ?? "",
    manifest: `/sounds/keys/${value}/keys-manifest.json`,
    preview: `/sounds/keys/${value}/preview.ogg`,
  })),
].map((c) =>
  // The first Warm set is not installed: a family whose head is disabled.
  c.value === "warm"
    ? { ...c, disabled: true, note: "sound files not installed" }
    : c,
);

function mountGrouped(value = "bright-clack"): {
  onSelect: ReturnType<typeof vi.fn>;
  option: (label: string) => HTMLButtonElement;
  view: ReturnType<typeof render>;
} {
  const onSelect = vi.fn();
  const view = render(() => (
    <KeyboardSoundList
      options={grouped}
      value={value}
      onSelect={onSelect}
      onPreview={vi.fn()}
      onStop={vi.fn()}
    />
  ));
  const option = (label: string): HTMLButtonElement =>
    view.getByRole<HTMLButtonElement>("option", {
      name: new RegExp(`^${label}`),
    });
  return { onSelect, option, view };
}

describe("keyboard sound list grouped by family", () => {
  it("puts each family in a named ARIA group, Off outside any", () => {
    const { view, option } = mountGrouped();
    const groups = view.getAllByRole("group");
    expect(groups.map((g) => g.closest("[role=listbox]"))).toEqual(
      groups.map(() => view.getByRole("listbox")),
    );
    expect(
      ["Deep", "Warm", "Solid", "Bright Clack"].map(
        (name) =>
          view.getByRole("group", { name }).querySelectorAll("[role=option]")
            .length,
      ),
    ).toEqual([2, 2, 1, 2]);
    expect(option("Off").closest("[role=group]")).toBeNull();
    expect(option("Bright Clack Amber").closest("[role=group]")).toBe(
      view.getByRole("group", { name: "Bright Clack" }),
    );
  });

  it("keeps headings out of the options: not selectable, not focusable", () => {
    const { view, onSelect } = mountGrouped();
    expect(view.getAllByRole("option")).toHaveLength(8);
    const heading = view.getByText("Deep", { exact: true });
    expect(heading.getAttribute("role")).toBeNull();
    expect(heading.closest("button")).toBeNull();
    expect(heading.tabIndex).toBe(-1);
    fireEvent.click(heading);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("lines the Listen column up with the rows: one cell per set and per heading", () => {
    const { view } = mountGrouped();
    const listbox = view.getByRole("listbox");
    const listens = listbox.nextElementSibling as HTMLElement;
    const rows = 8 + 4;
    expect(listens.children).toHaveLength(rows);
    expect(
      [...listens.children].map((c) => c.getAttribute("aria-hidden")),
    ).toEqual([
      "true", // Off
      "true", // Deep heading
      null,
      null,
      "true", // Warm heading
      "true", // Warm Velvet, not installed
      null,
      "true", // Solid heading
      null,
      "true", // Bright Clack heading
      null,
      null,
    ]);
    expect(listens.querySelector("[role=option]")).toBeNull();
  });

  it("jumps between families with PageDown and PageUp, skipping disabled sets", () => {
    const { option } = mountGrouped();
    option("Off").focus();
    fireEvent.keyDown(option("Off"), { key: "PageDown" });
    expect(document.activeElement).toBe(option("Deep Velvet"));
    fireEvent.keyDown(option("Deep Velvet"), { key: "PageDown" });
    expect(document.activeElement).toBe(option("Warm Amber"));
    fireEvent.keyDown(option("Warm Amber"), { key: "PageDown" });
    expect(document.activeElement).toBe(option("Solid Velvet"));
    fireEvent.keyDown(option("Solid Velvet"), { key: "PageDown" });
    expect(document.activeElement).toBe(option("Bright Clack Velvet"));
    // Past the last family: the last set, like End.
    fireEvent.keyDown(option("Bright Clack Velvet"), { key: "PageDown" });
    expect(document.activeElement).toBe(option("Bright Clack Amber"));
    fireEvent.keyDown(option("Bright Clack Amber"), { key: "PageUp" });
    expect(document.activeElement).toBe(option("Solid Velvet"));
    fireEvent.keyDown(option("Solid Velvet"), { key: "PageUp" });
    expect(document.activeElement).toBe(option("Warm Amber"));
    fireEvent.keyDown(option("Warm Amber"), { key: "PageUp" });
    expect(document.activeElement).toBe(option("Deep Velvet"));
    fireEvent.keyDown(option("Deep Velvet"), { key: "PageUp" });
    expect(document.activeElement).toBe(option("Off"));
    fireEvent.keyDown(option("Off"), { key: "PageUp" });
    expect(document.activeElement).toBe(option("Off"));
  });

  it("moves with arrows across family headings", () => {
    const { option } = mountGrouped();
    option("Deep Amber").focus();
    fireEvent.keyDown(option("Deep Amber"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option("Warm Amber"));
    fireEvent.keyDown(option("Warm Amber"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(option("Deep Amber"));
  });

  describe("scrolling", () => {
    const ROW = 36;
    const VIEW_TOP = 100;
    const VIEW_HEIGHT = 3 * ROW;
    type ScrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => void;
    let scrollIntoView: ReturnType<typeof vi.fn<ScrollIntoView>>;
    const original = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollIntoView",
    );

    beforeEach(() => {
      // A list three rows high: each row's place follows the box's own scrollTop.
      vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(
        function (this: Element) {
          return this.hasAttribute("data-keyboard-scroll") ? VIEW_HEIGHT : 0;
        },
      );
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
        function (this: Element) {
          const box = this.closest<HTMLElement>("[data-keyboard-scroll]");
          let top = VIEW_TOP;
          let height = VIEW_HEIGHT;
          if (box !== null && box !== this) {
            const rows = [
              ...box.querySelectorAll("[role=option], [role=group] > div"),
            ];
            const row =
              this.getAttribute("role") === "group"
                ? (this.firstElementChild ?? this)
                : this;
            const at = rows.indexOf(row);
            top = VIEW_TOP + at * ROW - box.scrollTop;
            height = ROW - 4;
          }
          return {
            top,
            bottom: top + height,
            left: 0,
            right: 200,
            width: 200,
            height,
            x: 0,
            y: top,
            toJSON: () => ({}),
          };
        },
      );
      scrollIntoView = vi.fn<ScrollIntoView>();
      Element.prototype.scrollIntoView = scrollIntoView;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      if (original === undefined) {
        Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      } else {
        Object.defineProperty(Element.prototype, "scrollIntoView", original);
      }
    });

    const box = (view: ReturnType<typeof render>): HTMLElement =>
      view
        .getByRole("listbox")
        .closest<HTMLElement>("[data-keyboard-scroll]") as HTMLElement;

    it("is a bounded box with its own scroll", () => {
      const { view } = mountGrouped();
      expect(box(view).className).toContain("overflow-y-auto");
      expect(box(view).className).toContain("overscroll-contain");
      expect(box(view).className).toMatch(/max-h-\[/);
    });

    it("brings the chosen set into view on open, scrolling only the list", () => {
      const { view, option } = mountGrouped("bright-clack-amber");
      const rect = option("Bright Clack Amber").getBoundingClientRect();
      expect(box(view).scrollTop).toBeGreaterThan(0);
      expect(rect.top).toBeGreaterThanOrEqual(VIEW_TOP);
      expect(rect.bottom).toBeLessThanOrEqual(VIEW_TOP + VIEW_HEIGHT);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("shows a family's heading with its first set when scrolling up", () => {
      const { view, option } = mountGrouped("bright-clack-amber");
      option("Bright Clack Amber").focus();
      fireEvent.keyDown(option("Bright Clack Amber"), { key: "PageUp" });
      expect(document.activeElement).toBe(option("Solid Velvet"));
      const heading = view.getByText("Solid", { exact: true });
      expect(heading.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        VIEW_TOP,
      );
      expect(
        option("Solid Velvet").getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(VIEW_TOP + VIEW_HEIGHT);
      // Warm's first set is not installed: its heading still comes with Warm Amber.
      fireEvent.keyDown(option("Solid Velvet"), { key: "PageUp" });
      expect(document.activeElement).toBe(option("Warm Amber"));
      expect(
        view.getByText("Warm", { exact: true }).getBoundingClientRect().top,
      ).toBeGreaterThanOrEqual(VIEW_TOP);
    });

    it("leaves the scroll alone when the chosen set already shows", () => {
      const { view } = mountGrouped("off");
      expect(box(view).scrollTop).toBe(0);
    });

    it("follows keyboard moves inside the list", () => {
      const { view, option } = mountGrouped("off");
      option("Off").focus();
      fireEvent.keyDown(option("Off"), { key: "End" });
      expect(document.activeElement).toBe(option("Bright Clack Amber"));
      const rect = option("Bright Clack Amber").getBoundingClientRect();
      expect(rect.bottom).toBeLessThanOrEqual(VIEW_TOP + VIEW_HEIGHT);
      fireEvent.keyDown(option("Bright Clack Amber"), { key: "Home" });
      expect(box(view).scrollTop).toBe(0);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});

type FakeGain = {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
type FakeSource = {
  buffer: unknown;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

describe("keyboard sound list with the kit's preview", () => {
  let gains: FakeGain[];
  let sources: FakeSource[];
  let fetchBytes: ReturnType<
    typeof vi.fn<(url: string) => Promise<ArrayBuffer>>
  >;
  let preview: KeyboardSoundPreview;

  beforeEach(() => {
    vi.useFakeTimers();
    gains = [];
    sources = [];
    const ctx = {
      state: "running",
      currentTime: 5,
      destination: {},
      resume: vi.fn(async () => undefined),
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
      createGain: (): FakeGain => {
        const gain: FakeGain = {
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
        gains.push(gain);
        return gain;
      },
      createBufferSource: (): FakeSource => {
        const source: FakeSource = {
          buffer: null,
          onended: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
        sources.push(source);
        return source;
      },
    };
    const sounds = {
      context: ctx,
      resume: () => ctx,
      use: vi.fn(),
    } as unknown as TypingSounds;
    fetchBytes = vi.fn(async (_url: string) => new ArrayBuffer(8));
    preview = new KeyboardSoundPreview({
      levels: () => ({ master: 0.5, keyboard: 1 }),
      sounds,
      fetchBytes,
    });
  });

  function mountWithPreview(): (label: string) => HTMLElement {
    const view = render(() => (
      <KeyboardSoundList
        options={choices}
        value="bright-clack"
        onSelect={(choice) => preview.select(choice)}
        onPreview={(choice, delay) => preview.preview(choice, delay)}
        onStop={() => preview.stop()}
      />
    ));
    return (label) =>
      view.getByRole("option", { name: new RegExp(`^${label}`) });
  }

  it("does not fetch or play for a hover shorter than 150 ms", async () => {
    const option = mountWithPreview();
    fireEvent.pointerEnter(option("Deep"), { pointerType: "mouse" });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.pointerLeave(option("Deep"), { pointerType: "mouse" });
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(sources).toHaveLength(0);
  });

  it("plays one second after a 150 ms dwell", async () => {
    const option = mountWithPreview();
    fireEvent.pointerEnter(option("Deep"), { pointerType: "mouse" });
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchBytes).toHaveBeenCalledWith("/sounds/keys/deep/preview.ogg");
    expect(sources).toHaveLength(1);
    expect(sources[0]?.start).toHaveBeenCalledWith(5, 0, 1);
    expect(sources[0]?.stop).toHaveBeenCalledWith(6);
    expect(gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 5);
  });

  it("fades the first preview out over 30 ms before the next starts", async () => {
    const option = mountWithPreview();
    fireEvent.pointerEnter(option("Deep"), { pointerType: "mouse" });
    await vi.advanceTimersByTimeAsync(150);
    fireEvent.pointerLeave(option("Deep"), { pointerType: "mouse" });
    fireEvent.pointerEnter(option("Bright Clack"), { pointerType: "mouse" });
    expect(gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      5.03,
    );
    expect(sources[0]?.stop).toHaveBeenLastCalledWith(5.03);
    await vi.advanceTimersByTimeAsync(150);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.start).toHaveBeenCalledWith(5.03, 0, 1);
  });
});
