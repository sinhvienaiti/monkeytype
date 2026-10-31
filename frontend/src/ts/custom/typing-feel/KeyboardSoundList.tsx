import {
  Accessor,
  Index,
  JSXElement,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import type { KeyboardSoundChoice } from "./kit/audio";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";
import { groupByFamily, type KeyboardSection } from "./catalog";

const focusRing =
  "focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),_0_0_0_0.2rem_var(--text-color)] focus-visible:outline-none";
/** One height for a set and its Listen cell, so the two columns line up. */
const rowHeight = "h-8 pointer-coarse:h-11";
/** A family heading and its spacer in the Listen column. */
const headingHeight = "h-6";

type Item = KeyboardSection["items"][number];

/**
 * Scrolls only `box` until `top` to `bottom` shows (the top wins when both
 * cannot), so the settings sidebar around the list stays still.
 */
function reveal(box: HTMLElement, top: HTMLElement, bottom: HTMLElement): void {
  const start = box.getBoundingClientRect().top + box.clientTop;
  const end = start + box.clientHeight;
  const from = top.getBoundingClientRect().top;
  const to = bottom.getBoundingClientRect().bottom;
  if (from < start) box.scrollTop += from - start;
  else if (to > end) box.scrollTop += Math.min(to - end, from - start);
}

/**
 * The keyboard-sound listbox (port of the kit's KeyboardSoundChoices): sets
 * grouped under their family heading (ARIA groups, the heading is never an
 * option), a bounded height with its own scroll that brings the chosen set
 * into view on open and follows keyboard moves, PageUp/PageDown between
 * families. A mouse hover or keyboard focus previews after the kit's 150 ms
 * dwell, leaving stops it with a 30 ms fade, touch uses the Listen buttons
 * beside the list (never inside an option). Timing lives in
 * KeyboardSoundPreview.
 *
 * Rows are kept by place (Index), not by object: the settings map the
 * catalogue again after every set load or failure, and a rebuilt row would
 * drop keyboard focus and replay the hover preview under a still mouse.
 */
export function KeyboardSoundList(props: {
  options: readonly KeyboardSoundChoice[];
  value: string;
  onSelect: (choice: KeyboardSoundChoice) => void;
  onPreview: (choice: KeyboardSoundChoice, delay?: number) => void;
  onStop: () => void;
}): JSXElement {
  let pointerFocus = false;
  /** A set picked in the list: already where the user looks, so its pick does not scroll. */
  let picked: string | undefined;
  let box: HTMLDivElement | undefined;
  let listbox: HTMLDivElement | undefined;
  const uid = createUniqueId();
  const [focused, setFocused] = createSignal(-1);
  const sections = createMemo(() => groupByFamily(props.options));

  const usable = (): number[] =>
    props.options.flatMap((c, i) => (c.disabled === true ? [] : [i]));

  const roving = (): number => {
    const f = focused();
    if (f >= 0) return f;
    const selected = props.options.findIndex(
      (c) => c.value === props.value && c.disabled !== true,
    );
    return selected >= 0
      ? selected
      : props.options.findIndex((c) => c.disabled !== true);
  };

  const optionAt = (index: number): HTMLButtonElement | undefined =>
    listbox?.querySelectorAll<HTMLButtonElement>("[role=option]")[index];

  /** Option `index` in view, with its family heading when it is the first usable set of one. */
  const show = (index: number): void => {
    const option = optionAt(index);
    if (option === undefined || box === undefined) return;
    const heads = sections().some(
      (s) =>
        s.family !== undefined &&
        s.items.find((i) => i.choice.disabled !== true)?.index === index,
    );
    const group = heads ? option.closest<HTMLElement>("[role=group]") : null;
    reveal(box, group ?? option, option);
  };

  const showChosen = (): void => {
    const index = props.options.findIndex((c) => c.value === props.value);
    if (index >= 0) show(index);
  };

  // The saved set in view when the list fills (the catalogue loads) or the
  // value changes from outside (a repaired id). A click or Enter in the list
  // leaves the box still: scrolling under the pointer would end its preview.
  const chosen = createMemo(
    () => `${props.value}\n${props.options.map((c) => c.value).join(",")}`,
  );
  createEffect(
    on(chosen, () => {
      const own = picked === props.value;
      picked = undefined;
      if (!own) showChosen();
    }),
  );

  const pick = (choice: KeyboardSoundChoice): void => {
    if (choice.disabled === true) return;
    if (choice.value !== props.value) picked = choice.value;
    props.onSelect(choice);
  };

  onMount(() => {
    // The custom tab hides the group (display none): scroll once it shows.
    if (typeof ResizeObserver === "undefined" || box === undefined) return;
    const scroller = box;
    let visible = false;
    const watcher = new ResizeObserver(() => {
      const now = scroller.clientHeight > 0;
      if (now && !visible) showChosen();
      visible = now;
    });
    watcher.observe(scroller);
    onCleanup(() => watcher.disconnect());
  });

  const preview = (choice: KeyboardSoundChoice): void => {
    if (choice.disabled === true) return;
    // Off has nothing to hear: hovering it only ends a running preview.
    if (choice.preview === undefined) props.onStop();
    else props.onPreview(choice);
  };

  /** A family is a page: the first usable set of the next or previous one, else the ends. */
  const pageTarget = (key: string, index: number): number | undefined => {
    const all = sections();
    const here = all.findIndex((s) => s.items.some((i) => i.index === index));
    const first = (s: KeyboardSection): number | undefined =>
      s.items.find((i) => i.choice.disabled !== true)?.index;
    const ahead =
      key === "PageDown"
        ? all.slice(here + 1)
        : all.slice(0, Math.max(0, here)).reverse();
    for (const section of ahead) {
      const target = first(section);
      if (target !== undefined) return target;
    }
    return key === "PageDown" ? usable().at(-1) : usable()[0];
  };

  const move = (event: KeyboardEvent, index: number): void => {
    const enabled = usable();
    const at = enabled.indexOf(index);
    const target =
      event.key === "PageDown" || event.key === "PageUp"
        ? pageTarget(event.key, index)
        : event.key === "Home"
          ? enabled[0]
          : event.key === "End"
            ? enabled[enabled.length - 1]
            : event.key === "ArrowDown"
              ? enabled[Math.min(enabled.length - 1, at + 1)]
              : event.key === "ArrowUp"
                ? enabled[Math.max(0, at - 1)]
                : undefined;
    if (target === undefined) return;
    event.preventDefault();
    optionAt(target)?.focus({ preventScroll: true });
    show(target);
  };

  const option = (item: Accessor<Item>): JSXElement => {
    const choice = (): KeyboardSoundChoice => item().choice;
    return (
      <button
        type="button"
        role="option"
        aria-selected={choice().value === props.value}
        tabIndex={roving() === item().index ? 0 : -1}
        data-value={choice().value}
        disabled={choice().disabled === true}
        title={choice().label}
        class={cn(
          "min-w-0 cursor-pointer truncate rounded px-3 text-left lowercase transition-colors",
          rowHeight,
          focusRing,
          choice().value === props.value
            ? "bg-main text-bg"
            : "bg-sub-alt text-text hover:bg-text hover:text-bg",
          choice().disabled === true &&
            "cursor-not-allowed opacity-[0.33] hover:bg-sub-alt hover:text-text",
        )}
        onPointerDown={() => {
          pointerFocus = true;
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") preview(choice());
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") props.onStop();
        }}
        onFocus={() => {
          setFocused(item().index);
          if (!pointerFocus) preview(choice());
        }}
        onBlur={() => {
          pointerFocus = false;
          setFocused(-1);
          props.onStop();
        }}
        onPointerCancel={() => {
          pointerFocus = false;
          props.onStop();
        }}
        onClick={() => {
          pointerFocus = false;
          pick(choice());
        }}
        onKeyDown={(event) => {
          pointerFocus = false;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!event.repeat) pick(choice());
            return;
          }
          move(event, item().index);
        }}
      >
        {choice().label}
        <Show when={choice().note}>
          {(note) => (
            <span class="ml-2 text-[0.68rem] opacity-75">{note()}</span>
          )}
        </Show>
      </button>
    );
  };

  const listen = (item: Accessor<Item>): JSXElement => {
    const choice = (): KeyboardSoundChoice => item().choice;
    return (
      <Show
        when={choice().preview !== undefined && choice().disabled !== true}
        fallback={
          <span
            aria-hidden="true"
            class={cn("w-8 pointer-coarse:w-11", rowHeight)}
          ></span>
        }
      >
        <button
          type="button"
          aria-label={`Listen to ${choice().label}`}
          title={`Listen to ${choice().label}`}
          data-listen={choice().value}
          class={cn(
            "grid w-8 cursor-pointer place-items-center rounded bg-sub-alt text-sub transition-colors hover:bg-text hover:text-bg pointer-coarse:w-11",
            rowHeight,
            focusRing,
          )}
          onClick={() => props.onPreview(choice(), 0)}
          onBlur={() => props.onStop()}
        >
          <Fa icon="fa-play" />
        </button>
      </Show>
    );
  };

  return (
    <div
      ref={(el) => {
        box = el;
      }}
      data-keyboard-scroll="true"
      class="max-h-[min(20rem,40dvh)] overflow-y-auto overscroll-contain p-1"
    >
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
        <div
          ref={(el) => {
            listbox = el;
          }}
          role="listbox"
          aria-label="keyboard sound"
          class="grid content-start gap-1"
        >
          <Index each={sections()}>
            {(section, at) => (
              <Show
                when={section().family}
                fallback={<Index each={section().items}>{option}</Index>}
              >
                {(family) => (
                  <div
                    role="group"
                    aria-labelledby={`${uid}-family-${at}`}
                    class="grid gap-1"
                  >
                    <div
                      id={`${uid}-family-${at}`}
                      class={cn(
                        "flex items-end px-3 text-[0.68rem] text-sub lowercase",
                        headingHeight,
                      )}
                    >
                      {family()}
                    </div>
                    <Index each={section().items}>{option}</Index>
                  </div>
                )}
              </Show>
            )}
          </Index>
        </div>
        <div class="grid content-start gap-1">
          <Index each={sections()}>
            {(section) => (
              <>
                <Show when={section().family !== undefined}>
                  <span aria-hidden="true" class={headingHeight}></span>
                </Show>
                <Index each={section().items}>{listen}</Index>
              </>
            )}
          </Index>
        </div>
      </div>
    </div>
  );
}
