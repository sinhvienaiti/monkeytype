import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCommitCharacterType,
  normalizeCommittedText,
  normalizeTargetText,
  shouldDeferVietnameseCompositionSeparator,
  shouldIgnoreVietnameseImeDelete,
  shouldUseVietnameseIme,
  splitCommittedText,
} from "../../../src/ts/input/helpers/util";
import * as FunboxList from "../../../src/ts/test/funbox/list";
import { Config } from "../../../src/ts/config/store";

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
  beforeEach(() => {
    Config.vietnameseImeMode = "native";
  });

  afterEach(() => {
    Config.vietnameseImeMode = "off";
  });

  it("keeps Vietnamese handling disabled while safe mode is off", () => {
    Config.vietnameseImeMode = "off";
    expect(shouldUseVietnameseIme("vietnamese", "vietnamese")).toBe(false);
  });

  it("uses explicit Vietnamese input regardless of test language", () => {
    expect(shouldUseVietnameseIme("vietnamese", "english")).toBe(true);
  });

  it("uses auto mode only for Vietnamese test languages", () => {
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

  it("splits committed text by Unicode code point", () => {
    expect(splitCommittedText("ường")).toEqual(["ư", "ờ", "n", "g"]);
  });

  it("defers a separator only during active Vietnamese composition", () => {
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

  it("distinguishes IME-internal delete from real Backspace intent", () => {
    const base = {
      inputType: "deleteContentBackward",
      inputLanguage: "vietnamese",
      testLanguage: "vietnamese_5k",
    } as const;

    expect(
      shouldIgnoreVietnameseImeDelete({
        ...base,
        isComposing: true,
        activeKeyCode: "KeyF",
        hasBackspaceIntent: false,
      }),
    ).toBe(true);

    for (const activeKeyCode of [null, "Unidentified", "KeyQ"]) {
      expect(
        shouldIgnoreVietnameseImeDelete({
          ...base,
          isComposing: true,
          activeKeyCode,
          hasBackspaceIntent: false,
        }),
      ).toBe(true);
    }

    expect(
      shouldIgnoreVietnameseImeDelete({
        ...base,
        isComposing: true,
        activeKeyCode: null,
        hasBackspaceIntent: true,
      }),
    ).toBe(false);
    expect(
      shouldIgnoreVietnameseImeDelete({
        ...base,
        isComposing: true,
        activeKeyCode: "Backspace",
        hasBackspaceIntent: false,
      }),
    ).toBe(false);
    for (const activeKeyCode of [
      "KeyW",
      "KeyO",
      "KeyS",
      "Digit1",
      "Digit6",
      "Digit9",
      "Numpad1",
    ]) {
      expect(
        shouldIgnoreVietnameseImeDelete({
          ...base,
          isComposing: false,
          activeKeyCode,
          hasBackspaceIntent: false,
        }),
      ).toBe(true);
    }

    for (const activeKeyCode of [null, "Unidentified"]) {
      expect(
        shouldIgnoreVietnameseImeDelete({
          ...base,
          isComposing: false,
          activeKeyCode,
          hasBackspaceIntent: false,
        }),
      ).toBe(false);
    }

    expect(
      shouldIgnoreVietnameseImeDelete({
        inputType: "deleteContentBackward",
        isComposing: true,
        activeKeyCode: "KeyF",
        hasBackspaceIntent: false,
        inputLanguage: "english",
        testLanguage: "english",
      }),
    ).toBe(false);
  });
});
