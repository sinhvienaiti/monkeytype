import { basename } from "node:path";
import { HtmlTagDescriptor, Plugin } from "vite";
import { EnvConfig } from "virtual:env-config";

const virtualModuleId = "virtual:env-config";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

function fallback(value: string | undefined | null, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

/**
 * TYPING_FEEL_URL: the Typing Feel root, the part before /v1/ (an origin such
 * as https://feel.typing-game.local, or a same-origin path such as
 * /typing-feel for the feel:mirror copy). No default on purpose: unset or
 * blank (GitHub monkey-ci, GitLab CI, a plain clone) means Typing Feel off,
 * no network, and Monkeytype's own click sounds. See custom/typing-feel/catalog.ts.
 */
function typingFeelUrl(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text === undefined || text === "" ? undefined : text;
}

/**
 * The origin to preconnect to (§5.1 step 2): only for an absolute http(s)
 * TYPING_FEEL_URL that the game would read (no credentials, query or
 * fragment). A same-origin path such as /typing-feel needs none.
 */
export function typingFeelOrigin(value: string | undefined): string | null {
  const text = typingFeelUrl(value);
  if (text === undefined || /[\s?#]/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.host === "" || url.username !== "" || url.password !== "") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** The page's `<link rel="preconnect">` to the Typing Feel origin; none for a same-origin or unset URL. */
export function typingFeelPreconnect(
  value: string | undefined,
): HtmlTagDescriptor[] {
  const origin = typingFeelOrigin(value);
  if (origin === null) return [];
  return [
    {
      tag: "link",
      attrs: { rel: "preconnect", href: origin, crossorigin: true },
      injectTo: "head",
    },
  ];
}

export function envConfig(options: {
  isDevelopment: boolean;
  clientVersion: string;
  env: Record<string, string>;
}): Plugin {
  return {
    name: "virtual-env-config",
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
      return;
    },
    transformIndexHtml: {
      // After the head.html include is in, so the tag lands in the real head.
      order: "post",
      handler(html, ctx) {
        if (basename(ctx.filename) !== "index.html") return html;
        const tags = typingFeelPreconnect(options.env["TYPING_FEEL_URL"]);
        return tags.length === 0 ? html : { html, tags };
      },
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        const devConfig: EnvConfig = {
          isDevelopment: true,
          backendUrl: fallback(
            options.env["BACKEND_URL"],
            "http://localhost:5005",
          ),
          clientVersion: options.clientVersion,
          recaptchaSiteKey: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
          quickLoginEmail: options.env["QUICK_LOGIN_EMAIL"],
          quickLoginPassword: options.env["QUICK_LOGIN_PASSWORD"],
          typingFeelUrl: typingFeelUrl(options.env["TYPING_FEEL_URL"]),
        };

        const prodConfig: EnvConfig = {
          isDevelopment: false,
          backendUrl: fallback(
            options.env["BACKEND_URL"],
            "https://api.monkeytype.com",
          ),
          recaptchaSiteKey: options.env["RECAPTCHA_SITE_KEY"] ?? "",
          quickLoginEmail: undefined,
          quickLoginPassword: undefined,
          clientVersion: options.clientVersion,
          typingFeelUrl: typingFeelUrl(options.env["TYPING_FEEL_URL"]),
        };

        const envConfig = options.isDevelopment ? devConfig : prodConfig;
        return `
          export const envConfig = ${JSON.stringify(envConfig)};
        `;
      }
      return;
    },
  };
}
