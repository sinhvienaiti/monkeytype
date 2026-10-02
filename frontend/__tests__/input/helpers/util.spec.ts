import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deriveCompositionCommit,
  deriveVietnameseCommittedRewrite,
  deriveVietnameseDirectInsert,
  deriveVietnameseImeRewrite,
  deriveVietnameseImeRewrites,
  deriveVietnamesePhysicalRewrites,
  deriveVietnameseTelexRewrite,
  getCommitCharacterType,
  hasVietnameseImeProvisionalMismatch,
  isVietnameseImeBoundary,
  isVietnameseImeProvisionalCharacter,
  normalizeCommittedText,
  normalizeTargetText,
  shouldDeferVietnameseCompositionSeparator,
  shouldIgnoreVietnameseImeDelete,
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

  it("does not reach Telex fallback backwards across punctuation", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "la,",
        "f",
        "là,",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
  });

  it("allows a Telex modifier to correct a wrong tone on the same base letter", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "lá",
        "f",
        "là",
        "vietnamese",
        "english",
      ),
    ).toEqual([{ charIndex: 1, from: "á", data: "à" }]);

    expect(
      deriveVietnamesePhysicalRewrites(
        "lá",
        "z",
        "la",
        "vietnamese",
        "english",
      ),
    ).toEqual([{ charIndex: 1, from: "á", data: "a" }]);
  });

  it("allows a committed Unicode correction on the same Vietnamese base letter", () => {
    expect(
      deriveVietnameseCommittedRewrite(
        "lá",
        "à",
        "là",
        "vietnamese",
        "english",
      ),
    ).toEqual({ charIndex: 1, from: "á", data: "à" });

    expect(
      deriveVietnameseCommittedRewrite(
        "la,",
        "à",
        "là,",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
  });

  it("treats punctuation, spaces and digits as Vietnamese IME boundaries", () => {
    expect(isVietnameseImeBoundary(",", "vietnamese", "english")).toBe(true);
    expect(isVietnameseImeBoundary(" ", "vietnamese", "english")).toBe(true);
    expect(isVietnameseImeBoundary("1", "vietnamese", "english")).toBe(true);
    expect(isVietnameseImeBoundary("n", "vietnamese", "english")).toBe(false);
    expect(isVietnameseImeBoundary("ư", "vietnamese", "english")).toBe(false);
  });

  it("defers a committing separator only while Vietnamese composition is active", () => {
    expect(
      shouldDeferVietnameseCompositionSeparator(
        " ",
        true,
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toBe(true);
    expect(
      shouldDeferVietnameseCompositionSeparator(
        "\n",
        true,
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toBe(true);
    expect(
      shouldDeferVietnameseCompositionSeparator(
        " ",
        false,
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toBe(false);
    expect(
      shouldDeferVietnameseCompositionSeparator(
        "s",
        true,
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toBe(false);
    expect(
      shouldDeferVietnameseCompositionSeparator(
        " ",
        true,
        "english",
        "english",
      ),
    ).toBe(false);
  });

  it("does not emulate VNI numeric modifiers in Telex fallback", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "ra",
        "8",
        "rằng",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
    expect(
      deriveVietnamesePhysicalRewrites(
        "ră",
        "2",
        "rằng",
        "vietnamese",
        "english",
      ),
    ).toBeNull();
  });

  it("distinguishes IME-internal delete from a real Backspace", () => {
    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: "KeyF",
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese_5k",
      }),
    ).toBe(true);

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: "Backspace",
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese_5k",
      }),
    ).toBe(false);

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: false,
        activeKeyCode: "KeyW",
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese_5k",
      }),
    ).toBe(true);

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: null,
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese_5k",
      }),
    ).toBe(false);

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: "Unidentified",
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese_5k",
      }),
    ).toBe(false);

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: "KeyF",
        inputLanguage: "english",
        testLanguage: "english",
      }),
    ).toBe(false);
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

  it("never marks English auto-mode text as Vietnamese provisional", () => {
    expect(
      hasVietnameseImeProvisionalMismatch(
        "cxt",
        "cat",
        "auto",
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

  it("models Windows Chrome + UniKey 4.0 RC2 direct Telex replacement", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "ra",
        "w",
        "rằng",
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toEqual([{ charIndex: 1, from: "a", data: "ă" }]);

    expect(
      deriveVietnamesePhysicalRewrites(
        "răng",
        "f",
        "rằng",
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toEqual([{ charIndex: 1, from: "ă", data: "ằ" }]);
  });

  it("supports uppercase target-aware Telex rewrites", () => {
    expect(
      deriveVietnamesePhysicalRewrites(
        "D",
        "d",
        "Đường",
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toEqual([{ charIndex: 0, from: "D", data: "Đ" }]);
  });

  it("models macOS Chrome + EVKey 3.3.10 composition rewrites", () => {
    expect(
      deriveVietnameseImeRewrites(
        "phe",
        "phé",
        "phép",
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toEqual([{ charIndex: 2, from: "e", data: "é" }]);

    expect(
      deriveVietnameseImeRewrites(
        "nguo",
        "ngươ",
        "người",
        "vietnamese",
        "vietnamese_5k",
      ),
    ).toEqual([
      { charIndex: 2, from: "u", data: "ư" },
      { charIndex: 3, from: "o", data: "ơ" },
    ]);
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
