import { notifyParentSpeech } from "./audio-focus";
import { stopTextReader } from "./text-reader";
import type {
  EnVnTranslationSettings,
  PronunciationAccent,
  PronunciationRate,
} from "./store";

const speechRateMap: Record<PronunciationRate, number> = {
  slow: 0.82,
  normal: 1,
  fast: 1.15,
};

function findVoice(accent: PronunciationAccent): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const normalizedAccent = accent.toLowerCase();

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalizedAccent) ??
    voices.find((voice) =>
      voice.lang.toLowerCase().startsWith(normalizedAccent.split("-")[0] ?? ""),
    ) ??
    null
  );
}

export function speakEnglish(
  source: string,
  settings: EnVnTranslationSettings,
): void {
  if (!settings.pronunciationEnabled) return;
  if (!("speechSynthesis" in window)) return;
  if (typeof SpeechSynthesisUtterance === "undefined") return;

  const speech = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(source);

  utterance.lang = settings.pronunciationAccent;
  utterance.rate = speechRateMap[settings.pronunciationRate];
  utterance.volume = settings.pronunciationVolume / 100;

  const voice = findVoice(settings.pronunciationAccent);
  if (voice !== null) {
    utterance.voice = voice;
  }

  utterance.onstart = () => notifyParentSpeech(true);
  utterance.onend = () => notifyParentSpeech(false);
  utterance.onerror = () => notifyParentSpeech(false);

  // Gameplay calls this only while the full-text reader is idle. Do not cancel
  // the shared speech queue here: rapid completed words must be pronounced in
  // order instead of dropping the later utterance.
  speech.speak(utterance);
}

export function stopEnglishSpeech(): void {
  notifyParentSpeech(false);
  stopTextReader();
}
