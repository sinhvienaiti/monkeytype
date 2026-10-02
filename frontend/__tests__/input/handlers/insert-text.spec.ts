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

const mockImeState = vi.hoisted(() => ({
  composing: false,
  data: "",
  compositionText: "",
  lastInsertCompositionTextData: "",
  revision: 0,
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
  setCompositionText: (value: string) => {
    mockImeState.compositionText = value;
  },
}));

vi.mock("../../../src/ts/input/state", () => ({
  isCorrectShiftUsed: () => mockState.correctShiftUsed,
  getIncorrectShiftsInARow: () => 0,
  incrementIncorrectShiftsInARow: () => undefined,
  resetIncorrectShiftsInARow: () => undefined,
  isAwaitingNextWord: () => false,
  getLastInsertCompositionTextData: () =>
    mockImeState.lastInsertCompositionTextData,
  setLastInsertCompositionTextData: (value: string) => {
    mockImeState.lastInsertCompositionTextData = value;
  },
  setPendingVietnameseCompositionSeparator: () => undefined,
  setActivePhysicalKeyCode: () => undefined,
}));

vi.mock("../../../src/ts/test/custom-text", () => ({
  getLimit: () => ({ mode: "words", value: 0 }),
}));

// peripheral collaborators - none of them feed back into the events we assert
vi.mock("../../../src/ts/test/test-ui", () => ({
  afterTestTextInput: vi.fn(),
  afterTestDelete: vi.fn(),
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
  getComposing: () => mockImeState.composing,
  setComposing: (value: boolean) => {
    mockImeState.composing = value;
  },
  getData: () => mockImeState.data,
  setData: (value: string) => {
    mockImeState.data = value;
  },
  getRevision: () => mockImeState.revision,
  invalidate: () => {
    mockImeState.composing = false;
    mockImeState.data = "";
    mockImeState.revision++;
  },
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
import { onDelete } from "../../../src/ts/input/handlers/delete";
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

async function commitNativeDomRewrite(
  physicalData: string,
  domValue: string,
  now = 1000,
): Promise<void> {
  setInput(domValue);
  await onInsertText({ data: physicalData, now });
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
    mockImeState.composing = false;
    mockImeState.data = "";
    mockImeState.compositionText = "";
    mockImeState.lastInsertCompositionTextData = "";
    mockImeState.revision = 0;
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
      vietnameseImeMode: "native",
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

  it("scores a committed Vietnamese base mismatch as a real error", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("phép", "next");

    await type("p", 1000);
    await type("h", 1001);
    await type("e", 1002);

    expect(getInput()).toBe("ph");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);
    expect(insertEventsForWord(0).at(-1)?.data.correct).toBe(false);
  });

  it("reconciles the real UniKey phe + s -> phé sequence", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("phép", "next");

    await type("p", 1000);
    await type("h", 1001);

    // The intermediate "e" exists only in the browser IME preview. Monkeytype
    // receives the committed DOM rewrite when the IME commits "é".
    setInput("phé");
    await onInsertText({ data: "s", now: 1010 });

    expect(getInput()).toBe("phé");
    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 3,
      incorrect: 0,
      percentage: 100,
    });

    const last = insertEventsForWord(0).at(-1);
    expect(last?.data.data).toBe("é");
    expect(last?.data.charIndex).toBe(2);
    expect(last?.data.replacesChar).toBe(true);
    expect(last?.data.correct).toBe(true);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("scores a composition commit without exposing its preview text", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("phép", "next");

    await type("p", 1000);
    await type("h", 1001);
    await commitComposition("é", 1010);

    expect(getInput()).toBe("phé");
    expect(getAccuracy(buildEventLog()).percentage).toBe(100);
    expect(insertEventsForWord(0).at(-1)?.data.isCompositionEnding).toBe(true);
  });

  it("scores only the final commit for a multi-stage Vietnamese composition", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("ồ", "next");

    await commitComposition("ồ", 1020);

    expect(getInput()).toBe("ồ");
    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 0,
      percentage: 100,
    });
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("does not score transient Telex stages while typing rằng", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("rằng", "next");

    await commitComposition("rằng", 1005);

    expect(getInput()).toBe("rằng");
    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("accepts the final IME result regardless of Telex key order", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("ằ", "next");

    await commitComposition("ằ", 1002);

    expect(getInput()).toBe("ằ");
    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("restores Telex conversion after IME context is lost", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là", "next");

    await type("l", 1000);

    // After IME context is rebuilt, only the final committed Unicode reaches
    // the scorer.
    await commitComposition("à", 1010);

    expect(getInput()).toBe("là");
    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("blocks further text after an incomplete Vietnamese word is committed", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là", "cơ");

    await type("l", 1000);
    await type("a", 1001);
    await type(" ", 1002);

    expect(getInput()).toBe("la");
    const countAfterBlockedSpace = insertEventsForWord(0).length;

    // Further input must stay blocked until the wrong separator is deleted.
    await type("c", 1003);
    await type("o", 1004);

    expect(getInput()).toBe("la");
    expect(insertEventsForWord(0)).toHaveLength(countAfterBlockedSpace);
    expect(mockState.activeWordIndex).toBe(0);
  });

  it.each([
    ["người", "nguowif"],
    ["đường", "dduowngf"],
    ["tiếng", "tieengs"],
  ])(
    "scores common Vietnamese IME committed words without false errors: %s",
    async (word, _keys) => {
      replaceConfig({
        ...__testing.getConfig(),
        stopOnError: "letter",
        stopOnErrorKeepFirstError: true,
        inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      });
      pushWords(word, "next");

      await commitComposition(word, 1000);

      expect(getInput()).toBe(word);
      expect(getLiveCachedAccuracy()).toBe(100);
      expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    },
  );

  it("keeps English auto mode byte-for-byte literal for Telex-looking keys", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      language: "english",
      inputLanguage: "auto",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
    });
    pushWords("raw", "software", "next");

    for (const [i, char] of Array.from("raw software").entries()) {
      await type(char, 1000 + i);
    }

    expect(mockState.activeWordIndex).toBe(1);
    expect(getInput()).toBe("software");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(
      [...insertEventsForWord(0), ...insertEventsForWord(1)].some(
        (event) => event.data.replacesChar === true,
      ),
    ).toBe(false);
  });

  it("preserves literal English letters inside Vietnamese mode when the IME rewrites them", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      language: "vietnamese_5k",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("address", "next");

    await type("a", 1000);
    await type("d", 1001);
    expect(getInput()).toBe("ad");

    // Simulate a browser-side UniKey rewrite of the first d when the second d
    // is pressed. The target is English literal "dd", so scorer/DOM must be
    // restored to the target prefix instead of accepting "đ".
    setInput("ađ");
    await onInsertText({ data: "d", now: 1002 });

    expect(getInput()).toBe("add");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("keeps mixed English Telex-looking words literal in Vietnamese mode", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      language: "vietnamese_5k",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("raw", "software", "next");

    for (const [i, char] of Array.from("raw software").entries()) {
      await type(char, 1000 + i);
    }

    expect(mockState.activeWordIndex).toBe(1);
    expect(getInput()).toBe("software");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it.each([
    ["as", "a", "á", "s"],
    ["raw", "ra", "ră", "w"],
    ["book", "bo", "bô", "o"],
  ])(
    "restores a literal English target after an incompatible Telex DOM rewrite: %s",
    async (word, prefix, rewrittenDom, physicalKey) => {
      replaceConfig({
        ...__testing.getConfig(),
        language: "vietnamese_5k",
        inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
        stopOnError: "letter",
        stopOnErrorKeepFirstError: true,
      });
      pushWords(word, "next");

      for (const [i, char] of Array.from(prefix).entries()) {
        await type(char, 1100 + i);
      }

      setInput(rewrittenDom);
      await onInsertText({ data: physicalKey, now: 1200 });

      expect(getInput()).toBe(prefix + physicalKey);
      expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
      expect(insertEventsForWord(0).at(-1)?.data.replacesChar).toBeUndefined();
    },
  );

  it.each(["off", "word", "letter"] as const)(
    "keeps a correct Vietnamese Telex sequence clean with stop on error=%s",
    async (stopOnError) => {
      replaceConfig({
        ...__testing.getConfig(),
        language: "vietnamese_5k",
        inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
        stopOnError,
        stopOnErrorKeepFirstError: true,
      });
      pushWords("đường", "next");

      await commitComposition("đường", 1300);

      expect(getInput()).toBe("đường");
      expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
      expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
    },
  );

  it("does not trigger delete-on-error for a valid Vietnamese provisional character", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      language: "vietnamese_5k",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "off",
      deleteOnError: "letter",
    });
    pushWords("là", "next");

    await type("l", 1400);
    await commitNativeDomRewrite("f", "là", 1402);

    expect(getInput()).toBe("là");
    expect(deletesForWord(0)).toEqual([]);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);

    expect(getInput()).toBe("là");
    expect(deletesForWord(0)).toEqual([]);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("counts an unresolved Vietnamese provisional as an error on word commit", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "off",
      deleteOnError: "off",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là", "next");

    await type("l", 1000);
    await type("a", 1001);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);

    await type(" ", 1002);

    expect(mockState.activeWordIndex).toBe(1);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);
    expect(getLiveCachedAccuracy()).toBeLessThan(100);
  });

  it("keeps a last-word provisional accent clean until the final modifier", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      quickEnd: true,
      stopOnError: "off",
      deleteOnError: "off",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là");

    await type("l", 1000);
    await commitNativeDomRewrite("f", "là", 1002);
    expect(getLiveCachedAccuracy()).toBe(100);

    expect(getInput()).toBe("là");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("accepts a browser-transformed direct append such as w -> ư", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("ư", "next");

    setInput("ư");
    await onInsertText({ data: "w", now: 1000 });

    expect(getInput()).toBe("ư");
    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 0,
      percentage: 100,
    });
  });

  it("resets stale Vietnamese composition state after Backspace", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là", "next");

    await type("l", 1000);
    await type("a", 1001);
    expect(getInput()).toBe("la");

    // Simulate UniKey/EVKey still owning composition state when the browser
    // applies Backspace.
    mockImeState.composing = true;
    mockImeState.data = "a";
    mockImeState.compositionText = "a";
    mockImeState.lastInsertCompositionTextData = "a";

    setInput("l");
    onDelete("deleteContentBackward", 1010);

    expect(getInput()).toBe("l");
    expect(mockImeState.composing).toBe(false);
    expect(mockImeState.data).toBe("");
    expect(mockImeState.compositionText).toBe("");
    expect(mockImeState.lastInsertCompositionTextData).toBe("");

    await type("a", 1020);
    await commitNativeDomRewrite("f", "là", 1030);

    expect(getInput()).toBe("là");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("can rebuild ư after deleting its provisional u", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("ư", "next");

    await type("u", 1000);
    expect(getInput()).toBe("u");
    expect(getLiveCachedAccuracy()).toBe(100);

    setInput("");
    onDelete("deleteContentBackward", 1010);
    expect(getInput()).toBe("");

    await type("u", 1020);
    await commitNativeDomRewrite("w", "ư", 1030);

    expect(getInput()).toBe("ư");
    expect(getLiveCachedAccuracy()).toBe(100);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("invalidates the IME session revision on every Vietnamese Backspace", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
    });
    pushWords("là", "next");

    await type("l", 1000);
    await type("a", 1001);
    const revisionBeforeDelete = mockImeState.revision;

    setInput("l");
    onDelete("deleteContentBackward", 1010);
    expect(mockImeState.revision).toBe(revisionBeforeDelete + 1);

    setInput("");
    onDelete("deleteContentBackward", 1020);
    expect(mockImeState.revision).toBe(revisionBeforeDelete + 2);
  });

  it("goes back to a Vietnamese previous word, deletes, then resumes Telex cleanly", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("là", "cơ", "next");

    await type("l", 1000);
    await commitNativeDomRewrite("f", "là", 1001);
    await type(" ", 1002);
    expect(mockState.activeWordIndex).toBe(1);

    // Browser Backspace at the empty next word removes Monkeytype's sentinel,
    // which is the signal to navigate back to the previous word.
    inputEl.value = "";
    onDelete("deleteContentBackward", 1010);
    expect(mockState.activeWordIndex).toBe(0);
    expect(getInput()).toBe("là");

    // Delete the composed character, then rebuild it from a clean IME state.
    setInput("l");
    onDelete("deleteContentBackward", 1020);
    await type("a", 1030);
    await commitNativeDomRewrite("f", "là", 1040);

    expect(getInput()).toBe("là");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("resets Vietnamese IME state for Ctrl+Backspace and allows a clean retype", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("người", "next");

    await commitComposition("người", 1000);
    expect(getInput()).toBe("người");

    mockImeState.composing = true;
    mockImeState.data = "ời";
    setInput("");
    onDelete("deleteWordBackward", 1100);

    expect(getInput()).toBe("");
    expect(mockImeState.composing).toBe(false);
    expect(mockImeState.data).toBe("");

    await commitComposition("người", 1200);

    expect(getInput()).toBe("người");
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("handles consecutive Backspaces inside a Vietnamese word before retyping", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("đường", "next");

    await commitComposition("đường", 1000);
    expect(getInput()).toBe("đường");

    setInput("đườn");
    onDelete("deleteContentBackward", 1100);
    setInput("đườ");
    onDelete("deleteContentBackward", 1110);
    setInput("đư");
    onDelete("deleteContentBackward", 1120);
    setInput("đ");
    onDelete("deleteContentBackward", 1130);

    await commitComposition("ường", 1200);

    expect(getInput()).toBe("đường");
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("supports uppercase Vietnamese Telex without false penalties", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("Đường", "next");

    await commitComposition("Đường", 1000);

    expect(getInput()).toBe("Đường");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("does not apply opposite-shift rules to a Telex modifier replacement", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
      oppositeShiftMode: "on",
    });
    pushWords("Đ", "next");

    mockState.correctShiftUsed = true;
    await type("D", 1000);

    // Browser/IME commits D -> Đ. The physical modifier is not scored as the
    // target character itself.
    mockState.correctShiftUsed = false;
    await commitNativeDomRewrite("d", "Đ", 1001);

    expect(getInput()).toBe("Đ");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
  });

  it("treats punctuation as a boundary when a Vietnamese accent is still pending", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
    });
    pushWords("là,", "next");

    await type("l", 1000);
    await type("a", 1001);
    await type(",", 1002);

    expect(getInput()).toBe("la");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);

    // A tone key after the rejected boundary must not reach backwards and
    // silently fix the earlier vowel.
    await type("f", 1003);
    expect(getInput()).toBe("la");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);
  });

  it("types Vietnamese punctuation normally when the accent is completed first", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
    });
    pushWords("là,", "next");

    await type("l", 1000);
    await commitNativeDomRewrite("f", "là", 1001);
    await type(",", 1002);

    expect(getInput()).toBe("là,");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(findInputValueMismatches(inputEventsForWord(0))).toEqual([]);
  });

  it("allows a Telex modifier to correct an already wrong tone without bypassing accuracy rules", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      forgiveCorrectedErrors: false,
    });
    pushWords("là", "next");

    await type("l", 1000);
    await type("á", 1001);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);

    await commitNativeDomRewrite("f", "là", 1002);

    expect(getInput()).toBe("là");
    const accuracy = getAccuracy(buildEventLog());
    expect(accuracy.correct).toBe(2);
    expect(accuracy.incorrect).toBe(1);
    expect(accuracy.percentage).toBeCloseTo(66.67, 2);
  });

  it("forgives a corrected Vietnamese tone only when the option is enabled", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      stopOnError: "letter",
      stopOnErrorKeepFirstError: true,
      forgiveCorrectedErrors: true,
    });
    pushWords("là", "next");

    await type("l", 1000);
    await type("á", 1001);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);

    await commitNativeDomRewrite("f", "là", 1002);

    expect(getInput()).toBe("là");
    expect(getAccuracy(buildEventLog()).incorrect).toBe(0);
    expect(getLiveCachedAccuracy()).toBe(100);
  });

  it("still penalizes a real Backspace correction when forgiveness is disabled", async () => {
    replaceConfig({
      ...__testing.getConfig(),
      inputLanguage: "vietnamese",
      vietnameseImeMode: "native",
      forgiveCorrectedErrors: false,
      stopOnError: "off",
    });
    pushWords("à", "next");

    // x is a genuine mistake, not a Vietnamese base form.
    await type("x", 1000);
    expect(getAccuracy(buildEventLog()).incorrect).toBe(1);

    setInput("");
    onDelete("deleteContentBackward", 1010);
    await type("à", 1020);

    expect(getAccuracy(buildEventLog())).toEqual({
      correct: 1,
      incorrect: 1,
      percentage: 50,
    });
  });

});
