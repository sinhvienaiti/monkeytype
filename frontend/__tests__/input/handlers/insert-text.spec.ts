import { describe, it, expect, beforeEach, vi } from "vitest";

// The input element and the event log are the two things delete-on-error
// writes to, and they must agree. The element is faked (mirroring the real
// module, fake leading space included) and the event log is the real one, so
// these tests assert the actual events onInsertText emits.
const inputEl = vi.hoisted(() => ({ value: " " }));

vi.mock("../../../src/ts/input/input-element", () => ({
  getInputElementValue: () => ({
    inputValue: inputEl.value.slice(1),
    realInputValue: inputEl.value,
  }),
  setInputElementValue: (value: string) => {
    inputEl.value = ` ${value}`;
  },
  appendToInputElementValue: (value: string) => {
    inputEl.value += value;
  },
  replaceInputElementLastValueChar: (char: string) => {
    inputEl.value = ` ${inputEl.value.slice(1).slice(0, -1)}${char}`;
  },
  getInputElement: () => null,
  moveInputElementCaretToTheEnd: () => undefined,
  isInputElementFocused: () => true,
  focusInputElement: () => undefined,
  blurInputElement: () => undefined,
}));

const mockState = vi.hoisted(() => ({
  activeWordIndex: 0,
  correctShiftUsed: true as boolean,
  // words that have scrolled off the screen and been removed from the dom
  wordsScrolledOff: new Set<number>(),
}));

const nav = vi.hoisted(() => ({
  goToNextWord: vi.fn(),
  goToPreviousWord: vi.fn(),
}));
vi.mock("../../../src/ts/input/helpers/word-navigation", () => nav);

vi.mock("../../../src/ts/test/test-words", () => {
  type CommitChar = " " | "\n" | "";
  type Word = { text: string; textWithCommit: string; commit: CommitChar };
  const list: Word[] = [];
  return {
    words: {
      list,
      get: (index?: number) => (index === undefined ? [...list] : list[index]),
      getCurrent: () => list[mockState.activeWordIndex],
      push(word: string, _index?: number) {
        let commit: CommitChar = "";
        if (word.endsWith(" ")) {
          commit = " ";
          word = word.slice(0, -1);
        } else if (word.endsWith("\n")) {
          commit = "\n";
          word = word.slice(0, -1);
        }
        list.push({ text: word, textWithCommit: word + commit, commit });
      },
      reset() {
        list.length = 0;
      },
      get length() {
        return list.length;
      },
    },
  };
});

vi.mock("../../../src/ts/states/test", () => ({
  getActiveWordIndex: () => mockState.activeWordIndex,
  isTestActive: () => true,
  isResultCalculating: () => false,
  isTestRestarting: () => false,
  wordsHaveNewline: () => false,
  getCurrentQuote: () => null,
  getBailedOut: () => false,
  getKoreanStatus: () => false,
}));

vi.mock("../../../src/ts/input/state", () => ({
  isCorrectShiftUsed: () => mockState.correctShiftUsed,
  getIncorrectShiftsInARow: () => 0,
  incrementIncorrectShiftsInARow: () => undefined,
  resetIncorrectShiftsInARow: () => undefined,
  isAwaitingNextWord: () => false,
}));

vi.mock("../../../src/ts/test/custom-text", () => ({
  getLimit: () => ({ mode: "words", value: 0 }),
}));

