// Source: new for the kit: keyboard sound profiles on preloaded AudioBuffers (TYPING_FEEDBACK_REVIEW.md §4, §6; owner 29/10)
/**
 * Keypress sounds from recorded files (owner 29/10: every one made in the
 * Audio Lab, no downloaded packs). A keyboard profile is `key-01 … key-10`
 * and `space-01 … space-03`, loudness-matched across profiles, listed in a
 * `keys-manifest.json` beside them; the game gives the base URL
 * (`<base>/<profile>/keys-manifest.json`). Everything is fetched and decoded
 * before play: a key never waits on a file.
 *
 * Each play takes the next variant of a shuffled round (never the same twice
 * in a row), nudges pitch and level a little, and takes a voice: at most
 * `keyVoices` key sounds at once (the oldest is cut with a 4 ms fade), and a
 * separate `wordVoices` for the space set so a burst of keys never cuts a
 * word's sound. Letters (right, wrong or stray) play the key set; a word done
 * (and the spacebar) plays the space set. The hierarchy key < wrong-damped <
 * word < perfect < milestone is by level, inside the owner's two sets.
 *
 * "synth" profiles are the kit's code-made AudioCues through a stand-in the
 * Lab sets: for testing in the Lab only, never in a game.
 */
import type { TypingFxSink } from "./driver";
import { isMilestone } from "./intensity";

/** The two recorded sets of a keyboard profile. */
export const TYPING_SOUND_SETS = ["key", "space"] as const;
export type TypingSoundSet = (typeof TYPING_SOUND_SETS)[number];

/** What a sound is played for: the driver's calls (and the spacebar). */
export const TYPING_SOUND_EVENTS = ["key", "wrong", "stray", "space", "word", "perfect", "combo"] as const;
export type TypingSoundEvent = (typeof TYPING_SOUND_EVENTS)[number];

/** Each event's set and level (before the player's volume): keys quiet and dry, a word above them. */
export const TYPING_SOUND_MAP: Readonly<Record<TypingSoundEvent, { set: TypingSoundSet; gain: number }>> = {
  key: { set: "key", gain: 0.55 },
  wrong: { set: "key", gain: 0.42 },
  stray: { set: "key", gain: 0.32 },
  space: { set: "space", gain: 0.6 },
  word: { set: "space", gain: 0.68 },
  perfect: { set: "space", gain: 0.78 },
  combo: { set: "space", gain: 0.88 },
};

/** Files a keyboard profile has (owner 29/10): ten keys, three spaces; fewer still plays, the Lab lists the gap. */
export const TYPING_SOUND_SET: Readonly<Record<TypingSoundSet, { min: number; want: number }>> = {
  key: { min: 6, want: 10 },
  space: { min: 1, want: 3 },
};

/**
 * Legacy fallback only, for games not yet given a ticket-189 catalogue.
 * New catalogues supply their own ids and player-facing names.
 */
export const KEYBOARD_PROFILES: readonly { readonly id: string; readonly name: string }[] = [
  { id: "creamy", name: "Creamy Linear" },
  { id: "thock", name: "Deep Thock" },
  { id: "marbly", name: "Marbly" },
  { id: "clack", name: "Clean Clack" },
  { id: "dome", name: "Soft Dome" },
];

export type TypingSoundProfile = {
  readonly id: string;
  readonly name: string;
  /** "audio-lab": files made by the pipeline; "synth": the Lab's labelled code stand-in (never in a game). */
  readonly source: "audio-lab" | "synth";
  readonly licence: string;
  readonly files: Partial<Record<TypingSoundSet, readonly string[]>>;
  /** Level per event, over TYPING_SOUND_MAP's. */
  readonly gain?: Partial<Record<TypingSoundEvent, number>>;
  /** ± playback-rate share (default 0.03) and ± level share (default 0.08) per play. */
  readonly pitch?: number;
  readonly level?: number;
};

const FILE = /(?:^|\/)(key|space)-(\d{2})\.(?:ogg|opus|webm|m4a|mp3|wav|flac)$/i;

