const VIETNAMESE_BASES = new Set([
  "a",
  "A",
  "e",
  "E",
  "i",
  "I",
  "o",
  "O",
  "u",
  "U",
  "y",
  "Y",
  "d",
  "D",
]);

const VIETNAMESE_MARKS = new Set([
  "\u0300", // grave
  "\u0301", // acute
  "\u0302", // circumflex
  "\u0303", // tilde
  "\u0306", // breve
  "\u0309", // hook above
  "\u031b", // horn
  "\u0323", // dot below
  "stroke",
]);

type VietnameseCharParts = {
  base: string;
  marks: Set<string>;
};

function getVietnameseCharParts(char: string): VietnameseCharParts | null {
  const normalized = char.normalize("NFC");

  if (normalized === "đ") {
    return { base: "d", marks: new Set(["stroke"]) };
  }
  if (normalized === "Đ") {
    return { base: "D", marks: new Set(["stroke"]) };
  }

  const chars = Array.from(normalized.normalize("NFD"));
  const base = chars[0] ?? "";
  const marks = new Set(chars.slice(1));

  if (!VIETNAMESE_BASES.has(base)) return null;
  for (const mark of marks) {
    if (!VIETNAMESE_MARKS.has(mark)) return null;
  }

  return { base, marks };
}

export function isVietnameseImeCorrectableCharacter(
  inputChar: string,
  targetChar: string,
): boolean {
  const input = inputChar.normalize("NFC");
  const target = targetChar.normalize("NFC");
  if (input === "" || target === "" || input === target) return false;

  const inputParts = getVietnameseCharParts(input);
  const targetParts = getVietnameseCharParts(target);
  if (inputParts === null || targetParts === null) return false;

  return inputParts.base === targetParts.base;
}

export function isVietnameseImeProvisionalCharacter(
  inputChar: string,
  targetChar: string,
): boolean {
  if (!isVietnameseImeCorrectableCharacter(inputChar, targetChar)) {
    return false;
  }

  const inputParts = getVietnameseCharParts(inputChar);
  const targetParts = getVietnameseCharParts(targetChar);
  if (inputParts === null || targetParts === null) return false;

  for (const mark of inputParts.marks) {
    if (!targetParts.marks.has(mark)) return false;
  }

  return inputParts.marks.size < targetParts.marks.size;
}

export function hasOnlyVietnameseImeCorrectableMismatches(
  inputValue: string,
  targetWord: string,
): boolean {
  const inputChars = Array.from(inputValue);
  const targetChars = Array.from(targetWord);
  let foundMismatch = false;

  for (let index = 0; index < inputChars.length; index++) {
    const inputChar = inputChars[index] as string;
    const targetChar = targetChars[index];
    if (targetChar === undefined) return false;
    if (inputChar === targetChar) continue;

    if (!isVietnameseImeCorrectableCharacter(inputChar, targetChar)) {
      return false;
    }
    foundMismatch = true;
  }

  return foundMismatch;
}

export function findFirstVietnameseImeProvisionalMismatch(
  inputValue: string,
  targetWord: string,
): { index: number; inputChar: string; targetChar: string } | null {
  const inputChars = Array.from(inputValue);
  const targetChars = Array.from(targetWord);

  for (let index = 0; index < inputChars.length; index++) {
    const inputChar = inputChars[index] as string;
    const targetChar = targetChars[index];
    if (targetChar === undefined) return null;

    if (isVietnameseImeProvisionalCharacter(inputChar, targetChar)) {
      return { index, inputChar, targetChar };
    }
  }

  return null;
}

export function isVietnameseImeBoundary(data: string): boolean {
  const first = Array.from(data)[0];

  // Native mode must remain input-method agnostic. Telex modifiers are letters
  // and VNI modifiers are digits (1-5 tones, 6-9 shapes, 0 tone removal), so
  // neither letters/marks nor numbers are commit boundaries. Spaces and
  // punctuation still flush unresolved preview text.
  return first !== undefined && !/[\p{L}\p{M}\p{N}]/u.test(first);
}
