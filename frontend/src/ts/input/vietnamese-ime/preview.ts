import { isVietnameseImeSafeModeActive } from "./gate";
import { isVietnameseImeProvisionalCharacter } from "./provisional";

/**
 * Returns true when the browser's live Vietnamese IME preview is a valid
 * intermediate form of the target character. Presentation only: scoring uses
 * the same Unicode relation explicitly through provisional.ts.
 */
export function isVietnameseImePreviewCharacter(
  inputChar: string,
  targetChar: string,
): boolean {
  return (
    isVietnameseImeSafeModeActive() &&
    isVietnameseImeProvisionalCharacter(inputChar, targetChar)
  );
}
