import { statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { Connect, Plugin } from "vite";

/** Where `pnpm feel:mirror` unpacks Typing Feel in the public folder, and its URL. */
export const MIRROR_PATH = "/typing-feel";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * A missing Typing Feel file is a 404, never the app page (parent repo
 * docs/games/TYPING_FEEL_SERVICE.md §4.2). The dev server answers any path
 * it has no file for with index.html and status 200; for /typing-feel/
 * (no mirror yet, or an older one) this answers 404 instead. Files the
 * mirror holds go on to Vite's public folder handler.
 */
export function typingFeelMirrorGuard(
  publicDir: string,
): Connect.NextHandleFunction {
  return (req, res, next) => {
    const raw = (req.url ?? "").split(/[?#]/, 1)[0] ?? "";
    let pathname: string;
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      pathname = raw;
    }
    if (pathname !== MIRROR_PATH && !pathname.startsWith(`${MIRROR_PATH}/`)) {
      next();
      return;
    }
    const file = join(publicDir, pathname);
    const inside = relative(join(publicDir, MIRROR_PATH), file);
    if (!inside.startsWith("..") && !isAbsolute(inside) && isFile(file)) {
      next();
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.end("Not found\n");
  };
}

/** Dev server only: a build copies the mirror into dist, served by its own host. */
export function typingFeelMirror(): Plugin {
  return {
    name: "typing-feel-mirror",
    apply: "serve",
    configureServer(server) {
      // Added before Vite's own handlers, so the SPA fallback never sees these paths.
      server.middlewares.use(typingFeelMirrorGuard(server.config.publicDir));
    },
  };
}