/**
 * The files a `keys-manifest.json` names, as URLs under `base` (the profile's
 * folder). Any JSON shape works: every string that ends in `key-NN.<ext>` or
 * `space-NN.<ext>` is taken (a list, `files`, objects with `file`/`path`…),
 * sorted by number, duplicates dropped.
 */
export function keyboardFiles(manifest: unknown, base: string): Record<TypingSoundSet, string[]> {
  const found: Record<TypingSoundSet, Map<number, string>> = { key: new Map(), space: new Map() };
  const walk = (value: unknown, depth: number): void => {
    if (depth > 6 || value === null) return;
    if (typeof value === "string") {
      const m = FILE.exec(value.trim());
      if (m === null || /^[a-z]+:|^\/|\.\./i.test(value.trim())) return;
      const set = m[1]!.toLowerCase() as TypingSoundSet;
      const n = Number(m[2]);
      if (!found[set].has(n)) found[set].set(n, value.trim());
      return;
    }
    if (Array.isArray(value)) for (const item of value) walk(item, depth + 1);
    else if (typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) walk(item, depth + 1);
  };
  walk(manifest, 0);
  const root = base.endsWith("/") ? base : base + "/";
  const list = (set: TypingSoundSet): string[] => [...found[set].entries()].sort((a, b) => a[0] - b[0]).map(([, file]) => root + file);
  return { key: list("key"), space: list("space") };
}

export type KeyboardLoad = {
  id: string;
  /** "ready": every file in; "partial": plays, but fewer than the owner's set; "pending": nothing staged yet. */
  state: "ready" | "partial" | "pending";
  keys: number;
  spaces: number;
  missing: string[];
};

/**
 * A shuffled round of `n` variants: each plays once per round in random
 * order, and a new round never starts with the one that just played.
 */
export class VariantPicker {
  private readonly order: Int16Array;
  private cursor: number;
  private last = -1;

  constructor(readonly n: number, private readonly random: () => number = Math.random) {
    this.order = new Int16Array(Math.max(1, n));
    for (let i = 0; i < this.order.length; i += 1) this.order[i] = i;
    this.cursor = this.order.length;
  }

  next(): number {
    const n = this.order.length;
    if (n === 1) return 0;
    if (this.cursor >= n) {
      for (let i = n - 1; i > 0; i -= 1) {
        const j = Math.floor(this.random() * (i + 1));
        const t = this.order[i]!;
        this.order[i] = this.order[j]!;
        this.order[j] = t;
      }
      if (this.order[0] === this.last) {
        const j = 1 + Math.floor(this.random() * (n - 1));
        const t = this.order[0]!;
        this.order[0] = this.order[j]!;
        this.order[j] = t;
      }
      this.cursor = 0;
    }
    this.last = this.order[this.cursor]!;
    this.cursor += 1;
    return this.last;
  }
}

/** `cap` voices on a clock in seconds: a free one, else the one that started first. */
export class VoicePool {
  readonly starts: Float64Array;
  readonly ends: Float64Array;
  stolen = 0;
  /** The last acquire cut a sounding voice. */
  stole = false;

  constructor(readonly cap: number) {
    this.starts = new Float64Array(cap).fill(-Infinity);
    this.ends = new Float64Array(cap).fill(-Infinity);
  }

  /** A voice for a sound of `duration` s from `now`: returns its slot; `stole` tells whether it cut one. */
  acquire(now: number, duration: number): number {
    let slot = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.cap; i += 1) {
      if (this.ends[i]! <= now) {
        slot = i;
        break;
      }
      if (this.starts[i]! < oldest) {
        oldest = this.starts[i]!;
        slot = i;
      }
    }
    this.stole = this.ends[slot]! > now;
    if (this.stole) this.stolen += 1;
    this.starts[slot] = now;
    this.ends[slot] = now + duration;
    return slot;
  }

  busy(slot: number, now: number): boolean {
    return this.ends[slot]! > now;
  }

  active(now: number): number {
    let n = 0;
    for (let i = 0; i < this.cap; i += 1) if (this.ends[i]! > now) n += 1;
    return n;
  }
}

