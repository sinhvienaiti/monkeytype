import { getInputElement } from "../input-element";
import { onKeyup } from "../handlers/keyup";
import { onKeydown } from "../handlers/keydown";
import { recordImeDebugEvent } from "../ime-debug";

const inputEl = getInputElement();

inputEl.addEventListener("keyup", async (event) => {
  recordImeDebugEvent("keyup", "before", event);
  console.debug("wordsInput event keyup", {
    event,
    key: event.key,
    code: event.code,
  });

  await onKeyup(event);
  recordImeDebugEvent("keyup", "after", event);
});

inputEl.addEventListener("keydown", async (event) => {
  recordImeDebugEvent("keydown", "before", event);
  console.debug("wordsInput event keydown", {
    event,
    key: event.key,
    code: event.code,
  });

  await onKeydown(event);
  recordImeDebugEvent("keydown", "after", event);
});
