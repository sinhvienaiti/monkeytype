import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lessons, loadLesson } = vi.hoisted(() => {
  const lessons = [
    {
      id: 0,
      title: "Introduction",
      passages: Array.from(
        { length: 7 },
        (_, i) => `Intro paragraph ${i + 1}.`,
      ),
    },
    {
      id: 2,
      title: "Dependency injection",
      passages: Array.from({ length: 4 }, (_, i) => `DI paragraph ${i + 1}.`),
    },
    {
      id: 5,
      title: "Cache",
      passages: ["Cache paragraph 1.", "Cache paragraph 2."],
    },
  ];
  return {
    lessons,
    loadLesson: vi.fn(async (id: number) => {
      const lesson = lessons.find((item) => item.id === id);
      if (lesson === undefined) throw new Error("Unknown lesson");
      return lesson;
    }),
  };
});

vi.mock("../../src/ts/custom/everyday-lessons", () => ({
  getEverydayLessonIndex: () => lessons.map(({ id, title }) => ({ id, title })),
  loadEverydayLesson: loadLesson,
}));

function installStorage(): Map<string, string> {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  });
  return storage;
}

async function module(): Promise<
  typeof import("../../src/ts/custom/everyday-sessions")
> {
  return await import("../../src/ts/custom/everyday-sessions");
}

