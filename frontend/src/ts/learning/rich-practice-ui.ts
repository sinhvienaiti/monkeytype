import { Config } from "../config/store";
import { speakEnglish } from "../custom/en-vn-translation/speech";
import {
  getSettings,
  isRichPracticeLearningMode,
  type RichPracticeLearningMode,
} from "../custom/en-vn-translation/store";
import {
  loadTypingTextIndex,
  loadTypingTextSettings,
} from "../custom/typing-text-library";
import { restartTestEvent } from "../events/test";
import {
  buildRichPracticeLearningEvents,
  prepareRichPracticeItems,
  richPracticeHint,
  validateRichPracticeAnswer,
  type RichPracticeExerciseItem,
  type RichPracticeItem,
} from "./rich-practice";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const PARENT_ORIGIN = "https://typing-game.local";

let items: RichPracticeItem[] = [];
let itemIndex = 0;
let revealedCharacters = 0;
let hintUsed = false;
let replayUsed = false;
let attemptRecorded = false;
let startedAt = 0;
let requestSequence = 0;
let loadGeneration = 0;
let boundPanel: HTMLElement | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function currentItem(): RichPracticeItem | null {
  return items[itemIndex] ?? null;
}

function modeLabel(mode: RichPracticeLearningMode): string {
  if (mode === "grammar-lesson") return "Grammar lesson";
  if (mode === "translation") return "Translation";
  if (mode === "correction") return "Error correction";
  if (mode === "transformation") return "Sentence transformation";
  return "Sentence listening";
}

function setFeedback(
  message: string,
  state: "idle" | "correct" | "wrong" = "idle",
): void {
  const feedback = byId<HTMLElement>("richPracticeFeedback");
  if (feedback === null) return;
  feedback.textContent = message;
  feedback.dataset["state"] = state;
}

function postAttempts(
  events: ReturnType<typeof buildRichPracticeLearningEvents>,
): void {
  if (window.parent === window) return;

  for (const event of events) {
    requestSequence++;
    window.parent.postMessage(
      {
        type: LEARNING_ATTEMPT_MESSAGE,
        requestId: `monkeytype-rich-${Date.now().toString(36)}-${requestSequence.toString(36)}`,
        event,
      },
      PARENT_ORIGIN,
    );
  }
}

function setDetails(lines: readonly string[]): void {
  const details = byId<HTMLElement>("richPracticeDetails");
  if (details === null) return;
  details.textContent = lines.filter(Boolean).join("\n");
  details.style.whiteSpace = "pre-line";
  details.classList.toggle("hidden", details.textContent === "");
}

function speakExercise(
  item: RichPracticeExerciseItem,
  explicitReplay: boolean,
): void {
  if (item.mode !== "sentence-listening") return;
  const expected = item.acceptedAnswers[0];
  if (expected === undefined) return;
  if (explicitReplay) replayUsed = true;
  speakEnglish(expected, getSettings());
}

function renderEmpty(mode: RichPracticeLearningMode): void {
  const type = byId<HTMLElement>("richPracticeType");
  const goal = byId<HTMLElement>("richPracticeGoal");
  const progress = byId<HTMLElement>("richPracticeProgress");
  const prompt = byId<HTMLElement>("richPracticePrompt");
  const secondary = byId<HTMLElement>("richPracticeSecondary");
  const input = byId<HTMLInputElement>("richPracticeAnswer");
  const replay = byId<HTMLButtonElement>("richPracticeReplay");
  const reveal = byId<HTMLButtonElement>("richPracticeReveal");
  const submit = byId<HTMLButtonElement>("richPracticeSubmit");
  const next = byId<HTMLButtonElement>("richPracticeNext");
  if (
    type === null ||
    goal === null ||
    progress === null ||
    prompt === null ||
    secondary === null ||
    input === null ||
    replay === null ||
    reveal === null ||
    submit === null ||
    next === null
  ) {
    return;
  }

  type.textContent = modeLabel(mode);
  goal.textContent = "reviewed content only";
  progress.textContent = "0 / 0";
  prompt.textContent =
    "No reviewed/published content is available for this CEFR level yet.";
  secondary.textContent =
    "The mode is ready and will activate automatically after content passes the publication gate.";
  secondary.classList.remove("hidden");
  setDetails([]);
  input.classList.add("hidden");
  replay.hidden = true;
  reveal.hidden = true;
  submit.hidden = true;
  next.disabled = true;
  setFeedback("");
}

