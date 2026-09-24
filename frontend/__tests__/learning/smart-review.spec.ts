import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareReviewDictionary: vi.fn(),
  getCachedVocabularyEntry: vi.fn(),
  loadVocabularyGrammarIndex: vi.fn(),
}));

vi.mock("../../src/ts/custom/en-vn-translation/library", () => ({
  prepareReviewDictionary: mocks.prepareReviewDictionary,
  getCachedVocabularyEntry: mocks.getCachedVocabularyEntry,
  loadVocabularyGrammarIndex: mocks.loadVocabularyGrammarIndex,
}));

import {
  activityForReviewItem,
  buildSmartReviewLearningEvent,
  parseSmartReviewDataset,
  prepareSmartReviewItems,
  smartReviewHint,
  validateSmartReviewAnswer,
} from "../../src/ts/learning/smart-review";

describe("Monkey Smart Review coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareReviewDictionary.mockResolvedValue({
      entries: 1,
      levels: [1],
    });
    mocks.getCachedVocabularyEntry.mockReturnValue({
      id: "airport",
      en: "airport",
      vi: "sân bay",
      ipa: "/ˈerˌpɔrt/",
    });
    mocks.loadVocabularyGrammarIndex.mockResolvedValue({
      version: 1,
      primaryTimeGroups: ["time.present", "time.past", "time.future"],
      modules: [
        {
          id: "time.past",
          label: "Past",
          group: "past",
          focus: ["completed events"],
          topicIds: ["travel.planning"],
          signalTokens: ["yesterday", "ago"],
          signalEntries: [],
          missingSignalKeys: [],
        },
      ],
    });
  });

  it("parses the parent L10 dataset contract and rejects goal/entity mismatches", () => {
    const parsed = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-1",
      createdAt: "2026-09-24T13:00:00.000Z",
      goal: "listening",
      items: [
        {
          entityType: "vocabulary",
          entityId: " Airport ",
          mastery: 43,
          reviewPriority: 88,
        },
      ],
    });

    expect(parsed).toMatchObject({
      requestId: "review-1",
      goal: "listening",
      items: [{ entityType: "vocabulary", entityId: "airport" }],
    });

    expect(() =>
      parseSmartReviewDataset({
        version: 1,
        type: "typing-game:learning:v1:review-dataset",
        requestId: "review-2",
        goal: "grammar",
        items: [{ entityType: "vocabulary", entityId: "airport" }],
      }),
    ).toThrow("does not support vocabulary");
  });

  it("chooses deterministic activities for mixed vocabulary weaknesses", () => {
    expect(
      activityForReviewItem("mixed", {
        entityType: "vocabulary",
        entityId: "airport",
        reviewContext: { activityType: "listen" },
      }),
    ).toBe("listening");

    expect(
      activityForReviewItem("mixed", {
        entityType: "vocabulary",
        entityId: "airport",
        reviewContext: { errorType: "spelling" },
      }),
    ).toBe("spelling");

    expect(
      activityForReviewItem("mixed", {
        entityType: "vocabulary",
        entityId: "airport",
      }),
    ).toBe("remember");
  });

  it("enriches vocabulary from the shared 18k library", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-3",
      goal: "listening",
      items: [{ entityType: "vocabulary", entityId: "airport" }],
    });
    if (dataset === null) throw new Error("Missing dataset");

    const items = await prepareSmartReviewItems(dataset);

    expect(mocks.prepareReviewDictionary).toHaveBeenCalledWith(["airport"]);
    expect(items[0]).toMatchObject({
      activity: "listening",
      prompt: "Listen to the pronunciation and type the English word.",
      secondary: "/ˈerˌpɔrt/",
      expectedAnswers: ["airport"],
    });
  });

  it("uses learning-memory context first for grammar review", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-4",
      goal: "grammar",
      items: [
        {
          entityType: "grammar",
          entityId: "time.past",
          reviewContext: {
            userAnswer: "tomorrow",
            expectedAnswer: "yesterday",
            errorType: "wrong-tense",
          },
        },
      ],
    });
    if (dataset === null) throw new Error("Missing dataset");

    const items = await prepareSmartReviewItems(dataset);

    expect(items[0]).toMatchObject({
      activity: "grammar",
      title: "Grammar · Past",
      prompt: "Correct your previous answer: tomorrow",
      expectedAnswers: ["yesterday"],
    });

    const validation = validateSmartReviewAnswer(items[0]!, "tomorrow");
    expect(validation).toEqual({
      correct: false,
      errorType: "wrong-tense",
    });
  });

  it("falls back to shared grammar signal tokens when no mistake context exists", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-5",
      goal: "grammar",
      items: [{ entityType: "grammar", entityId: "time.past" }],
    });
    if (dataset === null) throw new Error("Missing dataset");

    const items = await prepareSmartReviewItems(dataset);
    expect(items[0]?.expectedAnswers).toEqual(["yesterday", "ago"]);
    expect(validateSmartReviewAnswer(items[0]!, "Ago")).toEqual({
      correct: true,
      matchedAnswer: "ago",
    });
  });

  it("reuses Sentence Builder accepted-answer validation for sentence review", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-6",
      goal: "sentence-building",
      items: [
        {
          entityType: "sentence",
          entityId: "sentence-1",
          acceptedAnswers: [
            "I have lived here since 2020.",
            "Since 2020, I have lived here.",
          ],
          reviewContext: {
            userAnswer: "I lived here since 2020.",
            errorType: "wrong-tense",
          },
        },
      ],
    });
    if (dataset === null) throw new Error("Missing dataset");

    const items = await prepareSmartReviewItems(dataset);
    expect(
      validateSmartReviewAnswer(
        items[0]!,
        "Since 2020, I have lived here.",
      ),
    ).toMatchObject({
      correct: true,
      matchedAnswer: "Since 2020, I have lived here.",
    });
    expect(
      validateSmartReviewAnswer(items[0]!, "I lived here since 2020."),
    ).toMatchObject({
      correct: false,
      errorType: "wrong-tense",
    });
  });

  it("builds a shared learning event without calculating mastery locally", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-7",
      goal: "mixed",
      items: [
        {
          entityType: "vocabulary",
          entityId: "airport",
          reviewContext: { errorType: "spelling" },
        },
      ],
    });
    if (dataset === null) throw new Error("Missing dataset");

    const item = (await prepareSmartReviewItems(dataset))[0];
    if (item === undefined) throw new Error("Missing item");
    const validation = validateSmartReviewAnswer(item, "airport");

    expect(
      buildSmartReviewLearningEvent({
        item,
        answer: "airport",
        validation,
        responseMs: 441.6,
        hintUsed: true,
        replayUsed: false,
        occurredAt: "2026-09-24T13:00:00.000Z",
      }),
    ).toEqual({
      version: 1,
      entityType: "vocabulary",
      entityId: "airport",
      gameId: "monkeytype",
      activityType: "typing",
      result: "correct",
      occurredAt: "2026-09-24T13:00:00.000Z",
      responseMs: 442,
      hintUsed: true,
      replayUsed: false,
      userAnswer: "airport",
      expectedAnswer: "airport",
    });
  });

  it("reveals Unicode text incrementally", async () => {
    const dataset = parseSmartReviewDataset({
      version: 1,
      type: "typing-game:learning:v1:review-dataset",
      requestId: "review-8",
      goal: "spelling",
      items: [{ entityType: "vocabulary", entityId: "airport" }],
    });
    if (dataset === null) throw new Error("Missing dataset");
    const item = (await prepareSmartReviewItems(dataset))[0];
    if (item === undefined) throw new Error("Missing item");

    expect(smartReviewHint(item, 0)).toEqual({
      revealed: "a",
      nextRevealedCharacters: 1,
    });
  });
});
