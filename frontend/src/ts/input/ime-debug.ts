import { Config } from "../config/store";
import * as CompositionState from "../legacy-states/composition";
import { getActiveWordIndex } from "../states/test";
import { getCurrentInput } from "../test/events/data";
import { getLiveCachedAccuracy } from "../test/events/live-cache";
import * as TestWords from "../test/test-words";
import {
  getActivePhysicalKeyCode,
  hasRecentBackspaceIntent,
} from "./state";
import {
  getVietnameseImeDirectPreview,
  getVietnameseImeQueuedSeparator,
  getVietnameseImeSession,
} from "./vietnamese-ime/state";

type ImeDebugPhase = "before" | "after";

export type ImeDebugEntry = {
  seq: number;
  ms: number;
  phase: ImeDebugPhase;
  eventType: string;
  key?: string;
  code?: string;
  data?: string | null;
  inputType?: string;
  isComposing?: boolean;
  defaultPrevented: boolean;
  domValue: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  scorerValue: string;
  targetWord: string;
  wordIndex: number;
  accuracy: number;
  composition: {
    composing: boolean;
    data: string;
    activePhysicalKeyCode: string | null;
    backspaceIntent: boolean;
    pendingSeparator: string | null;
    directPreview: string | null;
    sessionId: number | null;
    sessionRevision: number | null;
  };
  config: {
    language: string;
    inputLanguage: string;
    vietnameseImeMode: string;
    stopOnError: string;
    stopOnErrorKeepFirstError: boolean;
    ignoreRepeatedBlockedErrors: boolean;
    forgiveCorrectedErrors: boolean;
  };
};

type ImeDebugExport = {
  environment: {
    userAgent: string;
    platform: string;
    href: string;
  };
  entries: ImeDebugEntry[];
};

const MAX_ENTRIES = 1000;
const STORAGE_KEY = "mt-ime-debug";

let enabled = false;
let seq = 0;
let entries: ImeDebugEntry[] = [];

function readInitialEnabled(): boolean {
  if (!import.meta.env.DEV) return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get("imeDebug") === "1") return true;
  if (params.get("imeDebug") === "0") return false;

  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function getDomSnapshot(): {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
} {
  const input = document.querySelector<HTMLTextAreaElement>("#wordsInput");
  if (input === null) {
    return { value: "", selectionStart: null, selectionEnd: null };
  }

  return {
    // wordsInput uses one sentinel character at the start.
    value: input.value.startsWith(" ") ? input.value.slice(1) : input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
  };
}

function getEventDetails(event: Event): Pick<
  ImeDebugEntry,
  "key" | "code" | "data" | "inputType" | "isComposing"
> {
  if (event instanceof KeyboardEvent) {
    return {
      key: event.key,
      code: event.code,
      isComposing: event.isComposing,
    };
  }

  if (event instanceof InputEvent) {
    return {
      data: event.data,
      inputType: event.inputType,
      isComposing: event.isComposing,
    };
  }

  if (event instanceof CompositionEvent) {
    return {
      data: event.data,
    };
  }

  return {};
}

function createExport(): ImeDebugExport {
  return {
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      href: window.location.href,
    },
    entries: [...entries],
  };
}

function exportText(): string {
  return JSON.stringify(createExport(), null, 2);
}

function installDevApi(): void {
  if (!import.meta.env.DEV) return;

  const api = {
    enable: (): void => {
      enabled = true;
      window.localStorage.setItem(STORAGE_KEY, "1");
      console.info("[MT IME DEBUG] enabled");
    },
    disable: (): void => {
      enabled = false;
      window.localStorage.setItem(STORAGE_KEY, "0");
      console.info("[MT IME DEBUG] disabled");
    },
    clear: (): void => {
      seq = 0;
      entries = [];
      console.info("[MT IME DEBUG] cleared");
    },
    isEnabled: (): boolean => enabled,
    getEntries: (): ImeDebugEntry[] => [...entries],
    environment: (): ImeDebugExport["environment"] => createExport().environment,
    text: (): string => exportText(),
    copy: async (): Promise<string> => {
      const text = exportText();
      await navigator.clipboard.writeText(text);
      console.info(
        `[MT IME DEBUG] copied ${entries.length} entries to clipboard`,
      );
      return text;
    },
  };

  Reflect.set(window, "__mtImeDebug", api);
}

export function recordImeDebugEvent(
  eventType: string,
  phase: ImeDebugPhase,
  event: Event,
): void {
  if (!enabled) return;

  const dom = getDomSnapshot();
  const currentWord = TestWords.words.getCurrent();
  const entry: ImeDebugEntry = {
    seq: ++seq,
    ms: Number(performance.now().toFixed(3)),
    phase,
    eventType,
    ...getEventDetails(event),
    defaultPrevented: event.defaultPrevented,
    domValue: dom.value,
    selectionStart: dom.selectionStart,
    selectionEnd: dom.selectionEnd,
    scorerValue: getCurrentInput(),
    targetWord: currentWord?.textWithCommit ?? "",
    wordIndex: getActiveWordIndex(),
    accuracy: Number(getLiveCachedAccuracy().toFixed(2)),
    composition: {
      composing: CompositionState.getComposing(),
      data: CompositionState.getData() ?? "",
      activePhysicalKeyCode: getActivePhysicalKeyCode(),
      backspaceIntent: hasRecentBackspaceIntent(performance.now()),
      pendingSeparator: getVietnameseImeQueuedSeparator(),
      directPreview: getVietnameseImeDirectPreview()?.domValue ?? null,
      sessionId: getVietnameseImeSession()?.id ?? null,
      sessionRevision: getVietnameseImeSession()?.revision ?? null,
    },
    config: {
      language: Config.language,
      inputLanguage: Config.inputLanguage,
      vietnameseImeMode: Config.vietnameseImeMode,
      stopOnError: Config.stopOnError,
      stopOnErrorKeepFirstError: Config.stopOnErrorKeepFirstError,
      ignoreRepeatedBlockedErrors: Config.ignoreRepeatedBlockedErrors,
      forgiveCorrectedErrors: Config.forgiveCorrectedErrors,
    },
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  console.info("[MT IME DEBUG]", entry);
}

enabled = readInitialEnabled();
installDevApi();
