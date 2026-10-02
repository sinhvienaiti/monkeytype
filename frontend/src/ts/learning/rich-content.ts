import type { ContextClozeExercise } from "./context-cloze";
import type { SentenceBuilderExercise } from "./sentence-builder";

const DEFAULT_BASE_URL = "https://typing-game.local/english-content";

type RuntimeDataset = "sentences" | "grammar" | "phrases" | "dictionary";
type RuntimeShard = { id: string; path: string; count: number };
type RuntimeManifest = {
  schemaVersion: 1;
  contentVersion: string;
  dataset: RuntimeDataset;
  count: number;
  shards: RuntimeShard[];
};

export type PublishedEnglishExerciseType =
  | "cloze"
  | "error-correction"
  | "sentence-building"
  | "translation"
  | "transformation"
  | "listening-typing"
  | "contextual-usage"
  | "collocation"
  | "grammar-typing";

export type PublishedEnglishSentence = {
  schemaVersion: 1;
  id: string;
  text: string;
  cefr?: string;
  contexts?: string[];
  register?: string[];
  grammarIds?: string[];
  lexicalIds?: string[];
};

export type PublishedEnglishExercise = {
  schemaVersion: 1;
  id: string;
  type: PublishedEnglishExerciseType;
  prompt: string;
  targetIds: string[];
  acceptedAnswers: string[];
  sourceSentenceIds: string[];
  cefr?: string;
};

export type RichContentFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export type RichEnglishContentClient = {
  loadSentences: () => Promise<PublishedEnglishSentence[]>;
  loadExercises: (
    types?: readonly PublishedEnglishExerciseType[],
  ) => Promise<PublishedEnglishExercise[]>;
  loadPublishedContextClozeExercises: (
    cefr: string,
    maxExercises: number,
  ) => Promise<ContextClozeExercise[]>;
  loadPublishedSentenceBuilderExercise: (
    cefr?: string,
  ) => Promise<SentenceBuilderExercise | null>;
};

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.normalize("NFC").trim();
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item) => nonEmpty(item, `${field}[]`));
}

function parseManifest(value: unknown, dataset: RuntimeDataset): RuntimeManifest {
  if (
    !plainObject(value) ||
    value["schemaVersion"] !== 1 ||
    value["dataset"] !== dataset ||
    !Number.isInteger(value["count"]) ||
    !Array.isArray(value["shards"])
  ) {
    throw new TypeError(`Invalid ${dataset} runtime manifest`);
  }
  const shards: RuntimeShard[] = value["shards"].map((raw) => {
    if (
      !plainObject(raw) ||
      typeof raw["id"] !== "string" ||
      raw["id"].trim() === "" ||
      typeof raw["path"] !== "string" ||
      raw["path"].trim() === "" ||
      !Number.isInteger(raw["count"])
    ) {
      throw new TypeError(`Invalid ${dataset} runtime shard`);
    }
    return {
      id: raw["id"],
      path: raw["path"],
      count: raw["count"] as number,
    };
  });
  const count = value["count"] as number;
  if (count < 0 || shards.reduce((sum, shard) => sum + shard.count, 0) !== count) {
    throw new TypeError(`Invalid ${dataset} runtime manifest count`);
  }
  return {
    schemaVersion: 1,
    contentVersion: nonEmpty(value["contentVersion"], "contentVersion"),
    dataset,
    count,
    shards,
  };
}

function parseEnvelope(value: unknown, expectedCount: number): unknown[] {
  if (
    !plainObject(value) ||
    value["schemaVersion"] !== 1 ||
    !Array.isArray(value["records"]) ||
    value["records"].length !== expectedCount
  ) {
    throw new TypeError("Invalid rich-content runtime shard");
  }
  return value["records"];
}

