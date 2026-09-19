import type {
  EnVnTranslationSettings,
  TextReaderLanguage,
} from "./store";

export type TextReaderState = "idle" | "playing" | "paused";

export type TextReaderCallbacks = {
  onStateChange?: (state: TextReaderState) => void;
  onError?: (message: string) => void;
};

const VIETNAMESE_MARKS =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

let runId = 0;
let state: TextReaderState = "idle";
let callbacks: TextReaderCallbacks = {};

function setState(next: TextReaderState): void {
  state = next;
  callbacks.onStateChange?.(next);
}

function getSpeech(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  return window.speechSynthesis;
}

export function resolveTextReaderLanguage(
  source: string,
  language: TextReaderLanguage,
): "en-US" | "vi-VN" {
  if (language !== "auto") return language;
  return VIETNAMESE_MARKS.test(source) ? "vi-VN" : "en-US";
}

export function chunkTextReaderText(
  source: string,
  maxLength = 280,
): string[] {
  const normalized = source.replace(/\s+/g, " ").trim();
  if (normalized === "") return [];

  const sentenceParts =
    normalized.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()) ??
    [normalized];

  const chunks: string[] = [];

  const pushLongPart = (part: string): void => {
    const words = part.split(" ");
    let current = "";

    for (const word of words) {
      if (current === "") {
        current = word;
        continue;
      }

      const candidate = `${current} ${word}`;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        chunks.push(current);
        current = word;
      }
    }

    if (current !== "") chunks.push(current);
  };

  let pending = "";

  for (const part of sentenceParts) {
    if (part === "") continue;

    if (part.length > maxLength) {
      if (pending !== "") {
        chunks.push(pending);
        pending = "";
      }
      pushLongPart(part);
      continue;
    }

    const candidate = pending === "" ? part : `${pending} ${part}`;
    if (candidate.length <= maxLength) {
      pending = candidate;
    } else {
      if (pending !== "") chunks.push(pending);
      pending = part;
    }
  }

  if (pending !== "") chunks.push(pending);
  return chunks;
}

export function getLocalTextReaderVoices(
  source: string,
  language: TextReaderLanguage,
): SpeechSynthesisVoice[] {
  const speech = getSpeech();
  if (speech === null) return [];

  const resolvedLanguage = resolveTextReaderLanguage(source, language);
  const baseLanguage = resolvedLanguage.split("-")[0]?.toLowerCase() ?? "";

  return speech
    .getVoices()
    .filter(
      (voice) =>
        voice.localService &&
        voice.lang.toLowerCase().startsWith(baseLanguage),
    )
    .sort((left, right) => {
      const leftExact =
        left.lang.toLowerCase() === resolvedLanguage.toLowerCase() ? 0 : 1;
      const rightExact =
        right.lang.toLowerCase() === resolvedLanguage.toLowerCase() ? 0 : 1;
      if (leftExact !== rightExact) return leftExact - rightExact;
      return left.name.localeCompare(right.name);
    });
}

export function startTextReader(
  source: string,
  settings: EnVnTranslationSettings,
  nextCallbacks: TextReaderCallbacks = {},
): { started: boolean; error?: string } {
  if (!settings.textReaderEnabled) {
    return { started: false, error: "Text reader is disabled." };
  }

  if (
    typeof SpeechSynthesisUtterance === "undefined" ||
    getSpeech() === null
  ) {
    return {
      started: false,
      error: "Speech synthesis is not supported by this browser.",
    };
  }

  const chunks = chunkTextReaderText(source);
  if (chunks.length === 0) {
    return { started: false, error: "Text is empty." };
  }

  const speech = getSpeech();
  if (speech === null) {
    return {
      started: false,
      error: "Speech synthesis is not supported by this browser.",
    };
  }

  const language = resolveTextReaderLanguage(
    source,
    settings.textReaderLanguage,
  );
  const voices = getLocalTextReaderVoices(source, settings.textReaderLanguage);
  const voice =
    voices.find((item) => item.voiceURI === settings.textReaderVoiceURI) ??
    voices[0] ??
    null;

  if (voice === null) {
    return {
      started: false,
      error: `No local ${language.startsWith("vi") ? "Vietnamese" : "English"} voice is available.`,
    };
  }

  stopTextReader();

  callbacks = nextCallbacks;
  const currentRunId = ++runId;
  let chunkIndex = 0;

  const speakNext = (): void => {
    if (currentRunId !== runId) return;

    const chunk = chunks[chunkIndex];
    if (chunk === undefined) {
      setState("idle");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = language;
    utterance.voice = voice;
    utterance.rate = settings.textReaderRate;
    utterance.volume = settings.textReaderVolume / 100;

    utterance.onend = () => {
      if (currentRunId !== runId) return;
      chunkIndex++;
      speakNext();
    };

    utterance.onerror = (event) => {
      if (currentRunId !== runId) return;
      setState("idle");
      callbacks.onError?.(`Text reader stopped: ${event.error}.`);
    };

    speech.speak(utterance);
  };

  setState("playing");
  speakNext();
  return { started: true };
}

export function pauseTextReader(): void {
  const speech = getSpeech();
  if (speech === null || state !== "playing") return;

  speech.pause();
  setState("paused");
}

export function resumeTextReader(): void {
  const speech = getSpeech();
  if (speech === null || state !== "paused") return;

  speech.resume();
  setState("playing");
}

export function stopTextReader(): void {
  runId++;
  const speech = getSpeech();
  if (speech !== null) speech.cancel();

  if (state !== "idle") setState("idle");
}

export function getTextReaderState(): TextReaderState {
  return state;
}
