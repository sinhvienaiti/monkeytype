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
type VietnameseCharParts = {
  base: string;
  marks: Set<string>;
};

function getVietnameseCharParts(
  char: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseCharParts {
  const normalized = normalizeCommittedText(
    char,
    inputLanguage,
    testLanguage,
  );

  if (normalized === "đ") {
    return { base: "d", marks: new Set(["stroke"]) };
  }
  if (normalized === "Đ") {
    return { base: "D", marks: new Set(["stroke"]) };
  }

  const chars = Array.from(normalized.normalize("NFD"));
  return {
    base: chars[0] ?? "",
    marks: new Set(chars.slice(1)),
  };
}

export function getVietnameseBaseCharacter(
  char: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): string {
  return getVietnameseCharParts(
    char,
    inputLanguage,
    testLanguage,
  ).base;
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

  const inputParts = getVietnameseCharParts(
    input,
    inputLanguage,
    testLanguage,
  );
  const targetParts = getVietnameseCharParts(
    target,
    inputLanguage,
    testLanguage,
  );

  if (
    inputParts.base !== targetParts.base ||
    targetParts.marks.size === 0
  ) {
    return false;
  }

  // A valid intermediate may contain only marks that are also present on the
  // final target. This rejects wrong accents/shapes such as ă while targeting
  // à, but accepts either order for target ằ: a -> ă -> ằ or a -> à -> ằ.
  for (const mark of inputParts.marks) {
    if (!targetParts.marks.has(mark)) return false;
  }

  return inputParts.marks.size < targetParts.marks.size;
}

const VIETNAMESE_TONE_ROWS = [
  "aáàảãạ",
  "ăắằẳẵặ",
  "âấầẩẫậ",
  "eéèẻẽẹ",
  "êếềểễệ",
  "iíìỉĩị",
  "oóòỏõọ",
  "ôốồổỗộ",
  "ơớờởỡợ",
  "uúùủũụ",
  "ưứừửữự",
  "yýỳỷỹỵ",
  "AÁÀẢÃẠ",
  "ĂẮẰẲẴẶ",
  "ÂẤẦẨẪẬ",
  "EÉÈẺẼẸ",
  "ÊẾỀỂỄỆ",
  "IÍÌỈĨỊ",
  "OÓÒỎÕỌ",
  "ÔỐỒỔỖỘ",
  "ƠỚỜỞỠỢ",
  "UÚÙỦŨỤ",
  "ƯỨỪỬỮỰ",
  "YÝỲỶỸỴ",
] as const;

const TONE_INDEX_BY_KEY: Record<string, number> = {
  // Telex
  s: 1,
  f: 2,
  r: 3,
  x: 4,
  j: 5,
  z: 0,
  // VNI
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "0": 0,
};

function replaceVietnameseShape(
  char: string,
  fromRow: string,
  toRow: string,
): string | null {
  const index = Array.from(fromRow).indexOf(char);
  return index === -1 ? null : (Array.from(toRow)[index] ?? null);
}

function applyVietnameseInputModifier(
  char: string,
  physicalKey: string,
): string | null {
  const key = physicalKey.toLowerCase();

  const toneIndex = TONE_INDEX_BY_KEY[key];
  if (toneIndex !== undefined) {
    for (const row of VIETNAMESE_TONE_ROWS) {
      const chars = Array.from(row);
      if (chars.includes(char)) {
        return chars[toneIndex] ?? null;
      }
    }
  }

  const upper = char === char.toUpperCase() && char !== char.toLowerCase();
  const row = (lower: string, upperRow: string): string =>
    upper ? upperRow : lower;

  if (key === "a" || key === "6") {
    const converted = replaceVietnameseShape(
      char,
      row("aáàảãạ", "AÁÀẢÃẠ"),
      row("âấầẩẫậ", "ÂẤẦẨẪẬ"),
    );
    if (converted !== null || key === "a") return converted;
  }
  if (key === "e" || key === "6") {
    const converted = replaceVietnameseShape(
      char,
      row("eéèẻẽẹ", "EÉÈẺẼẸ"),
      row("êếềểễệ", "ÊẾỀỂỄỆ"),
    );
    if (converted !== null || key === "e") return converted;
  }
  if (key === "o" || key === "6") {
    const converted = replaceVietnameseShape(
      char,
      row("oóòỏõọ", "OÓÒỎÕỌ"),
      row("ôốồổỗộ", "ÔỐỒỔỖỘ"),
    );
    if (converted !== null || key === "o") return converted;
  }
  if (key === "w" || key === "7" || key === "8") {
    if (key === "w" || key === "8") {
      const breve = replaceVietnameseShape(
        char,
        row("aáàảãạ", "AÁÀẢÃẠ"),
        row("ăắằẳẵặ", "ĂẮẰẲẴẶ"),
      );
      if (breve !== null || key === "8") return breve;
    }

    if (key === "w" || key === "7") {
      return (
        replaceVietnameseShape(
          char,
          row("oóòỏõọ", "OÓÒỎÕỌ"),
          row("ơớờởỡợ", "ƠỚỜỞỠỢ"),
        ) ??
        replaceVietnameseShape(
          char,
          row("uúùủũụ", "UÚÙỦŨỤ"),
          row("ưứừửữự", "ƯỨỪỬỮỰ"),
        )
      );
    }
  }
  if (key === "d" || key === "9") {
    if (char === "d") return "đ";
    if (char === "D") return "Đ";
  }

  return null;
}

/**
 * Resolve a physical Telex/VNI modifier even when the OS IME has lost its
 * composition context (for example after Backspace navigation) or temporarily
 * appends the modifier key to the hidden textarea.
 */
export function deriveVietnamesePhysicalRewrites(
  scoredInput: string,
  physicalData: string,
  targetWord: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseImeRewrite[] | null {
  if (
    !shouldUseVietnameseIme(inputLanguage, testLanguage) ||
    Array.from(physicalData).length !== 1
  ) {
    return null;
  }

  const before = Array.from(
    normalizeCommittedText(scoredInput, inputLanguage, testLanguage),
  );
  const target = Array.from(
    normalizeTargetText(targetWord, inputLanguage, testLanguage),
  );
  const candidates: VietnameseImeRewrite[] = [];

  for (let charIndex = before.length - 1; charIndex >= 0; charIndex--) {
    const from = before[charIndex] as string;
    const targetChar = target[charIndex];
    if (targetChar === undefined || from === targetChar) continue;

    const data = applyVietnameseInputModifier(from, physicalData);
    if (
      data !== null &&
      data !== from &&
      (data === targetChar ||
        isVietnameseImeProvisionalCharacter(
          data,
          targetChar,
          inputLanguage,
          testLanguage,
        )) &&
      isVietnameseImeProvisionalCharacter(
        from,
        targetChar,
        inputLanguage,
        testLanguage,
      )
    ) {
      candidates.push({ charIndex, from, data });
    }
  }

  if (candidates.length === 0) return null;

  const key = physicalData.toLowerCase();
  const rightmost = candidates[0] as VietnameseImeRewrite;

  // UniKey commonly accepts one w (or VNI 7) for the contiguous uo -> ươ
  // shape. Do not broadly rewrite several syllables with one physical key.
  if ((key === "w" || key === "7") && candidates.length > 1) {
    const left = candidates.find(
      (candidate) => candidate.charIndex === rightmost.charIndex - 1,
    );
    if (left !== undefined) {
      const leftBase = getVietnameseBaseCharacter(
        left.from,
        inputLanguage,
        testLanguage,
      ).toLowerCase();
      const rightBase = getVietnameseBaseCharacter(
        rightmost.from,
        inputLanguage,
        testLanguage,
      ).toLowerCase();

      if (leftBase === "u" && rightBase === "o") {
        return [left, rightmost];
      }
    }
  }

  return [rightmost];
}

// Kept for focused callers/tests that only need the primary rewrite.
export function deriveVietnameseTelexRewrite(
  scoredInput: string,
  physicalData: string,
  targetWord: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseImeRewrite | null {
  return (
    deriveVietnamesePhysicalRewrites(
      scoredInput,
      physicalData,
      targetWord,
      inputLanguage,
      testLanguage,
    )?.[0] ?? null
  );
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
export function deriveVietnameseImeRewrites(
  scoredInput: string,
  domInput: string,
  targetWord: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseImeRewrite[] | null {
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

  const rewrites: VietnameseImeRewrite[] = [];
  for (let charIndex = 0; charIndex < before.length; charIndex++) {
    const from = before[charIndex] as string;
    const data = after[charIndex] as string;
    if (from === data) continue;

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

    if (!fromCompatible || !dataCompatible) return null;
    rewrites.push({ charIndex, from, data });
  }

  return rewrites.length > 0 ? rewrites : null;
}

export function deriveVietnameseImeRewrite(
  scoredInput: string,
  domInput: string,
  targetWord: string,
  inputLanguage = Config.inputLanguage,
  testLanguage = Config.language,
): VietnameseImeRewrite | null {
  return (
    deriveVietnameseImeRewrites(
      scoredInput,
      domInput,
      targetWord,
      inputLanguage,
      testLanguage,
    )?.[0] ?? null
  );
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
