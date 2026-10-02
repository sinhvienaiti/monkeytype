import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deriveCompositionCommit,
  deriveVietnameseDirectInsert,
  deriveVietnameseImeRewrite,
  deriveVietnameseImeRewrites,
  deriveVietnamesePhysicalRewrites,
  deriveVietnameseTelexRewrite,
  getCommitCharacterType,
  hasVietnameseImeProvisionalMismatch,
  isVietnameseImeProvisionalCharacter,
  normalizeCommittedText,
  normalizeTargetText,
  shouldUseVietnameseIme,
  splitCommittedText,
} from "../../../src/ts/input/helpers/util";
import * as FunboxList from "../../../src/ts/test/funbox/list";

vi.mock("../../../src/ts/test/funbox/list", () => ({
  isFunboxActiveWithProperty: vi.fn(),
}));

const isFunboxActiveWithProperty = vi.mocked(
  FunboxList.isFunboxActiveWithProperty,
);

describe("getCommitCharacterType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFunboxActiveWithProperty.mockReturnValue(false);
  });

  it("returns 'separator' for a regular space", () => {
    expect(
      getCommitCharacterType({
        data: " ",
        inputValue: "tes",
        targetWord: "test",
      }),
    ).toBe("separator");
  });

  it.each([
    ["　", "ideographic"],
    [" ", "non-breaking"],
    [" ", "em"],
    ["​", "zero width"],
  ])("returns 'separator' for %s (%s space)", (data) => {
    expect(
      getCommitCharacterType({ data, inputValue: "tes", targetWord: "test" }),
    ).toBe("separator");
  });

  it("returns 'separator' for a newline", () => {
    expect(
      getCommitCharacterType({
        data: "\n",
        inputValue: "tes",
        targetWord: "test",
      }),
    ).toBe("separator");
  });

  it("returns false for a regular letter when nospace is inactive", () => {
    expect(
      getCommitCharacterType({
        data: "t",
        inputValue: "tes",
        targetWord: "test",
      }),
    ).toBe(false);
    expect(isFunboxActiveWithProperty).toHaveBeenCalledWith("nospace");
  });

  describe("nospace funbox", () => {
    beforeEach(() => {
      isFunboxActiveWithProperty.mockReturnValue(true);
    });

    it("returns 'nospace' when the char completes the target word", () => {
      expect(
        getCommitCharacterType({
          data: "t",
          inputValue: "tes",
          targetWord: "test",
        }),
      ).toBe("nospace");
    });

    it("returns false when the word is not yet complete", () => {
      expect(
        getCommitCharacterType({
          data: "s",
          inputValue: "te",
          targetWord: "test",
        }),
      ).toBe(false);
    });

    it("returns false when input already exceeds the target length", () => {
      expect(
        getCommitCharacterType({
          data: "x",
          inputValue: "test",
          targetWord: "test",
        }),
      ).toBe(false);
    });

    it("still returns 'separator' for a space", () => {
      expect(
        getCommitCharacterType({
          data: " ",
          inputValue: "tes",
          targetWord: "test",
        }),
      ).toBe("separator");
    });
  });
});

