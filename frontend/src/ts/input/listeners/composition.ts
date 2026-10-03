import { getInputElement } from "../input-element";
import * as CompositionState from "../../legacy-states/composition";
import * as TestLogic from "../../test/test-logic";
import { setLastInsertCompositionTextData } from "../state";
import { onInsertText } from "../handlers/insert-text";
import { logTestEvent } from "../../test/events/data";
import {
  isTestRestarting,
  getActiveWordIndex,
  isResultCalculating,
  isTestActive,
  setCompositionText,
} from "../../states/test";
import { recordImeDebugEvent } from "../ime-debug";
import { isVietnameseImeSafeModeActive } from "../vietnamese-ime/gate";
import {
  onVietnameseCompositionEnd,
  onVietnameseCompositionStart,
  onVietnameseCompositionUpdate,
} from "../vietnamese-ime/native-events";

const inputEl = getInputElement();

inputEl.addEventListener("compositionstart", (event) => {
  if (isVietnameseImeSafeModeActive()) {
    onVietnameseCompositionStart(event);
    return;
  }

  recordImeDebugEvent("compositionstart", "before", event);
  console.debug("wordsInput event compositionstart", {
    event,
    data: event.data,
  });

  const now = performance.now();

  if (isTestRestarting() || isResultCalculating()) return;
  CompositionState.setComposing(true);
  CompositionState.setData("");
  setLastInsertCompositionTextData("");
  if (!isTestActive()) {
    TestLogic.startTest(now);
  }

  logTestEvent("composition", now, {
    event: "start",
    wordIndex: getActiveWordIndex(),
  });
  recordImeDebugEvent("compositionstart", "after", event);
});

inputEl.addEventListener("compositionupdate", (event) => {
  if (isVietnameseImeSafeModeActive()) {
    onVietnameseCompositionUpdate(event);
    return;
  }

  recordImeDebugEvent("compositionupdate", "before", event);
  console.debug("wordsInput event compositionupdate", {
    event,
    data: event.data,
  });

  if (isTestRestarting() || isResultCalculating()) return;
  CompositionState.setData(event.data);
  setCompositionText(event.data);

  const now = performance.now();

  logTestEvent("composition", now, {
    event: "update",
    data: event.data,
    wordIndex: getActiveWordIndex(),
  });
  recordImeDebugEvent("compositionupdate", "after", event);
});

inputEl.addEventListener("compositionend", async (event) => {
  if (isVietnameseImeSafeModeActive()) {
    await onVietnameseCompositionEnd(event);
    return;
  }

  recordImeDebugEvent("compositionend", "before", event);
  console.debug("wordsInput event compositionend", { event, data: event.data });

  if (isTestRestarting() || isResultCalculating()) return;
  CompositionState.setComposing(false);
  CompositionState.setData("");
  setCompositionText("");
  setLastInsertCompositionTextData("");

  const now = performance.now();

  if (event.data !== "") {
    await onInsertText({
      data: event.data,
      now,
      isCompositionEnding: true,
    });
  }

  logTestEvent("composition", now, {
    event: "end",
    data: event.data,
    wordIndex: getActiveWordIndex(),
  });

  recordImeDebugEvent("compositionend", "after", event);
});
