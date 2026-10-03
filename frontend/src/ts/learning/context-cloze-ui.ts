import { Config } from "../config/store";
import { restartTestEvent } from "../events/test";
import { getSettings } from "../custom/en-vn-translation/store";
import { loadTypingTextSettings } from "../custom/typing-text-library";
import {
  buildContextClozeLearningEvent,
  contextClozeHint,
  prepareContextClozeExercises,
  validateContextClozeAnswer,
  type ContextClozeExercise,
} from "./context-cloze";

const LEARNING_ATTEMPT_MESSAGE = "typing-game:learning:v1:attempt";
const PARENT_ORIGIN = "https://typing-game.local";

let exercises: ContextClozeExercise[] = [];
let exerciseIndex = 0;
let revealedCharacters = 0;
let hintUsed = false;
let attemptRecorded = false;
let startedAt = 0;
let requestSequence = 0;
let loadGeneration = 0;
let boundPanel: HTMLElement | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function currentExercise(): ContextClozeExercise | null {
  return exercises[exerciseIndex] ?? null;
}

function setFeedback(
  message: string,
  state: "idle" | "correct" | "wrong" = "idle",
): void {
  const feedback = byId<HTMLElement>("contextClozeFeedback");
  if (feedback === null) return;
  feedback.textContent = message;
  feedback.dataset["state"] = state;
}

function postAttempt(
  event: ReturnType<typeof buildContextClozeLearningEvent>,
): void {
  if (window.parent === window) return;

  requestSequence++;
  window.parent.postMessage(
    {
      type: LEARNING_ATTEMPT_MESSAGE,
      requestId: `monkeytype-cloze-${Date.now().toString(36)}-${requestSequence.toString(36)}`,
      event,
    },
    PARENT_ORIGIN,
  );
}

function renderCurrent(): void {
  const current = currentExercise();
  const progress = byId<HTMLElement>("contextClozeProgress");
  const type = byId<HTMLElement>("contextClozeType");
  const topic = byId<HTMLElement>("contextClozeTopic");
  const prompt = byId<HTMLElement>("contextClozePrompt");
  const input = byId<HTMLInputElement>("contextClozeAnswer");
  const hint = byId<HTMLElement>("contextClozeHint");
  const submit = byId<HTMLButtonElement>("contextClozeSubmit");
  const next = byId<HTMLButtonElement>("contextClozeNext");

  if (
    current === null ||
    progress === null ||
    type === null ||
    topic === null ||
    prompt === null ||
    input === null ||
    hint === null ||
    submit === null ||
    next === null
  ) {
    return;
  }

  progress.textContent = `${exerciseIndex + 1} / ${exercises.length}`;
  type.textContent =
    current.entityType === "grammar"
      ? `Grammar · ${current.entityId}`
      : "Vocabulary";
  topic.textContent =
    `Level ${current.level} · ${current.cefr} · ${current.topic}`;
  prompt.textContent = current.maskedSentence;
  input.value = "";
  input.placeholder = "Type the missing word or phrase";
  input.disabled = false;
  submit.disabled = false;
  next.disabled = true;
  hint.textContent = "";
  revealedCharacters = 0;
  hintUsed = false;
  attemptRecorded = false;
  startedAt = performance.now();
  setFeedback("");
  input.focus();
}

function submitAnswer(): void {
  const current = currentExercise();
  const input = byId<HTMLInputElement>("contextClozeAnswer");
  const submit = byId<HTMLButtonElement>("contextClozeSubmit");
  const next = byId<HTMLButtonElement>("contextClozeNext");
  if (
    current === null ||
    input === null ||
    submit === null ||
    next === null ||
    attemptRecorded
  ) {
    return;
  }

  const answer = input.value;
  if (answer.trim() === "") {
    setFeedback("Type the missing word or phrase first.", "wrong");
    return;
  }

  const validation = validateContextClozeAnswer(current, answer);
  const responseMs = Math.max(0, Math.round(performance.now() - startedAt));
  postAttempt(
    buildContextClozeLearningEvent({
      exercise: current,
      answer,
      validation,
      responseMs,
      hintUsed,
    }),
  );
  attemptRecorded = true;
  input.disabled = true;
  submit.disabled = true;
  next.disabled = false;

  if (validation.correct) {
    setFeedback("Correct · context attempt recorded.", "correct");
  } else {
    setFeedback(
      `${validation.errorType ?? "wrong-form"} · expected: ${current.target}`,
      "wrong",
    );
  }
}

function revealNextCharacter(): void {
  const current = currentExercise();
  const hint = byId<HTMLElement>("contextClozeHint");
  if (current === null || hint === null || attemptRecorded) return;

  const next = contextClozeHint(current, revealedCharacters);
  revealedCharacters = next.nextRevealedCharacters;
  hintUsed = true;
  hint.textContent =
    revealedCharacters >= Array.from(current.target).length
      ? `Revealed: ${next.revealed}`
      : `Starts with: ${next.revealed}…`;
}

function nextExercise(): void {
  if (!attemptRecorded) return;

  if (exerciseIndex + 1 >= exercises.length) {
    const next = byId<HTMLButtonElement>("contextClozeNext");
    if (next !== null) next.disabled = true;
    setFeedback(
      `Context session complete · ${exercises.length} exercises reviewed.`,
      "correct",
    );
    return;
  }

  exerciseIndex++;
  renderCurrent();
}

function bindPanel(): void {
  const panel = byId<HTMLElement>("contextClozePanel");
  if (panel === null || panel === boundPanel) return;

  byId<HTMLButtonElement>("contextClozeSubmit")?.addEventListener(
    "click",
    submitAnswer,
  );
  byId<HTMLButtonElement>("contextClozeReveal")?.addEventListener(
    "click",
    revealNextCharacter,
  );
  byId<HTMLButtonElement>("contextClozeNext")?.addEventListener(
    "click",
    nextExercise,
  );
  byId<HTMLInputElement>("contextClozeAnswer")?.addEventListener(
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

async function loadSession(generation: number): Promise<void> {
  const typingText = loadTypingTextSettings();
  const maxExercises = Math.min(20, Math.max(8, typingText.passageCount * 4));
  const loaded = await prepareContextClozeExercises(
    typingText.level,
    typingText.passageCount,
    maxExercises,
  );

  if (generation !== loadGeneration) return;
  exercises = loaded;
  exerciseIndex = 0;
  renderCurrent();
}

export function syncContextClozePanel(): void {
  bindPanel();

  const panel = byId<HTMLElement>("contextClozePanel");
  const typingTest = byId<HTMLElement>("typingTest");
  if (panel === null || typingTest === null) return;

  const active =
    Config.mode === "custom" &&
    getSettings().learningMode === "context-cloze";
  panel.classList.toggle("hidden", !active);
  typingTest.classList.toggle("context-cloze-active", active);

  if (!active) {
    loadGeneration++;
    exercises = [];
    exerciseIndex = 0;
    return;
  }

  const generation = ++loadGeneration;
  setFeedback("Loading shared context…");
  void loadSession(generation).catch((error: unknown) => {
    if (generation !== loadGeneration) return;
    exercises = [];
    setFeedback(
      error instanceof Error
        ? error.message
        : "Failed to load shared Context/Cloze data.",
      "wrong",
    );
  });
}

syncContextClozePanel();
restartTestEvent.subscribe(() => {
  window.setTimeout(syncContextClozePanel, 0);
});
