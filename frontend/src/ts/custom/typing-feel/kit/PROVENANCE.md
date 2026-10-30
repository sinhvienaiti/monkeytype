# Vendored typing-fx kit

The project owner's own code, copied from the parent `typing-game` repo.
Nothing here imports across repos.

- Source: `shared/game-kit/feedback/typing-fx/` in the parent repo at commit
  `590864fb` (G2 of the parent's `docs/games/TYPING_FEEL_SERVICE.md`: the
  Typing Feel data step, `typingFeelKeysBase`, `timedJson`,
  `settleKeyboardChoice`, `pendingKeyboardChoices`, catalogue `revision`,
  `defaultId` and `effects`, a first decode batch of 12 keys and 4 spaces;
  `draw.ts` builds glow sprites once per palette, from `0a9a40a2`). Copied
  from a clean export of that commit (`git show`), never from the parent's
  working tree. Before: `8d130d09`; only `audio.ts` and `draw.ts` changed
  since.
- Files: `audio.ts`, `driver.ts`, `intensity.ts`, `settings.ts`, `styles.ts`,
  `pool.ts`, `draw.ts` (`audio.ts` imports only `driver`, `intensity` and
  `settings`).
  Left out: `strip.ts`, `css.ts`, `index.ts` and the `ui/quick-settings`
  files, including the family-grouped `keyboard-choices.ts` (the fork has
  its own Solid picker, grouped the same way, and canvas adapter in `../`).
- Hashes: `kit-manifest.json` lists the git blob, the sha256 of each source
  blob and the sha256 of each vendored file.
- Tests: the kit's vitest tests stay in the parent (`shared/game-kit`).
  The fork tests its own adapter in `__tests__/custom/typing-feel/`.

## Patches

Type-only edits, needed by the fork's `noPropertyAccessFromIndexSignature`
(TS4111). Runtime behaviour is unchanged.

1. `audio.ts` (`loadKeyboardCatalog`): `entry as Record<string, unknown>`
   becomes `entry as { readonly id?: unknown; readonly name?: unknown;
   readonly manifest?: unknown; readonly preview?: unknown; readonly order?:
   unknown; readonly family?: unknown; readonly score?: unknown }`.
2. `audio.ts` (`catalogueEffects`): `raw as Record<string, unknown>` becomes
   `raw as { readonly style?: unknown; readonly intensity?: unknown;
   readonly size?: unknown; readonly volume?: unknown }`.
3. `audio.ts` (`catalogueInfo`): the parameter `raw: Record<string, unknown>`
   becomes `raw: { readonly revision?: unknown; readonly default?: unknown;
   readonly effects?: unknown }` (its caller still passes a
   `Record<string, unknown>`, which fits).
4. `settings.ts` (`sanitizeTypingFx`): `raw as Record<string, unknown>`
   becomes `raw as Partial<Record<keyof TypingFxSettings, unknown>>`.

Follow-up: move these into `shared/game-kit` once the kit work in flight
there is committed, rerun its tests, then re-copy byte-identical.

## Rules

- Re-copy, never edit here. Update `kit-manifest.json` with each copy.
- Changes flow from the kit to the fork only, never from the fork back into
  `shared/game-kit`: Monkeytype is GPL-3.0 and the shared kit must not take
  GPL code (parent `docs/games/SHARED_SYSTEMS_BAR.md`, licence rules).
- The folder is excluded from oxlint and oxfmt (both `.oxfmtrc.json` and
  the editor's `.oxfmtrc-editor.json`), so the documented
  `pnpm oxlint --type-aware --type-check` does not see it. `tsc` does: run
  `pnpm ts-check` after every re-copy; Custom EN-VN CI runs it too.

## Sounds

The keyboard sets are not in this repo. Since 31/10/2026 (owner decision 14,
step B6 of `TYPING_FEEL_SERVICE.md`) Monkeytype reads them at run time from
Typing Feel, the parent repo's shared host, through this kit
(`../catalog.ts`): the catalogue, each set's manifest and its samples. The
copies this repo used to track, and the script that filled them, are gone.

`TYPING_FEEL_URL` (build time) names the host; without it Typing Feel is off
and Monkeytype's own click plays. How to set it, what happens when the host
is down, and the company Mac's offline copy (`pnpm feel:mirror`):
`docs/CUSTOM_TYPING_FEEL.md` at the repo root.

New sets, renames and the default are made in the parent repo (Typing Feel,
later its Admin page); Monkeytype needs no change, the list groups by
`family` as the catalogue orders it. The tests use a sample of the r1
catalogue (`__tests__/custom/typing-feel/fixtures/typing-feel-catalogue.json`).

Long tails: the kit's player keeps 6 key voices and 2 word voices and cuts
only the oldest sounding one (4 ms fade). With Raindrop Tile a key voice is
cut only when 6 more strokes start inside its tail, so even at 20 keys/s
the cut comes 300 ms in, where its keys sit at or below -76 dB (25 ms RMS
under the sample's peak); a space is cut only after 2 more words, about
500 ms in at 240 wpm, where its spaces sit below -75 dB. Hail Stone holds
several hailstone hits per sample, some as late as 270 ms: at 20 keys/s the
cut at 300 ms shortens a later hit in 3 of its 25 keys, under 6 newer keys.
The voice counts stay; the kit is shared, so a change there is the shared
kit's call.
