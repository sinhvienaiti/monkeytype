import { setConfig } from "../config/setters";
import { restartTestEvent } from "../events/test";
import * as CustomText from "../test/custom-text";
import { prepareReviewDictionary } from "../custom/en-vn-translation/library";
import {
  getSettings,
  setSettings,
  type LearningMode,
} from "../custom/en-vn-translation/store";

export const MONKEY_REVIEW_DATASET_MESSAGE =
  "typing-game:learning:v1:review-dataset";
export const MONKEY_REVIEW_READY_MESSAGE =
  "typing-game:learning:v1:review-ready";
export const MONKEY_REVIEW_ERROR_MESSAGE =
  "typing-game:learning:v1:review-error";

const PARENT_ORIGIN = "https://typing-game.local";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

export type MonkeyReviewDataset = {
  requestId: string;
  mode: Extract<LearningMode, "learn" | "recall" | "listen">;
  entityIds: string[];
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEntityId(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseMonkeyReviewDataset(
  value: unknown,
): MonkeyReviewDataset | null {
  if (!plainObject(value) || value["type"] !== MONKEY_REVIEW_DATASET_MESSAGE) {
    return null;
  }

  const requestId = value["requestId"];
  if (
    typeof requestId !== "string" ||
    !REQUEST_ID_PATTERN.test(requestId)
  ) {
    throw new TypeError("review requestId is invalid");
  }

  const mode = value["mode"];
  if (mode !== "learn" && mode !== "recall" && mode !== "listen") {
    throw new TypeError("review mode is not supported");
  }

  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new TypeError("review items must contain 1 to 100 items");
  }

  const entityIds: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!plainObject(item) || item["entityType"] !== "vocabulary") {
      throw new TypeError("Monkey Learn/Listen review accepts vocabulary only");
    }
    const entityId = item["entityId"];
    if (typeof entityId !== "string") {
      throw new TypeError("review entityId is invalid");
    }
    const normalized = normalizeEntityId(entityId);
    if (normalized === "" || normalized.length > 200) {
      throw new TypeError("review entityId is invalid");
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      entityIds.push(normalized);
    }
  }

  if (entityIds.length === 0) {
    throw new TypeError("review dataset is empty");
  }

  return { requestId, mode, entityIds };
}

export async function applyMonkeyReviewDataset(
  dataset: MonkeyReviewDataset,
): Promise<{ entries: number; words: number }> {
  const prepared = await prepareReviewDictionary(dataset.entityIds);
  if (prepared.entries !== dataset.entityIds.length) {
    throw new Error(
      `Shared vocabulary resolved ${prepared.entries}/${dataset.entityIds.length} review items`,
    );
  }

  const words = dataset.entityIds.flatMap((entityId) =>
    entityId.split(/\s+/).filter(Boolean),
  );
  if (words.length === 0) throw new Error("Review dataset has no typing words");

  CustomText.setMode("repeat");
  CustomText.setPipeDelimiter(false);
  CustomText.setText(words);
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(words.length);

  const current = getSettings();
  setSettings({
    ...current,
    enabled: true,
    learningMode: dataset.mode,
    recallModeEnabled: dataset.mode === "recall",
    dictionarySource: "review",
  });

  setConfig("mode", "custom");
  restartTestEvent.dispatch();

  return { entries: prepared.entries, words: words.length };
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
        postParent({
          type: MONKEY_REVIEW_ERROR_MESSAGE,
          requestId: dataset.requestId,
          message:
            error instanceof Error ? error.message : "Review dataset failed",
        });
      });
  });
}