// peripheral collaborators - none of them feed back into the events we assert
vi.mock("../../../src/ts/test/test-ui", () => ({
  afterTestTextInput: vi.fn(),
  // words scrolled off the screen are removed from the dom
  getWordElement: vi.fn((index: number) =>
    mockState.wordsScrolledOff.has(index) ? null : {},
  ),
  pendingWordData: new Map<number, string>(),
}));
vi.mock("../../../src/ts/test/test-logic", () => ({
  startTest: vi.fn(),
  fail: vi.fn(),
  finish: vi.fn(),
  addWord: vi.fn(),
}));
vi.mock("../../../src/ts/test/weak-spot", () => ({ updateScore: vi.fn() }));
vi.mock("../../../src/ts/events/keymap", () => ({ flash: vi.fn() }));
vi.mock("../../../src/ts/states/notifications", () => ({
  showNoticeNotification: vi.fn(),
}));
vi.mock("../../../src/ts/legacy-states/composition", () => ({
  getComposing: () => false,
  getData: () => "",
}));
vi.mock("../../../src/ts/test/words-generator", () => ({
  areAllWordsGenerated: () => true,
}));
vi.mock("../../../src/ts/input/handlers/before-insert-text", () => ({
  onBeforeInsertText: () => false,
}));
vi.mock("../../../src/ts/input/helpers/fail-or-finish", () => ({
  checkIfFailedDueToDifficulty: () => false,
  checkIfFailedDueToMinBurst: () => false,
  checkIfFinished: () => false,
}));

import { onInsertText } from "../../../src/ts/input/handlers/insert-text";
import {
  buildEventLog,
  logTestEvent,
  resetTestEvents,
  getAllTestEvents,
  getInputForWord,
} from "../../../src/ts/test/events/data";
import {
  findInputValueMismatches,
  getEventsForWord,
} from "../../../src/ts/test/events/helpers";
import type { InputEventNoMs } from "../../../src/ts/test/events/types";
import { getAccuracy } from "../../../src/ts/test/events/stats";
import { getLiveCachedAccuracy } from "../../../src/ts/test/events/live-cache";
import { words as TestWords } from "../../../src/ts/test/test-words";
import { __testing } from "../../../src/ts/config/testing";
import { DeleteInputType } from "../../../src/ts/input/helpers/input-type";

const { replaceConfig } = __testing;

function setInput(value: string): void {
  inputEl.value = ` ${value}`;
}
function getInput(): string {
  return inputEl.value.slice(1);
}

// mirrors goToNextWord's observable effects: clear the input, advance the word
nav.goToNextWord.mockImplementation(async () => {
  setInput("");
  mockState.activeWordIndex++;
  return { increasedWordIndex: true, lastBurst: null };
});

// mirrors goToPreviousWord (minus the nospace branch): step back a word and
// restore that word's input, dropping its separator for a single backspace
nav.goToPreviousWord.mockImplementation((inputType: DeleteInputType) => {
  if (mockState.activeWordIndex === 0) {
    setInput("");
    return;
  }
  mockState.activeWordIndex--;
  if (inputType === "deleteWordBackward") {
    setInput("");
    return;
  }
  const word = getInputForWord(mockState.activeWordIndex);
  setInput(
    word.endsWith("\n") || word.endsWith(" ") ? word.slice(0, -1) : word,
  );
});

function pushWords(...words: string[]): void {
  words.forEach((word, i) => {
    TestWords.push(i === words.length - 1 ? word : `${word} `, i);
  });
}

// mirrors emulateInsertText: the character is in the element before the
// handler runs, which is what handleDeleteOnError's length maths relies on
async function type(data: string, now = 1000): Promise<void> {
  inputEl.value += data;
  await onInsertText({ data, now });
}

async function commitComposition(data: string, now = 1000): Promise<void> {
  inputEl.value += data;
  await onInsertText({ data, now, isCompositionEnding: true });
}

function inputEventsForWord(wordIndex: number): InputEventNoMs[] {
  return getEventsForWord(getAllTestEvents(), wordIndex).filter(
    (e): e is InputEventNoMs => e.type === "input",
  );
}

type InsertInputEventData = Extract<
  InputEventNoMs["data"],
  { data: string; correct: boolean }
>;
type InsertInputEventNoMs = Omit<InputEventNoMs, "data"> & {
  data: InsertInputEventData;
};

function insertEventsForWord(wordIndex: number): InsertInputEventNoMs[] {
  return inputEventsForWord(wordIndex).filter(
    (event): event is InsertInputEventNoMs => "correct" in event.data,
  );
}

