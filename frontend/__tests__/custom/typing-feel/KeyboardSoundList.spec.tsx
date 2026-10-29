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
