import * as CompositionState from "../../legacy-states/composition";
import { isVietnameseImeSafeModeActive } from "./gate";
import { isVietnameseImeProvisionalCharacter } from "./provisional";
import { getVietnameseImeDirectPreview } from "./state";

/**
 * Returns true only while the character is part of a live browser/OS IME
 * preview. Once preview state is committed/materialized, the same base letter
 * must render as a real typo instead of remaining visually "dead".
 */
export function isVietnameseImePreviewCharacter(
  inputChar: string,
  targetChar: string,
): boolean {
  if (!isVietnameseImeSafeModeActive()) return false;

  const hasLivePreview =
    CompositionState.getComposing() ||
    getVietnameseImeDirectPreview() !== null;
  if (!hasLivePreview) return false;

  return isVietnameseImeProvisionalCharacter(inputChar, targetChar);
}