/** The deletion events only, as `[inputType, charIndex, inputValue]` triples. */
function deletesForWord(
  wordIndex: number,
): [string, number, string | undefined][] {
  return inputEventsForWord(wordIndex)
    .filter((e) => e.data.inputType.startsWith("delete"))
    .map((e) => [e.data.inputType, e.data.charIndex, e.data.inputValue]);
}

describe("onInsertText - delete on error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestEvents();
    TestWords.reset();
    mockState.activeWordIndex = 0;
    mockState.correctShiftUsed = true;
    mockState.wordsScrolledOff.clear();
    setInput("");
    replaceConfig({
      mode: "words",
      language: "english",
      deleteOnError: "letter",
      stopOnError: "off",
      forgiveCorrectedErrors: false,
      difficulty: "normal",
      strictSpace: false,
      oppositeShiftMode: "off",
      keymapMode: "off",
      blindMode: false,
    });
  });

  describe("letter mode", () => {
    it("deletes the incorrect char and the one before it", async () => {
      pushWords("hello", "world");
      await type("h");
      await type("e");
      await type("x");

      expect(deletesForWord(0)).toEqual([
        ["deleteContentBackward", 3, "he"],
        ["deleteContentBackward", 2, "h"],
      ]);
      expect(getInput()).toBe("h");
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    });

    it("deletes only the incorrect char at the start of a word", async () => {
      pushWords("hello", "world");
      await type("x");

      expect(deletesForWord(0)).toEqual([["deleteContentBackward", 1, ""]]);
      expect(getInput()).toBe("");
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    });

    it("does not go back a word without a hard variant", async () => {
      pushWords("hello", "world");
      await type("h");
      await type("e");
      await type("l");
      await type("l");
      await type("o");
      await type(" ");
      expect(mockState.activeWordIndex).toBe(1);

      await type("x");

      expect(nav.goToPreviousWord).not.toHaveBeenCalled();
      expect(mockState.activeWordIndex).toBe(1);
    });

    it("deletes an incorrect separator instead of committing the word", async () => {
      pushWords("hello", "world");
      await type("h");
      await type("e");
      await type(" ");

      expect(nav.goToNextWord).not.toHaveBeenCalled();
      expect(mockState.activeWordIndex).toBe(0);
      expect(deletesForWord(0)).toEqual([
        ["deleteContentBackward", 3, "he"],
        ["deleteContentBackward", 2, "h"],
      ]);
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    });
  });

  describe("word mode", () => {
    beforeEach(() => {
      replaceConfig({ deleteOnError: "word", stopOnError: "off" });
    });

    it("clears the whole word in one event", async () => {
      pushWords("hello", "world");
      await type("h");
      await type("e");
      await type("x");

      expect(deletesForWord(0)).toEqual([["deleteWordBackward", 3, ""]]);
      expect(getInput()).toBe("");
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    });
  });

  describe("hard variants", () => {
    it("letter_hard regresses on a first-char mistake", async () => {
      replaceConfig({ deleteOnError: "letter_hard", stopOnError: "off" });
      pushWords("hello", "world");
      for (const char of "hello ") await type(char);
      expect(mockState.activeWordIndex).toBe(1);

      await type("x");

      expect(nav.goToPreviousWord).toHaveBeenCalledWith(
        "deleteContentBackward",
      );
      expect(mockState.activeWordIndex).toBe(0);
      // the incorrect char is deleted from the word it was typed in...
      expect(deletesForWord(1)).toEqual([["deleteContentBackward", 1, ""]]);
      // ...then the regression lands on the previous word, separator removed
      expect(deletesForWord(0)).toEqual([
        ["deleteContentBackward", 5, "hello"],
      ]);
      expect(getInput()).toBe("hello");
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
      expect(findInputValueMismatches(inputEventsForWord(1))).toEqual([]);
    });

    it("word_hard clears the word it regresses into", async () => {
      replaceConfig({ deleteOnError: "word_hard", stopOnError: "off" });
      pushWords("hello", "world");
      for (const char of "hello ") await type(char);

      await type("x");

      expect(nav.goToPreviousWord).toHaveBeenCalledWith("deleteWordBackward");
      expect(deletesForWord(1)).toEqual([["deleteWordBackward", 1, ""]]);
      // the whole previous word goes too, so the post-navigation length is 0
      expect(deletesForWord(0)).toEqual([["deleteWordBackward", 0, ""]]);
      expect(getInput()).toBe("");
    });

    it("does not regress past the first word", async () => {
      replaceConfig({ deleteOnError: "letter_hard", stopOnError: "off" });
      pushWords("hello", "world");

      await type("x");

      expect(nav.goToPreviousWord).not.toHaveBeenCalled();
      expect(mockState.activeWordIndex).toBe(0);
      expect(deletesForWord(0)).toEqual([["deleteContentBackward", 1, ""]]);
    });

    it("does not regress into a word that scrolled off the screen", async () => {
      replaceConfig({ deleteOnError: "letter_hard", stopOnError: "off" });
      pushWords("hello", "world");
      for (const char of "hello ") await type(char);
      mockState.wordsScrolledOff.add(0);

      await type("x");

      expect(nav.goToPreviousWord).not.toHaveBeenCalled();
      expect(mockState.activeWordIndex).toBe(1);
      expect(deletesForWord(1)).toEqual([["deleteContentBackward", 1, ""]]);
      expect(getInput()).toBe("");
    });

    it("does not regress on a mistake later in the word", async () => {
      replaceConfig({ deleteOnError: "letter_hard", stopOnError: "off" });
      pushWords("hello", "world");
      for (const char of "hello ") await type(char);
      await type("w");

      await type("x");

      expect(nav.goToPreviousWord).not.toHaveBeenCalled();
      expect(mockState.activeWordIndex).toBe(1);
      expect(getInput()).toBe("");
    });
  });

  describe("when it must not fire", () => {
    it("stays quiet on a correct character", async () => {
      pushWords("hello", "world");
      await type("h");

      expect(deletesForWord(0)).toEqual([]);
      expect(getInput()).toBe("h");
    });

    it("stays quiet when the config is off", async () => {
      replaceConfig({ deleteOnError: "off", stopOnError: "off" });
      pushWords("hello", "world");
      await type("x");

      expect(deletesForWord(0)).toEqual([]);
      expect(getInput()).toBe("x");
    });

    it("stays quiet when opposite shift already took the char back", async () => {
      replaceConfig({
        deleteOnError: "letter",
        stopOnError: "off",
        oppositeShiftMode: "on",
      });
      mockState.correctShiftUsed = false;
      pushWords("hello", "world");
      await type("h");

      // the char was removed by the shift check, so there is nothing to delete
      expect(deletesForWord(0)).toEqual([]);
      expect(getInput()).toBe("");
    });
  });

  it("marks its deletions automatic and still counts the mistake", async () => {
    pushWords("hello", "world");
    await type("h");
    await type("x");

    const events = inputEventsForWord(0);
    expect(events.map((e) => e.data.automatic)).toEqual([
      undefined, // h
      undefined, // x - the user typed it, it is only the deletes that are ours
      true,
      true,
    ]);
    // the mistake is still on the record even though the input is gone
    const incorrect = events.filter(
      (e) => "correct" in e.data && !e.data.correct,
    );
    expect(incorrect).toHaveLength(1);
  });
});


