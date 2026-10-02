import { describe, expect, it } from "vitest";
import { isVietnameseImeSafeModeActive } from "../../../src/ts/input/vietnamese-ime/gate";
import { createVietnameseCommitTransaction } from "../../../src/ts/input/vietnamese-ime/transaction";

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
