export type EverydayLessonMeta = {
  id: number;
  title: string;
  passageCount?: number;
};

export type EverydayLesson = {
  id: number;
  title: string;
  passages: string[];
};

// Only the numbered typing files are lessons. The two unnumbered files in
// this package are exact copies of lessons 00 and 01, verified by the tests.
// Keep these imports lazy: the complete corpus is several megabytes.
const lessonImports = import.meta.glob<string>(
  "../../../../adobe_commerce_lessons_1_180_package/02_Typing_Files/[0-9]*_typing.md",
  { query: "?raw", import: "default" },
);

type LessonSource = {
  metadata: EverydayLessonMeta;
  load: () => Promise<string>;
};

const lessonSources = new Map<number, LessonSource>();

for (const [path, load] of Object.entries(lessonImports)) {
  const match = /\/(\d+)_([^/]+)_typing\.md$/.exec(path);
  if (match === null) continue;

  const id = Number(match[1]);
  const name = (match[2] ?? "").replaceAll("_", " ");
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  if (lessonSources.has(id)) {
    throw new Error(`Everyday lesson ${id} has duplicate source files`);
  }

  lessonSources.set(id, { metadata: { id, title }, load });
}

const lessonCache = new Map<number, Promise<EverydayLesson>>();

export function getEverydayLessonIndex(): EverydayLessonMeta[] {
  return [...lessonSources.values()]
    .map(({ metadata }) => ({ ...metadata }))
    .sort((a, b) => a.id - b.id);
}

export function parseEverydayLessonPassages(text: string): string[] {
  // The author uses one physical line per passage. Some files have
  // blank separator lines and some do not; splitting only on blank
  // lines would accidentally merge entire lessons into one passage.
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export async function loadEverydayLesson(id: number): Promise<EverydayLesson> {
  const source = Number.isInteger(id) ? lessonSources.get(id) : undefined;
  if (source === undefined) {
    throw new Error(`Everyday lesson ${id} is unavailable`);
  }

  const cached = lessonCache.get(id);
  if (cached !== undefined) return cached;

  const pending = source
    .load()
    .then((text): EverydayLesson => {
      const passages = parseEverydayLessonPassages(text);

      if (passages.length === 0) {
        throw new Error(`Everyday lesson ${id} has no passages`);
      }

      source.metadata.passageCount = passages.length;
      return { ...source.metadata, passages };
    })
    .catch((error: unknown) => {
      // A failed request must not poison subsequent retries.
      lessonCache.delete(id);
      throw error;
    });

  lessonCache.set(id, pending);
  return pending;
}
