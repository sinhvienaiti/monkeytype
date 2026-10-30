import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  envConfig,
  typingFeelOrigin,
  typingFeelPreconnect,
} from "../../../vite-plugins/env-config";
import { typingFeelMirrorGuard } from "../../../vite-plugins/typing-feel-mirror";

type Hook = (id: string) => unknown;
type HtmlHook = {
  order: string;
  handler: (html: string, ctx: { filename: string }) => unknown;
};

function plugin(env: Record<string, string>): {
  config: (development: boolean) => Record<string, unknown>;
  html: HtmlHook;
} {
  const make = (isDevelopment: boolean): ReturnType<typeof envConfig> =>
    envConfig({ isDevelopment, clientVersion: "TESTING", env });
  return {
    config: (development) => {
      const code = (make(development).load as Hook)(
        "\0virtual:env-config",
      ) as string;
      const json = /envConfig = (\{.*\});/s.exec(code)?.[1] ?? "{}";
      return JSON.parse(json) as Record<string, unknown>;
    },
    html: make(false).transformIndexHtml as unknown as HtmlHook,
  };
}

describe("TYPING_FEEL_URL in the build", () => {
  it("passes the value through trimmed, in dev and prod configs; unset or blank is off", () => {
    for (const development of [true, false]) {
      expect(
        plugin({ TYPING_FEEL_URL: " https://feel.typing-game.local " }).config(
          development,
        )["typingFeelUrl"],
      ).toBe("https://feel.typing-game.local");
      expect(plugin({}).config(development)).not.toHaveProperty(
        "typingFeelUrl",
      );
      expect(
        plugin({ TYPING_FEEL_URL: "  " }).config(development),
      ).not.toHaveProperty("typingFeelUrl");
    }
  });

  it("preconnects only to an absolute http(s) origin (§5.1 step 2)", () => {
    expect(typingFeelOrigin("https://feel.typing-game.local")).toBe(
      "https://feel.typing-game.local",
    );
    expect(typingFeelOrigin("https://cdn.example/feel/v1/")).toBe(
      "https://cdn.example",
    );
    for (const value of [
      undefined,
      "",
      "/typing-feel",
      "//cdn.example",
      "ftp://cdn.example",
      "https://user:pw@cdn.example",
      "https://cdn.example/?x=1",
    ]) {
      expect(typingFeelOrigin(value), String(value)).toBeNull();
    }
    expect(typingFeelPreconnect("https://feel.typing-game.local")).toEqual([
      {
        tag: "link",
        attrs: {
          rel: "preconnect",
          href: "https://feel.typing-game.local",
          crossorigin: true,
        },
        injectTo: "head",
      },
    ]);
    expect(typingFeelPreconnect("/typing-feel")).toEqual([]);
  });

  it("adds the preconnect to index.html only, after the head include", () => {
    const { html } = plugin({ TYPING_FEEL_URL: "https://feel.example" });
    expect(html.order).toBe("post");
    expect(
      html.handler("<html></html>", { filename: "/x/src/index.html" }),
    ).toMatchObject({
      tags: [{ attrs: { href: "https://feel.example" } }],
    });
    expect(html.handler("<html></html>", { filename: "/x/src/404.html" })).toBe(
      "<html></html>",
    );
    expect(
      plugin({}).html.handler("<html></html>", {
        filename: "/x/src/index.html",
      }),
    ).toBe("<html></html>");
  });

  it("is in Turbo's env lists for build and dev, or strict env mode drops it", () => {
    const turbo = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../turbo.json"), "utf8"),
    ) as { tasks: Record<string, { env?: string[] }> };
    for (const task of [
      "@monkeytype/frontend#build",
      "@monkeytype/frontend#dev",
    ]) {
      expect(turbo.tasks[task]?.env, task).toContain("TYPING_FEEL_URL");
    }
  });
});

describe("the feel:mirror folder under the dev server", () => {
  let publicDir: string;

  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), "feel-guard-"));
    mkdirSync(join(publicDir, "typing-feel/v1/keys"), { recursive: true });
    writeFileSync(
      join(publicDir, "typing-feel/v1/keys/keys-manifest.json"),
      "{}",
    );
  });

  afterEach(() => {
    rmSync(publicDir, { recursive: true, force: true });
  });

  function request(url: string): { passed: boolean; status: number } {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };
    let passed = false;
    typingFeelMirrorGuard(publicDir)({ url } as never, res as never, () => {
      passed = true;
    });
    return { passed, status: passed ? 200 : res.statusCode };
  }

  it("lets a mirrored file and every other path through", () => {
    expect(request("/typing-feel/v1/keys/keys-manifest.json?t=1")).toEqual({
      passed: true,
      status: 200,
    });
    expect(request("/")).toMatchObject({ passed: true });
    expect(request("/typing-feelings")).toMatchObject({ passed: true });
    expect(request("/sounds/click1/click1_1.wav")).toMatchObject({
      passed: true,
    });
  });

  it("answers 404, not the app page, for what the mirror lacks (§4.2)", () => {
    for (const url of [
      "/typing-feel",
      "/typing-feel/",
      "/typing-feel/v1/keys/",
      "/typing-feel/v1/keys/sets/deep/000000000000/key-01.ogg",
      "/typing-feel/v1/../../outside.json",
      "/typing-feel/%E0%A4%A",
    ]) {
      expect(request(url), url).toEqual({ passed: false, status: 404 });
    }
  });
});
