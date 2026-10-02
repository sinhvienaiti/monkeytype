import * as TestUI from "../../test/test-ui";
import * as TestWords from "../../test/test-words";
import {
  getInputElementValue,
  replaceInputElementLastValueChar,
  setInputElementValue,
  appendToInputElementValue,
} from "../input-element";
import {
  checkIfFailedDueToDifficulty,
  checkIfFailedDueToMinBurst,
  checkIfFinished,
} from "../helpers/fail-or-finish";
import { removeLanguageSize } from "../../utils/strings";
import * as TestLogic from "../../test/test-logic";
import { Config } from "../../config/store";
import { flash } from "../../events/keymap";
import * as WeakSpot from "../../test/weak-spot";
import * as CompositionState from "../../legacy-states/composition";
import {
  isCorrectShiftUsed,
  getIncorrectShiftsInARow,
  incrementIncorrectShiftsInARow,
  resetIncorrectShiftsInARow,
} from "../state";
import { showNoticeNotification } from "../../states/notifications";
import { goToNextWord, goToPreviousWord } from "../helpers/word-navigation";
import { onBeforeInsertText } from "./before-insert-text";
import {
  hasUnresolvedInputError,
  shouldGoToNextWord,
  isCharCorrect,
} from "../helpers/validation";
import {
  forgiveAccuracyErrorsAt,
  forgiveAccuracyErrorsForWord,
  getCurrentInput,
  hasCountedAccuracyError,
  hasCountedAccuracyErrorInWord,
  logTestEvent,
} from "../../test/events/data";
import {
  deriveVietnameseImeRewrite,
  deriveVietnameseTelexRewrite,
  getCommitCharacterType,
  isVietnameseImeProvisionalCharacter,
  normalizeCommittedText,
  normalizeData,
  normalizeTargetText,
  splitCommittedText,
} from "../helpers/util";
import { areAllWordsGenerated } from "../../test/words-generator";
import { getActiveWordIndex, isTestActive } from "../../states/test";
import { DeleteInputType } from "../helpers/input-type";
import { handleStartedWord as handleEnVnTranslationStart } from "../../custom/en-vn-translation";

const charOverrides = new Map<string, string>([
  ["…", "..."],
  // ["œ", "oe"],
  // ["æ", "ae"],
]);

const languageCharOverrides = new Map<string, [string, string][]>([
  ["dutch", [["ĳ", "ij"]]],
]);

type OnInsertTextParams = {
  // might need later?
  // inputType: SupportedInputType;
  // event: Event;

  // timing information
  now: number;
  // data being inserted
  data: string;
  // true if called by compositionEnd
  isCompositionEnding?: true;
  // are we on the last character of a multi character input
  lastInMultiIndex?: boolean;
  // true if monkeytype is inserting this itself, not the user
  automatic?: true;
  // IME replaced a previously committed character at this index.
  replacementCharIndex?: number;
};

function logDeleteOnErrorEvent(
  inputType: DeleteInputType,
  now: number,
  charIndex: number,
): void {
  logTestEvent("input", now, {
    inputType,
    wordIndex: getActiveWordIndex(),
    charIndex,
    inputValue: getInputElementValue().inputValue,
    automatic: true,
  });
}

/**
 * Deletes input after an incorrect keypress, based on the deleteOnError config.
 * Every deletion is logged as a delete event, because the UI, live stats and
 * replay all derive the current input from the event log - editing the input
 * element without logging would desync them.
 * @param now - Timestamp of the input event that triggered the deletion
 */
function handleDeleteOnError(now: number): void {
  const deleteWholeWord =
    Config.deleteOnError === "word" || Config.deleteOnError === "word_hard";
  const goBackAWord =
    Config.deleteOnError === "letter_hard" ||
    Config.deleteOnError === "word_hard";

  //the incorrect character has already been inserted and logged at this point
  const inputLength = getCurrentInput().length;

  if (inputLength > 0) {
    if (deleteWholeWord) {
      setInputElementValue("");
      logDeleteOnErrorEvent("deleteWordBackward", now, inputLength);
    } else {
      //delete the incorrect character
      replaceInputElementLastValueChar("");
      logDeleteOnErrorEvent("deleteContentBackward", now, inputLength);

      //and the one before it, so that a mistake actually costs progress
      if (inputLength > 1) {
        replaceInputElementLastValueChar("");
        logDeleteOnErrorEvent("deleteContentBackward", now, inputLength - 1);
      }
    }
  }

  //mistake on the first character of the word - the hard modes send you back
  //but only if the previous word is still in the dom (it might have scrolled
  //off), same check as the one a normal backspace does in onBeforeDelete
  if (
    goBackAWord &&
    inputLength <= 1 &&
    getActiveWordIndex() > 0 &&
    TestUI.getWordElement(getActiveWordIndex() - 1) !== null
  ) {
    //pretend its a normal backspace, not insertText
    const inputType: DeleteInputType = deleteWholeWord
      ? "deleteWordBackward"
      : "deleteContentBackward";
    goToPreviousWord(inputType);
    logDeleteOnErrorEvent(
      inputType,
      now,
      getInputElementValue().inputValue.length,
    );
  }
}

