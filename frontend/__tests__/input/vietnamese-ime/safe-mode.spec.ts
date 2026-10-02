import { afterEach, describe, expect, it } from "vitest";
import { isVietnameseImeSafeModeActive } from "../../../src/ts/input/vietnamese-ime/gate";
import { createVietnameseCommitTransaction } from "../../../src/ts/input/vietnamese-ime/transaction";
import { getAsciiTargetRestore } from "../../../src/ts/input/vietnamese-ime/ascii-guard";
import { isVietnameseImePreviewCharacter } from "../../../src/ts/input/vietnamese-ime/preview";
import {
  hasOnlyVietnameseImeCorrectableMismatches,
  isVietnameseImeCorrectableCharacter,
  isVietnameseImeProvisionalCharacter,
} from "../../../src/ts/input/vietnamese-ime/provisional";
import { Config } from "../../../src/ts/config/store";
import {
  beginVietnameseImeSession,
  clearVietnameseImeDirectPreview,
  getVietnameseImeSession,
  invalidateVietnameseImeSession,
  setVietnameseImeDirectPreview,
} from "../../../src/ts/input/vietnamese-ime/state";

describe("Vietnamese IME Safe Mode gate", () => {
  it("is off by default regardless of language", () => {
    expect(
      isVietnameseImeSafeModeActive({
        mode: "off",
        inputLanguage: "vietnamese",
        testLanguage: "vietnamese",
      }),
    ).toBe(false);
  });

  it("activates native mode only for Vietnamese input", () => {
    expect(
      isVietnameseImeSafeModeActive({
        mode: "native",
        inputLanguage: "vietnamese",
        testLanguage: "english",
      }),
    ).toBe(true);

    expect(
      isVietnameseImeSafeModeActive({
        mode: "native",
        inputLanguage: "auto",
        testLanguage: "vietnamese_1k",
      }),
    ).toBe(true);

    expect(
      isVietnameseImeSafeModeActive({
        mode: "native",
        inputLanguage: "auto",
        testLanguage: "english",
      }),
    ).toBe(false);
  });
});

describe("Vietnamese IME commit transaction", () => {
  it("creates one append transaction", () => {
    expect(
      createVietnameseCommitTransaction({
        wordIndex: 2,
        before: "nguo",
        after: "người",
        source: "composition",
      }),
    ).toEqual({
      wordIndex: 2,
      start: 2,
      deleteCount: 2,
      insertText: "ười",
      before: "nguo",
      after: "người",
      source: "composition",
    });
  });

  it("normalizes committed text to NFC before diffing", () => {
    expect(
      createVietnameseCommitTransaction({
        wordIndex: 0,
        before: "",
        after: "một".normalize("NFD"),
        source: "composition",
      }),
    ).toMatchObject({
      wordIndex: 0,
      start: 0,
      deleteCount: 0,
      insertText: "một",
      after: "một",
    });
  });

  it("returns null when no committed text changed", () => {
    expect(
      createVietnameseCommitTransaction({
        wordIndex: 0,
        before: "commerce",
        after: "commerce",
        source: "composition",
      }),
    ).toBeNull();
  });
});

describe("Vietnamese IME ASCII target guard", () => {
  it.each([
    ["as", "a", "á", "s"],
    ["raw", "ra", "ră", "w"],
    ["book", "bo", "bô", "o"],
    ["commerce", "commerc", "commercê", "e"],
    ["address", "ad", "ađ", "d"],
  ])(
    "restores literal target-compatible ASCII for %s",
    (targetWord, scorerInput, domInput, physicalData) => {
      expect(
        getAsciiTargetRestore({
          scorerInput,
          domInput,
          physicalData,
          targetWord,
        }),
      ).toBe(scorerInput + physicalData);
    },
  );

  it("does not alter a Vietnamese target", () => {
    expect(
      getAsciiTargetRestore({
        scorerInput: "ra",
        domInput: "ră",
        physicalData: "w",
        targetWord: "rằng",
      }),
    ).toBeNull();
  });

  it("does not rescue a physical key that is not the next target character", () => {
    expect(
      getAsciiTargetRestore({
        scorerInput: "com",
        domInput: "côm",
        physicalData: "x",
        targetWord: "commerce",
      }),
    ).toBeNull();
  });
});

