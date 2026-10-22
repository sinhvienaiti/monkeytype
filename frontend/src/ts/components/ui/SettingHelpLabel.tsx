import {
  createEffect,
  createSignal,
  createUniqueId,
  JSXElement,
  onCleanup,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

export function SettingHelpLabel(props: {
  label: string;
  help: string;
}): JSXElement {
  const id = createUniqueId();
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  const [position, setPosition] = createSignal({ left: 0, top: 0 });
  const [positioned, setPositioned] = createSignal(false);
  const open = (): boolean => hovered() || focused();
  let trigger: HTMLButtonElement | undefined;
  let tooltip: HTMLDivElement | undefined;

  const hide = (): void => {
    setHovered(false);
    setFocused(false);
  };

  createEffect(() => {
    if (!open() || trigger === undefined || tooltip === undefined) return;
    const anchor = trigger.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const left = Math.max(
      margin,
      Math.min(
        anchor.left + anchor.width / 2 - bounds.width / 2,
        window.innerWidth - bounds.width - margin,
      ),
    );
    const top =
      anchor.top - bounds.height - gap >= margin
        ? anchor.top - bounds.height - gap
        : Math.min(
            anchor.bottom + gap,
            window.innerHeight - bounds.height - margin,
          );
    setPosition({ left, top: Math.max(margin, top) });
    setPositioned(true);

    // Keep the help tied to its trigger while either scroll pane is moving.
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    onCleanup(() => {
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      setPositioned(false);
    });
  });

  return (
    <div class="flex items-center gap-1 text-sub">
      <span>{props.label}</span>
      <button
        ref={(element) => {
          trigger = element;
        }}
        type="button"
        aria-label={`Help for ${props.label}`}
        aria-describedby={open() ? id : undefined}
        class="grid size-5 shrink-0 cursor-help place-items-center rounded-full border border-sub/30 bg-transparent p-0 text-[0.65rem] leading-none text-sub hover:border-text hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-main"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open()) return;
          event.preventDefault();
          event.stopPropagation();
          hide();
        }}
      >
        ?
      </button>
      <Show when={open()}>
        {/* Stay in the dialog's top layer, outside both clipped scroll panes. */}
        <Portal mount={trigger?.closest("dialog") ?? undefined}>
          <div
            ref={(element) => {
              tooltip = element;
            }}
            id={id}
            role="tooltip"
            class="pointer-events-none fixed z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded border border-sub/30 bg-sub-alt px-3 py-2 text-left text-xs leading-relaxed wrap-anywhere whitespace-normal text-text shadow-lg"
            style={{
              left: `${position().left}px`,
              top: `${position().top}px`,
              visibility: positioned() ? "visible" : "hidden",
            }}
          >
            {props.help}
          </div>
        </Portal>
      </Show>
    </div>
  );
}
