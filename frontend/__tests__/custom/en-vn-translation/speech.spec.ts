import { afterEach, describe, expect, it, vi } from "vitest";

import { speakEnglish, stopEnglishSpeech } from "../../../src/ts/custom/en-vn-translation/speech";
import type { EnVnTranslationSettings } from "../../../src/ts/custom/en-vn-translation/store";

class FakeUtterance {
  readonly text: string;
  lang = "";
  rate = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const settings: EnVnTranslationSettings = {
  enabled: true,
  recallModeEnabled: false,
  dictionarySource: "custom",
  dictionaryTopicId: "everyday.routine",
  dictionary: "",
  durationMs: 3000,
  popupStyle: "bubble",
  popupSize: "medium",
  popupColor: "blue",
  displayMode: "both",
  tooltipBehavior: "hold",
  lineSpacing: "comfortable",
  pronunciationEnabled: true,
  pronunciationAccent: "en-US",
  pronunciationRate: "normal",
  pronunciationVolume: 100,
  textReaderEnabled: false,
  textReaderLanguage: "auto",
  textReaderVoiceURI: "",
  textReaderRate: 1,
  textReaderVolume: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EN-VN pronunciation queue", () => {
  it("queues rapid completed words without cancelling the previous pronunciation", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    const resume = vi.fn();
    const speech = {
      getVoices: () => [],
      speak,
      cancel,
      resume,
      paused: false,
    };

    vi.stubGlobal("window", { speechSynthesis: speech });
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);

    speakEnglish("first", settings);
    speakEnglish("second", settings);

    expect(speak).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();
    expect((speak.mock.calls[0]?.[0] as FakeUtterance).text).toBe("first");
    expect((speak.mock.calls[1]?.[0] as FakeUtterance).text).toBe("second");

    stopEnglishSpeech();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
