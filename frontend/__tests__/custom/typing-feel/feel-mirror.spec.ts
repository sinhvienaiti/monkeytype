import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  entryProblem,
  main,
  mirror,
  MirrorError,
  readZipEntries,
} from "../../../scripts/feel-mirror";

type Entry = {
  name: string;
  data?: string | Buffer;
  /** Unix file type and mode for the external attributes (default 0o100644). */
  mode?: number;
  deflate?: boolean;
  /** Overrides the CRC-32 written in the central directory. */
  crc?: number;
  flags?: number;
};

/** A plain zip, as `pnpm feel:pack` writes it (or broken on purpose). */
function zip(entries: readonly Entry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data ?? "");
    const body = entry.deflate === true ? deflateRawSync(data) : data;
    const method = entry.deflate === true ? 8 : 0;
    const crc = entry.crc ?? crc32(data);
    const flags = entry.flags ?? 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE((3 << 8) | 20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(flags, 8);
    head.writeUInt16LE(method, 10);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

const CATALOGUE = JSON.stringify({
  revision: "r7",
  profiles: [
    {
      id: "deep",
      manifest: "sets/deep/0123456789ab/keys-manifest.json",
      preview: "sets/deep/0123456789ab/preview.ogg",
    },
  ],
});

function pack(extra: readonly Entry[] = [], revision = "r7"): Entry[] {
  return [
    {
      name: "v1/health.json",
      data: JSON.stringify({ contract: 1, revision }),
      deflate: true,
    },
    {
      name: "v1/keys/keys-manifest.json",
      data: CATALOGUE.replace("r7", revision),
      deflate: true,
    },
    { name: "v1/keys/sets/deep/0123456789ab/" },
    {
      name: "v1/keys/sets/deep/0123456789ab/keys-manifest.json",
      data: '{"files":["key-01.ogg"],"preview":"preview.ogg"}',
      deflate: true,
    },
    {
      name: "v1/keys/sets/deep/0123456789ab/key-01.ogg",
      data: `OggS ${revision}`,
    },
    {
      name: "v1/keys/sets/deep/0123456789ab/preview.ogg",
      data: "OggS preview",
    },
    ...extra,
  ];
}

let root: string;
let dest: string;

function writeZip(entries: readonly Entry[], name = "pack.zip"): string {
  const file = join(root, name);
  writeFileSync(file, zip(entries));
  return file;
}

const quiet = (): {
  out: { write: (t: string) => void };
  err: { write: (t: string) => void };
  text: { out: string; err: string };
} => {
  const text = { out: "", err: "" };
  return {
    text,
    out: { write: (t) => void (text.out += t) },
    err: { write: (t) => void (text.err += t) },
  };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "feel-mirror-"));
  dest = join(root, "static", "typing-feel");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("feel:mirror", () => {
  it("unpacks a pack under static/typing-feel/ and prints the URL to use", () => {
    const file = writeZip(pack());
    const io = quiet();
    expect(main(["pack.zip"], { ...io, cwd: root, dest })).toBe(0);
    expect(readFileSync(join(dest, "v1/keys/keys-manifest.json"), "utf8")).toBe(
      CATALOGUE,
    );
    expect(
      readFileSync(
        join(dest, "v1/keys/sets/deep/0123456789ab/key-01.ogg"),
        "utf8",
      ),
    ).toBe("OggS r7");
    expect(io.text.out).toContain("Typing Feel r7 mirrored");
    expect(io.text.out).toContain("1 sets, 5 files");
    expect(io.text.out).toContain("TYPING_FEEL_URL=/typing-feel");
    expect(io.text.err).toBe("");
    // Only the mirror is left beside it: no staging folder.
    expect(readdirSync(join(root, "static"))).toEqual(["typing-feel"]);
    expect(existsSync(file)).toBe(true);
  });

  it("replaces the previous mirror whole: files of the old pack do not survive", () => {
    mirror(writeZip(pack([], "r7"), "old.zip"), dest);
    mkdirSync(join(dest, "v1/keys/sets/gone"), { recursive: true });
    writeFileSync(join(dest, "v1/keys/sets/gone/key-01.ogg"), "old");
    const result = mirror(writeZip(pack([], "r8"), "new.zip"), dest);
    expect(result).toMatchObject({ revision: "r8", replaced: true, files: 5 });
    expect(existsSync(join(dest, "v1/keys/sets/gone"))).toBe(false);
    expect(
      readFileSync(
        join(dest, "v1/keys/sets/deep/0123456789ab/key-01.ogg"),
        "utf8",
      ),
    ).toBe("OggS r8");
    expect(readdirSync(join(root, "static"))).toEqual(["typing-feel"]);
  });

  it("puts back a mirror an interrupted swap left only in its previous folder", () => {
    mirror(writeZip(pack([], "r7"), "old.zip"), dest);
    // A run stopped between its two renames: no mirror, the old copy aside.
    renameSync(dest, join(root, "static", ".typing-feel-previous-4242"));
    const io = quiet();
    const bad = writeZip(
      pack().map((e) => (e.name.endsWith("key-01.ogg") ? { ...e, crc: 1 } : e)),
      "bad.zip",
    );
    expect(main([bad], { ...io, dest })).toBe(1);
    expect(io.text.err).toMatch(/CRC-32/);
    expect(
      readFileSync(
        join(dest, "v1/keys/sets/deep/0123456789ab/key-01.ogg"),
        "utf8",
      ),
    ).toBe("OggS r7");
    expect(readdirSync(join(root, "static"))).toEqual(["typing-feel"]);
    // A good pack then replaces it as usual.
    expect(mirror(writeZip(pack([], "r8"), "new.zip"), dest)).toMatchObject({
      revision: "r8",
      replaced: true,
    });
    expect(readdirSync(join(root, "static"))).toEqual(["typing-feel"]);
  });

  it("warns about the old sync-keys copy beside the mirror and leaves it to the player", () => {
    const old = join(root, "static", "sounds", "keys", "deep");
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, "key-01.ogg"), "OggS old");
    const io = quiet();
    expect(main([writeZip(pack())], { ...io, dest })).toBe(0);
    expect(io.text.err).toContain(
      `rm -rf ${join(root, "static", "sounds", "keys")}`,
    );
    expect(io.text.err).toMatch(/committed as media/);
    expect(existsSync(join(old, "key-01.ogg"))).toBe(true);
    expect(existsSync(join(dest, "v1/health.json"))).toBe(true);
  });

  it.each([
    ["../escape.json", /outside v1|segment/],
    ["v1/../../escape.json", /segment/],
    ["v1/keys/../../../escape.json", /segment/],
    ["/etc/escape.json", /absolute/],
    ["C:/escape.json", /drive letter/],
    ["v1\\..\\escape.json", /backslash/],
    ["v1//double.json", /segment/],
    ["other/file.json", /outside v1/],
    ["__MACOSX/v1/._x", /outside v1/],
  ])(
    "refuses the entry %s and leaves the previous mirror as it was",
    (name, why) => {
      mirror(writeZip(pack(), "good.zip"), dest);
      const before = readFileSync(join(dest, "v1/keys/keys-manifest.json"));
      const io = quiet();
      const bad = writeZip(pack([{ name, data: "{}" }]), "bad.zip");
      expect(main([bad], { ...io, dest })).toBe(1);
      expect(io.text.err).toMatch(why);
      expect(io.text.err).toContain("Nothing was changed.");
      expect(readFileSync(join(dest, "v1/keys/keys-manifest.json"))).toEqual(
        before,
      );
      expect(existsSync(join(root, "escape.json"))).toBe(false);
      expect(existsSync(join(root, "static", "escape.json"))).toBe(false);
      expect(readdirSync(join(root, "static"))).toEqual(["typing-feel"]);
    },
  );

  it("refuses a symbolic link, two names that differ only in case, and a bad CRC", () => {
    const cases: [Entry[], RegExp][] = [
      [
        pack([
          { name: "v1/keys/link", data: "../../../../etc", mode: 0o120777 },
        ]),
        /symbolic link/,
      ],
      [
        pack([{ name: "v1/keys/KEYS-MANIFEST.JSON", data: "{}" }]),
        /listed twice/,
      ],
      [
        pack().map((e) =>
          e.name.endsWith("key-01.ogg") ? { ...e, crc: 1 } : e,
        ),
        /CRC-32/,
      ],
      [
        pack([{ name: "v1/secret.json", data: "{}", flags: 0x801 }]),
        /encrypted/,
      ],
    ];
    for (const [entries, why] of cases) {
      expect(() => mirror(writeZip(entries), dest)).toThrow(why);
      expect(existsSync(dest)).toBe(false);
      expect(readdirSync(root).filter((n) => n !== "pack.zip")).toEqual(
        existsSync(join(root, "static")) ? ["static"] : [],
      );
      if (existsSync(join(root, "static"))) {
        expect(readdirSync(join(root, "static"))).toEqual([]);
      }
    }
  });

  it("refuses a zip that is not a Typing Feel pack, or not a zip", () => {
    const noCatalogue = pack().filter(
      (e) => e.name !== "v1/keys/keys-manifest.json",
    );
    expect(() => mirror(writeZip(noCatalogue), dest)).toThrow(
      /no v1\/keys\/keys-manifest\.json/,
    );
    const noSets = pack().map((e) =>
      e.name === "v1/keys/keys-manifest.json"
        ? { ...e, data: '{"revision":"r7","profiles":[]}' }
        : e,
    );
    expect(() => mirror(writeZip(noSets), dest)).toThrow(/no keyboard set/);
    writeFileSync(join(root, "page.zip"), "<!doctype html>".repeat(4));
    expect(() => mirror(join(root, "page.zip"), dest)).toThrow(MirrorError);
    expect(() => mirror(join(root, "missing.zip"), dest)).toThrow(
      /cannot read/,
    );
    expect(existsSync(dest)).toBe(false);
  });

  it("reads the central directory and checks names on their own", () => {
    const entries = readZipEntries(zip(pack()));
    expect(entries.map((e) => e.name)).toContain("v1/health.json");
    expect(entries.find((e) => e.name.endsWith("/"))?.directory).toBe(true);
    expect(entryProblem("v1/keys/keys-manifest.json")).toBeNull();
    expect(entryProblem("v1/keys/")).toBeNull();
    expect(entryProblem("")).toBe("an empty name");
    expect(entryProblem("v1/./x")).toMatch(/segment/);
  });

  it("CLI: one zip only, usage exit 2", () => {
    const io = quiet();
    expect(main([], { ...io, dest })).toBe(2);
    expect(main(["a.zip", "b.zip"], { ...io, dest })).toBe(2);
    expect(main(["--help"], { ...io, dest })).toBe(0);
    expect(io.text.out).toContain("pnpm feel:mirror");
  });
});
