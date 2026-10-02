import { isVietnameseImeSafeModeActive } from "./gate";

type VietnameseCharParts = {
  base: string;
  marks: Set<string>;
};

function getVietnameseCharParts(char: string): VietnameseCharParts {
  const normalized = char.normalize("NFC");

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

/**
 * Returns true when the browser's live Vietnamese IME preview is a valid
 * intermediate form of the target character. This is presentation-only:
 * scorer/event-log code must never use preview compatibility as correctness.
 */
export function isVietnameseImePreviewCharacter(
  inputChar: string,
  targetChar: string,
): boolean {
  if (!isVietnameseImeSafeModeActive()) return false;

  const input = inputChar.normalize("NFC");
  const target = targetChar.normalize("NFC");
  if (input === "" || target === "" || input === target) return false;

  const inputParts = getVietnameseCharParts(input);
  const targetParts = getVietnameseCharParts(target);
  if (
    inputParts.base !== targetParts.base ||
    targetParts.marks.size === 0
  ) {
    return false;
  }

  for (const mark of inputParts.marks) {
    if (!targetParts.marks.has(mark)) return false;
  }

  return inputParts.marks.size < targetParts.marks.size;
}
