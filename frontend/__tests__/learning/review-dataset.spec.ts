import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setConfig: vi.fn(),
  dispatch: vi.fn(),
  setMode: vi.fn(),
  setPipeDelimiter: vi.fn(),
  setText: vi.fn(),
  setLimitMode: vi.fn(),
  setLimitValue: vi.fn(),
  prepareReviewDictionary: vi.fn(),
  setSettings: vi.fn(),
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

vi.mock("../../src/ts/custom/en-vn-translation/library", () => ({
  prepareReviewDictionary: mocks.prepareReviewDictionary,
}));

vi.mock("../../src/ts/custom/en-vn-translation/store", () => ({
  getSettings: () => mocks.settings,
  setSettings: mocks.setSettings,
}));

import {
  applyMonkeyReviewDataset,
  parseMonkeyReviewDataset,
} from "../../src/ts/learning/review-dataset";

describe("Monkeytype review dataset input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareReviewDictionary.mockResolvedValue({
      entries: 2,
      levels: [1, 2],
    });
  });

  it("parses and canonicalizes a vocabulary review dataset", () => {
    expect(
      parseMonkeyReviewDataset({
        type: "typing-game:learning:v1:review-dataset",
        requestId: "review-1",
        mode: "listen",
        items: [
          { entityType: "vocabulary", entityId: "  Passport " },
          { entityType: "vocabulary", entityId: "AIRPORT" },
          { entityType: "vocabulary", entityId: "airport" },
        ],
      }),
    ).toEqual({
      requestId: "review-1",
      mode: "listen",
      entityIds: ["passport", "airport"],
    });
  });

  it("rejects non-vocabulary content at the Learn/Listen boundary", () => {
    expect(() =>
      parseMonkeyReviewDataset({
        type: "typing-game:learning:v1:review-dataset",
        requestId: "review-2",
        mode: "learn",
        items: [{ entityType: "grammar", entityId: "time.present" }],
      }),
    ).toThrow("accepts vocabulary only");
  });

  it("loads shared vocabulary then configures one bounded Custom test", async () => {
    const result = await applyMonkeyReviewDataset({
      requestId: "review-3",
      mode: "listen",
      entityIds: ["dependency injection", "airport"],
    });

    expect(result).toEqual({ entries: 2, words: 3 });
    expect(mocks.prepareReviewDictionary).toHaveBeenCalledWith([
      "dependency injection",
      "airport",
    ]);
    expect(mocks.setMode).toHaveBeenCalledWith("repeat");
    expect(mocks.setPipeDelimiter).toHaveBeenCalledWith(false);
    expect(mocks.setText).toHaveBeenCalledWith([
      "dependency",
      "injection",
      "airport",
    ]);
    expect(mocks.setLimitMode).toHaveBeenCalledWith("word");
    expect(mocks.setLimitValue).toHaveBeenCalledWith(3);
    expect(mocks.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        learningMode: "listen",
        recallModeEnabled: false,
        dictionarySource: "review",
      }),
    );
    expect(mocks.setConfig).toHaveBeenCalledWith("mode", "custom");
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the shared vocabulary cannot resolve every item", async () => {
    mocks.prepareReviewDictionary.mockResolvedValue({
      entries: 1,
      levels: [1],
    });

    await expect(
      applyMonkeyReviewDataset({
        requestId: "review-4",
        mode: "learn",
        entityIds: ["airport", "missing word"],
      }),
    ).rejects.toThrow("resolved 1/2");

    expect(mocks.setText).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
