import { afterEach, describe, expect, it, vi } from "vitest";

function installStorage(): void {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("shared typing-text passage access", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns passage metadata for Context/Cloze and preserves shuffle-bag progress", async () => {
    installStorage();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const body = url.endsWith("/index.json")
        ? {
            version: 1,
            plannedLevels: 100,
            availableLevels: 1,
            totalPassages: 2,
            totalWords: 12,
            levels: [
              {
                level: 1,
                cefr: "A1",
                file: "levels/001.json",
                passageCount: 2,
                wordCount: 12,
              },
            ],
          }
        : {
            version: 1,
            level: 1,
            cefr: "A1",
            passages: [
              {
                id: "L001-P001",
                topic: "school",
                style: "daily",
                setting: "school",
                tone: "calm",
                targetWords: ["school"],
                wordCount: 6,
                text: "I go to school every day.",
              },
              {
                id: "L001-P002",
                topic: "travel",
                style: "daily",
                setting: "airport",
                tone: "calm",
                targetWords: ["airport"],
                wordCount: 6,
                text: "I went to the airport yesterday.",
              },
            ],
          };

      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const library = await import(
      "../../../src/ts/custom/typing-text-library"
    );

    const first = await library.prepareLevelPassages(1, 1);
    const second = await library.prepareLevelPassageText(1, 1);

    expect(first.level).toBe(1);
    expect(first.cefr).toBe("A1");
    expect(first.passages).toHaveLength(1);
    expect(second.passageIds).toHaveLength(1);
    expect(second.passageIds[0]).not.toBe(first.passages[0]?.id);

    const levelRequests = fetchMock.mock.calls
      .map(([input]) => requestUrl(input))
      .filter((url) => url.endsWith("/levels/001.json"));
    expect(levelRequests).toHaveLength(1);
  });
});
