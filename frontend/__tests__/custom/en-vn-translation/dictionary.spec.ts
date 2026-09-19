import { describe, expect, it } from "vitest";

import {
  findDictionaryMatch,
  normalizePhrase,
  parseDictionary,
} from "../../../src/ts/custom/en-vn-translation/dictionary";

describe("EN-VN translation dictionary", () => {
  it("parses equals separated entries", () => {
    const result = parseDictionary(
      "cache = bộ nhớ đệm\nparent block = block cha",
    );

    expect(result.translations.get("cache")).toBe("bộ nhớ đệm");
    expect(result.translations.get("parent block")).toBe("block cha");
    expect(result.maxWordCount).toBe(2);
  });

  it("supports arrow and tab separators", () => {
    const result = parseDictionary(
      "dependency injection => tiêm phụ thuộc\nrender\tkết xuất",
    );

    expect(result.translations.get("dependency injection")).toBe(
      "tiêm phụ thuộc",
    );
    expect(result.translations.get("render")).toBe("kết xuất");
  });

  it("normalizes case and surrounding punctuation", () => {
    expect(normalizePhrase("Cache,")).toBe("cache");
    expect(normalizePhrase("(Parent Block)")).toBe("parent block");
  });

  it("ignores invalid and empty lines", () => {
    const result = parseDictionary(
      "invalid line\n= missing source\nmissing translation =\ncache = bộ nhớ đệm",
    );

    expect(result.translations.size).toBe(1);
    expect(result.translations.get("cache")).toBe("bộ nhớ đệm");
  });

  it("keeps the latest value for duplicate source entries", () => {
    const result = parseDictionary(
      "cache = nghĩa cũ\nCACHE = nghĩa mới",
    );

    expect(result.translations.get("cache")).toBe("nghĩa mới");
  });

  it("uses the longest matching phrase", () => {
    const dictionary = parseDictionary(
      "dependency = sự phụ thuộc\ndependency injection = tiêm phụ thuộc",
    );
    const match = findDictionaryMatch(
      ["dependency", "injection", "pattern"],
      0,
      dictionary,
    );

    expect(match).toEqual({
      source: "dependency injection",
      translation: "tiêm phụ thuộc",
      wordCount: 2,
    });
  });

  it("returns null when no dictionary entry matches", () => {
    const dictionary = parseDictionary("cache = bộ nhớ đệm");
    expect(findDictionaryMatch(["service", "container"], 0, dictionary)).toBeNull();
  });
});