export type TypingSoundsOptions = {
  /** The game's context (shared), or a function that makes it on resume(); default its own. */
  context?: AudioContext | (() => AudioContext);
  /** Where the sounds play into (the game's sfx bus); default the destination. */
  destination?: AudioNode | (() => AudioNode);
  random?: () => number;
  keyVoices?: number;
  wordVoices?: number;
};

type Loaded = { profile: TypingSoundProfile; buffers: Partial<Record<TypingSoundSet, AudioBuffer[]>>; pickers: Partial<Record<TypingSoundSet, VariantPicker>> };

/** What a "synth" profile plays instead of files (the Lab's labelled stand-in). */
export type SoundStandIn = (event: TypingSoundEvent, step: number, gain: number) => void;

const STEAL_FADE_S = 0.004;

export class TypingSounds implements TypingFxSink {
  private ctx: AudioContext | null = null;
  private own = false;
  private out: GainNode | null = null;
  private readonly loaded = new Map<string, Loaded>();
  private current: Loaded | null = null;
  private readonly keyPool: VoicePool;
  private readonly wordPool: VoicePool;
  private keyGains: GainNode[] = [];
  private wordGains: GainNode[] = [];
  private readonly keySources: (AudioBufferSourceNode | null)[];
  private readonly wordSources: (AudioBufferSourceNode | null)[];
  private readonly random: () => number;
  private volume = 0.7;
  muted = false;
  /** Plays a "synth" profile (set by the Lab only). */
  standIn: SoundStandIn | null = null;
  /** Counts for the Lab's readout. */
  readonly stats = { played: 0, standIn: 0, missing: 0 };

