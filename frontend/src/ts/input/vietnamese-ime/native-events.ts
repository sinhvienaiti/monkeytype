import {
  getInputElementValue,
  setInputElementValue,
} from "../input-element";
import * as CompositionState from "../../legacy-states/composition";
import * as TestLogic from "../../test/test-logic";
import { setLastInsertCompositionTextData } from "../state";
import { onInsertText } from "../handlers/insert-text";
import { getCurrentInput, logTestEvent } from "../../test/events/data";
import { normalizeCommittedText } from "../helpers/util";
import { recordImeDebugEvent } from "../ime-debug";
import { isSpace } from "../../utils/strings";
import {
  isTestRestarting,
  getActiveWordIndex,
  isResultCalculating,
  isTestActive,
  setCompositionText,
} from "../../states/test";
import {
  beginVietnameseImeSession,
  finishVietnameseImeSession,
  getVietnameseImeRevision,
  getVietnameseImeSession,
  takeVietnameseImeSeparator,
} from "./state";
import { createVietnameseCommitTransaction } from "./transaction";

export function onVietnameseCompositionStart(event: CompositionEvent): void {
  recordImeDebugEvent("compositionstart", "before", event);
  console.debug("wordsInput event compositionstart [vi-native]", {
    event,
    data: event.data,
  });

  const now = performance.now();
  if (isTestRestarting() || isResultCalculating()) return;

  const committedPrefix = normalizeCommittedText(getCurrentInput());
  beginVietnameseImeSession({
    wordIndex: getActiveWordIndex(),
    committedPrefix,
  });

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
}

export function onVietnameseCompositionUpdate(event: CompositionEvent): void {
  recordImeDebugEvent("compositionupdate", "before", event);
  console.debug("wordsInput event compositionupdate [vi-native]", {
    event,
    data: event.data,
  });

  if (isTestRestarting() || isResultCalculating()) return;

  CompositionState.setData(event.data);
  setCompositionText(event.data);

  logTestEvent("composition", performance.now(), {
    event: "update",
    data: event.data,
    wordIndex: getActiveWordIndex(),
  });
  recordImeDebugEvent("compositionupdate", "after", event);
}

export async function onVietnameseCompositionEnd(
  event: CompositionEvent,
): Promise<void> {
  recordImeDebugEvent("compositionend", "before", event);
  console.debug("wordsInput event compositionend [vi-native]", {
    event,
    data: event.data,
  });

  const now = performance.now();

  if (isTestRestarting() || isResultCalculating()) {
    finishVietnameseImeSession();
    CompositionState.invalidate();
    setCompositionText("");
    setLastInsertCompositionTextData("");
    takeVietnameseImeSeparator();
    setInputElementValue(normalizeCommittedText(getCurrentInput()));
    return;
  }

  CompositionState.setComposing(false);
  CompositionState.setData("");
  setCompositionText("");
  setLastInsertCompositionTextData("");

  const session = getVietnameseImeSession();
  finishVietnameseImeSession();
  let committedData = "";

  if (
    session !== null &&
    session.wordIndex === getActiveWordIndex() &&
    session.revision === getVietnameseImeRevision()
  ) {
    const scorerInput = normalizeCommittedText(getCurrentInput());
    const finalInputValue = normalizeCommittedText(
      getInputElementValue().inputValue,
    );

    if (scorerInput !== session.committedPrefix) {
      setInputElementValue(scorerInput);
    } else {
      const transaction = createVietnameseCommitTransaction({
        wordIndex: session.wordIndex,
        before: session.committedPrefix,
        after: finalInputValue,
        source: "composition",
      });

      if (transaction !== null) {
        const beforeChars = Array.from(transaction.before);
        const insertChars = Array.from(transaction.insertText);
        const replaceCount = Math.min(
          transaction.deleteCount,
          insertChars.length,
        );

        if (transaction.deleteCount > insertChars.length) {
          // Native mode never invents deletions the browser did not commit
          // through Monkeytype. Keep scorer/event-log state authoritative.
          setInputElementValue(scorerInput);
        } else {
          const logicalChars = [...beforeChars];

          for (let i = 0; i < replaceCount; i++) {
            const charIndex = transaction.start + i;
            const data = insertChars[i] as string;
            logicalChars[charIndex] = data;
            setInputElementValue(logicalChars.join(""));
            await onInsertText({
              data,
              now,
              isCompositionEnding: true,
              replacementCharIndex: charIndex,
              lastInMultiIndex:
                i === insertChars.length - 1 && replaceCount === insertChars.length,
            });
          }

          for (let i = replaceCount; i < insertChars.length; i++) {
            const data = insertChars[i] as string;
            logicalChars.splice(transaction.start + i, 0, data);
            setInputElementValue(logicalChars.join(""));
            await onInsertText({
              data,
              now,
              isCompositionEnding: true,
              lastInMultiIndex: i === insertChars.length - 1,
            });
          }

          committedData = transaction.insertText;
          setInputElementValue(transaction.after);
        }
      }
    }
  } else {
    setInputElementValue(normalizeCommittedText(getCurrentInput()));
  }

  const pendingSeparator = takeVietnameseImeSeparator();

  if (pendingSeparator !== null) {
    const lastCommittedChar = Array.from(committedData).at(-1);
    const separatorAlreadyCommitted =
      pendingSeparator === "\n"
        ? lastCommittedChar === "\n"
        : lastCommittedChar !== undefined && isSpace(lastCommittedChar);

    if (
      !separatorAlreadyCommitted &&
      session?.wordIndex === getActiveWordIndex()
    ) {
      const scorerInput = normalizeCommittedText(getCurrentInput());
      setInputElementValue(scorerInput + pendingSeparator);
      await onInsertText({
        data: pendingSeparator,
        now,
        isCompositionEnding: true,
      });
    }
  }

  logTestEvent("composition", now, {
    event: "end",
    data: committedData,
    wordIndex: getActiveWordIndex(),
  });
  recordImeDebugEvent("compositionend", "after", event);
}
