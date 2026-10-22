import { describe, expect, it } from "vitest";

import {
  chunkTextReaderText,
  resolveTextReaderLanguage,
} from "../../../src/ts/custom/en-vn-translation/text-reader";

describe("EN-VN text reader helpers", () => {
  it("detects Vietnamese text in auto mode", () => {
    expect(resolveTextReaderLanguage("Tôi đang học tiếng Anh.", "auto")).toBe(
      "vi-VN",
    );
  });

  it("defaults auto mode to English when Vietnamese marks are absent", () => {
    expect(resolveTextReaderLanguage("Modern software development.", "auto")).toBe(
      "en-US",
    );
  });

  it("honors an explicit reader language", () => {
    expect(resolveTextReaderLanguage("Hello world.", "vi-VN")).toBe("vi-VN");
    expect(resolveTextReaderLanguage("Xin chao.", "en-US")).toBe("en-US");
  });

  it("chunks long text without dropping words", () => {
    const source =
      "This is the first sentence. This is the second sentence with more words. Final sentence.";
    const chunks = chunkTextReaderText(source, 45);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 45)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(source);
  });

  it("splits a single oversized token safely", () => {
    const chunks = chunkTextReaderText("abcdefghijklmnop", 5);
    expect(chunks).toEqual(["abcde", "fghij", "klmno", "p"]);
  });

  it("returns no chunks for blank text", () => {
    expect(chunkTextReaderText("   \n\t ")).toEqual([]);
  });
});
