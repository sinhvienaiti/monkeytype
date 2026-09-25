import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deriveCompositionCommit,
  getCommitCharacterType,
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