  constructor(private readonly options: TypingSoundsOptions = {}) {
    this.random = options.random ?? Math.random;
    this.keyPool = new VoicePool(Math.max(1, options.keyVoices ?? 6));
    this.wordPool = new VoicePool(Math.max(1, options.wordVoices ?? 2));
    this.keySources = new Array<AudioBufferSourceNode | null>(this.keyPool.cap).fill(null);
    this.wordSources = new Array<AudioBufferSourceNode | null>(this.wordPool.cap).fill(null);
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Browsers start audio on a gesture: call on the first key or click. Makes the voices once. */
  resume(): AudioContext {
    if (this.ctx === null) {
      const given = this.options.context;
      const ctx = given === undefined ? new AudioContext() : typeof given === "function" ? given() : given;
      this.own = given === undefined;
      this.ctx = ctx;
      const target = this.options.destination;
      this.out = new GainNode(ctx, { gain: this.volume });
      this.out.connect(target === undefined ? ctx.destination : typeof target === "function" ? target() : target);
      this.keyGains = Array.from({ length: this.keyPool.cap }, () => this.voice(ctx));
      this.wordGains = Array.from({ length: this.wordPool.cap }, () => this.voice(ctx));
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private voice(ctx: AudioContext): GainNode {
    const gain = new GainNode(ctx, { gain: 0 });
    gain.connect(this.out!);
    return gain;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (this.out !== null) this.out.gain.value = this.volume;
  }

  /**
   * Fetches and decodes every file of `profile` before play. Missing or
   * broken files are listed, the rest load.
   */
  async load(profile: TypingSoundProfile, fetchBytes: (url: string) => Promise<ArrayBuffer> = defaultFetch, activate = true): Promise<{ loaded: number; missing: string[] }> {
    const entry: Loaded = { profile, buffers: {}, pickers: {} };
    const missing: string[] = [];
    let loaded = 0;
    if (profile.source !== "synth") {
      const ctx = this.resume();
      for (const set of TYPING_SOUND_SETS) {
        const urls = profile.files[set] ?? [];
        const buffers: AudioBuffer[] = [];
        await Promise.all(
          urls.map(async (url, index) => {
            try {
              buffers[index] = await ctx.decodeAudioData(await fetchBytes(url));
              loaded += 1;
            } catch {
              missing.push(url);
            }
          }),
        );
        const kept = buffers.filter((buffer): buffer is AudioBuffer => buffer !== undefined);
        if (kept.length > 0) {
          entry.buffers[set] = kept;
          entry.pickers[set] = new VariantPicker(kept.length, this.random);
        }
      }
    }
    this.loaded.set(profile.id, entry);
    if (activate && (this.current?.profile.id === profile.id || this.current === null)) this.current = entry;
    return { loaded, missing };
  }

  /**
   * Loads keyboard profile `id` from `<base>/<id>/keys-manifest.json` (the
   * Audio Lab's layout). No manifest, or no file in it: "pending", and the
   * profile stays silent; nothing stands in for it.
   */
  async loadKeyboard(base: string, id: string, name = id, fetchJson: (url: string) => Promise<unknown> = defaultJson, fetchBytes: (url: string) => Promise<ArrayBuffer> = defaultFetch): Promise<KeyboardLoad> {
    const folder = (base.endsWith("/") ? base : base + "/") + encodeURIComponent(id) + "/";
    return this.loadKeyboardManifest(folder + "keys-manifest.json", id, name, fetchJson, fetchBytes, true);
  }

  /** Loads the explicit manifest URL from a catalogue (its directory owns the sample files). */
  async loadKeyboardManifest(url: string, id: string, name = id, fetchJson: (url: string) => Promise<unknown> = defaultJson, fetchBytes: (url: string) => Promise<ArrayBuffer> = defaultFetch, activate = false): Promise<KeyboardLoad> {
    const folder = url.slice(0, url.lastIndexOf("/") + 1);
    let manifest: unknown = null;
    try {
      manifest = await fetchJson(url);
    } catch {
      manifest = null;
    }
    const files = manifest === null ? { key: [], space: [] } : keyboardFiles(manifest, folder);
    if (files.key.length === 0 && files.space.length === 0) return { id, state: "pending", keys: 0, spaces: 0, missing: [] };
    const result = await this.load({ id, name, source: "audio-lab", licence: "project-owned (Audio Lab)", files }, fetchBytes, activate);
    const keys = this.loaded.get(id)?.buffers.key?.length ?? 0;
    const spaces = this.loaded.get(id)?.buffers.space?.length ?? 0;
    const full = keys >= TYPING_SOUND_SET.key.want && spaces >= TYPING_SOUND_SET.space.want;
    return { id, state: keys === 0 ? "pending" : full ? "ready" : "partial", keys, spaces, missing: result.missing };
  }

  /** Switches to a loaded profile ("off" or unknown: silent). */
  use(id: string): boolean {
    this.current = this.loaded.get(id) ?? null;
    return this.current !== null;
  }

  get profile(): TypingSoundProfile | null {
    return this.current?.profile ?? null;
  }

  /** Plays the sound of `event` now (its set, its level); `step` is the letter's place in the word. False: nothing played. */
  play(event: TypingSoundEvent, step = 0): boolean {
    const entry = this.current;
    if (entry === null || this.muted) return false;
    const profile = entry.profile;
    const row = TYPING_SOUND_MAP[event];
    const base = profile.gain?.[event] ?? row.gain;
    if (profile.source === "synth") {
      if (this.standIn === null) return false;
      this.standIn(event, step, base * this.volume);
      this.stats.standIn += 1;
      return true;
    }
    if (this.ctx === null) return false;
    // A profile without its space set plays a key for a word: never silence on a finished word.
    const set: TypingSoundSet = entry.buffers[row.set] !== undefined ? row.set : row.set === "space" ? "key" : "space";
    const buffers = entry.buffers[set];
    if (buffers === undefined) {
      this.stats.missing += 1;
      return false;
    }
    const buffer = buffers[entry.pickers[set]!.next()]!;
    const pitch = profile.pitch ?? 0.03;
    const level = profile.level ?? 0.08;
    const rate = 1 + (this.random() * 2 - 1) * pitch;
    const gain = Math.max(0, base * (1 + (this.random() * 2 - 1) * level));
    const words = set === "space";
    const pool = words ? this.wordPool : this.keyPool;
    const gains = words ? this.wordGains : this.keyGains;
    const sources = words ? this.wordSources : this.keySources;
    const ctx = this.ctx;
    let t = ctx.currentTime;
    const slot = pool.acquire(t, buffer.duration / rate);
    const voice = gains[slot]!.gain;
    const old = sources[slot];
    voice.cancelScheduledValues(t);
    if (pool.stole && old !== null && old !== undefined) {
      // Cut the oldest voice with a short fade, then start on the same voice.
      voice.setValueAtTime(voice.value, t);
      voice.linearRampToValueAtTime(0, t + STEAL_FADE_S);
      try {
        old.stop(t + STEAL_FADE_S);
      } catch {
        // Already stopped.
      }
      t += STEAL_FADE_S;
    }
    voice.setValueAtTime(gain, t);
    const source = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
    source.connect(gains[slot]!);
    source.start(t);
    sources[slot] = source;
    this.stats.played += 1;
    return true;
  }

  /** Voices sounding now (keys and words). */
  activeVoices(): number {
    if (this.ctx === null) return 0;
    const t = this.ctx.currentTime;
    return this.keyPool.active(t) + this.wordPool.active(t);
  }

  get stolen(): number {
    return this.keyPool.stolen + this.wordPool.stolen;
  }

  // The sink side: the same driver calls as the focus strip.
  key(index: number): void {
    this.play("key", index);
  }

  wrong(): void {
    this.play("wrong");
  }

  stray(): void {
    this.play("stray");
  }

  /** The spacebar (a game that types phrases or queues words). */
  space(): void {
    this.play("space");
  }

  complete(perfect: boolean, combo: number): void {
    this.play(isMilestone(combo) ? "combo" : perfect ? "perfect" : "word");
  }

  dispose(): void {
    for (const source of [...this.keySources, ...this.wordSources]) {
      try {
        source?.stop();
      } catch {
        // Already stopped.
      }
    }
    this.out?.disconnect();
    if (this.own && this.ctx !== null) void this.ctx.close();
    this.ctx = null;
    this.out = null;
    this.loaded.clear();
    this.current = null;
  }
}

async function defaultFetch(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(url + ": " + response.status);
  return response.arrayBuffer();
}

async function defaultJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(url + ": " + response.status);
  return response.json();
}

/** Each set of a profile against the owner's ten keys and three spaces: what the Audio Lab still owes. */
export function profileGaps(profile: TypingSoundProfile): { set: TypingSoundSet; have: number; min: number; want: number }[] {
  return TYPING_SOUND_SETS.map((set) => ({ set, have: profile.files[set]?.length ?? 0, ...TYPING_SOUND_SET[set] })).filter((row) => row.have < row.want);
}

/** Ticket 189 catalogue choice; compatible with quick-settings' game-owned choices. */
export type KeyboardSoundChoice = {
  readonly value: string;
  readonly label: string;
  readonly manifest?: string;
  readonly preview?: string;
  readonly disabled?: boolean;
  readonly note?: string;
};
export type KeyboardCatalog = { readonly options: readonly KeyboardSoundChoice[]; readonly state: "ready" | "missing" | "invalid" };

/** Read only the root catalogue. Samples and previews stay lazy. First duplicate id wins. */
export async function loadKeyboardCatalog(base: string, options: {
  readonly extra?: readonly KeyboardSoundChoice[];
  readonly fallback?: readonly KeyboardSoundChoice[];
  readonly fetchJson?: (url: string) => Promise<unknown>;
} = {}): Promise<KeyboardCatalog> {
  const root = base.endsWith("/") ? base : base + "/";
  const resolve = (relative: string): string => {
    // Catalogue paths are relative to its root; refuse absolute/traversing paths.
    if (!relative || relative.startsWith("/") || relative.includes(":") || relative.includes("\\") || relative.split("/").some((part) => part === ".." || part === ".") || /[?#%]/.test(relative)) throw new Error("Invalid catalogue path");
    return root + relative;
  };
  let state: KeyboardCatalog["state"] = "ready";
  let choices: KeyboardSoundChoice[] = [];
  try {
    const raw = await (options.fetchJson ?? defaultJson)(root + "keys-manifest.json");
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as { profiles?: unknown }).profiles)) throw new Error("Invalid catalogue");
    const seen = new Set(["off"]);
    const ordered: { choice: KeyboardSoundChoice; order: number }[] = [];
    for (const entry of (raw as { profiles: unknown[] }).profiles) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { readonly id?: unknown; readonly name?: unknown; readonly manifest?: unknown; readonly preview?: unknown; readonly order?: unknown };
      if (typeof row.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(row.id) || seen.has(row.id) || typeof row.name !== "string" || !row.name.trim() || typeof row.manifest !== "string" || typeof row.preview !== "string" || typeof row.order !== "number" || !Number.isFinite(row.order)) continue;
      try {
        const choice = { value: row.id, label: row.name, manifest: resolve(row.manifest), preview: resolve(row.preview) };
        seen.add(row.id);
        ordered.push({ choice, order: row.order });
      } catch { /* A malformed entry cannot prevent the other packs loading. */ }
    }
    choices = ordered.sort((a, b) => a.order - b.order).map((row) => row.choice);
  } catch (error) {
    state = error instanceof Error && error.message === "Invalid catalogue" ? "invalid" : "missing";
    choices = [...(options.fallback ?? KEYBOARD_PROFILES.map((p) => ({ value: p.id, label: p.name })))];
  }
  const merged: KeyboardSoundChoice[] = [{ value: "off", label: "Off" }];
  const seen = new Set(["off"]);
  // Game-specific choices (e.g. Relay) are appended and may override a catalogue entry.
  const extras = options.extra ?? [];
  for (const choice of [...choices.filter((c) => !extras.some((extra) => extra.value === c.value)), ...extras]) {
    if (seen.has(choice.value)) continue;
    seen.add(choice.value);
    merged.push(choice);
  }
  return { options: merged, state };
}

