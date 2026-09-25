import { setConfig } from "../config/setters";
import { restartTestEvent } from "../events/test";
import * as CustomText from "../test/custom-text";
import { setSettings, getSettings } from "../custom/en-vn-translation/store";
import {
  parseSmartReviewDataset,
  prepareSmartReviewItems,
  type SmartReviewDataset,
  type SmartReviewPreparedItem,
} from "./smart-review";

export const MONKEY_REVIEW_DATASET_MESSAGE =
  "typing-game:learning:v1:review-dataset";
export const MONKEY_REVIEW_READY_MESSAGE =
  "typing-game:learning:v1:review-ready";
export const MONKEY_REVIEW_ERROR_MESSAGE =
  "typing-game:learning:v1:review-error";

const PARENT_ORIGIN = "https://typing-game.local";

export type MonkeyReviewDataset = SmartReviewDataset;

let activeDataset: SmartReviewDataset | null = null;
let activeItems: SmartReviewPreparedItem[] = [];

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseMonkeyReviewDataset(
  value: unknown,
): MonkeyReviewDataset | null {
  return parseSmartReviewDataset(value);
}

export function getActiveMonkeyReviewDataset(): SmartReviewDataset | null {
  return activeDataset;
}

export function getActiveMonkeyReviewItems(): readonly SmartReviewPreparedItem[] {
  return activeItems;
}

export async function applyMonkeyReviewDataset(
  dataset: MonkeyReviewDataset,
): Promise<{ items: number; vocabularyItems: number }> {
  const preparedItems = await prepareSmartReviewItems(dataset);

  // Keep Monkeytype's test engine in a valid Custom state while the dedicated
  // Smart Review panel owns the actual interaction. The parent remains the
  // only source of item selection, ordering, mastery and review priority.
  CustomText.setMode("repeat");
  CustomText.setPipeDelimiter(false);
  CustomText.setText(["review"]);
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(1);

  const current = getSettings();
  setSettings({
    ...current,
    enabled: true,
    learningMode: "smart-review",
    recallModeEnabled: false,
    dictionarySource: "review",
  });

  activeDataset = dataset;
  activeItems = preparedItems;

  setConfig("mode", "custom");
  restartTestEvent.dispatch();

  return {
    items: preparedItems.length,
    vocabularyItems: preparedItems.filter(
      (item) => item.source.entityType === "vocabulary",
    ).length,
  };
}

export function clearActiveMonkeyReview(): void {
  activeDataset = null;
  activeItems = [];
}

function postParent(message: unknown): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, PARENT_ORIGIN);
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || event.origin !== PARENT_ORIGIN) return;

    let dataset: MonkeyReviewDataset | null;
    try {
      dataset = parseMonkeyReviewDataset(event.data);
    } catch (error) {
      const requestId =
        plainObject(event.data) && typeof event.data["requestId"] === "string"
          ? event.data["requestId"].slice(0, 100)
          : "invalid";
      postParent({
        type: MONKEY_REVIEW_ERROR_MESSAGE,
        requestId,
        message:
          error instanceof Error ? error.message : "Invalid review dataset",
      });
      return;
    }

    if (dataset === null) return;

    void applyMonkeyReviewDataset(dataset)
      .then((result) => {
        postParent({
          type: MONKEY_REVIEW_READY_MESSAGE,
          requestId: dataset.requestId,
          result,
        });
      })
      .catch((error: unknown) => {
        clearActiveMonkeyReview();
        postParent({
          type: MONKEY_REVIEW_ERROR_MESSAGE,
          requestId: dataset.requestId,
          message:
            error instanceof Error ? error.message : "Review dataset failed",
        });
      });
  });
}
