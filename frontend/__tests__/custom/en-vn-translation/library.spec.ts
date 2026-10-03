import { afterEach, describe, expect, it, vi } from "vitest";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function installStorage(): void {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  });
}

function installFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    const body =
      url.endsWith("/topics/index.json")
        ? {
            version: 1,
            totalGroups: 2,
            totalTopics: 2,
            uniqueVocabularyKeys: 3,
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
              {
                id: "everyday.routine",
                label: "Daily Routine",
                group: "everyday-life",
                groupLabel: "Everyday Life",
                levels: ["A1"],
                count: 1,
                keys: ["work"],
                entries: [{ key: "work", level: 2 }],
              },
            ],
          }
        : url.endsWith("/parts-of-speech/index.json")
          ? {
              version: 1,
              categories: [
                {
                  id: "noun",
                  tokens: ["airport", "passport"],
                  entries: [
                    { key: "airport", level: 1 },
                    { key: "passport", level: 2 },
                  ],
                  missing: [],
                },
                {
                  id: "phrasal-verb",
                  tokens: ["wake up"],
                  entries: [],
                  missing: ["wake up"],
                },
              ],
            }
          : url.endsWith("/grammar/index.json")
            ? {
                version: 1,
                primaryTimeGroups: ["time.present", "time.past", "time.future"],
                modules: [
                  {
                    id: "time.present",
                    label: "Present",
                    group: "present",
                    focus: ["habits and routines"],
                    topicIds: ["everyday.routine"],
                    signalTokens: ["today"],
                    signalEntries: [{ key: "today", level: 1 }],
                    missingSignalKeys: [],
                  },
                ],
              }
            : url.endsWith("/lookup.json")
              ? {
                  version: 1,
                  totalEntries: 5,
                  maxWordCount: 1,
                  entries: {
                    airport: 1,
                    passport: 2,
                    today: 1,
                    work: 2,
                    breakfast: 3,
                  },
                }
              : url.endsWith("/levels/001.json")
                ? {
                    version: 1,
                    level: 1,
                    label: "One",
                    entries: [
                      { id: "L001-001", en: "airport", vi: "sân bay", ipa: "/ˈerˌpɔrt/" },
                      { id: "L001-002", en: "today", vi: "hôm nay", ipa: "/təˈdeɪ/" },
                    ],
                  }
                : url.endsWith("/levels/002.json")
                  ? {
                      version: 1,
                      level: 2,
                      label: "Two",
                      entries: [
                        { id: "L002-001", en: "passport", vi: "hộ chiếu", ipa: "/ˈpæsˌpɔrt/" },
                        { id: "L002-002", en: "work", vi: "công việc", ipa: "/wɝk/" },
                      ],
                    }
                  : {
                      version: 1,
                      level: 3,
                      label: "Three",
                      entries: [
                        { id: "L003-001", en: "breakfast", vi: "bữa sáng", ipa: "/ˈbrɛkfəst/" },
                      ],
                    };

    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("EN-VN shared curriculum dictionaries", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("loads only levels used by the selected topic and keeps topic order", async () => {
    installStorage();
    const fetchMock = installFetch();
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
    expect(urls.some((url) => url.endsWith("/levels/003.json"))).toBe(false);
  });

  it("reuses shared level documents across repeated curriculum preparation", async () => {
    installStorage();
    const fetchMock = installFetch();
    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );

    await library.prepareTopicDictionary("travel.airport");
    await library.preparePosDictionary("noun");
    await library.prepareGrammarDictionary("time.present");

    const levelUrls = fetchMock.mock.calls
      .map(([input]) => requestUrl(input))
      .filter((url) => url.includes("/levels/"));
    expect(levelUrls.filter((url) => url.endsWith("/001.json"))).toHaveLength(1);
    expect(levelUrls.filter((url) => url.endsWith("/002.json"))).toHaveLength(1);
  });

  it("loads Word type from embedded level hints without the 18k lookup", async () => {
    installStorage();
    const fetchMock = installFetch();
    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );

    const result = await library.preparePosDictionary("noun");

    expect(result.entries).toBe(2);
    expect(result.label).toBe("Noun");
    expect(library.getActiveDictionaryRaw("word-type", "", "", "noun")).toBe(
      "airport = sân bay\npassport = hộ chiếu",
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/lookup.json"),
      ),
    ).toBe(false);
  });

  it("builds Grammar dictionary from signal words plus linked topic context", async () => {
    installStorage();
    installFetch();
    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );

    const result = await library.prepareGrammarDictionary("time.present");

    expect(result.label).toBe("Present");
    expect(
      library.getActiveDictionaryRaw(
        "grammar",
        "",
        "",
        "",
        "time.present",
      ),
    ).toBe("today = hôm nay\nwork = công việc");
  });

  it("prepares an ordered review dictionary and exposes shared IPA metadata", async () => {
    installStorage();
    installFetch();
    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );

    const result = await library.prepareReviewDictionary([
      "passport",
      "airport",
    ]);

    expect(result).toEqual({ entries: 2, levels: [1, 2] });
    expect(library.getActiveDictionaryRaw("review", "")).toBe(
      "passport = hộ chiếu\nairport = sân bay",
    );
    expect(library.getCachedVocabularyEntry("passport")?.ipa).toBe(
      "/ˈpæsˌpɔrt/",
    );
  });

  it("keeps Library, Topic, Word type and Grammar caches separate", async () => {
    installStorage();
    installFetch();
    const library = await import(
      "../../../src/ts/custom/en-vn-translation/library"
    );

    await library.prepareLibraryDictionary("breakfast");
    await library.prepareTopicDictionary("travel.airport");
    await library.preparePosDictionary("noun");
    await library.prepareGrammarDictionary("time.present");

    expect(library.getActiveDictionaryRaw("library", "")).toBe(
      "breakfast = bữa sáng",
    );
    expect(
      library.getActiveDictionaryRaw("topic", "", "travel.airport"),
    ).toContain("passport = hộ chiếu");
    expect(
      library.getActiveDictionaryRaw("word-type", "", "", "noun"),
    ).toContain("airport = sân bay");
    expect(
      library.getActiveDictionaryRaw(
        "grammar",
        "",
        "",
        "",
        "time.present",
      ),
    ).toContain("today = hôm nay");
  });
});