describe("Everyday passage navigation", () => {
  beforeEach(() => {
    installStorage();
    loadLesson.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("keeps paragraph anchors when changing 3 to 1 and never skips the shrunken tail", async () => {
    const sessions = await module();
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(0, 3));
    const second = await sessions.prepareEverydaySession(0, 3, "next");
    sessions.commitEverydaySession(second);
    expect([second.start, second.end]).toEqual([3, 6]);

    const smaller = await sessions.prepareEverydaySession(0, 1);
    sessions.commitEverydaySession(smaller);
    expect(smaller.text).toBe("Intro paragraph 4.");
    expect([smaller.start, smaller.end]).toEqual([3, 4]);

    const next = await sessions.prepareEverydaySession(0, 1, "next");
    sessions.commitEverydaySession(next);
    expect(next.text).toBe("Intro paragraph 5.");
    const previous = await sessions.prepareEverydaySession(0, 1, "prev");
    expect([previous.start, previous.end]).toEqual([3, 4]);
  });

  it("keeps the same start for 1 to 3 and advances from the expanded end", async () => {
    const sessions = await module();
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(0, 1));
    sessions.commitEverydaySession(
      await sessions.prepareEverydaySession(0, 1, "next"),
    );
    const expanded = await sessions.prepareEverydaySession(0, 3);
    sessions.commitEverydaySession(expanded);
    expect([expanded.start, expanded.end]).toEqual([1, 4]);
    expect(expanded.text).toBe(
      "Intro paragraph 2. Intro paragraph 3. Intro paragraph 4.",
    );

    const next = await sessions.prepareEverydaySession(0, 3, "next");
    sessions.commitEverydaySession(next);
    expect([next.start, next.end]).toEqual([4, 7]);
    const previous = await sessions.prepareEverydaySession(0, 2, "prev");
    expect([previous.start, previous.end]).toEqual([1, 3]);
  });

  it("restores the exact previous start after reload, using the new count", async () => {
    const sessions = await module();
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(0, 3));
    sessions.commitEverydaySession(
      await sessions.prepareEverydaySession(0, 3, "next"),
    );
    vi.resetModules();
    const reloaded = await module();
    expect(reloaded.loadEverydaySession()?.start).toBe(3);

    const previous = await reloaded.prepareEverydaySession(0, 1, "prev");
    reloaded.commitEverydaySession(previous);
    expect([previous.start, previous.end]).toEqual([0, 1]);
    const next = await reloaded.prepareEverydaySession(0, 1, "next");
    expect([next.start, next.end]).toEqual([1, 2]);
  });

  it("uses a final partial group and crosses numeric gaps without omitting or duplicating paragraphs", async () => {
    const sessions = await module();
    const actual: string[] = [];
    let current = await sessions.prepareEverydaySession(0, 3);
    while (true) {
      sessions.commitEverydaySession(current);
      actual.push(current.text);
      if (!current.hasNext) break;
      current = await sessions.prepareEverydaySession(
        current.lessonId,
        3,
        "next",
      );
    }
    expect(actual.join(" ")).toEqual(
      lessons.flatMap((lesson) => lesson.passages).join(" "),
    );
    expect(current).toMatchObject({
      lessonId: 5,
      start: 0,
      end: 2,
      hasNext: false,
    });
    const end = await sessions.prepareEverydaySession(5, 3, "next");
    expect(end).toEqual(current);
  });

  it("restores the previous lesson's final start across a boundary and does not wrap at the beginning", async () => {
    const sessions = await module();
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(0, 3));
    sessions.commitEverydaySession(
      await sessions.prepareEverydaySession(0, 3, "next"),
    );
    const tail = await sessions.prepareEverydaySession(0, 3, "next");
    sessions.commitEverydaySession(tail);
    expect(tail).toMatchObject({ start: 6, end: 7 });
    const crossed = await sessions.prepareEverydaySession(0, 3, "next");
    sessions.commitEverydaySession(crossed);
    expect(crossed).toMatchObject({ lessonId: 2, start: 0, end: 3 });

    vi.resetModules();
    const reloaded = await module();
    const previous = await reloaded.prepareEverydaySession(2, 1, "prev");
    reloaded.commitEverydaySession(previous);
    expect(previous).toMatchObject({ lessonId: 0, start: 6, end: 7 });
    const earlier = await reloaded.prepareEverydaySession(0, 1, "prev");
    reloaded.commitEverydaySession(earlier);
    expect(earlier.start).toBe(3);
    const first = await reloaded.prepareEverydaySession(0, 1, "prev");
    reloaded.commitEverydaySession(first);
    expect(first).toMatchObject({ start: 0, hasPrevious: false });
    expect(await reloaded.prepareEverydaySession(0, 1, "prev")).toEqual(first);
  });

  it("preserves each lesson's absolute progress when selecting a different lesson", async () => {
    const sessions = await module();
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(0, 2));
    sessions.commitEverydaySession(
      await sessions.prepareEverydaySession(0, 2, "next"),
    );
    sessions.commitEverydaySession(await sessions.prepareEverydaySession(2, 1));
    expect(await sessions.prepareEverydaySession(0, 3)).toMatchObject({
      start: 2,
      end: 5,
    });
  });

  it("does not save prepared candidates or failed lesson loads", async () => {
    const sessions = await module();
    const first = await sessions.prepareEverydaySession(0, 3);
    expect(sessions.loadEverydaySession()).toBeNull();
    sessions.commitEverydaySession(first);
    const originalStorage = localStorage.getItem(
      "personalTypingEverydayProgress",
    );

    await sessions.prepareEverydaySession(0, 3, "next");
    expect(sessions.loadEverydaySession()).toEqual(first);
    expect(localStorage.getItem("personalTypingEverydayProgress")).toBe(
      originalStorage,
    );
    loadLesson.mockRejectedValueOnce(new Error("Network failed"));
    await expect(sessions.prepareEverydaySession(0, 3, "next")).rejects.toThrow(
      "Network failed",
    );
    expect(sessions.loadEverydaySession()).toEqual(first);
    expect(localStorage.getItem("personalTypingEverydayProgress")).toBe(
      originalStorage,
    );
    expect(await sessions.prepareEverydaySession(0, 3, "next")).toMatchObject({
      start: 3,
      end: 6,
    });
  });

  it("falls back safely for corrupt storage and clamps counts", async () => {
    localStorage.setItem("personalTypingEverydayProgress", "{not json}");
    const sessions = await module();
    expect(sessions.loadEverydaySession()).toBeNull();
    expect(await sessions.prepareEverydaySession(999, 0)).toMatchObject({
      lessonId: 0,
      start: 0,
      end: 1,
    });
    loadLesson.mockResolvedValueOnce({
      id: 0,
      title: "Long lesson",
      passages: Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}.`),
    });
    expect(await sessions.prepareEverydaySession(0, 99)).toMatchObject({
      start: 0,
      end: 15,
    });
    expect(await sessions.prepareEverydaySession(0, Number.NaN)).toMatchObject({
      start: 0,
      end: 1,
    });
  });

  it("keeps uncommitted navigation isolated when storage is unavailable", async () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const sessions = await module();
    const first = await sessions.prepareEverydaySession(0, 2);
    sessions.commitEverydaySession(first);
    const candidate = await sessions.prepareEverydaySession(0, 2, "next");
    expect(sessions.loadEverydaySession()).toEqual(first);
    sessions.commitEverydaySession(candidate);
    expect(sessions.loadEverydaySession()?.start).toBe(2);
  });
});
