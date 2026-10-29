import { For, JSXElement, Show, createSignal } from "solid-js";

import type { KeyboardSoundChoice } from "./kit/audio";

import { Fa } from "../../components/common/Fa";
import { cn } from "../../utils/cn";

const focusRing =
  "focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),_0_0_0_0.2rem_var(--text-color)] focus-visible:outline-none";

/**
 * The keyboard-sound listbox (port of the kit's KeyboardSoundChoices): a
 * mouse hover or keyboard focus previews after the kit's 150 ms dwell,
 * leaving stops it with a 30 ms fade, touch uses the Listen buttons beside
 * the list (never inside an option). Timing lives in KeyboardSoundPreview.
 */
export function KeyboardSoundList(props: {
  options: readonly KeyboardSoundChoice[];
  value: string;
  onSelect: (choice: KeyboardSoundChoice) => void;
  onPreview: (choice: KeyboardSoundChoice, delay?: number) => void;
  onStop: () => void;
}): JSXElement {
  let pointerFocus = false;
  const buttons: HTMLButtonElement[] = [];
  const [focused, setFocused] = createSignal(-1);

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

  const preview = (choice: KeyboardSoundChoice): void => {
    if (choice.disabled === true) return;
    // Off has nothing to hear: hovering it only ends a running preview.
    if (choice.preview === undefined) props.onStop();
    else props.onPreview(choice);
  };

  const move = (event: KeyboardEvent, index: number): void => {
    const enabled = props.options
      .map((c, i) => (c.disabled === true ? -1 : i))
      .filter((i) => i >= 0);
    const at = enabled.indexOf(index);
    const target =
      event.key === "Home"
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
    const button = buttons[target];
    button?.focus();
    button?.scrollIntoView?.({ block: "nearest" });
  };

  return (
    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-1">
      <div role="listbox" aria-label="keyboard sound" class="grid gap-1">
        <For each={props.options}>
          {(choice, index) => (
            <button
              ref={(el) => {
                buttons[index()] = el;
              }}
              type="button"
              role="option"
              aria-selected={choice.value === props.value}
              tabIndex={roving() === index() ? 0 : -1}
              data-value={choice.value}
              disabled={choice.disabled === true}
              title={choice.label}
              class={cn(
                "h-8 min-w-0 cursor-pointer truncate rounded px-3 text-left lowercase transition-colors pointer-coarse:h-11",
                focusRing,
                choice.value === props.value
                  ? "bg-main text-bg"
                  : "bg-sub-alt text-text hover:bg-text hover:text-bg",
                choice.disabled === true &&
                  "cursor-not-allowed opacity-[0.33] hover:bg-sub-alt hover:text-text",
              )}
              onPointerDown={() => {
                pointerFocus = true;
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") preview(choice);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") props.onStop();
              }}
              onFocus={() => {
                setFocused(index());
                if (!pointerFocus) preview(choice);
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
                if (choice.disabled !== true) props.onSelect(choice);
              }}
              onKeyDown={(event) => {
                pointerFocus = false;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!event.repeat && choice.disabled !== true) {
                    props.onSelect(choice);
                  }
                  return;
                }
                move(event, index());
              }}
            >
              {choice.label}
              <Show when={choice.note !== undefined}>
                <span class="ml-2 text-[0.68rem] opacity-75">
                  {choice.note}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>
      <div class="grid gap-1">
        <For each={props.options}>
          {(choice) => (
            <Show
              when={choice.preview !== undefined && choice.disabled !== true}
              fallback={
                <span
                  aria-hidden="true"
                  class="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
                ></span>
              }
            >
              <button
                type="button"
                aria-label={`Listen to ${choice.label}`}
                title={`Listen to ${choice.label}`}
                data-listen={choice.value}
                class={cn(
                  "grid h-8 w-8 cursor-pointer place-items-center rounded bg-sub-alt text-sub transition-colors hover:bg-text hover:text-bg pointer-coarse:h-11 pointer-coarse:w-11",
                  focusRing,
                )}
                onClick={() => props.onPreview(choice, 0)}
                onBlur={() => props.onStop()}
              >
                <Fa icon="fa-play" />
              </button>
            </Show>
          )}
        </For>
      </div>
    </div>
  );
}
