import { restartTestEvent } from "../events/test";
import { getSettings } from "../custom/en-vn-translation/store";
import {
  buildSentenceBuilderLayout,
  sentenceBuilderHint,
  validateSentenceBuilderAnswer,
  type SentenceBuilderErrorType,
  type SentenceBuilderExercise,
} from "./sentence-builder";
import { loadSentenceBuilderExercise } from "./sentence-builder-store";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const GAME_ID = "monkeytype";

let exercise: SentenceBuilderExercise | null = null;
let revealedWords = 0;
let hintUsed = false;
let startedAt = 0;
let requestSequence = 0;
let boundPanel: HTMLElement | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function postLearningAttempt(options: {
  entityType: "sentence" | "grammar";
  entityId: string;
  result: "correct" | "wrong";
  responseMs: number;
  userAnswer: string;
  expectedAnswer: string;
  errorType?: SentenceBuilderErrorType;
}): void {
  if (window.parent === window) return;

  requestSequence++;
  window.parent.postMessage(
    {
      type: LEARNING_ATTEMPT_MESSAGE,
      requestId: `monkeytype-sentence-${Date.now().toString(36)}-${requestSequence.toString(36)}`,
      event: {
        version: 1,
        entityType: options.entityType,
        entityId: options.entityId,
        gameId: GAME_ID,
        activityType: "sentence-builder",
        result: options.result,
        occurredAt: new Date().toISOString(),
        responseMs: options.responseMs,
        hintUsed,
        replayUsed: false,
        userAnswer: options.userAnswer,
        expectedAnswer: options.expectedAnswer,
        ...(options.errorType === undefined
          ? {}
          : { errorType: options.errorType }),
      },
    },
    "https://typing-game.local",
  );
}

function setFeedback(
  message: string,
  state: "idle" | "correct" | "wrong" = "idle",
): void {
  const feedback = byId<HTMLElement>("sentenceBuilderFeedback");
  if (feedback === null) return;
  feedback.textContent = message;
  feedback.dataset["state"] = state;
}

function appendUnit(unit: string, button: HTMLButtonElement): void {
  const input = byId<HTMLInputElement>("sentenceBuilderAnswer");
  if (input === null) return;
  const current = input.value.trim();
  input.value = current === "" ? unit : `${current} ${unit}`;
  button.disabled = true;
  input.focus();
}

function bindUnitButtons(): void {
  const units = byId<HTMLElement>("sentenceBuilderUnits");
  if (units === null) return;
  for (const button of units.querySelectorAll<HTMLButtonElement>("button")) {
    button.addEventListener("click", () => {
      const unit = button.dataset["unit"];
      if (unit !== undefined) appendUnit(unit, button);
    });
  }
}

function renderExercise(current: SentenceBuilderExercise): void {
  const prompt = byId<HTMLElement>("sentenceBuilderPrompt");
  const meaning = byId<HTMLElement>("sentenceBuilderMeaning");
  const fixed = byId<HTMLElement>("sentenceBuilderFixedStart");
  const units = byId<HTMLElement>("sentenceBuilderUnits");
  const input = byId<HTMLInputElement>("sentenceBuilderAnswer");
  const grammarButton = byId<HTMLButtonElement>("sentenceBuilderGrammarHint");
  const structureButton = byId<HTMLButtonElement>(
    "sentenceBuilderStructureHint",
  );

  if (
    prompt === null ||
    meaning === null ||
    fixed === null ||
    units === null ||
    input === null ||
    grammarButton === null ||
    structureButton === null
  ) {
    return;
  }

  const layout = buildSentenceBuilderLayout(current);
  prompt.textContent = current.prompt ?? "Build a natural English sentence.";
  meaning.textContent = current.meaning ?? "";
  meaning.classList.toggle("hidden", meaning.textContent === "");
  fixed.textContent =
    layout.fixedStart === "" ? "" : `Start: ${layout.fixedStart}`;
  fixed.classList.toggle("hidden", layout.fixedStart === "");

  units.replaceChildren(
    ...layout.units.map((unit, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["unit"] = unit;
      button.dataset["unitIndex"] = String(index);
      button.textContent = unit;
      return button;
    }),
  );
  units.classList.toggle("hidden", layout.units.length === 0);

  input.value = layout.fixedStart;
  input.placeholder =
    current.difficulty === "extreme"
      ? "Type the complete sentence from memory"
      : "Build or type your answer";
  grammarButton.disabled = (current.grammarHint ?? "") === "";
  structureButton.disabled = false;

  revealedWords = 0;
  hintUsed = false;
  startedAt = performance.now();
  setFeedback("");
  bindUnitButtons();
}

