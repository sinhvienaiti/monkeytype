import { getInputElement } from "../input-element";
import { onKeyup } from "../handlers/keyup";
import { onKeydown } from "../handlers/keydown";
import { recordImeDebugEvent } from "../ime-debug";
import {
  clearActivePhysicalKeyCode,
  markBackspaceIntent,
  setActivePhysicalKeyCode,
} from "../state";

const inputEl = getInputElement();

inputEl.addEventListener("keyup", async (event) => {
  recordImeDebugEvent("keyup", "before", event);
  console.debug("wordsInput event keyup", {
    event,
    key: event.key,
    code: event.code,
  });

  await onKeyup(event);
  clearActivePhysicalKeyCode(event.code);
  recordImeDebugEvent("keyup", "after", event);
});

inputEl.addEventListener("keydown", async (event) => {
  if (event.code === "Backspace") {
    markBackspaceIntent(event.timeStamp);
  }
  setActivePhysicalKeyCode(event.code);
  recordImeDebugEvent("keydown", "before", event);
  console.debug("wordsInput event keydown", {
    event,
    key: event.key,
    code: event.code,
  });

  await onKeydown(event);
  recordImeDebugEvent("keydown", "after", event);
});
