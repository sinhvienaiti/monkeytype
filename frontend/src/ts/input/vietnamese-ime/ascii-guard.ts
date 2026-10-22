function isAsciiOnly(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

export function getAsciiTargetRestore(options: {
  scorerInput: string;
  domInput: string;
  physicalData: string;
  targetWord: string;
}): string | null {
  if (!isAsciiOnly(options.targetWord)) return null;
  if (Array.from(options.physicalData).length !== 1) return null;

  const expectedLiteralInput = options.scorerInput + options.physicalData;
  if (!options.targetWord.startsWith(expectedLiteralInput)) return null;
  if (options.domInput === expectedLiteralInput) return null;

  return expectedLiteralInput;
}