describe("onInsertText - forgive corrected errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestEvents();
    TestWords.reset();
    mockState.activeWordIndex = 0;
    mockState.correctShiftUsed = true;
    mockState.wordsScrolledOff.clear();
    setInput("");
    replaceConfig({
      mode: "words",
      language: "english",
      deleteOnError: "off",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: false,
      ignoreRepeatedBlockedErrors: false,
      forgiveCorrectedErrors: true,
      difficulty: "normal",
      strictSpace: false,
      oppositeShiftMode: "off",
      keymapMode: "off",
      blindMode: false,
    });
  });

  it("counts repeated blocked attempts at one character only once", async () => {
    pushWords("hello", "world");

    await type("x");
    await type("y");

    const inserts = insertEventsForWord(0);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.data.correct).toBe(false);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[1]?.data.correct).toBe(false);
    expect(inserts[1]?.data.accuracyIgnored).toBe(true);
  });

  it("forgives the counted error after the blocked character is corrected", async () => {
    pushWords("hello", "world");

    await type("x");
    await type("y");
    await type("h");

    const inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBe(true);
    expect(inserts[1]?.data.accuracyIgnored).toBe(true);
    expect(inserts[2]?.data.correct).toBe(true);
    expect(inserts[2]?.data.accuracyIgnored).toBeUndefined();

    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 0,
      percentage: 100,
    });
  });

  it("treats a blocked word as one accuracy error and forgives it after correction", async () => {
    replaceConfig({ ...__testing.getConfig(), stopOnError: "word" });
    pushWords("hello", "world");

    await type("x");
    await type("y");

    let inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[1]?.data.accuracyIgnored).toBe(true);

    setInput("");
    logTestEvent("input", 1100, {
      inputType: "deleteWordBackward",
      wordIndex: 0,
      charIndex: 2,
      inputValue: "",
    });

    for (const char of "hello") await type(char);

    inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBe(true);
    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("keeps the original Monkeytype accuracy behavior when disabled", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      forgiveCorrectedErrors: false,
    });
    pushWords("hello", "world");

    await type("x");
    await type("y");
    await type("h");

    const inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[1]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[2]?.data.correct).toBe(true);

    expect(getAccuracy(buildEventLog()).incorrect).toBe(2);
  });
});

