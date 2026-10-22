import { createSignal, JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { getSettings } from "../../../custom/en-vn-translation/store";
import {
  canNavigateEveryday,
  getEverydaySession,
  isEverydayLoading,
  navigateEveryday,
  replayEveryday,
} from "../../../custom/everyday-runtime";
import { loadTypingTextSettings } from "../../../custom/typing-text-library";
import { restartTestEvent } from "../../../events/test";
import { showErrorNotification } from "../../../states/notifications";
import { getResultVisible, isResultCalculating } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Button } from "../../common/Button";

type EverydayNavigationProps = {
  placement?: "typing" | "result";
};

export function EverydayNavigation(props: EverydayNavigationProps): JSXElement {
  const isResult = (): boolean => props.placement === "result";
  const [settings, setSettings] = createSignal(loadTypingTextSettings());
  const [learningMode, setLearningMode] = createSignal(
    getSettings().learningMode,
  );
  restartTestEvent.useListener(() => {
    setSettings(loadTypingTextSettings());
    setLearningMode(getSettings().learningMode);
  });

  const visible = () =>
    getConfig.mode === "custom" &&
    settings().source === "everyday" &&
    !isResultCalculating() &&
    getResultVisible() === isResult() &&
    !["sentence-builder", "context-cloze", "smart-review"].includes(
      learningMode(),
    );

  const navigate = (direction: "prev" | "next" | "replay"): void => {
    const action =
      direction === "replay" ? replayEveryday() : navigateEveryday(direction);
    void action.catch((error: unknown) => {
      showErrorNotification(
        error instanceof Error
          ? error.message
          : "Failed to load the Everyday session.",
        { durationMs: 5000 },
      );
    });
  };

  return (
    <Show when={visible() && getEverydaySession()}>
      {(session) => (
        <nav
          aria-label={
            isResult() ? "Everyday result controls" : "Everyday passages"
          }
          data-everyday-placement={props.placement ?? "typing"}
          class={cn(
            "grid min-w-0 items-center text-sub",
            isResult()
              ? "mt-5 grid-cols-[repeat(3,minmax(0,auto))] justify-center gap-x-3 gap-y-4 pb-2 text-base"
              : "my-3 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 text-xs sm:grid-cols-[auto_minmax(0,auto)_auto] sm:justify-center sm:gap-x-4",
            !isResult() && getConfig.monkey && "mt-40",
          )}
        >
          <Button
            text="prev"
            fa={{ icon: "fa-chevron-left" }}
            variant="text"
            class={cn(
              "col-start-1 min-h-11 bg-sub-alt/40 px-3 hover:opacity-100 focus-visible:opacity-100",
              isResult()
                ? "row-start-2 min-w-20 bg-sub-alt/65 px-4 text-text sm:min-w-28"
                : "row-start-1 opacity-65 sm:min-h-0",
            )}
            disabled={
              isEverydayLoading() ||
              !canNavigateEveryday() ||
              !session().hasPrevious
            }
            onClick={() => navigate("prev")}
            balloon={{ text: "Previous Everyday passages", position: "up" }}
          />
          <span
            class={cn(
              "max-w-full min-w-0 text-center wrap-break-word",
              isResult()
                ? "col-span-3 row-start-1 text-sm"
                : "col-start-2 row-start-1",
            )}
            aria-live="polite"
            aria-atomic="true"
          >
            Everyday · {String(session().lessonId).padStart(3, "0")} ·{" "}
            {session().title}
            <span class="block opacity-75">
              passages {session().start + 1}–{session().end} /{" "}
              {session().totalPassages}
            </span>
          </span>
          <Show when={isResult()}>
            <Button
              text="replay"
              fa={{ icon: "fa-redo-alt" }}
              variant="text"
              class="col-start-2 row-start-2 min-h-11 min-w-24 bg-sub-alt/65 px-4 text-text hover:bg-sub-alt sm:min-w-28"
              disabled={isEverydayLoading() || !canNavigateEveryday()}
              onClick={() => navigate("replay")}
              balloon={{
                text: "Type these Everyday passages again",
                position: "up",
              }}
            />
          </Show>
          <Button
            text="next"
            fa={{ icon: "fa-chevron-right" }}
            variant="text"
            class={cn(
              "col-start-3 min-h-11 bg-sub-alt/40 px-3 hover:opacity-100 focus-visible:opacity-100",
              isResult()
                ? "row-start-2 min-w-20 bg-sub-alt/65 px-4 text-main sm:min-w-28"
                : "row-start-1 opacity-65 sm:min-h-0",
            )}
            disabled={
              isEverydayLoading() ||
              !canNavigateEveryday() ||
              !session().hasNext
            }
            onClick={() => navigate("next")}
            balloon={{ text: "Next Everyday passages", position: "up" }}
          />
        </nav>
      )}
    </Show>
  );
}
