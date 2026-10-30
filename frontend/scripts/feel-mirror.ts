/**
 * pnpm feel:mirror <typing-feel-v1-rN.zip>
 *
 * Typing Feel for a machine without the feel host (the company Mac, parent
 * repo docs/games/TYPING_FEEL_SERVICE.md §6.5): the zip `pnpm feel:pack`
 * writes in the parent repo is unpacked into static/typing-feel/ (ignored by
 * Git), Monkeytype serves it itself, and TYPING_FEEL_URL=/typing-feel points
 * the game at it. A relative zip path is read from the folder pnpm was run in.
 *
 * Refuses (exit 1, the previous mirror untouched) anything but a plain pack:
 * an entry outside v1/, a path that could escape the folder (absolute, a
 * drive letter, a backslash, an empty, "." or ".." segment), a link, two
 * entries that differ only in case, an encrypted, zip64 or multi-disk
 * archive, a method other than store or deflate, a size or CRC-32 that does
 * not match, and a pack without v1/keys/keys-manifest.json or v1/health.json.
 * The new copy is unpacked beside the old one and swapped in by renames, so
 * the game never reads a half-written mirror; a run stopped between those
 * renames is undone by the next one.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, inflateRawSync } from "node:zlib";

export class MirrorError extends Error {}

const here = dirname(fileURLToPath(import.meta.url));
/** Served by Vite from the public folder as /typing-feel/. */
export const DEFAULT_DEST = resolve(here, "../static/typing-feel");
/** The TYPING_FEEL_URL that reads the mirror (the Typing Feel root, same origin). */
export const MIRROR_URL = "/typing-feel";
export const CATALOGUE = "v1/keys/keys-manifest.json";
export const HEALTH = "v1/health.json";
/**
 * The keyboard copy the retired sync-keys script wrote beside the mirror
 * (static/sounds/keys/). Git no longer ignores it, so its OGG files would be
 * committed as media: feel:mirror asks for it to be deleted.
 */
export const OLD_COPY = ["sounds", "keys"] as const;

const MAX_ENTRIES = 50_000;
/** Unpacked bytes in all; the 34-set pack is about 27 MB. */
const MAX_TOTAL_BYTES = 1024 ** 3;
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const UTF8_NAMES = 0x800;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

export type ZipEntry = {
  readonly name: string;
  readonly directory: boolean;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
};

function findEndRecord(zip: Buffer): number {
  const last = zip.length - 22;
  const first = Math.max(0, last - 0xffff);
  for (let at = last; at >= first; at -= 1) {
    if (zip.readUInt32LE(at) === EOCD) return at;
  }
  throw new MirrorError("not a zip file (no end of central directory)");
}

function entryName(bytes: Buffer, flags: number): string {
  if ((flags & UTF8_NAMES) === 0 && bytes.some((byte) => byte >= 0x80)) {
    throw new MirrorError("an entry name is neither ASCII nor marked UTF-8");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MirrorError("an entry name is not valid UTF-8");
  }
}