describe("onInsertText - ignore repeated blocked errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestEvents();
    TestWords.reset();
    mockState.activeWordIndex = 0;
    mockState.correctShiftUsed = true;
    mockState.wordsScrolledOff.clear();
    setInput("");
    replaceConfig({
      mode: "words",
      language: "english",
      deleteOnError: "off",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: false,
      ignoreRepeatedBlockedErrors: true,
      forgiveCorrectedErrors: false,
      difficulty: "normal",
      strictSpace: false,
      oppositeShiftMode: "off",
      keymapMode: "off",
      blindMode: false,
    });
  });

  it("ignores repeated blocked mistakes but keeps the first accuracy penalty", async () => {
    pushWords("hello", "world");

    await type("x");
    await type("y");
    await type("h");

    const inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.correct).toBe(false);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[1]?.data.correct).toBe(false);
    expect(inserts[1]?.data.accuracyIgnored).toBe(true);
    expect(inserts[2]?.data.correct).toBe(true);

    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 1,
      percentage: 50,
    });
  });

  it("keeps the first blocked-word penalty after the word is corrected", async () => {
    replaceConfig({ ...__testing.getConfig(), stopOnError: "word" });
    pushWords("hello", "world");

    await type("x");
    await type("y");

    let inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(inserts[1]?.data.accuracyIgnored).toBe(true);

    setInput("");
    logTestEvent("input", 1100, {
      inputType: "deleteWordBackward",
      wordIndex: 0,
      charIndex: 2,
      inputValue: "",
    });

    for (const char of "hello") await type(char);

    inserts = insertEventsForWord(0);
    expect(inserts[0]?.data.accuracyIgnored).toBeUndefined();
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);
  });
});