export const KEYBOARD_PREVIEW_DELAY_MS = 150;
export const KEYBOARD_PREVIEW_SECONDS = 1;
export const KEYBOARD_PREVIEW_FADE_SECONDS = 0.03;
export type KeyboardPreviewLevels = { readonly master: number; readonly keyboard: number; readonly muted?: boolean };

/** Linear volumes 0…1, independent of the game's effects/music buses. */
export function keyboardPreviewGain(levels: KeyboardPreviewLevels): number {
  const clamp = (v: number): number => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  return levels.muted ? 0 : clamp(levels.master) * clamp(levels.keyboard);
}

/**
 * One preview voice, lazy decoded-buffer cache, and generation guards for every async boundary.
 * Pass the gameplay TypingSounds so selection loads all samples into that same player.
 * A shared context is borrowed; previews go straight to its destination at Master × Keyboard.
 */
export class KeyboardSoundPreview {
  private readonly sounds: TypingSounds;
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();
  private readonly packs = new Map<string, Promise<KeyboardLoad>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private selection = 0;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private silentAt = 0;
  private disposed = false;

  constructor(private readonly options: {
    readonly levels: () => KeyboardPreviewLevels;
    readonly sounds?: TypingSounds;
    readonly fetchBytes?: (url: string) => Promise<ArrayBuffer>;
    readonly fetchJson?: (url: string) => Promise<unknown>;
    readonly onLoad?: (result: KeyboardLoad) => void;
    /** Game-specific already registered sounds (e.g. Relay). */
    readonly onUse?: (choice: KeyboardSoundChoice) => void;
  }) {
    this.sounds = options.sounds ?? new TypingSounds();
  }

