import { Config } from "../config/store";
import { speakEnglish } from "../custom/en-vn-translation/speech";
import { getSettings } from "../custom/en-vn-translation/store";
import { restartTestEvent } from "../events/test";
import {
  getActiveMonkeyReviewDataset,
  getActiveMonkeyReviewItems,
} from "./review-dataset";
import {
  buildSmartReviewLearningEvent,
  smartReviewHint,
  smartReviewSentenceUnits,
  validateSmartReviewAnswer,
  type SmartReviewPreparedItem,
} from "./smart-review";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const PARENT_ORIGIN = "https://typing-game.local";

let itemIndex = 0;
let revealedCharacters = 0;
let hintUsed = false;
let replayUsed = false;
let attemptRecorded = false;
let startedAt = 0;
let requestSequence = 0;
let boundPanel: HTMLElement | null = null;
let activeRequestId = "";

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function currentItem(): SmartReviewPreparedItem | null {
  return getActiveMonkeyReviewItems()[itemIndex] ?? null;
}

function activityLabel(item: SmartReviewPreparedItem): string {
  if (item.activity === "remember") return "Recall";
  if (item.activity === "spelling") return "Spelling";
  if (item.activity === "listening") return "Listening";
  if (item.activity === "grammar") return "Grammar";
  return "Sentence Builder";
}

function setFeedback(
  message: string,
  state: "idle" | "correct" | "wrong" = "idle",
): void {
  const feedback = byId<HTMLElement>("smartReviewFeedback");
  if (feedback === null) return;
  feedback.textContent = message;
  feedback.dataset["state"] = state;
}

function postAttempt(
  event: ReturnType<typeof buildSmartReviewLearningEvent>,
): void {
  if (window.parent === window) return;

  requestSequence++;
  window.parent.postMessage(
    {
      type: LEARNING_ATTEMPT_MESSAGE,
      requestId: `monkeytype-smart-review-${Date.now().toString(36)}-${requestSequence.toString(36)}`,
      event,
    },
    PARENT_ORIGIN,
  );
}

function appendSentenceUnit(unit: string, button: HTMLButtonElement): void {
  const input = byId<HTMLInputElement>("smartReviewAnswer");
  if (input === null || attemptRecorded) return;
  const current = input.value.trim();
  input.value = current === "" ? unit : `${current} ${unit}`;
  button.disabled = true;
  input.focus();
}

function renderUnits(item: SmartReviewPreparedItem): void {
  const units = byId<HTMLElement>("smartReviewUnits");
  if (units === null) return;

  const values = smartReviewSentenceUnits(item);
  units.replaceChildren(
    ...values.map((unit, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset["unitIndex"] = String(index);
      button.textContent = unit;
      button.addEventListener("click", () => appendSentenceUnit(unit, button));
      return button;
    }),
  );
  units.classList.toggle("hidden", values.length === 0);
}

function speakCurrent(item: SmartReviewPreparedItem, explicitReplay: boolean): void {
  if (item.activity !== "listening") return;
  const expected = item.expectedAnswers[0];
  if (expected === undefined) return;
  if (explicitReplay) replayUsed = true;
  speakEnglish(expected, getSettings());
}

function renderCurrent(): void {
  const dataset = getActiveMonkeyReviewDataset();
  const items = getActiveMonkeyReviewItems();
  const item = currentItem();

  const progress = byId<HTMLElement>("smartReviewProgress");
  const goal = byId<HTMLElement>("smartReviewGoal");
  const type = byId<HTMLElement>("smartReviewType");
  const prompt = byId<HTMLElement>("smartReviewPrompt");
  const secondary = byId<HTMLElement>("smartReviewSecondary");
  const metrics = byId<HTMLElement>("smartReviewMetrics");
  const input = byId<HTMLInputElement>("smartReviewAnswer");
  const hint = byId<HTMLElement>("smartReviewHint");
  const replay = byId<HTMLButtonElement>("smartReviewReplay");
  const reveal = byId<HTMLButtonElement>("smartReviewReveal");
  const submit = byId<HTMLButtonElement>("smartReviewSubmit");
  const next = byId<HTMLButtonElement>("smartReviewNext");

  if (
    dataset === null ||
    item === null ||
    progress === null ||
    goal === null ||
    type === null ||
    prompt === null ||
    secondary === null ||
    metrics === null ||
    input === null ||
    hint === null ||
    replay === null ||
    reveal === null ||
    submit === null ||
    next === null
  ) {
    return;
  }

  progress.textContent = `${itemIndex + 1} / ${items.length}`;
  goal.textContent = dataset.goal.replaceAll("-", " ");
  type.textContent = activityLabel(item);
  prompt.textContent = item.prompt;
  secondary.textContent = item.secondary;
  secondary.classList.toggle("hidden", item.secondary === "");

  const metricParts: string[] = [];
  if (typeof item.source.mastery === "number") {
    metricParts.push(`${Math.round(item.source.mastery)}% mastery`);
  }
  if (typeof item.source.reviewPriority === "number") {
    metricParts.push(`priority ${Math.round(item.source.reviewPriority)}`);
  }
  metrics.textContent = metricParts.join(" · ");
  metrics.classList.toggle("hidden", metricParts.length === 0);

  input.value = "";
  input.disabled = false;
  input.placeholder =
    item.activity === "sentence-building"
      ? "Build or type your answer"
      : "Type your answer";

  replay.hidden = item.activity !== "listening";
  reveal.disabled = false;
  submit.disabled = false;
  next.disabled = true;
  hint.textContent = "";
  setFeedback("");
  renderUnits(item);

  revealedCharacters = 0;
  hintUsed = false;
  replayUsed = false;
  attemptRecorded = false;
  startedAt = performance.now();
  input.focus();

  if (item.activity === "listening") {
    window.setTimeout(() => speakCurrent(item, false), 80);
  }
}