describe("onInsertText - keep first wrong letter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestEvents();
    TestWords.reset();
    mockState.activeWordIndex = 0;
    mockState.correctShiftUsed = true;
    mockState.wordsScrolledOff.clear();
    setInput("");
    replaceConfig({
      mode: "words",
      language: "english",
      deleteOnError: "off",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      ignoreRepeatedBlockedErrors: false,
      forgiveCorrectedErrors: false,
      difficulty: "normal",
      strictSpace: false,
      oppositeShiftMode: "off",
      keymapMode: "off",
      blindMode: false,
    });
  });

  it("keeps the first wrong letter and blocks later input until it is deleted", async () => {
    pushWords("modern", "software");

    await type("m");
    await type("a");

    let inserts = insertEventsForWord(0);
    expect(getInput()).toBe("ma");
    expect(inserts).toHaveLength(2);
    expect(inserts[1]?.data.correct).toBe(false);
    expect(inserts[1]?.data.inputStopped).toBeUndefined();

    // Defensive handler guard mirrors the normal before-insert block.
    await type("x");
    inserts = insertEventsForWord(0);
    expect(getInput()).toBe("ma");
    expect(inserts).toHaveLength(2);

    setInput("m");
    logTestEvent("input", 1100, {
      inputType: "deleteContentBackward",
      wordIndex: 0,
      charIndex: 2,
      inputValue: "m",
    });

    await type("o");
    inserts = insertEventsForWord(0);
    expect(getInput()).toBe("mo");
    expect(inserts).toHaveLength(3);
    expect(inserts[2]?.data.correct).toBe(true);
  });
});

describe("onInsertText - Vietnamese IME committed text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestEvents();
    TestWords.reset();
    mockState.activeWordIndex = 0;
    mockState.correctShiftUsed = true;
    mockState.wordsScrolledOff.clear();
    setInput("");
    replaceConfig({
      mode: "words",
      language: "english",
      inputLanguage: "vietnamese",
      deleteOnError: "off",
      stopOnError: "off",
      forgiveCorrectedErrors: false,
      difficulty: "normal",
      strictSpace: false,
      oppositeShiftMode: "off",
      keymapMode: "off",
      blindMode: false,
    });
  });

  it("scores a decomposed ấ commit as one correct committed character", async () => {
    pushWords("ấ", "next");

    await commitComposition("ấ".normalize("NFD"));

    const inserts = insertEventsForWord(0);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.data.data).toBe("ấ");
    expect(inserts[0]?.data.correct).toBe(true);
    expect(inserts[0]?.data.isCompositionEnding).toBe(true);
    expect(getInput()).toBe("ấ");
    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 0,
      percentage: 100,
    });
  });

  it.each(["ộ", "ường", "nghiêng"])(
    "scores a decomposed Vietnamese commit without intermediate penalties: %s",
    async (word) => {
      pushWords(word, "next");

      await commitComposition(word.normalize("NFD"));

      const inserts = insertEventsForWord(0);
      expect(inserts.map((event) => event.data.data)).toEqual(Array.from(word));
      expect(inserts.every((event) => event.data.correct)).toBe(true);
      expect(inserts.filter((event) => !event.data.correct)).toHaveLength(0);
      expect(getInput()).toBe(word);
    },
  );

  it("normalizes a Vietnamese target before comparing committed text", async () => {
    const decomposedTarget = "Việt".normalize("NFD");
    pushWords(decomposedTarget, "next");

    await commitComposition("Việt".normalize("NFD"));

    const inserts = insertEventsForWord(0);
    expect(inserts.map((event) => event.data.data)).toEqual(Array.from("Việt"));
    expect(inserts.every((event) => event.data.correct)).toBe(true);
  });

  it("auto mode enables IME scoring when the selected language is Vietnamese", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "auto",
      language: "vietnamese",
    });
    pushWords("Việt", "next");

    await commitComposition("Việt".normalize("NFD"));

    expect(insertEventsForWord(0).every((event) => event.data.correct)).toBe(
      true,
    );
  });

  it("keeps English mode unchanged instead of silently applying Vietnamese NFC", async () => {
    replaceConfig({ ...__testing.getConfig(), inputLanguage: "english" });
    pushWords("é", "next");

    await commitComposition("é".normalize("NFD"));

    const inserts = insertEventsForWord(0);
    expect(inserts.some((event) => !event.data.correct)).toBe(true);
  });
});
