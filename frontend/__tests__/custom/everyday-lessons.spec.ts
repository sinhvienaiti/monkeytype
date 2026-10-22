import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getEverydayLessonIndex,
  loadEverydayLesson,
  parseEverydayLessonPassages,
} from "../../src/ts/custom/everyday-lessons";

const typingDirectory = resolve(
  "../adobe_commerce_lessons_1_180_package/02_Typing_Files",
);
function readTypingFile(filename: string): string {
  return readFileSync(`${typingDirectory}/${filename}`, "utf8");
}

describe("Everyday lesson corpus", () => {
  it("indexes every unique numbered lesson in numeric order", () => {
    const index = getEverydayLessonIndex();
    const filenames = readdirSync(typingDirectory).filter((name) =>
      name.endsWith("_typing.md"),
    );
    const numberedFiles = filenames.filter((name) => /^\d+_/.test(name));
    const ids = numberedFiles
      .map((name) => Number.parseInt(name, 10))
      .sort((a, b) => a - b);

    // Source numbering begins at 00 and has existing gaps 41, 49 and 59.
    expect(index.map(({ id }) => id)).toEqual(ids);
    expect(index).toHaveLength(178);
    expect(index[0]).toMatchObject({ id: 0, title: "Full page caching" });
    expect(index.at(-1)?.id).toBe(180);
    expect(index.every(({ title }) => title !== "")).toBe(true);

    // These aliases are safe to omit only while their full text matches.
    expect(filenames.filter((name) => !/^\d+_/.test(name)).sort()).toEqual([
      "full_page_caching_typing.md",
      "partial_caching_typing.md",
    ]);
    expect(readTypingFile("full_page_caching_typing.md")).toBe(
      readTypingFile("00_full_page_caching_typing.md"),
    );
    expect(readTypingFile("partial_caching_typing.md")).toBe(
      readTypingFile("01_partial_caching_typing.md"),
    );
  });

  // All 178 lazy raw imports need extra time when CI runs other checks in parallel.
  it("preserves all authored passages and their order across the complete corpus", async () => {
    const filenames = readdirSync(typingDirectory).filter((name) =>
      /^\d+_.+_typing\.md$/.test(name),
    );
    let totalPassages = 0;

    for (const filename of filenames) {
      const id = Number.parseInt(filename, 10);
      const raw = readTypingFile(filename);
      const expected = raw
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => line.trim());
      const lesson = await loadEverydayLesson(id);

      expect(lesson.id, filename).toBe(id);
      expect(lesson.passages, filename).toEqual(expected);
      expect(lesson.passages.length, filename).toBeGreaterThan(0);
      expect(
        getEverydayLessonIndex().find((meta) => meta.id === id),
      ).toMatchObject({ passageCount: expected.length });
      totalPassages += lesson.passages.length;
    }

    expect(totalPassages).toBeGreaterThan(2000);
  }, 30_000);

  it("rejects unknown, missing and noninteger lesson IDs", async () => {
    for (const id of [-1, 41, 49, 59, 181, 0.5, Number.NaN]) {
      await expect(loadEverydayLesson(id)).rejects.toThrow("unavailable");
    }
  });
});

describe("Everyday lesson loading", () => {
  it("handles BOM and mixed newlines without requiring blank separator lines", () => {
    expect(
      parseEverydayLessonPassages(
        "\uFEFF  Full page cache giữ original  spacing.  \r\nSecond passage.\r\n \r\nThird passage.\rFourth passage.\n",
      ),
    ).toEqual([
      "Full page cache giữ original  spacing.",
      "Second passage.",
      "Third passage.",
      "Fourth passage.",
    ]);
  });

  it("shares an in-flight load and caches the completed lesson", async () => {
    const [first, second] = await Promise.all([
      loadEverydayLesson(0),
      loadEverydayLesson(0),
    ]);

    expect(second).toBe(first);
    expect(await loadEverydayLesson(0)).toBe(first);
  });

  it("returns no passages for BOM and whitespace-only content", () => {
    expect(parseEverydayLessonPassages("\uFEFF \r\n\t\n")).toEqual([]);
  });
});