/** The central directory of `zip`; throws MirrorError on anything a plain pack never holds. */
export function readZipEntries(zip: Buffer): ZipEntry[] {
  if (zip.length < 22) throw new MirrorError("not a zip file (too short)");
  const end = findEndRecord(zip);
  const disk = zip.readUInt16LE(end + 4);
  const centralDisk = zip.readUInt16LE(end + 6);
  const onDisk = zip.readUInt16LE(end + 8);
  const count = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  const centralOffset = zip.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || onDisk !== count) {
    throw new MirrorError("multi-disk zip");
  }
  if (
    count === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new MirrorError("zip64 archive (a pack is never that large)");
  }
  if (count > MAX_ENTRIES) {
    throw new MirrorError(`${count} entries (at most ${MAX_ENTRIES})`);
  }
  if (centralOffset + centralSize > end) {
    throw new MirrorError("damaged zip (central directory out of range)");
  }
  const entries: ZipEntry[] = [];
  let at = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || zip.readUInt32LE(at) !== CENTRAL) {
      throw new MirrorError("damaged zip (bad central directory entry)");
    }
    const madeBy = zip.readUInt16LE(at + 4);
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const compressedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const external = zip.readUInt32LE(at + 38);
    const offset = zip.readUInt32LE(at + 42);
    if (at + 46 + nameLength > end) {
      throw new MirrorError("damaged zip (entry name out of range)");
    }
    const name = entryName(zip.subarray(at + 46, at + 46 + nameLength), flags);
    if ((flags & 0x1) !== 0) throw new MirrorError(`${name}: encrypted`);
    if (method !== 0 && method !== 8) {
      throw new MirrorError(`${name}: compression method ${method}`);
    }
    if (
      compressedSize === 0xffffffff ||
      size === 0xffffffff ||
      offset === 0xffffffff
    ) {
      throw new MirrorError(`${name}: zip64 entry`);
    }
    // Unix permissions sit in the high half of the external attributes.
    const unixMode = madeBy >> 8 === 3 ? external >>> 16 : 0;
    if ((unixMode & S_IFMT) === S_IFLNK) {
      throw new MirrorError(`${name}: a symbolic link`);
    }
    entries.push({
      name,
      directory: name.endsWith("/"),
      method,
      crc,
      compressedSize,
      size,
      offset,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Why `name` may not be unpacked, or null: only plain relative paths under v1/. */
export function entryProblem(name: string): string | null {
  if (name === "") return "an empty name";
  if (name.includes("\\")) return "a backslash";
  if (name.includes("\0")) return "a NUL character";
  if (name.startsWith("/")) return "an absolute path";
  if (/^[A-Za-z]:/.test(name)) return "a drive letter";
  const parts = (name.endsWith("/") ? name.slice(0, -1) : name).split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return 'an empty, "." or ".." segment';
  }
  if (parts[0] !== "v1") return "outside v1/";
  return null;
}

function entryData(zip: Buffer, entry: ZipEntry): Buffer {
  const at = entry.offset;
  if (at + 30 > zip.length || zip.readUInt32LE(at) !== LOCAL) {
    throw new MirrorError(`${entry.name}: damaged local header`);
  }
  const start = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
  const stop = start + entry.compressedSize;
  if (stop > zip.length) throw new MirrorError(`${entry.name}: truncated`);
  const raw = zip.subarray(start, stop);
  let data: Buffer;
  if (entry.method === 0) {
    data = raw;
  } else {
    try {
      // The bound stops a zip bomb: never more than the size it declares.
      data = inflateRawSync(raw, { maxOutputLength: Math.max(1, entry.size) });
    } catch {
      throw new MirrorError(`${entry.name}: does not inflate to its size`);
    }
  }
  if (data.length !== entry.size) {
    throw new MirrorError(`${entry.name}: size does not match`);
  }
  if (crc32(data) !== entry.crc) {
    throw new MirrorError(`${entry.name}: CRC-32 does not match`);
  }
  return data;
}

function inside(root: string, name: string): string {
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new MirrorError(`${name}: resolves outside the mirror folder`);
  }
  return target;
}

function readJson(file: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch {
    throw new MirrorError(`${name}: not JSON`);
  }
}

export type MirrorResult = {
  readonly dest: string;
  readonly revision: string;
  readonly sets: number;
  readonly files: number;
  readonly bytes: number;
  readonly replaced: boolean;
  /** The old sync-keys copy beside the mirror, still on disk; null when gone. */
  readonly oldCopy: string | null;
};

/**
 * A run stopped between its two renames leaves no mirror and the only copy
 * in `.typing-feel-previous-<pid>`: the newest one goes back first, so the
 * sweep of leftovers never deletes it.
 */