function resetAnswer(): void {
  if (exercise === null) return;
  renderExercise(exercise);
  byId<HTMLInputElement>("sentenceBuilderAnswer")?.focus();
}

function submitAnswer(): void {
  if (exercise === null) return;
  const input = byId<HTMLInputElement>("sentenceBuilderAnswer");
  if (input === null) return;

  const answer = input.value;
  if (answer.trim() === "") {
    setFeedback("Type or build an answer first.", "wrong");
    return;
  }

  const validation = validateSentenceBuilderAnswer(exercise, answer);
  const responseMs = Math.max(0, Math.round(performance.now() - startedAt));
  const result = validation.correct ? "correct" : "wrong";
  const expectedAnswer =
    validation.matchedAnswer ?? (exercise.acceptedAnswers[0] as string);

  postLearningAttempt({
    entityType: "sentence",
    entityId: exercise.sentenceId,
    result,
    responseMs,
    userAnswer: answer,
    expectedAnswer,
    errorType: validation.errorType,
  });

  if (exercise.grammarId !== undefined) {
    postLearningAttempt({
      entityType: "grammar",
      entityId: exercise.grammarId,
      result,
      responseMs,
      userAnswer: answer,
      expectedAnswer,
      errorType: validation.errorType,
    });
  }

  if (validation.correct) {
    setFeedback(
      `Correct · score 100 · accepted answer ${exercise.acceptedAnswers.indexOf(validation.matchedAnswer ?? expectedAnswer) + 1}/${exercise.acceptedAnswers.length}`,
      "correct",
    );
  } else {
    setFeedback(
      `Score 0 · ${validation.errorType ?? "wrong-form"} · try again or use a hint`,
      "wrong",
    );
  }

  startedAt = performance.now();
}

function revealNextWord(): void {
  if (exercise === null) return;
  const hint = byId<HTMLElement>("sentenceBuilderHint");
  if (hint === null) return;

  const next = sentenceBuilderHint(exercise, revealedWords);
  revealedWords = next.nextRevealedWords;
  hintUsed = true;
  hint.textContent = `Next words: ${next.prefix}`;
}

function showGrammarHint(): void {
  if (exercise === null || exercise.grammarHint === undefined) return;
  const hint = byId<HTMLElement>("sentenceBuilderHint");
  if (hint === null) return;
  hintUsed = true;
  hint.textContent = `Grammar: ${exercise.grammarHint}`;
}

function showStructureHint(): void {
  if (exercise === null) return;
  const hint = byId<HTMLElement>("sentenceBuilderHint");
  if (hint === null) return;
  hintUsed = true;
  const canonicalWords = (exercise.acceptedAnswers[0] as string)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  hint.textContent =
    `Structure: ${canonicalWords.length} required units · ${exercise.acceptedAnswers.length} accepted answer${exercise.acceptedAnswers.length === 1 ? "" : "s"}`;
}

function bindPanel(): void {
  const panel = byId<HTMLElement>("sentenceBuilderPanel");
  if (panel === null || panel === boundPanel) return;

  byId<HTMLButtonElement>("sentenceBuilderSubmit")?.addEventListener(
    "click",
    submitAnswer,
  );
  byId<HTMLButtonElement>("sentenceBuilderReset")?.addEventListener(
    "click",
    resetAnswer,
  );
  byId<HTMLButtonElement>("sentenceBuilderReveal")?.addEventListener(
    "click",
    revealNextWord,
  );
  byId<HTMLButtonElement>("sentenceBuilderGrammarHint")?.addEventListener(
    "click",
    showGrammarHint,
  );
  byId<HTMLButtonElement>("sentenceBuilderStructureHint")?.addEventListener(
    "click",
    showStructureHint,
  );
  byId<HTMLInputElement>("sentenceBuilderAnswer")?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        submitAnswer();
      }
    },
  );

  boundPanel = panel;
}

export function syncSentenceBuilderPanel(): void {
  bindPanel();
  const panel = byId<HTMLElement>("sentenceBuilderPanel");
  const typingTest = byId<HTMLElement>("typingTest");
  if (panel === null || typingTest === null) return;

  const active =
    getSettings().learningMode === "sentence-builder";
  panel.classList.toggle("hidden", !active);
  typingTest.classList.toggle("sentence-builder-active", active);

  if (!active) {
    exercise = null;
    return;
  }

  exercise = loadSentenceBuilderExercise();
  if (exercise === null) {
    setFeedback(
      "Open Custom Text settings and create a Sentence Builder exercise.",
      "wrong",
    );
    return;
  }

  renderExercise(exercise);
}

syncSentenceBuilderPanel();
restartTestEvent.subscribe(() => {
  window.setTimeout(syncSentenceBuilderPanel, 0);
});