export async function onInsertText(options: OnInsertTextParams): Promise<void> {
  const normalizedCommittedData = normalizeCommittedText(options.data);
  if (normalizedCommittedData !== options.data) {
    const { inputValue: rawInputValue } = getInputElementValue();
    setInputElementValue(normalizeCommittedText(rawInputValue));
    options = { ...options, data: normalizedCommittedData };
  }

  const { now, lastInMultiIndex, isCompositionEnding, automatic } = options;
  let { inputValue } = getInputElementValue();

  const committedCharacters = splitCommittedText(options.data);

  if (committedCharacters.length > 1) {
    // remove the entire committed text, then replay it one Unicode code point
    // at a time through the normal Monkeytype scorer.
    setInputElementValue(inputValue.slice(0, -options.data.length));
    for (let i = 0; i < committedCharacters.length; i++) {
      const char = committedCharacters[i] as string;

      // then add it one by one
      await emulateInsertText({
        ...options,
        data: char,
        lastInMultiIndex: i === committedCharacters.length - 1,
      });
    }
    return;
  }

  const charOverride = charOverrides.get(options.data);
  if (
    charOverride !== undefined &&
    TestWords.words.getCurrent()?.textWithCommit[getCurrentInput().length] !==
      options.data
  ) {
    // replace the data with the override
    setInputElementValue(
      inputValue.slice(0, -options.data.length) + charOverride,
    );
    await onInsertText({
      ...options,
      data: charOverride,
    });
    return;
  }

  const languageOverrides = languageCharOverrides.get(
    removeLanguageSize(Config.language),
  );
  if (languageOverrides !== undefined) {
    for (const [targetChar, overrideChar] of languageOverrides) {
      if (
        options.data === targetChar &&
        TestWords.words.getCurrent()?.textWithCommit[
          getCurrentInput().length
        ] !== options.data
      ) {
        // replace the data with the override
        setInputElementValue(
          inputValue.slice(0, -options.data.length) + overrideChar,
        );
        await onInsertText({
          ...options,
          data: overrideChar,
        });
        return;
      }
    }
  }

  // input and target word
  const testInput = normalizeCommittedText(getCurrentInput());
  const currentTestWord = TestWords.words.getCurrent();
  const currentWord = normalizeTargetText(currentTestWord?.textWithCommit ?? "");
  const currentWordText = normalizeTargetText(currentTestWord?.text ?? "");

  // Windows Vietnamese IMEs may report the physical Telex/VNI key in
  // InputEvent.data while the textarea already contains the rewritten Unicode
  // character. Derive the real character from scorer-vs-DOM state instead.
  let replacementCharIndex = options.replacementCharIndex;
  if (
    replacementCharIndex === undefined &&
    isCompositionEnding !== true &&
    automatic !== true
  ) {
    const rewrite =
      deriveVietnameseImeRewrite(testInput, inputValue, currentWord) ??
      deriveVietnameseTelexRewrite(testInput, options.data, currentWord);

    if (rewrite !== null) {
      replacementCharIndex = rewrite.charIndex;
      options = { ...options, data: rewrite.data };

      const logicalChars = Array.from(testInput);
      logicalChars[rewrite.charIndex] = rewrite.data;
      const logicalInput = logicalChars.join("");
      setInputElementValue(logicalInput);
      inputValue = logicalInput;
    }
  }

  const scoreInput =
    replacementCharIndex === undefined
      ? testInput
      : Array.from(testInput).slice(0, replacementCharIndex).join("");

  // onBeforeInsertText normally catches this before the DOM value changes.
  // Keep this defensive guard for composition/emulated paths that can reach
  // the handler with a character already appended.
  if (
    Config.stopOnError === "letter" &&
    Config.stopOnErrorKeepFirstError &&
    hasUnresolvedInputError(testInput, currentWord)
  ) {
    replaceInputElementLastValueChar("");
    return;
  }

  // if the character is visually equal, replace it with the target character
  // this ensures all future equivalence checks work correctly
  const normalizedData = normalizeDataAndUpdateInputIfNeeded(
    options.data,
    scoreInput,
    currentWord,
  );
  const data = normalizedData ?? options.data;

  // start if needed
  if (!isTestActive()) {
    TestLogic.startTest(now);
  }

  // helper consts
  const lastInMultiOrSingle =
    lastInMultiIndex === true || lastInMultiIndex === undefined;
  const wordIndex = getActiveWordIndex();
  const correctShiftUsed =
    Config.oppositeShiftMode === "off" ? null : isCorrectShiftUsed();
  const charIndex = replacementCharIndex ?? testInput.length;
  const commitCharacterType = getCommitCharacterType({
    data,
    inputValue: scoreInput,
    targetWord: currentWord,
  });

  if (
    replacementCharIndex === undefined &&
    testInput.length === 0 &&
    commitCharacterType === false &&
    automatic !== true
  ) {
    handleEnVnTranslationStart(wordIndex);
  }

  // is char correct. Vietnamese base/partial characters are provisional while
  // UniKey/EVKey is still building the target character.
  let correct = isCharCorrect({
    data,
    inputValue: scoreInput,
    targetWord: currentWord,
    correctShiftUsed,
  });

  // A separator cannot be considered correct while an earlier Vietnamese
  // character is still only provisional. Otherwise "la " could slip past a
  // stop-on-error test that actually expects "là ".
  const prematureCommit =
    Config.stopOnError !== "off" &&
    commitCharacterType === "separator" &&
    testInput !== currentWordText;
  if (prematureCommit) {
    correct = false;
  }

  const targetChar = Array.from(currentWord)[charIndex] ?? "";
  const imeProvisional =
    !correct &&
    correctShiftUsed !== false &&
    isVietnameseImeProvisionalCharacter(data, targetChar);
  const acceptedInput = correct || imeProvisional;

  const ignoreRepeatedBlockedErrors =
    (Config.forgiveCorrectedErrors || Config.ignoreRepeatedBlockedErrors) &&
    Config.stopOnError !== "off";
  const accuracyIgnored =
    imeProvisional ||
    (ignoreRepeatedBlockedErrors &&
      !correct &&
      (Config.stopOnError === "word"
        ? hasCountedAccuracyErrorInWord(wordIndex)
        : hasCountedAccuracyError(wordIndex, charIndex)));

  if (
    Config.forgiveCorrectedErrors &&
    Config.stopOnError !== "off" &&
    correct
  ) {
    if (Config.stopOnError === "letter") {
      forgiveAccuracyErrorsAt(wordIndex, charIndex);
    } else if (testInput + data === currentWordText) {
      forgiveAccuracyErrorsForWord(wordIndex);
    }
  }

  // handing cases where last char needs to be removed
  // this is here and not in beforeInsertText because we want to penalize for incorrect spaces
  // like accuracy, keypress errors, and missed words
  let removeLastChar = false;
  let visualInputOverride: string | undefined;
  if (
    Config.stopOnError === "letter" &&
    !acceptedInput &&
    !Config.stopOnErrorKeepFirstError
  ) {
    if (!Config.blindMode) {
      visualInputOverride = testInput + data;
    }
    removeLastChar = true;
  }

  if (correctShiftUsed === false) {
    removeLastChar = true;
    visualInputOverride = undefined;
    incrementIncorrectShiftsInARow();
    if (getIncorrectShiftsInARow() >= 5) {
      showNoticeNotification("Opposite shift mode is on.", {
        important: true,
        customTitle: "Reminder",
      });
    }
  } else {
    resetIncorrectShiftsInARow();
  }

  // derived after removeLastChar: stop-on-error and opposite shift mode can block navigation
  const goingToNextWord =
    !removeLastChar &&
    shouldGoToNextWord({
      data,
      inputValue: scoreInput,
      targetWord: currentWord,
      commitCharacterType,
    });

  if (
    Config.forgiveCorrectedErrors &&
    Config.stopOnError === "word" &&
    goingToNextWord
  ) {
    forgiveAccuracyErrorsForWord(wordIndex);
  }

  if (Config.keymapMode === "react") {
    flash(data, acceptedInput);
  }

  if (removeLastChar) {
    replaceInputElementLastValueChar("");
  }

  // capture DOM before goToNextWord clears it for the new word
  const inputValueAfterEvent = getInputElementValue().inputValue;

  // Log the event BEFORE goToNextWord so readers inside the navigation
  // (e.g. beforeTestWordChange's updateWordLetters, getWordBurst) see the
  // completed event in derivation. Otherwise the just-typed trigger char
  // (space/newline) is missing — visible as missing \n element in zen mode.
  logTestEvent("input", now, {
    inputType: "insertText",
    data,
    correct,
    wordIndex,
    charIndex,
    isCompositionEnding: isCompositionEnding ? true : undefined,
    inputStopped: removeLastChar ? true : undefined,
    accuracyIgnored: accuracyIgnored ? true : undefined,
    imeProvisional: imeProvisional ? true : undefined,
    replacesChar: replacementCharIndex !== undefined ? true : undefined,
    automatic: automatic ? true : undefined,
    // inputValue is captured from the input element after this event (before goToNextWord clears it).
    inputValue: inputValueAfterEvent,
    commitsWord: goingToNextWord ? true : undefined,
    lastWord: wordIndex === TestWords.words.length - 1 ? true : undefined,
  });

  // this needs to be called after event logging
  if (!imeProvisional) {
    WeakSpot.updateScore(data, correct);
  }

  // delete on error
  // skipped when the input was stopped - nothing was inserted to delete
  // before the UI update so it renders the input after the deletion, in one go
  if (
    Config.deleteOnError !== "off" &&
    !acceptedInput &&
    !removeLastChar
  ) {
    handleDeleteOnError(now);
  }

  if (lastInMultiOrSingle) {
    TestUI.afterTestTextInput(
      acceptedInput,
      visualInputOverride,
      goingToNextWord,
    );
  }

  // going to next word
  let increasedWordIndex: null | boolean = null;
  let lastBurst: null | number = null;
  if (goingToNextWord) {
    const result = await goToNextWord({
      correctInsert:
        Config.mode === "zen"
          ? true
          : replacementCharIndex !== undefined
            ? inputValueAfterEvent === currentWord
            : testInput + data === currentWord,
      now,
    });
    lastBurst = result.lastBurst;
    increasedWordIndex = result.increasedWordIndex;
  }

  //this COULD be the next word because we are awaiting goToNextWord
  const nextWord = TestWords.words.getCurrent()?.textWithCommit ?? "";
  const doesNextWordHaveTab = /^\t+/.test(nextWord);
  const isCurrentCharTab = nextWord[getCurrentInput().length] === "\t";

  //code mode - auto insert tabs
  if (
    Config.language.startsWith("code") &&
    correct &&
    doesNextWordHaveTab &&
    isCurrentCharTab
  ) {
    setTimeout(() => {
      void emulateInsertText({ data: "\t", now, automatic: true });
    }, 0);
  }

  const testInputAfterEvent =
    replacementCharIndex !== undefined ? inputValueAfterEvent : testInput + data;

  if (!CompositionState.getComposing() && lastInMultiOrSingle) {
    if (
      checkIfFailedDueToDifficulty({
        data,
        testInput: scoreInput,
        targetWord: currentWord,
        correct: acceptedInput,
        commitCharacterType,
      })
    ) {
      TestLogic.fail("difficulty");
    } else if (
      increasedWordIndex &&
      checkIfFailedDueToMinBurst({
        testInputWithData: testInputAfterEvent,
        currentWord,
        lastBurst,
      })
    ) {
      TestLogic.fail("min burst");
    } else if (
      checkIfFinished({
        goingToNextWord,
        testInputWithData: testInputAfterEvent,
        currentWord,
        allWordsTyped: wordIndex >= TestWords.words.length - 1,
        allWordsGenerated: areAllWordsGenerated(),
      })
    ) {
      void TestLogic.finish();
    }
  }
}

function normalizeDataAndUpdateInputIfNeeded(
  data: string,
  testInput: string,
  currentWord: string,
): string | null {
  const normalized = normalizeData(data, testInput, currentWord);
  if (normalized !== data) {
    replaceInputElementLastValueChar(normalized);
    return normalized;
  }
  return null;
}

export async function emulateInsertText(
  options: OnInsertTextParams,
): Promise<void> {
  const inputStopped = onBeforeInsertText(options.data);

  if (inputStopped) {
    return;
  }

  // default is prevented so we need to manually update the input value.
  appendToInputElementValue(options.data);

  await onInsertText(options);
}
