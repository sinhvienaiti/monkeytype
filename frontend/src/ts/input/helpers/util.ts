import { isFunboxActiveWithProperty } from "../../test/funbox/list";
import { areCharactersVisuallyEqual, isSpace } from "../../utils/strings";
import { Config } from "../../config/store";
import { isVietnameseImeSafeModeActive } from "../vietnamese-ime/gate";

export { isVietnameseLanguage } from "../vietnamese-ime/gate";

/**
 * What kind of commit a character triggers, or false if it does not commit.
 * - "separator": a space or newline that ends the current word
 * - "nospace": the final letter of a word in a nospace funbox
 */
export type CommitCharacterType = "separator" | "nospace";

export function shouldUseVietnameseIme(
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): boolean {
  return isVietnameseImeSafeModeActive({
    mode: Config.vietnameseImeMode,
    inputLanguage,
    testLanguage,
  });
}

/**
 * IMEs may commit canonically equivalent Vietnamese text in decomposed form.
 * Normalize committed text only when Vietnamese IME handling is active.
 */
export function normalizeCommittedText(
  data: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): string {
  return shouldUseVietnameseIme(inputLanguage, testLanguage)
    ? data.normalize("NFC")
    : data;
}

/**
 * Compare Vietnamese targets in the same canonical form as committed input.
 * Rendering stays untouched; this function is only for input/scoring logic.
 */
export function normalizeTargetText(
  data: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): string {
  return shouldUseVietnameseIme(inputLanguage, testLanguage)
    ? data.normalize("NFC")
    : data;
}

/**
 * Split committed text by Unicode code point rather than UTF-16 code unit.
 * This keeps multi-character IME commits safe without implementing an IME.
 */
export function splitCommittedText(data: string): string[] {
  return Array.from(data);
}

export function shouldDeferVietnameseCompositionSeparator(
  data: string,
  isComposing: boolean,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): boolean {
  return (
    shouldUseVietnameseIme(inputLanguage, testLanguage) &&
    isComposing &&
    (isSpace(data) || data === "\n")
  );
}

export function shouldIgnoreVietnameseImeDelete(options: {
  inputType: string;
  isComposing: boolean;
  activeKeyCode: string | null;
  hasBackspaceIntent: boolean;
  inputLanguage?: typeof Config.inputLanguage;
  testLanguage?: typeof Config.language;
}): boolean {
  const {
    inputType,
    isComposing,
    hasBackspaceIntent,
    inputLanguage = Config.inputLanguage,
    testLanguage = Config.language,
  } = options;

  if (
    !shouldUseVietnameseIme(inputLanguage, testLanguage) ||
    inputType !== "deleteContentBackward"
  ) {
    return false;
  }

  // A real Backspace is identified by keydown intent. Chrome can delay the
  // delete event until after keyup, so do not rely only on isComposing.
  if (options.activeKeyCode === "Backspace" || hasBackspaceIntent) {
    return false;
  }

  // Only browser-internal deletes inside active composition are ignored.
  // Outside composition, Native Mode never guesses Telex behavior from
  // physical key codes.
  return isComposing;
}

export function getCommitCharacterType(options: {
  data: string;
  inputValue: string;
  targetWord: string;
}): CommitCharacterType | false {
  const { data, inputValue, targetWord } = options;

  if (isSpace(data)) {
    return "separator";
  }

  if (data === "\n") {
    return "separator";
  }

  const nospace = isFunboxActiveWithProperty("nospace");

  if (nospace && (inputValue + data).length === targetWord.length) {
    return "nospace";
  }

  return false;
}

/**
 * Normalize data to the target char when they are visually equivalent
 * (e.g. IME U+3000 space → U+0020), so commit/correctness checks are consistent.
 * Pure — no input-element side effects.
 */
export function normalizeData(
  data: string,
  inputValue: string,
  targetWord: string,
): string {
  const targetChar = targetWord[inputValue.length];
  if (
    targetChar !== undefined &&
    areCharactersVisuallyEqual(data, targetChar, Config.language)
  ) {
    return targetChar;
  }
  if (isSpace(data)) {
    return " ";
  }
  return data;
}