describe("Vietnamese IME helpers", () => {
  it("uses explicit Vietnamese mode regardless of the selected test language", () => {
    expect(shouldUseVietnameseIme("vietnamese", "english")).toBe(true);
  });

  it("uses Vietnamese handling in auto mode only for Vietnamese test languages", () => {
    expect(shouldUseVietnameseIme("auto", "vietnamese")).toBe(true);
    expect(shouldUseVietnameseIme("auto", "vietnamese_1k")).toBe(true);
    expect(shouldUseVietnameseIme("auto", "english")).toBe(false);
  });

  it.each(["ấ", "ộ", "ường", "nghiêng", "Việt Nam"])(
    "normalizes committed Vietnamese text to NFC: %s",
    (value) => {
      expect(
        normalizeCommittedText(value.normalize("NFD"), "vietnamese", "english"),
      ).toBe(value.normalize("NFC"));
    },
  );

  it("normalizes the Vietnamese target with the same NFC rule", () => {
    const decomposed = "Việt Nam".normalize("NFD");
    expect(normalizeTargetText(decomposed, "vietnamese", "english")).toBe(
      "Việt Nam",
    );
  });

  it("preserves English direct-input behavior", () => {
    const decomposed = "é".normalize("NFD");
    expect(normalizeCommittedText(decomposed, "english", "vietnamese")).toBe(
      decomposed,
    );
    expect(normalizeCommittedText(decomposed, "auto", "english")).toBe(
      decomposed,
    );
  });

  it("splits a committed string by Unicode code point", () => {
    expect(splitCommittedText("ường")).toEqual(["ư", "ờ", "n", "g"]);
  });


  it.each([
    ["e", "é"],
    ["o", "ô"],
    ["ô", "ồ"],
    ["u", "ư"],
    ["d", "đ"],
  ])(
    "treats %s as a provisional Vietnamese IME form of %s",
    (input, target) => {
      expect(
        isVietnameseImeProvisionalCharacter(
          input,
          target,
          "vietnamese",
          "english",
        ),
      ).toBe(true);
    },
  );

  it("does not make accented input provisional for a plain target", () => {
    expect(
      isVietnameseImeProvisionalCharacter(
        "é",
        "e",
        "vietnamese",
        "english",
      ),
    ).toBe(false);
  });

  it.each([
    ["phe", "phé", "phép", 2, "é"],
    ["tieng", "tiếng", "tiếng", 2, "ế"],
    ["o", "ô", "ồ", 0, "ô"],
    ["ô", "ồ", "ồ", 0, "ồ"],
  ])(
    "derives a Vietnamese IME rewrite: %s -> %s",
    (before, after, target, charIndex, data) => {
      expect(
        deriveVietnameseImeRewrite(
          before,
          after,
          target,
          "vietnamese",
          "english",
        ),
      ).toMatchObject({ charIndex, data });
    },
  );

  it("does not treat a normal append as an IME rewrite", () => {
    expect(
      deriveVietnameseImeRewrite(
        "ph",
        "phe",
        "phép",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
  });

  it.each([
    ["ra", "w", "rằng", 1, "ă"],
    ["ră", "f", "rằng", 1, "ằ"],
    ["răng", "f", "rằng", 1, "ằ"],
    ["la", "f", "là", 1, "à"],
    ["a", "f", "ằ", 0, "à"],
    ["à", "w", "ằ", 0, "ằ"],
  ])(
    "derives target-aware Telex rewrite: %s + %s -> %s",
    (before, key, target, charIndex, data) => {
      expect(
        deriveVietnameseTelexRewrite(
          before,
          key,
          target,
          "vietnamese",
          "english",
        ),
      ).toMatchObject({ charIndex, data });
    },
  );

  it("rejects a wrong Telex shape for a different target accent", () => {
    expect(
      deriveVietnameseTelexRewrite(
        "la",
        "w",
        "là",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
  });

  it("supports one w rewriting the contiguous uo pair to ươ", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "nguo",
        "w",
        "người",
        "vietnamese",
        "english",
      ),
    ).toEqual([
      { charIndex: 2, from: "u", data: "ư" },
      { charIndex: 3, from: "o", data: "ơ" },
    ]);
  });

  it("detects a browser multi-character uo -> ươ rewrite", () => {
    expect(
      deriveVietnameseImeRewrites(
        "nguo",
        "ngươ",
        "người",
        "vietnamese",
        "english",
      ),
    ).toEqual([
      { charIndex: 2, from: "u", data: "ư" },
      { charIndex: 3, from: "o", data: "ơ" },
    ]);
  });

  it.each([
    ["ra", "8", "rằng", 1, "ă"],
    ["ră", "2", "rằng", 1, "ằ"],
    ["d", "9", "được", 0, "đ"],
    ["uo", "7", "ươ", 0, "ư"],
  ])(
    "supports target-aware VNI fallback: %s + %s",
    (before, key, target, charIndex, data) => {
      expect(
        deriveVietnamesePhysicalRewrites(
          before,
          key,
          target,
          "vietnamese",
          "english",
        ),
      )?.toContainEqual({ charIndex, from: Array.from(before)[charIndex], data });
    },
  );

  it("does not activate Vietnamese physical rewrites in English input mode", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "ra",
        "w",
        "rằng",
        "english",
        "vietnamese",
      ),
    ).toBeNull();
  });

  it("detects a pending Vietnamese provisional mismatch", () => {
    expect(
      hasVietnameseImeProvisionalMismatch(
        "rang",
        "rằng",
        "vietnamese",
        "english",
      ),
    ).toBe(true);
    expect(
      hasVietnameseImeProvisionalMismatch(
        "rằng",
        "rằng",
        "vietnamese",
        "english",
      ),
    ).toBe(false);
  });

  it("derives a transformed direct append from the browser DOM", () => {
    expect(
      deriveVietnameseDirectInsert(
        "",
        "ư",
        "ừ",
        "vietnamese",
        "english",
      ),
    ).toBe("ư");
  });

  it("does not derive Vietnamese direct append in English mode", () => {
    expect(
      deriveVietnameseDirectInsert(
        "",
        "ư",
        "ư",
        "english",
        "vietnamese",
      ),
    ).toBeNull();
  });

  it.each([
    ["T", "Tô", "ô"],
    ["", "o\u0302", "ô"],
    ["T", "Tường", "ường"],
    ["typed", "typed", ""],
  ])(
    "derives the real Vietnamese composition delta from %s -> %s",
    (prefix, finalValue, expected) => {
      expect(
        deriveCompositionCommit(prefix, finalValue, "vietnamese", "english"),
      ).toBe(expected);
    },
  );

  it("rejects a composition result that replaced committed prefix text", () => {
    expect(
      deriveCompositionCommit("Ta", "Tô", "vietnamese", "english"),
    ).toBeNull();
  });
});
