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

  stopTextReader();

  const speech = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(source);

  utterance.lang = settings.pronunciationAccent;
  utterance.rate = speechRateMap[settings.pronunciationRate];
  utterance.volume = settings.pronunciationVolume / 100;

  const voice = findVoice(settings.pronunciationAccent);
  if (voice !== null) {
    utterance.voice = voice;
  }

  // Keep pronunciation synchronized with the current learning bubble instead
  // of allowing old speech to queue behind fast typing.
  speech.cancel();
  speech.speak(utterance);
}

export function stopEnglishSpeech(): void {
  stopTextReader();
}