function parseSentence(value: unknown): PublishedEnglishSentence {
  if (!plainObject(value) || value["schemaVersion"] !== 1) {
    throw new TypeError("Invalid published sentence");
  }
  const cefr =
    typeof value["cefr"] === "string" && value["cefr"].trim() !== ""
      ? value["cefr"].trim()
      : undefined;
  return {
    schemaVersion: 1,
    id: nonEmpty(value["id"], "sentence.id"),
    text: nonEmpty(value["text"], "sentence.text"),
    ...(cefr === undefined ? {} : { cefr }),
    ...(value["contexts"] === undefined ? {} : { contexts: stringArray(value["contexts"], "sentence.contexts") }),
    ...(value["register"] === undefined ? {} : { register: stringArray(value["register"], "sentence.register") }),
    ...(value["grammarIds"] === undefined ? {} : { grammarIds: stringArray(value["grammarIds"], "sentence.grammarIds") }),
    ...(value["lexicalIds"] === undefined ? {} : { lexicalIds: stringArray(value["lexicalIds"], "sentence.lexicalIds") }),
  };
}

const EXERCISE_TYPES = new Set<PublishedEnglishExerciseType>([
  "cloze", "error-correction", "sentence-building", "translation",
  "transformation", "listening-typing", "contextual-usage",
  "collocation", "grammar-typing",
]);

function parseExercise(value: unknown): PublishedEnglishExercise {
  if (!plainObject(value) || value["schemaVersion"] !== 1) {
    throw new TypeError("Invalid published exercise");
  }
  const type = value["type"];
  if (typeof type !== "string" || !EXERCISE_TYPES.has(type as PublishedEnglishExerciseType)) {
    throw new TypeError("Invalid published exercise type");
  }
  const acceptedAnswers = stringArray(value["acceptedAnswers"], "exercise.acceptedAnswers");
  const targetIds = stringArray(value["targetIds"], "exercise.targetIds");
  if (acceptedAnswers.length === 0 || targetIds.length === 0) {
    throw new TypeError("Published exercise must have targets and accepted answers");
  }
  const cefr =
    typeof value["cefr"] === "string" && value["cefr"].trim() !== ""
      ? value["cefr"].trim()
      : undefined;
  return {
    schemaVersion: 1,
    id: nonEmpty(value["id"], "exercise.id"),
    type: type as PublishedEnglishExerciseType,
    prompt: nonEmpty(value["prompt"], "exercise.prompt"),
    targetIds,
    acceptedAnswers,
    sourceSentenceIds: stringArray(value["sourceSentenceIds"] ?? [], "exercise.sourceSentenceIds"),
    ...(cefr === undefined ? {} : { cefr }),
  };
}

function normalizeBaseUrl(value: string | undefined): string {
  const normalized = (value ?? DEFAULT_BASE_URL).replace(/\/+$/u, "");
  return normalized === "" ? DEFAULT_BASE_URL : normalized;
}