  /** Call while opening Sound from a click/key gesture, before the delayed hover callback. */
  unlock(): void {
    if (this.disposed) return;
    try { this.sounds.resume(); } catch { /* Audio unavailable; the next explicit gesture can retry. */ }
  }

  /** Leaving, switching or closing invalidates even an in-flight decode. */
  stop(): void {
    this.generation += 1;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const ctx = this.sounds.context;
    if (this.source !== null && this.gain !== null && ctx !== null) {
      const t = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(this.gain.gain.value, t);
      this.gain.gain.linearRampToValueAtTime(0, t + KEYBOARD_PREVIEW_FADE_SECONDS);
      this.silentAt = t + KEYBOARD_PREVIEW_FADE_SECONDS;
      try { this.source.stop(this.silentAt); } catch { /* Already ended. */ }
    }
    this.source = null;
    this.gain = null;
  }

  /** First fetch happens only after the hover/focus dwell, or an explicit listen/select. */
  preview(choice: KeyboardSoundChoice, delayMs = KEYBOARD_PREVIEW_DELAY_MS): void {
    this.stop();
    if (this.disposed || choice.disabled || !choice.preview || keyboardPreviewGain(this.options.levels()) <= 0) return;
    const generation = this.generation;
    const play = (): void => { this.timer = null; void this.playPreview(choice.preview!, generation); };
    if (delayMs <= 0) play();
    else this.timer = setTimeout(play, delayMs);
  }

