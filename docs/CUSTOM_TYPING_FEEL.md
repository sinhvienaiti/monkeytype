# Typing Feel keyboard sounds

The keyboard sound sets of the typing feel settings (custom tab of the Custom
Text window) are not in this repo. Monkeytype reads them at run time from
Typing Feel, the shared sound host of the parent `typing-game` repo (design:
its `docs/games/TYPING_FEEL_SERVICE.md`). Code: `frontend/src/ts/custom/typing-feel/catalog.ts`.

## TYPING_FEEL_URL

A build-time variable (`frontend/vite-plugins/env-config.ts`, passed through
Turbo for `build` and `dev`). Its value is the Typing Feel **root**, the part
before `/v1/`; the game reads `<root>/v1/keys/keys-manifest.json`.

| Where | Value |
| --- | --- |
| Home machine (`pnpm build:monkeytype`, `pnpm dev:monkeytype:app` in the parent) | `https://feel.typing-game.local` |
| Company Mac, offline copy (below) | `/typing-feel` (same origin) |
| Online, after Cloudflare | `https://feel.<domain>` |
| GitHub `monkey-ci`, GitLab CI, a plain clone | not set |

- An http(s) origin may carry a path prefix (`https://cdn.example/feel`).
  A same-origin path starts with one `/`. A trailing `/v1` or `/v1/` is
  accepted and dropped, so `/typing-feel/v1/` works too.
- An http(s) origin also gets `<link rel="preconnect" … crossorigin>` in
  `index.html`; a same-origin path needs none.
- Not set, blank or invalid: Typing Feel is off. Nothing is fetched,
  Monkeytype's own click sounds play, CI needs no secret. A saved set is kept
  and shows as "saved sound · unavailable"; a player who never saved one
  sees Off.
- Host down, 404, an HTML page, or no answer in 3 s: the same, plus
  "keyboard sounds unavailable" under the list; the saved set is never
  overwritten. Opening the settings again retries.
- Host up: a saved set the catalogue no longer lists (retired, or the old
  "creamy") becomes the catalogue's default and is saved. A player without a
  save follows the catalogue's `default` without saving it, until they change
  any typing feel setting (that change saves the sound they had).
- Samples and previews get 10 s each; a set whose files never arrive counts
  as failed and Monkeytype's click plays.

## Company Mac (GitLab only, no feel host)

That Mac has no parent repo, Drive or Audio Lab, so it uses a zip of the
sounds and Monkeytype serves them itself.

0. Once, after pulling this change: delete the old copy that
   `pnpm sync-keys` wrote, `rm -rf frontend/static/sounds/keys`. Git no
   longer ignores it, so its OGG files would be committed as media, and
   nothing reads it any more. `feel:mirror` warns while it is there.
1. Home machine, parent repo: `pnpm feel:pack` writes
   `tmp/typing-feel-pack/typing-feel-v1-<revision>.zip` (about 15 MB, 34
   sets) and prints its sha256. Put it on Drive.
2. Company Mac: download the zip with the browser (keep it zipped; if Safari
   unpacks it, turn off "Open safe files after downloading" and download
   again).
3. In `frontend`: `pnpm feel:mirror ~/Downloads/typing-feel-v1-r1.zip`.
   It unpacks into `frontend/static/typing-feel/` (ignored by Git), replaces
   an older copy only once the new one is complete, refuses a zip that is not
   a Typing Feel pack or whose paths leave that folder, and prints the value
   to use.
4. Start Monkeytype with it, in the repo root:
   `TYPING_FEEL_URL=/typing-feel pnpm dev-fe`, or put the line
   `TYPING_FEEL_URL=/typing-feel` in `frontend/.env` (ignored by Git).
   The dev server answers a file the mirror lacks with 404, not the app
   page; without a mirror the list shows "keyboard sounds unavailable" and
   Monkeytype's click plays until step 3 is run.
5. A new revision on the home machine: repeat 1 to 3.

Once Typing Feel is online (Cloudflare), set `TYPING_FEEL_URL` to its
origin and skip the mirror.