export function createRichEnglishContentClient(
  options: { fetcher?: RichContentFetcher; baseUrl?: string } = {},
): RichEnglishContentClient {
  const fetcher = options.fetcher ?? fetch;
  const base = normalizeBaseUrl(options.baseUrl);
  const manifestCache = new Map<RuntimeDataset, Promise<RuntimeManifest>>();
  const shardCache = new Map<string, Promise<unknown[]>>();

  async function getJson(relative: string): Promise<unknown> {
    const response = await fetcher(
      base + "/" + relative.replace(/^\/+/u, ""),
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(
        `English content request failed: ${response.status} ${relative}`,
      );
    }
    return response.json();
  }

  async function loadManifest(dataset: RuntimeDataset): Promise<RuntimeManifest> {
    let pending = manifestCache.get(dataset);
    if (pending === undefined) {
      pending = getJson(`${dataset}/manifest.json`).then((value) =>
        parseManifest(value, dataset),
      );
      manifestCache.set(dataset, pending);
    }
    try {
      return await pending;
    } catch (error) {
      if (manifestCache.get(dataset) === pending) manifestCache.delete(dataset);
      throw error;
    }
  }

  async function loadShard(dataset: RuntimeDataset, shard: RuntimeShard): Promise<unknown[]> {
    const key = `${dataset}:${shard.path}`;
    let pending = shardCache.get(key);
    if (pending === undefined) {
      pending = getJson(`${dataset}/${shard.path}`).then((value) =>
        parseEnvelope(value, shard.count),
      );
      shardCache.set(key, pending);
    }
    try {
      return await pending;
    } catch (error) {
      if (shardCache.get(key) === pending) shardCache.delete(key);
      throw error;
    }
  }

  async function loadByPrefix(dataset: RuntimeDataset, prefix: string): Promise<unknown[]> {
    const manifest = await loadManifest(dataset);
    const shards = manifest.shards.filter((shard) => shard.id.startsWith(prefix));
    const groups = [];
    for (const shard of shards) {
      groups.push(await loadShard(dataset, shard));
    }
    return groups.flat();
  }

  async function loadSentences(): Promise<PublishedEnglishSentence[]> {
    return (await loadByPrefix("sentences", "examples-")).map(parseSentence);
  }

  async function loadExercises(
    types?: readonly PublishedEnglishExerciseType[],
  ): Promise<PublishedEnglishExercise[]> {
    const exercises = (await loadByPrefix("sentences", "exercises-")).map(parseExercise);
    if (types === undefined) return exercises;
    const wanted = new Set(types);
    return exercises.filter((exercise) => wanted.has(exercise.type));
  }

  async function loadPublishedContextClozeExercises(
    cefr: string,
    maxExercises: number,
  ): Promise<ContextClozeExercise[]> {
    const limit = Math.min(40, Math.max(1, Math.floor(maxExercises)));
    const [exercises, sentences] = await Promise.all([
      loadExercises(["cloze"]),
      loadSentences(),
    ]);
    const sentenceById = new Map(sentences.map((sentence) => [sentence.id, sentence]));
    return exercises
      .filter((exercise) => exercise.cefr === undefined || exercise.cefr === cefr)
      .slice(0, limit)
      .map((exercise): ContextClozeExercise => {
        const sourceId = exercise.sourceSentenceIds[0];
        const sentence = sourceId === undefined ? undefined : sentenceById.get(sourceId);
        const grammarId = exercise.targetIds.find((id) => id.startsWith("gr."));
        return {
          version: 1,
          id: exercise.id,
          passageId: sentence?.id ?? exercise.id,
          level: 0,
          cefr: exercise.cefr ?? sentence?.cefr ?? cefr,
          topic: grammarId ?? "Published English content",
          sentence: sentence?.text ?? exercise.prompt,
          maskedSentence: exercise.prompt,
          target: exercise.acceptedAnswers[0] as string,
          acceptedAnswers: exercise.acceptedAnswers,
          entityType: grammarId === undefined ? "vocabulary" : "grammar",
          entityId: grammarId ?? exercise.targetIds[0] ?? exercise.id,
          ...(grammarId === undefined ? {} : { grammarId }),
        };
      });
  }

  async function loadPublishedSentenceBuilderExercise(
    cefr?: string,
  ): Promise<SentenceBuilderExercise | null> {
    const exercises = await loadExercises(["sentence-building"]);
    const exercise =
      exercises.find(
        (candidate) =>
          cefr === undefined ||
          candidate.cefr === undefined ||
          candidate.cefr === cefr,
      ) ?? null;
    if (exercise === null) return null;
    const grammarId = exercise.targetIds.find((id) => id.startsWith("gr."));
    return {
      version: 1,
      sentenceId: exercise.sourceSentenceIds[0] ?? exercise.id,
      ...(grammarId === undefined ? {} : { grammarId }),
      prompt: exercise.prompt,
      acceptedAnswers: exercise.acceptedAnswers,
      difficulty: "normal",
    };
  }

  return {
    loadSentences,
    loadExercises,
    loadPublishedContextClozeExercises,
    loadPublishedSentenceBuilderExercise,
  };
}

const defaultClient = createRichEnglishContentClient();

export async function loadPublishedContextClozeExercises(
  cefr: string,
  maxExercises: number,
): Promise<ContextClozeExercise[]> {
  return await defaultClient.loadPublishedContextClozeExercises(
    cefr,
    maxExercises,
  );
}

export async function loadPublishedSentenceBuilderExercise(
  cefr?: string,
): Promise<SentenceBuilderExercise | null> {
  return await defaultClient.loadPublishedSentenceBuilderExercise(cefr);
}