function renderCurrent(): void {
  const item = currentItem();
  const settings = getSettings();
  if (!isRichPracticeLearningMode(settings.learningMode)) return;

  if (item === null) {
    renderEmpty(settings.learningMode);
    return;
  }

  const progress = byId<HTMLElement>("richPracticeProgress");
  const goal = byId<HTMLElement>("richPracticeGoal");
  const type = byId<HTMLElement>("richPracticeType");
  const prompt = byId<HTMLElement>("richPracticePrompt");
  const secondary = byId<HTMLElement>("richPracticeSecondary");
  const input = byId<HTMLInputElement>("richPracticeAnswer");
  const hint = byId<HTMLElement>("richPracticeHint");
  const replay = byId<HTMLButtonElement>("richPracticeReplay");
  const reveal = byId<HTMLButtonElement>("richPracticeReveal");
  const submit = byId<HTMLButtonElement>("richPracticeSubmit");
  const next = byId<HTMLButtonElement>("richPracticeNext");

  if (
    progress === null ||
    goal === null ||
    type === null ||
    prompt === null ||
    secondary === null ||
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
  goal.textContent = modeLabel(settings.learningMode);
  hint.textContent = "";
  setFeedback("");
  revealedCharacters = 0;
  hintUsed = false;
  replayUsed = false;
  attemptRecorded = item.kind === "lesson";
  startedAt = performance.now();

  if (item.kind === "lesson") {
    type.textContent = `Grammar · ${item.cefr}`;
    prompt.textContent = item.title;
    secondary.textContent = item.objective;
    secondary.classList.toggle("hidden", item.objective === "");
    setDetails([
      item.conceptVi,
      item.conceptEn,
      item.formulae.length === 0
        ? ""
        : `Formula: ${item.formulae.join(" · ")}`,
      item.whenToUse.length === 0
        ? ""
        : `Use: ${item.whenToUse.join(" · ")}`,
      item.examples.length === 0
        ? ""
        : `Examples: ${item.examples.join(" · ")}`,
    ]);
    input.classList.add("hidden");
    replay.hidden = true;
    reveal.hidden = true;
    submit.hidden = true;
    next.disabled = false;
    next.textContent = "next lesson";
    return;
  }

  type.textContent = item.title;
  prompt.textContent =
    item.mode === "sentence-listening"
      ? "Listen and type the complete English sentence."
      : item.prompt;
  secondary.textContent = [
    item.cefr ?? "",
    item.id,
  ].filter(Boolean).join(" · ");
  secondary.classList.toggle("hidden", secondary.textContent === "");
  setDetails([]);
  input.classList.remove("hidden");
  input.value = "";
  input.disabled = false;
  input.placeholder =
    item.mode === "correction"
      ? "Type the corrected sentence"
      : "Type your answer";
  replay.hidden = item.mode !== "sentence-listening";
  replay.disabled = false;
  reveal.hidden = false;
  reveal.disabled = false;
  submit.hidden = false;
  submit.disabled = false;
  next.disabled = true;
  next.textContent = "next";
  input.focus();

  if (item.mode === "sentence-listening") {
    window.setTimeout(() => speakExercise(item, false), 80);
  }
}

function submitAnswer(): void {
  const item = currentItem();
  const input = byId<HTMLInputElement>("richPracticeAnswer");
  const submit = byId<HTMLButtonElement>("richPracticeSubmit");
  const next = byId<HTMLButtonElement>("richPracticeNext");
  if (
    item?.kind !== "exercise" ||
    input === null ||
    submit === null ||
    next === null ||
    attemptRecorded
  ) {
    return;
  }

  const answer = input.value;
  if (answer.trim() === "") {
    setFeedback("Type an answer first.", "wrong");
    return;
  }

  const validation = validateRichPracticeAnswer(item, answer);
  postAttempts(
    buildRichPracticeLearningEvents({
      item,
      answer,
      validation,
      responseMs: performance.now() - startedAt,
      hintUsed,
      replayUsed,
    }),
  );

  attemptRecorded = true;
  input.disabled = true;
  submit.disabled = true;
  next.disabled = false;
  if (validation.correct) {
    setFeedback("Correct · learning attempt recorded.", "correct");
  } else {
    const expected = item.acceptedAnswers[0] ?? "";
    setFeedback(
      `${validation.errorType ?? "needs-review"} · expected: ${expected}`,
      "wrong",
    );
  }
}

function revealHint(): void {
  const item = currentItem();
  const hint = byId<HTMLElement>("richPracticeHint");
  if (
    item?.kind !== "exercise" ||
    hint === null ||
    attemptRecorded
  ) {
    return;
  }

  const next = richPracticeHint(item, revealedCharacters);
  revealedCharacters = next.nextRevealedCharacters;
  hintUsed = true;
  const targetLength = Array.from(item.acceptedAnswers[0] ?? "").length;
  hint.textContent =
    revealedCharacters >= targetLength
      ? `Revealed: ${next.revealed}`
      : `Starts with: ${next.revealed}…`;
}

function nextItem(): void {
  const item = currentItem();
  if (item === null) return;
  if (item.kind === "exercise" && !attemptRecorded) return;

  if (itemIndex + 1 >= items.length) {
    const next = byId<HTMLButtonElement>("richPracticeNext");
    const reveal = byId<HTMLButtonElement>("richPracticeReveal");
    const replay = byId<HTMLButtonElement>("richPracticeReplay");
    if (next !== null) next.disabled = true;
    if (reveal !== null) reveal.disabled = true;
    if (replay !== null) replay.disabled = true;
    setFeedback(
      `Session complete · ${items.length} item${items.length === 1 ? "" : "s"} reviewed.`,
      "correct",
    );
    return;
  }

  itemIndex++;
  renderCurrent();
}

function bindPanel(): void {
  const panel = byId<HTMLElement>("richPracticePanel");
  if (panel === null || panel === boundPanel) return;

  byId<HTMLButtonElement>("richPracticeSubmit")?.addEventListener(
    "click",
    submitAnswer,
  );
  byId<HTMLButtonElement>("richPracticeReveal")?.addEventListener(
    "click",
    revealHint,
  );
  byId<HTMLButtonElement>("richPracticeNext")?.addEventListener(
    "click",
    nextItem,
  );
  byId<HTMLButtonElement>("richPracticeReplay")?.addEventListener(
    "click",
    () => {
      const item = currentItem();
      if (item?.kind === "exercise") speakExercise(item, true);
    },
  );
  byId<HTMLInputElement>("richPracticeAnswer")?.addEventListener(
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

async function selectedCefr(): Promise<string | undefined> {
  const settings = loadTypingTextSettings();
  const index = await loadTypingTextIndex();
  return index.levels.find((item) => item.level === settings.level)?.cefr;
}

async function loadSession(
  mode: RichPracticeLearningMode,
  generation: number,
): Promise<void> {
  const cefr = await selectedCefr();
  const loaded = await prepareRichPracticeItems(mode, cefr, 20);
  if (generation !== loadGeneration) return;
  items = loaded;
  itemIndex = 0;
  renderCurrent();
}

export function syncRichPracticePanel(): void {
  bindPanel();

  const panel = byId<HTMLElement>("richPracticePanel");
  const typingTest = byId<HTMLElement>("typingTest");
  if (panel === null || typingTest === null) return;

  const mode = getSettings().learningMode;
  const active =
    Config.mode === "custom" && isRichPracticeLearningMode(mode);
  panel.classList.toggle("hidden", !active);
  typingTest.classList.toggle("rich-practice-active", active);

  if (!active || !isRichPracticeLearningMode(mode)) {
    loadGeneration++;
    items = [];
    itemIndex = 0;
    return;
  }

  const generation = ++loadGeneration;
  setFeedback("Loading reviewed English content…");
  void loadSession(mode, generation).catch((error: unknown) => {
    if (generation !== loadGeneration) return;
    items = [];
    renderEmpty(mode);
    setFeedback(
      error instanceof Error
        ? error.message
        : "Failed to load reviewed English content.",
      "wrong",
    );
  });
}

syncRichPracticePanel();
restartTestEvent.subscribe(() => {
  window.setTimeout(syncRichPracticePanel, 0);
});
