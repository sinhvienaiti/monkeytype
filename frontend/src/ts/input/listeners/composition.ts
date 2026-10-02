import {
  getInputElement,
  getInputElementValue,
  setInputElementValue,
} from "../input-element";
import * as CompositionState from "../../legacy-states/composition";
import * as TestLogic from "../../test/test-logic";
import { setLastInsertCompositionTextData } from "../state";
import { onInsertText } from "../handlers/insert-text";
import { getCurrentInput, logTestEvent } from "../../test/events/data";
import {
  deriveCompositionCommit,
  deriveVietnameseImeRewrite,
  normalizeCommittedText,
  normalizeTargetText,
} from "../helpers/util";
import * as TestWords from "../../test/test-words";
import {
  isTestRestarting,
  getActiveWordIndex,
  isResultCalculating,
  isTestActive,
  setCompositionText,
} from "../../states/test";

const inputEl = getInputElement();

type CompositionSnapshot = {
  committedPrefix: string;
  wordIndex: number;
};

let compositionSnapshot: CompositionSnapshot | null = null;

inputEl.addEventListener("compositionstart", (event) => {
  console.debug("wordsInput event compositionstart", {
    event,
    data: event.data,
  });

  const now = performance.now();

  if (isTestRestarting() || isResultCalculating()) return;
  compositionSnapshot = {
    committedPrefix: normalizeCommittedText(getCurrentInput()),
    wordIndex: getActiveWordIndex(),
  };
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
});

inputEl.addEventListener("compositionupdate", (event) => {
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
});

inputEl.addEventListener("compositionend", async (event) => {
  console.debug("wordsInput event compositionend", { event, data: event.data });

  if (isTestRestarting() || isResultCalculating()) return;
  CompositionState.setComposing(false);
  CompositionState.setData("");
  setCompositionText("");
  setLastInsertCompositionTextData("");

  const now = performance.now();
  const snapshot = compositionSnapshot;
  compositionSnapshot = null;
  let committedData = "";

  if (snapshot !== null && snapshot.wordIndex === getActiveWordIndex()) {
    const finalInputValue = normalizeCommittedText(
      getInputElementValue().inputValue,
    );
    const derived = deriveCompositionCommit(
      snapshot.committedPrefix,
      finalInputValue,
    );

    if (derived === null) {
      const currentWord = normalizeTargetText(
        TestWords.words.getCurrent()?.textWithCommit ?? "",
      );
      const rewrite = deriveVietnameseImeRewrite(
        snapshot.committedPrefix,
        finalInputValue,
        currentWord,
      );

      if (rewrite === null) {
        // Unknown replacement: keep the scorer/event-log state authoritative.
        setInputElementValue(normalizeCommittedText(getCurrentInput()));
      } else {
        committedData = rewrite.data;
        // Keep the browser's rewritten Unicode value and score the resulting
        // character at the position it replaced.
        setInputElementValue(finalInputValue);
        await onInsertText({
          data: rewrite.data,
          now,
          isCompositionEnding: true,
          replacementCharIndex: rewrite.charIndex,
        });
      }
    } else {
      committedData = derived;
      // onInsertText expects the browser-applied value to already be present.
      // Rebuild it from the committed scorer prefix + the true IME delta so
      // multi-code-point replay cannot delete an earlier committed prefix.
      setInputElementValue(snapshot.committedPrefix + committedData);
      if (committedData !== "") {
        await onInsertText({
          data: committedData,
          now,
          isCompositionEnding: true,
        });
      }
    }
  } else {
    // A word transition/restart happened during composition. Drop the stale
    // composition and reconcile the hidden input to current scorer state.
    setInputElementValue(normalizeCommittedText(getCurrentInput()));
  }

  logTestEvent("composition", now, {
    event: "end",
    data: committedData,
    wordIndex: getActiveWordIndex(),
  });
});
