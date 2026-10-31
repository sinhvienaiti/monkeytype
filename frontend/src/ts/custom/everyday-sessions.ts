import { getEverydayLessonIndex, loadEverydayLesson } from "./everyday-lessons";

const PROGRESS_KEY = "personalTypingEverydayProgress";

export type EverydaySession = {
  lessonId: number;
  title: string;
  start: number;
  end: number;
  totalPassages: number;
  text: string;
  hasPrevious: boolean;
  hasNext: boolean;
};

export type EverydaySessionDirection = "current" | "next" | "prev";

type LessonProgress = {
  start: number;
  end: number;
  previousStarts: number[];
};

type ProgressStore = {
  version: 1;
  active: EverydaySession | null;
  lessons: Record<string, LessonProgress>;
};

const preparedSessions = new WeakMap<EverydaySession, ProgressStore>();
let fallbackProgress: ProgressStore | null = null;

function emptyProgress(): ProgressStore {
  return { version: 1, active: null, lessons: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSession(value: unknown): value is EverydaySession {
  return (
    isRecord(value) &&
    isIndex(value["lessonId"]) &&
    typeof value["title"] === "string" &&
    isIndex(value["start"]) &&
    isIndex(value["end"]) &&
    isIndex(value["totalPassages"]) &&
    value["start"] < value["end"] &&
    value["end"] <= value["totalPassages"] &&
    typeof value["text"] === "string" &&
    value["text"].trim() !== "" &&
    typeof value["hasPrevious"] === "boolean" &&
    typeof value["hasNext"] === "boolean"
  );
}

function isLessonProgress(value: unknown): value is LessonProgress {
  if (
    !isRecord(value) ||
    !isIndex(value["start"]) ||
    !isIndex(value["end"]) ||
    value["start"] >= value["end"] ||
    !Array.isArray(value["previousStarts"])
  ) {
    return false;
  }
  const currentStart = value["start"];
  return value["previousStarts"].every(
    (start: unknown, index: number, starts: unknown[]) =>
      isIndex(start) &&
      start < currentStart &&
      (index === 0 || (starts[index - 1] as number) < start),
  );
}

function loadProgress(): ProgressStore {
  if (fallbackProgress !== null) {
    return {
      version: 1,
      active:
        fallbackProgress.active === null
          ? null
          : { ...fallbackProgress.active },
      lessons: Object.fromEntries(
        Object.entries(fallbackProgress.lessons).map(([id, progress]) => [
          id,
          { ...progress, previousStarts: [...progress.previousStarts] },
        ]),
      ),
    };
  }

  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw === null) return emptyProgress();

    const data: unknown = JSON.parse(raw);
    if (
      !isRecord(data) ||
      data["version"] !== 1 ||
      !isRecord(data["lessons"])
    ) {
      return emptyProgress();
    }

    const lessons: Record<string, LessonProgress> = {};
    for (const [id, progress] of Object.entries(data["lessons"])) {
      if (isIndex(Number(id)) && isLessonProgress(progress)) {
        lessons[id] = progress;
      }
    }

    return {
      version: 1,
      active: isSession(data["active"]) ? data["active"] : null,
      lessons,
    };
  } catch {
    return emptyProgress();
  }
}

function passageCount(value: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(15, Math.trunc(value)))
    : 1;
}

export function loadEverydaySession(): EverydaySession | null {
  return loadProgress().active;
}

/** Build a candidate without advancing saved progress or changing the active text. */
export async function prepareEverydaySession(
  lessonId: number,
  count: number,
  direction: EverydaySessionDirection = "current",
): Promise<EverydaySession> {
  const index = getEverydayLessonIndex();
  let lessonIndex = index.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex < 0) lessonIndex = 0;
  const metadata = index[lessonIndex];
  if (metadata === undefined) {
    throw new Error("Everyday lessons are unavailable");
  }

  const progress = loadProgress();
  const active =
    progress.active?.lessonId === metadata.id ? progress.active : null;
  let lesson = await loadEverydayLesson(metadata.id);
  let saved = progress.lessons[String(lesson.id)];
  let start = saved?.start ?? active?.start ?? 0;
  let previousStarts = [...(saved?.previousStarts ?? [])];
  const size = passageCount(count);

  if (direction === "next" && active !== null) {
    if (active.end < lesson.passages.length) {
      start = active.end;
      previousStarts.push(active.start);
    } else if (lessonIndex < index.length - 1) {
      lessonIndex += 1;
      const next = index[lessonIndex];
      if (next === undefined) throw new Error("Everyday lesson is unavailable");
      lesson = await loadEverydayLesson(next.id);
      start = 0;
      previousStarts = [];
    }
  } else if (direction === "prev" && active !== null) {
    if (active.start > 0) {
      start = previousStarts.pop() ?? Math.max(0, active.start - size);
    } else if (lessonIndex > 0) {
      lessonIndex -= 1;
      const previous = index[lessonIndex];
      if (previous === undefined) {
        throw new Error("Everyday lesson is unavailable");
      }
      lesson = await loadEverydayLesson(previous.id);
      saved = progress.lessons[String(lesson.id)];
      const lastGroupStart =
        Math.floor((lesson.passages.length - 1) / size) * size;
      start = saved?.start ?? lastGroupStart;
      previousStarts = [...(saved?.previousStarts ?? [])];
    }
  }

  if (
    lesson.passages.length === 0 ||
    lesson.passages.some((passage) => passage.trim() === "")
  ) {
    throw new Error(`Everyday lesson ${lesson.id} has invalid passages`);
  }

  start = Math.max(0, Math.min(start, lesson.passages.length - 1));
  previousStarts = previousStarts.filter((previous) => previous < start);
  const end = Math.min(start + size, lesson.passages.length);
  const session: EverydaySession = {
    lessonId: lesson.id,
    title: lesson.title,
    start,
    end,
    totalPassages: lesson.passages.length,
    text: lesson.passages.slice(start, end).join(" "),
    hasPrevious: start > 0 || lessonIndex > 0,
    hasNext: end < lesson.passages.length || lessonIndex < index.length - 1,
  };

  progress.active = session;
  progress.lessons[String(session.lessonId)] = { start, end, previousStarts };
  preparedSessions.set(session, progress);
  return session;
}

/** Commit only after the candidate text and its learning aids were applied. */
export function commitEverydaySession(session: EverydaySession): void {
  const progress = preparedSessions.get(session);
  if (progress === undefined) {
    throw new Error("Everyday session must be prepared before committing");
  }

  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    fallbackProgress = null;
  } catch {
    // Keep navigation usable when the browser disallows local storage.
    fallbackProgress = progress;
  }
  preparedSessions.delete(session);
}
