import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const frontend = resolve(__dirname, "../../..");
const tsx = join(frontend, "node_modules/.bin/tsx");

/** Stand-in bytes for the test's own throwaway folders; no audio is made. */
const FILES: Record<string, string> = {
  "key-01.ogg": "k1",
  "key-02.ogg": "k2",
  "space-01.ogg": "s1",
  "preview.ogg": "p",
};

const sha = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

let root: string;
let lab: string;
let dest: string;
let script: string;

function writeLab(files: Record<string, string> = FILES): void {
  mkdirSync(join(lab, "alpha"), { recursive: true });
  writeFileSync(
    join(lab, "keys-manifest.json"),
    JSON.stringify({
      profiles: [
        {
          id: "alpha",
          name: "Alpha",
          family: "Deep",
          score: 7,
          manifest: "alpha/keys-manifest.json",
          preview: "alpha/preview.ogg",
          order: 1,
        },
      ],
    }),
  );
  writeFileSync(
    join(lab, "alpha/keys-manifest.json"),
    JSON.stringify({
      id: "alpha",
      files: ["key-01.ogg", "key-02.ogg", "space-01.ogg"],
      preview: "preview.ogg",
    }),
  );
  for (const [file, bytes] of Object.entries(files)) {
    writeFileSync(join(lab, "alpha", file), bytes);
  }
}

function run(
  args: string[] = [],
  source = lab,
): { status: number | null; out: string } {
  const result = spawnSync(tsx, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KEYS_FIREFLY_DIR: source },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const sums = (): string => readFileSync(join(dest, "keys.sha256"), "utf8");

beforeEach(() => {
  // A copy of the script in a throwaway frontend: it writes to its own
  // ../static/sounds/keys, never to the real one.
  root = mkdtempSync(join(tmpdir(), "sync-keys-"));
  lab = join(root, "lab");
  dest = join(root, "static/sounds/keys");
  script = join(root, "scripts/sync-keyboard-sounds.ts");
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(frontend, "scripts/sync-keyboard-sounds.ts"), script);
  writeLab();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("pnpm sync-keys and keys.sha256", { timeout: 30_000 }, () => {
  it("writes one sha256 per OGG, sorted by path, in the shasum format", () => {
    expect(run().status).toBe(0);
    expect(sums()).toBe(
      [
        `${sha("k1")}  alpha/key-01.ogg`,
        `${sha("k2")}  alpha/key-02.ogg`,
        `${sha("p")}  alpha/preview.ogg`,
        `${sha("s1")}  alpha/space-01.ogg`,
        "",
      ].join("\n"),
    );
    expect(run(["--check"]).status).toBe(0);
  });

  it("fails --check when the local audio is not the version keys.sha256 records, though it matches the Audio Lab", () => {
    run();
    // Git brings back the list of an older commit: the code expects other takes.
    writeFileSync(
      join(dest, "keys.sha256"),
      sums().replace(sha("k2"), sha("older take")),
    );
    const check = run(["--check"]);
    expect(check.status).toBe(1);
    expect(check.out).toContain("alpha/key-02.ogg");
  });

  it("checks the local audio against keys.sha256 when the Audio Lab is not on this machine", () => {
    run();
    const away = join(root, "no-lab");
    expect(run(["--check"], away).status).toBe(0);
    writeFileSync(join(dest, "alpha/key-01.ogg"), "changed");
    const check = run(["--check"], away);
    expect(check.status).toBe(1);
    expect(check.out).toContain("alpha/key-01.ogg");
  });

  it("names Audio Lab takes that differ from keys.sha256 in --check", () => {
    run();
    writeLab({ ...FILES, "key-01.ogg": "rebuilt" });
    const check = run(["--check"]);
    expect(check.status).toBe(1);
    expect(check.out).toContain("alpha/key-01.ogg");
  });

  it("rewrites keys.sha256 when a rebuilt Audio Lab is synced, so Git shows the change", () => {
    run();
    writeLab({ ...FILES, "key-01.ogg": "rebuilt" });
    const sync = run();
    expect(sync.status).toBe(0);
    expect(sync.out).toContain("keys.sha256");
    expect(sums()).toContain(`${sha("rebuilt")}  alpha/key-01.ogg`);
    expect(sums()).not.toContain(sha("k1"));
    expect(run(["--check"]).status).toBe(0);
  });
});
