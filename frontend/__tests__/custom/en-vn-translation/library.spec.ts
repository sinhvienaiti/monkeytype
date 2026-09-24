import { afterEach, describe, expect, it, vi } from "vitest";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("EN-VN shared topic dictionary", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("loads only levels used by the selected topic and keeps topic key order", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const body =
        url.endsWith("/topics/index.json")
          ? {
              version: 1,
              totalGroups: 1,
              totalTopics: 1,
              uniqueVocabularyKeys: 2,
              topics: [
                {
                  id: "travel.airport",
                  label: "Airport",
                  group: "travel-tourism",
                  groupLabel: "Travel & Tourism",
                  levels: ["A1", "B1"],
                  count: 2,
                  keys: ["passport", "airport"],
                  entries: [
                    { key: "passport", level: 2 },
                    { key: "airport", level: 1 },
                  ],
                },
              ],
            }
          : url.endsWith("/lookup.json")
            ? {
                version: 1,
                totalEntries: 3,
                maxWordCount: 1,
                entries: { airport: 1, passport: 2, unused: 3 },
              }
            : url.endsWith("/levels/001.json")
              ? {
                  version: 1,
                  level: 1,
                  label: "One",
                  entries: [
                    { id: "L001-001", en: "airport", vi: "sân bay", ipa: "/ˈerˌpɔrt/" },
                  ],
                }
              : url.endsWith("/levels/002.json")
                ? {
                    version: 1,
                    level: 2,
                    label: "Two",
                    entries: [
                      { id: "L002-001", en: "passport", vi: "hộ chiếu", ipa: "/ˈpæsˌpɔrt/" },
                    ],
                  }
                : {
                    version: 1,
                    level: 3,
                    label: "Unused",
                    entries: [],
                  };

      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );
    const result = await library.prepareTopicDictionary("travel.airport");

    expect(result).toEqual({
      entries: 2,
      levels: [1, 2],
      label: "Airport",
    });
    expect(
      library.getActiveDictionaryRaw("topic", "", "travel.airport"),
    ).toBe("passport = hộ chiếu\nairport = sân bay");

    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input));
    expect(urls.some((url) => url.endsWith("/lookup.json"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/levels/001.json"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/levels/002.json"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/levels/003.json"))).toBe(false);
  });

  it("keeps Library and Topic caches separate when switching sources", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const body =
        url.endsWith("/topics/index.json")
          ? {
              version: 1,
              totalGroups: 1,
              totalTopics: 1,
              uniqueVocabularyKeys: 1,
              topics: [
                {
                  id: "food.meals",
                  label: "Meals",
                  group: "food-drink",
                  groupLabel: "Food & Drink",
                  levels: ["A1"],
                  count: 1,
                  keys: ["dinner"],
                  entries: [{ key: "dinner", level: 2 }],
                },
              ],
            }
          : url.endsWith("/lookup.json")
            ? {
                version: 1,
                totalEntries: 2,
                maxWordCount: 1,
                entries: { breakfast: 1, dinner: 2 },
              }
            : url.endsWith("/levels/001.json")
              ? {
                  version: 1,
                  level: 1,
                  label: "One",
                  entries: [
                    { id: "L001-001", en: "breakfast", vi: "bữa sáng", ipa: "/ˈbrɛkfəst/" },
                  ],
                }
              : {
                  version: 1,
                  level: 2,
                  label: "Two",
                  entries: [
                    { id: "L002-001", en: "dinner", vi: "bữa tối", ipa: "/ˈdɪnər/" },
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
      "../../../src/ts/custom/en-vn-translation/library"
    );
    await library.prepareLibraryDictionary("breakfast");
    await library.prepareTopicDictionary("food.meals");

    expect(library.getActiveDictionaryRaw("library", "")).toContain(
      "breakfast = bữa sáng",
    );
    expect(
      library.getActiveDictionaryRaw("topic", "", "food.meals"),
    ).toBe("dinner = bữa tối");
  });
});