function submitAnswer(): void {
  const item = currentItem();
  const input = byId<HTMLInputElement>("smartReviewAnswer");
  const submit = byId<HTMLButtonElement>("smartReviewSubmit");
  const next = byId<HTMLButtonElement>("smartReviewNext");
  const units = byId<HTMLElement>("smartReviewUnits");

  if (
    item === null ||
    input === null ||
    submit === null ||
    next === null ||
    attemptRecorded
  ) {
    return;
  }

  const answer = input.value;
  if (answer.trim() === "") {
    setFeedback("Type or build an answer first.", "wrong");
    return;
  }

  const validation = validateSmartReviewAnswer(item, answer);
  const responseMs = Math.max(0, Math.round(performance.now() - startedAt));
  postAttempt(
    buildSmartReviewLearningEvent({
      item,
      answer,
      validation,
      responseMs,
      hintUsed,
      replayUsed,
    }),
  );

  attemptRecorded = true;
  input.disabled = true;
  submit.disabled = true;
  next.disabled = false;
  if (units !== null) {
    for (const button of units.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = true;
    }
  }

  if (validation.correct) {
    setFeedback("Correct · Smart Review attempt recorded.", "correct");
  } else {
    const expected = item.expectedAnswers[0] ?? "";
    const reason =
      validation.errorType === undefined ? "" : ` · ${validation.errorType}`;
    setFeedback(`Needs review${reason} · expected: ${expected}`, "wrong");
  }
}

function revealHint(): void {
  const item = currentItem();
  const hint = byId<HTMLElement>("smartReviewHint");
  if (item === null || hint === null || attemptRecorded) return;

  const next = smartReviewHint(item, revealedCharacters);
  revealedCharacters = next.nextRevealedCharacters;
  hintUsed = true;
  const targetLength = Array.from(item.expectedAnswers[0] ?? "").length;
  hint.textContent =
    revealedCharacters >= targetLength
      ? `Revealed: ${next.revealed}`
      : `Starts with: ${next.revealed}…`;
}

function nextItem(): void {
  if (!attemptRecorded) return;
  const items = getActiveMonkeyReviewItems();

  if (itemIndex + 1 >= items.length) {
    const input = byId<HTMLInputElement>("smartReviewAnswer");
    const next = byId<HTMLButtonElement>("smartReviewNext");
    const reveal = byId<HTMLButtonElement>("smartReviewReveal");
    const replay = byId<HTMLButtonElement>("smartReviewReplay");
    if (input !== null) input.disabled = true;
    if (next !== null) next.disabled = true;
    if (reveal !== null) reveal.disabled = true;
    if (replay !== null) replay.disabled = true;
    setFeedback(
      `Smart Review complete · ${items.length} item${items.length === 1 ? "" : "s"} reviewed.`,
      "correct",
    );
    return;
  }

  itemIndex++;
  renderCurrent();
}

function bindPanel(): void {
  const panel = byId<HTMLElement>("smartReviewPanel");
  if (panel === null || panel === boundPanel) return;

  byId<HTMLButtonElement>("smartReviewSubmit")?.addEventListener(
    "click",
    submitAnswer,
  );
  byId<HTMLButtonElement>("smartReviewNext")?.addEventListener(
    "click",
    nextItem,
  );
  byId<HTMLButtonElement>("smartReviewReveal")?.addEventListener(
    "click",
    revealHint,
  );
  byId<HTMLButtonElement>("smartReviewReplay")?.addEventListener("click", () => {
    const item = currentItem();
    if (item !== null) speakCurrent(item, true);
  });
  byId<HTMLInputElement>("smartReviewAnswer")?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        if (attemptRecorded) nextItem();
        else submitAnswer();
      }
    },
  );

  boundPanel = panel;
}

export function syncSmartReviewPanel(): void {
  bindPanel();

  const panel = byId<HTMLElement>("smartReviewPanel");
  const typingTest = byId<HTMLElement>("typingTest");
  if (panel === null || typingTest === null) return;

  const dataset = getActiveMonkeyReviewDataset();
  const active =
    Config.mode === "custom" &&
    getSettings().learningMode === "smart-review" &&
    dataset !== null &&
    getActiveMonkeyReviewItems().length > 0;

  panel.classList.toggle("hidden", !active);
  typingTest.classList.toggle("smart-review-active", active);

  if (!active || dataset === null) {
    activeRequestId = "";
    itemIndex = 0;
    return;
  }

  if (activeRequestId !== dataset.requestId) {
    activeRequestId = dataset.requestId;
    itemIndex = 0;
  }
  renderCurrent();
}

syncSmartReviewPanel();
restartTestEvent.subscribe(() => {
  window.setTimeout(syncSmartReviewPanel, 0);
});