function restoreInterrupted(
  parent: string,
  prefix: string,
  dest: string,
): void {
  if (existsSync(dest)) return;
  const kept = readdirSync(parent)
    .filter((name) => name.startsWith(`${prefix}previous-`))
    .map((name) => ({
      path: join(parent, name),
      time: statSync(join(parent, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  const newest = kept[0];
  if (newest !== undefined) renameSync(newest.path, dest);
}

/** Unpacks `zipPath` into `dest`, replacing the previous mirror only once the new one is complete. */
export function mirror(zipPath: string, dest = DEFAULT_DEST): MirrorResult {
  let zip: Buffer;
  try {
    zip = readFileSync(zipPath);
  } catch (error) {
    throw new MirrorError(
      `cannot read ${zipPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const entries = readZipEntries(zip);
  const seen = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    const problem = entryProblem(entry.name);
    if (problem !== null) throw new MirrorError(`${entry.name}: ${problem}`);
    // macOS folders are case-blind: two such names would overwrite each other.
    const key = entry.name.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) {
      throw new MirrorError(`${entry.name}: listed twice (ignoring case)`);
    }
    seen.add(key);
    total += entry.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    throw new MirrorError(
      `${total} bytes unpacked (at most ${MAX_TOTAL_BYTES})`,
    );
  }
  for (const required of [CATALOGUE, HEALTH]) {
    if (!entries.some((entry) => entry.name === required && !entry.directory)) {
      throw new MirrorError(`no ${required}: not a Typing Feel pack`);
    }
  }

  const parent = dirname(dest);
  const prefix = `.${basename(dest)}-`;
  mkdirSync(parent, { recursive: true });
  restoreInterrupted(parent, prefix, dest);
  // Left by an earlier run that stopped half-way.
  for (const name of readdirSync(parent)) {
    if (
      name.startsWith(`${prefix}incoming-`) ||
      name.startsWith(`${prefix}previous-`)
    ) {
      rmSync(join(parent, name), { recursive: true, force: true });
    }
  }
  const stage = join(parent, `${prefix}incoming-${process.pid}`);
  const previous = join(parent, `${prefix}previous-${process.pid}`);
  let revision = "";
  let sets = 0;
  let files = 0;
  try {
    mkdirSync(stage);
    for (const entry of entries) {
      const target = inside(stage, entry.name);
      if (entry.directory) {
        mkdirSync(target, { recursive: true });
        continue;
      }
      const data = entryData(zip, entry);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, data, { flag: "wx" });
      files += 1;
    }
    const catalogue = readJson(join(stage, CATALOGUE), CATALOGUE) as {
      revision?: unknown;
      profiles?: unknown;
    } | null;
    if (
      catalogue === null ||
      typeof catalogue !== "object" ||
      !Array.isArray(catalogue.profiles) ||
      catalogue.profiles.length === 0
    ) {
      throw new MirrorError(`${CATALOGUE}: no keyboard set listed`);
    }
    readJson(join(stage, HEALTH), HEALTH);
    revision =
      typeof catalogue.revision === "string" ? catalogue.revision : "unknown";
    sets = catalogue.profiles.length;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    if (error instanceof MirrorError) throw error;
    throw new MirrorError(
      `unpacking failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const replaced = existsSync(dest);
  if (replaced) renameSync(dest, previous);
  try {
    renameSync(stage, dest);
  } catch (error) {
    if (replaced) renameSync(previous, dest);
    rmSync(stage, { recursive: true, force: true });
    throw new MirrorError(
      `could not swap the mirror in: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (replaced) rmSync(previous, { recursive: true, force: true });
  const oldCopy = join(parent, ...OLD_COPY);
  return {
    dest,
    revision,
    sets,
    files,
    bytes: total,
    replaced,
    oldCopy: existsSync(oldCopy) ? oldCopy : null,
  };
}

const USAGE = "Usage (in frontend): pnpm feel:mirror <typing-feel-v1-rN.zip>";

type Write = { write: (text: string) => unknown };

export function main(
  argv: readonly string[],
  options: {
    readonly out?: Write;
    readonly err?: Write;
    readonly cwd?: string;
    readonly dest?: string;
  } = {},
): number {
  const out = options.out ?? process.stdout;
  const err = options.err ?? process.stderr;
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  if (args.includes("-h") || args.includes("--help")) {
    out.write(`${USAGE}\n`);
    return 0;
  }
  if (args.length !== 1 || args[0]?.startsWith("-") === true) {
    err.write(`Give exactly one zip. ${USAGE}\n`);
    return 2;
  }
  // pnpm runs the script in frontend/; INIT_CWD is where it was typed.
  const cwd = options.cwd ?? process.env["INIT_CWD"] ?? process.cwd();
  const zipPath = resolve(cwd, args[0] as string);
  try {
    const result = mirror(zipPath, options.dest);
    const mb = (result.bytes / 1e6).toFixed(1);
    out.write(
      `Typing Feel ${result.revision} mirrored into ${result.dest}: ${result.sets} sets, ${result.files} files, ${mb} MB${result.replaced ? " (previous copy replaced)" : ""}.\n` +
        `Run Monkeytype with TYPING_FEEL_URL=${MIRROR_URL}, for example in the monkeytype folder:\n` +
        `  TYPING_FEEL_URL=${MIRROR_URL} pnpm dev-fe\n` +
        `or put the line TYPING_FEEL_URL=${MIRROR_URL} in frontend/.env.\n`,
    );
    if (result.oldCopy !== null) {
      err.write(
        `Warning: ${result.oldCopy} is the old sync-keys copy of the keyboard sounds. ` +
          `Git no longer ignores it, so its OGG files would be committed as media, ` +
          `and nothing reads it any more. Delete it:\n  rm -rf ${result.oldCopy}\n`,
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof MirrorError) {
      err.write(
        `feel:mirror refused ${zipPath}: ${error.message}\nNothing was changed.\n`,
      );
      return 1;
    }
    throw error;
  }
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