describe("Vietnamese IME stale session protection", () => {
  it("invalidates an old session even if text later becomes identical again", () => {
    const first = beginVietnameseImeSession({
      wordIndex: 0,
      committedPrefix: "la",
    });

    invalidateVietnameseImeSession();

    const second = beginVietnameseImeSession({
      wordIndex: 0,
      committedPrefix: "la",
    });

    expect(second.id).not.toBe(first.id);
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(getVietnameseImeSession()).toEqual(second);

    invalidateVietnameseImeSession();
  });
});


describe("Vietnamese IME preview rendering", () => {
  afterEach(() => {
    Config.vietnameseImeMode = "off";
    Config.inputLanguage = "auto";
    Config.language = "english";
    clearVietnameseImeDirectPreview();
  });

  it("recognizes only valid native IME preview forms", () => {
    Config.vietnameseImeMode = "native";
    Config.inputLanguage = "vietnamese";
    Config.language = "vietnamese_5k";
    setVietnameseImeDirectPreview({
      wordIndex: 0,
      scorerPrefix: "",
      domValue: "a",
    });

    expect(isVietnameseImePreviewCharacter("a", "à")).toBe(true);
    expect(isVietnameseImePreviewCharacter("o", "ồ")).toBe(true);
    expect(isVietnameseImePreviewCharacter("ô", "ồ")).toBe(true);
    expect(isVietnameseImePreviewCharacter("d", "đ")).toBe(true);
    expect(isVietnameseImePreviewCharacter("ă", "à")).toBe(false);
    expect(isVietnameseImePreviewCharacter("á", "ằ")).toBe(false);
  });

  it("does not disguise a committed wrong base character as an IME preview", () => {
    Config.vietnameseImeMode = "native";
    Config.inputLanguage = "vietnamese";
    Config.language = "vietnamese_5k";

    clearVietnameseImeDirectPreview();
    expect(isVietnameseImePreviewCharacter("e", "é")).toBe(false);
  });

  it("is disabled when Vietnamese IME safe mode is off", () => {
    Config.vietnameseImeMode = "off";
    Config.inputLanguage = "vietnamese";
    Config.language = "vietnamese_5k";

    expect(isVietnameseImePreviewCharacter("a", "à")).toBe(false);
  });
});


describe("Vietnamese IME provisional characters", () => {
  it.each([
    ["e", "é"],
    ["o", "ô"],
    ["ô", "ồ"],
    ["u", "ư"],
    ["a", "ă"],
    ["d", "đ"],
  ])("accepts %s as a provisional form of %s", (input, target) => {
    expect(isVietnameseImeProvisionalCharacter(input, target)).toBe(true);
  });

  it("allows same-base tone rewrites without calling them provisional", () => {
    expect(isVietnameseImeCorrectableCharacter("á", "à")).toBe(true);
    expect(isVietnameseImeProvisionalCharacter("á", "à")).toBe(false);
  });

  it("rejects unrelated letters as IME-correctable mismatches", () => {
    expect(isVietnameseImeCorrectableCharacter("x", "à")).toBe(false);
    expect(
      hasOnlyVietnameseImeCorrectableMismatches("phx", "phép"),
    ).toBe(false);
  });

  it("recognizes a prefix whose only mismatch can still be rewritten by the IME", () => {
    expect(
      hasOnlyVietnameseImeCorrectableMismatches("phe", "phép "),
    ).toBe(true);
    expect(
      hasOnlyVietnameseImeCorrectableMismatches("lá", "là "),
    ).toBe(true);
  });
});
