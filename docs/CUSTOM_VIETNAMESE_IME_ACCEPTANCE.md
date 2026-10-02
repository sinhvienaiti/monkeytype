# Vietnamese IME Acceptance Matrix

This document is the source of truth for manual Vietnamese input acceptance on the local typing-game fork.

## Reference environments

1. Windows + Chrome + UniKey 4.0 RC2 + Unicode + Telex.
2. macOS + Chrome + EVKey 3.3.10 + Unicode + Telex.

English behavior must remain identical to normal Monkeytype when `inputLanguage=english`, or when `inputLanguage=auto` and the selected language is not Vietnamese.

## Required Vietnamese sequences

| Keys | Expected |
| --- | --- |
| `laf` | `là` |
| `phes` | `phé` |
| `rawngf` | `rằng` |
| `tieengs` | `tiếng` |
| `nguowif` | `người` |
| `dduowngf` | `đường` |
| `thuowngf` | `thường` |
| `awf` | `ằ` |
| `afw` | `ằ` |
| `oof` | `ồ` |
| `uw` | `ư` |
| `ow` | `ơ` |
| `dd` | `đ` |

Each correct Vietnamese sequence must keep accuracy at 100% and must not be blocked by `stop on error=letter`.

## Required interaction cases

Test both reference environments with:

- `stop on error`: off, word, letter.
- `keep first wrong letter`: off/on.
- `ignore repeated blocked errors`: off/on.
- `forgive corrected errors`: off/on.
- `quick end`: off/on.
- Backspace inside the current word.
- Backspace to the previous word, then add a missing Vietnamese tone.
- Space while a Vietnamese character is still provisional.
- Multiple-character IME rewrites such as `uo -> ươ`.
- The final word of a test ending with a Vietnamese composed character.

A genuine wrong character must still count as an error. When `forgive corrected errors=off`, deleting a genuine error and typing the correct character must not restore accuracy.

## English regression cases

With English input active, type literal strings containing Telex-looking keys, including:

`raw software fast draw wax jazz`

The Vietnamese reconciliation layer must not transform, ignore, block, or forgive any of these English characters.

## Capturing a real browser/IME event trace

The recorder is development-only and has no production behavior.

Start Monkeytype in development mode and either open the direct Monkeytype URL with:

`?imeDebug=1`

or open DevTools Console and run:

`__mtImeDebug.enable()`

Before reproducing one case:

`__mtImeDebug.clear()`

After reproducing it:

`await __mtImeDebug.copy()`

The copied JSON contains:

- browser/user-agent and platform;
- keydown/keyup;
- beforeinput/input;
- compositionstart/compositionupdate/compositionend;
- `data`, `inputType`, and `isComposing`;
- textarea DOM value and caret;
- scorer value and target word;
- active word index and live accuracy;
- relevant input settings.

Disable capture with:

`__mtImeDebug.disable()`

When an issue occurs only on UniKey or only on EVKey, capture the smallest failing word on both environments and compare the two traces before changing scorer behavior.
