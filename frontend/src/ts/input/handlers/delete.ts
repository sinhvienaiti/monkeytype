import * as TestUI from "../../test/test-ui";
import * as TestWords from "../../test/test-words";
import {
  getInputElementValue,
  moveInputElementCaretToTheEnd,
  setInputElementValue,
} from "../input-element";

import { Config } from "../../config/store";
import { goToPreviousWord } from "../helpers/word-navigation";
import { DeleteInputType } from "../helpers/input-type";
import {
  forgiveAccuracyErrorsForWord,
  getCurrentInput,
  logTestEvent,
} from "../../test/events/data";
import {
  getActiveWordIndex,
  setCompositionText,
} from "../../states/test";
import * as CompositionState from "../../legacy-states/composition";
import {
  setActivePhysicalKeyCode,
  setLastInsertCompositionTextData,
} from "../state";
import {
  normalizeCommittedText,
  shouldUseVietnameseIme,
} from "../helpers/util";
import { invalidateVietnameseImeSession } from "../vietnamese-ime/state";

function resetVietnameseImeAfterDelete(): void {
  if (!shouldUseVietnameseIme()) return;

  // Backspace is an explicit editing boundary. UniKey/EVKey may otherwise
  // keep composition data that belongs to the pre-delete DOM and replay it on
  // the next key/compositionend.
  CompositionState.invalidate();
  setLastInsertCompositionTextData("");
  invalidateVietnameseImeSession();
  setActivePhysicalKeyCode(null);
  setCompositionText("");

  // The event log/scorer is authoritative after deletion/navigation. Rebuild
  // the hidden textarea from it so the next IME event starts from the exact
  // same prefix instead of a browser-side stale composition value.
  setInputElementValue(normalizeCommittedText(getCurrentInput()));
  moveInputElementCaretToTheEnd();
}

export function onDelete(inputType: DeleteInputType, now: number): void {
  const { realInputValue } = getInputElementValue();

  const inputBeforeDelete = getCurrentInput();
  const activeWordIndexBeforeDelete = getActiveWordIndex();

  const inputAfterDelete = getInputElementValue().inputValue;

  const beforeDeleteOnlyTabs = /^\t*$/.test(inputBeforeDelete);
  const allTabsCorrect = TestWords.words
    .getCurrent()
    ?.textWithCommit.startsWith(inputAfterDelete);

  //special check for code languages
  if (
    Config.language.startsWith("code") &&
    Config.codeUnindentOnBackspace &&
    inputBeforeDelete.length > 0 &&
    beforeDeleteOnlyTabs &&
    allTabsCorrect
  ) {
    // Clear N+1's tabs (the word the user was in)
    logTestEvent("input", now, {
      inputType: "deleteWordBackward",
      wordIndex: activeWordIndexBeforeDelete,
      charIndex: inputBeforeDelete.length,
      inputValue: "",
    });

    setInputElementValue("");
    goToPreviousWord(inputType);

    // Record the resulting state of the previous word (newline removed)
    const postNavInputValue = getInputElementValue().inputValue;
    logTestEvent("input", now, {
      inputType: "deleteContentBackward",
      wordIndex: getActiveWordIndex(),
      charIndex: postNavInputValue.length,
      inputValue: postNavInputValue,
    });

    resetVietnameseImeAfterDelete();
    TestUI.afterTestDelete();
    return;
  }

  //normal backspace
  if (realInputValue === "") {
    // if the input is NOT empty, that means the ctrl backspace deleted more than just the fake space (THANKS FIREFOX)
    // which means we need to force update the current word element when we move back
    goToPreviousWord(inputType);

    // Record the resulting state of the destination word
    const postNavInputValue = getInputElementValue().inputValue;
    logTestEvent("input", now, {
      inputType: inputType,
      wordIndex: getActiveWordIndex(),
      charIndex: postNavInputValue.length,
      inputValue: postNavInputValue,
      ...(inputBeforeDelete !== "" ? { clearedNextWord: true } : {}),
    });
  } else {
    // Delete within current word
    logTestEvent("input", now, {
      inputType: inputType,
      wordIndex: activeWordIndexBeforeDelete,
      charIndex: inputBeforeDelete.length,
      inputValue: inputAfterDelete,
    });

    if (
      Config.forgiveCorrectedErrors &&
      Config.stopOnError === "word" &&
      inputAfterDelete === TestWords.words.getCurrent()?.text
    ) {
      forgiveAccuracyErrorsForWord(activeWordIndexBeforeDelete);
    }
  }

  resetVietnameseImeAfterDelete();
  TestUI.afterTestDelete();
}
