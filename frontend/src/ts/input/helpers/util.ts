import { isFunboxActiveWithProperty } from "../../test/funbox/list";
import { areCharactersVisuallyEqual, isSpace } from "../../utils/strings";
import { Config } from "../../config/store";

/**
 * What kind of commit a character triggers, or false if it does not commit.
 * - "separator": a space or newline that ends the current word
 * - "nospace": the final letter of a word in a nospace funbox
 */
export type CommitCharacterType = "separator" | "nospace";

export function isVietnameseLanguage(language: string): boolean {
  return language === "vietnamese" || language.startsWith("vietnamese_");
}

/**
 * Vietnamese IME handling is opt-in, or automatically enabled when the test
 * language itself is Vietnamese. Auto therefore preserves existing English
 * direct-input behavior.
 */
export function shouldUseVietnameseIme(
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): boolean {
  return (
    inputLanguage === "vietnamese" ||
    (inputLanguage === "auto" && isVietnameseLanguage(testLanguage))
  );
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

/**
 * Reduce one Vietnamese character to its base Latin character for IME
 * compatibility checks. NFC/NFD are used only for scoring; rendering is not
 * modified.
 */
export function getVietnameseBaseCharacter(
  char: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): string {
  const normalized = normalizeCommittedText(
    char,
    inputLanguage,
    testLanguage,
  );
  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * A base/partially-accented Vietnamese character is provisional while the IME
 * is still building the target character. Example: e -> é, o -> ô -> ồ.
 * Provisional characters must not be counted as mistakes or blocked by
 * stop-on-error.
 */
export function isVietnameseImeProvisionalCharacter(
  inputChar: string,
  targetChar: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): boolean {
  if (!shouldUseVietnameseIme(inputLanguage, testLanguage)) return false;

  const input = normalizeCommittedText(
    inputChar,
    inputLanguage,
    testLanguage,
  );
  const target = normalizeTargetText(
    targetChar,
    inputLanguage,
    testLanguage,
  );

  if (input === "" || target === "" || input === target) return false;

  const inputBase = getVietnameseBaseCharacter(
    input,
    inputLanguage,
    testLanguage,
  );
  const targetBase = getVietnameseBaseCharacter(
    target,
    inputLanguage,
    testLanguage,
  );

  // Do not make an accented input provisional for an unaccented target.
  return inputBase === targetBase && target !== targetBase;
}

export type VietnameseImeRewrite = {
  charIndex: number;
  from: string;
  data: string;
};

/**
 * Detect a Windows Vietnamese IME rewrite by comparing the scorer snapshot
 * with the browser DOM. UniKey/EVKey can change an already committed character
 * in place, e.g. "phe" -> "phé" or "tieng" -> "tiếng", while InputEvent.data
 * contains the physical Telex key instead of the resulting Unicode character.
 */
export function deriveVietnameseImeRewrite(
  scoredInput: string,
  domInput: string,
  targetWord: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseImeRewrite | null {
  if (!shouldUseVietnameseIme(inputLanguage, testLanguage)) return null;

  const before = Array.from(
    normalizeCommittedText(scoredInput, inputLanguage, testLanguage),
  );
  const after = Array.from(
    normalizeCommittedText(domInput, inputLanguage, testLanguage),
  );
  const target = Array.from(
    normalizeTargetText(targetWord, inputLanguage, testLanguage),
  );

  if (before.length !== after.length || before.length === 0) return null;

  let charIndex = -1;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    if (charIndex !== -1) return null;
    charIndex = i;
  }

  if (charIndex === -1) return null;

  const from = before[charIndex] as string;
  const data = after[charIndex] as string;
  const targetChar = target[charIndex];
  if (targetChar === undefined) return null;

  const fromCompatible =
    from === targetChar ||
    isVietnameseImeProvisionalCharacter(
      from,
      targetChar,
      inputLanguage,
      testLanguage,
    );
  const dataCompatible =
    data === targetChar ||
    isVietnameseImeProvisionalCharacter(
      data,
      targetChar,
      inputLanguage,
      testLanguage,
    );

  return fromCompatible && dataCompatible
    ? { charIndex, from, data }
    : null;
}

/**
 * Derive the text actually committed by an IME from the event-log-backed
 * prefix captured at compositionstart and the final input element value.
 * Returning null means the IME replaced text outside the active composition
 * range, so the listener must reconcile to the scorer state instead of
 * replaying an unsafe payload.
 */
export function deriveCompositionCommit(
  committedPrefix: string,
  finalInputValue: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): string | null {
  const prefix = normalizeCommittedText(
    committedPrefix,
    inputLanguage,
    testLanguage,
  );
  const finalValue = normalizeCommittedText(
    finalInputValue,
    inputLanguage,
    testLanguage,
  );

  if (!finalValue.startsWith(prefix)) return null;
  return finalValue.slice(prefix.length);
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
