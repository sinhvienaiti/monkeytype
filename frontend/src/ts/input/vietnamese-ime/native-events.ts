import {
  getInputElementValue,
  setInputElementValue,
} from "../input-element";
import * as CompositionState from "../../legacy-states/composition";
import * as TestLogic from "../../test/test-logic";
import { setLastInsertCompositionTextData } from "../state";
import { onInsertText } from "../handlers/insert-text";
import { getCurrentInput, logTestEvent } from "../../test/events/data";
import {
  deriveVietnameseImeRewrites,
  normalizeCommittedText,
  normalizeTargetText,
} from "../helpers/util";
import * as TestWords from "../../test/test-words";
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
  queueVietnameseImeSeparator,
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
    domAtStart: normalizeCommittedText(getInputElementValue().inputValue),
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

export function queueVietnameseCompositionSeparator(value: string): void {
  queueVietnameseImeSeparator(value);
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

      const prefixLength = Array.from(session.committedPrefix).length;
      if (
        transaction?.start === prefixLength &&
        transaction.deleteCount === 0
      ) {
        committedData = transaction.insertText;
        setInputElementValue(transaction.after);
        if (committedData !== "") {
          await onInsertText({
            data: committedData,
            now,
            isCompositionEnding: true,
          });
        }
      } else if (transaction !== null) {
        const currentWord = normalizeTargetText(
          TestWords.words.getCurrent()?.textWithCommit ?? "",
        );
        const rewrites = deriveVietnameseImeRewrites(
          session.committedPrefix,
          finalInputValue,
          currentWord,
        );

        if (rewrites === null) {
          setInputElementValue(scorerInput);
        } else {
          const logicalChars = Array.from(session.committedPrefix);
          committedData = rewrites.map((rewrite) => rewrite.data).join("");

          for (let i = 0; i < rewrites.length; i++) {
            const rewrite = rewrites[i] as (typeof rewrites)[number];
            logicalChars[rewrite.charIndex] = rewrite.data;
            setInputElementValue(logicalChars.join(""));
            await onInsertText({
              data: rewrite.data,
              now,
              isCompositionEnding: true,
              replacementCharIndex: rewrite.charIndex,
              lastInMultiIndex: i === rewrites.length - 1,
            });
          }

          setInputElementValue(finalInputValue);
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