  private async playPreview(url: string, generation: number): Promise<void> {
    try {
      const ctx = this.sounds.resume();
      if (!this.buffers.has(url)) {
        const pending = (this.options.fetchBytes ?? defaultFetch)(url).then((bytes) => ctx.decodeAudioData(bytes));
        this.buffers.set(url, pending);
        void pending.catch(() => { if (this.buffers.get(url) === pending) this.buffers.delete(url); });
      }
      const buffer = await this.buffers.get(url)!;
      if (ctx.state === "suspended") await ctx.resume();
      const level = keyboardPreviewGain(this.options.levels());
      if (this.disposed || generation !== this.generation || level <= 0 || ctx.state !== "running") return;
      const start = Math.max(ctx.currentTime, this.silentAt);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(level, start);
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        if (this.source === source) { this.source = null; this.gain = null; }
      };
      source.start(start, 0, KEYBOARD_PREVIEW_SECONDS);
      source.stop(start + KEYBOARD_PREVIEW_SECONDS);
      this.source = source;
      this.gain = gain;
    } catch { /* Missing/blocked audio is silent; a later gesture may retry. */ }
  }

  /** Update a sounding preview immediately when the Master/Keyboard sliders or mute change. */
  refreshVolume(): void {
    const level = keyboardPreviewGain(this.options.levels());
    if (level <= 0) this.stop();
    else if (this.gain && this.sounds.context) {
      const t = this.sounds.context.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(level, t);
    }
  }

  /** The caller persists the id synchronously; samples load in parallel with exactly one preview. */
  select(choice: KeyboardSoundChoice): void {
    if (this.disposed || choice.disabled) return;
    const selection = ++this.selection;
    this.sounds.use("off");
    this.preview(choice, 0);
    if (choice.value === "off") return;
    if (!choice.manifest) {
      this.sounds.use(choice.value);
      this.options.onUse?.(choice);
      return;
    }
    const key = choice.value + "\n" + choice.manifest;
    if (!this.packs.has(key)) {
      this.packs.set(key, this.sounds.loadKeyboardManifest(choice.manifest, choice.value, choice.label, this.options.fetchJson, this.options.fetchBytes));
    }
    void this.packs.get(key)!.then((result) => {
      if (result.state !== "ready") this.packs.delete(key);
      if (this.disposed || selection !== this.selection) return;
      this.sounds.use(result.state === "pending" ? "off" : choice.value);
      this.options.onLoad?.(result);
    }).catch(() => { this.packs.delete(key); });
  }

  destroy(): void {
    this.stop();
    this.disposed = true;
    this.selection += 1;
    this.buffers.clear();
    this.packs.clear();
    if (!this.options.sounds) {
      // Let the 30 ms fade finish before closing our context.
      setTimeout(() => this.sounds.dispose(), KEYBOARD_PREVIEW_FADE_SECONDS * 1000);
    }
  }
}
