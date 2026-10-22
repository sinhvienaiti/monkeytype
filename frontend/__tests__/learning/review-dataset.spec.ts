import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setConfig: vi.fn(),
  dispatch: vi.fn(),
  setMode: vi.fn(),
  setPipeDelimiter: vi.fn(),
  setText: vi.fn(),
  setLimitMode: vi.fn(),
  setLimitValue: vi.fn(),
  setSettings: vi.fn(),
  prepareSmartReviewItems: vi.fn(),
  settings: {
    enabled: true,
    learningMode: "normal",
    recallModeEnabled: false,
    dictionarySource: "custom",
    dictionaryTopicId: "everyday.routine",
    dictionaryPosId: "noun",
    dictionaryGrammarId: "time.present",
    dictionary: "",
    durationMs: 3000,
    popupStyle: "bubble",
    popupSize: "medium",
    popupColor: "blue",
    displayMode: "both",
    tooltipBehavior: "hold",
    lineSpacing: "comfortable",
    pronunciationEnabled: true,
    pronunciationAccent: "en-US",
    pronunciationRate: "normal",
    pronunciationVolume: 100,
    textReaderEnabled: false,
    textReaderLanguage: "auto",
    textReaderVoiceURI: "",
    textReaderRate: 1,
    textReaderVolume: 100,
  },
}));

vi.mock("../../src/ts/config/setters", () => ({
  setConfig: mocks.setConfig,
}));

vi.mock("../../src/ts/events/test", () => ({
  restartTestEvent: {
    dispatch: mocks.dispatch,
  },
}));

vi.mock("../../src/ts/test/custom-text", () => ({
  setMode: mocks.setMode,
  setPipeDelimiter: mocks.setPipeDelimiter,
  setText: mocks.setText,
  setLimitMode: mocks.setLimitMode,
  setLimitValue: mocks.setLimitValue,
}));

vi.mock("../../src/ts/custom/en-vn-translation/store", () => ({
  getSettings: () => mocks.settings,
  setSettings: mocks.setSettings,
}));

vi.mock("../../src/ts/learning/smart-review", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/ts/learning/smart-review")>();
  return {
    ...original,
    prepareSmartReviewItems: mocks.prepareSmartReviewItems,
  };
});

import {
  applyMonkeyReviewDataset,
  clearActiveMonkeyReview,
  getActiveMonkeyReviewDataset,
  getActiveMonkeyReviewItems,
  parseMonkeyReviewDataset,
} from "../../src/ts/learning/review-dataset";

const dataset = {
  version: 1 as const,
  type: "typing-game:learning:v1:review-dataset" as const,
  requestId: "review-1",
  goal: "mixed" as const,
  items: [
    { entityType: "vocabulary" as const, entityId: "airport" },
    {
      entityType: "sentence" as const,
      entityId: "sentence-1",
      acceptedAnswers: ["I am here."],
    },
  ],
};

describe("Monkeytype Smart Review dataset input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActiveMonkeyReview();
    mocks.prepareSmartReviewItems.mockResolvedValue([
      {
        source: dataset.items[0],
        activity: "remember",
        title: "Remember the word",
        prompt: "sân bay",
        secondary: "/ˈerˌpɔrt/",
        expectedAnswers: ["airport"],
      },
      {
        source: dataset.items[1],
        activity: "sentence-building",
        title: "Sentence building",
        prompt: "Build a sentence",
        secondary: "",
        expectedAnswers: ["I am here."],
      },
    ]);
  });

  it("parses the parent goal + items contract", () => {
    expect(parseMonkeyReviewDataset(dataset)).toEqual(dataset);
  });

  it("prepares the parent queue and activates only the Smart Review surface", async () => {
    const result = await applyMonkeyReviewDataset(dataset);

    expect(result).toEqual({ items: 2, vocabularyItems: 1 });
    expect(mocks.prepareSmartReviewItems).toHaveBeenCalledWith(dataset);
    expect(mocks.setMode).toHaveBeenCalledWith("repeat");
    expect(mocks.setPipeDelimiter).toHaveBeenCalledWith(false);
    expect(mocks.setText).toHaveBeenCalledWith(["review"]);
    expect(mocks.setLimitMode).toHaveBeenCalledWith("word");
    expect(mocks.setLimitValue).toHaveBeenCalledWith(1);
    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        learningMode: "smart-review",
        recallModeEnabled: false,
        dictionarySource: "review",
      }),
    );
    expect(mocks.setConfig).toHaveBeenCalledWith("mode", "custom");
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(getActiveMonkeyReviewDataset()).toEqual(dataset);
    expect(getActiveMonkeyReviewItems()).toHaveLength(2);
  });

  it("does not publish partial active state when preparation fails", async () => {
    mocks.prepareSmartReviewItems.mockRejectedValueOnce(
      new Error("Shared vocabulary metadata missing"),
    );

    await expect(applyMonkeyReviewDataset(dataset)).rejects.toThrow(
      "Shared vocabulary metadata missing",
    );

    expect(getActiveMonkeyReviewDataset()).toBeNull();
    expect(getActiveMonkeyReviewItems()).toEqual([]);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
