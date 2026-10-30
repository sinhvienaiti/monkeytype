import {
  For,
  JSXElement,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";

import type { KeyboardSoundChoice } from "./kit/audio";

import { Button } from "../../components/common/Button";
import { Separator } from "../../components/common/Separator";
import { SettingHelpLabel } from "../../components/ui/SettingHelpLabel";
import { Config, getConfig } from "../../config/store";
import {
  loadKeyboardChoices,
  NOT_INSTALLED,
  restoreKeyboardChoice,
} from "./catalog";
import { KeyboardSoundList } from "./KeyboardSoundList";
import { KeyboardSoundPreview } from "./kit/audio";
import { TYPING_FX_INTENSITIES, TYPING_FX_STYLES } from "./kit/settings";
import {
  applyKeyboardLevels,
  gameplaySounds,
  markPack,
  packState,
  syncSavedKeyboard,
} from "./sounds";
import {
  getTypingFeel,
  setTypingFeel,
  type TypingFeelSettings as Settings,
} from "./store";

const LOAD_FAILED = "could not load, select to retry";
const OFF: KeyboardSoundChoice = { value: "off", label: "Off" };

/** Key sounds and letter effects, saved the moment a control changes. */
export function TypingFeelSettings(): JSXElement {
  const [settings, setSettings] = createSignal<Settings>(getTypingFeel());
  const [failed, setFailed] = createSignal<readonly string[]>([]);
  const [catalog] = createResource(async () => loadKeyboardChoices());

  const preview = new KeyboardSoundPreview({
    levels: () => ({
      master: Config.soundVolume,
      keyboard: settings().keyboardVolume / 100,
    }),
    sounds: gameplaySounds(),
    onLoad: (result) => {
      markPack(result);
      setFailed((ids) =>
        result.state === "pending"
          ? [...ids.filter((id) => id !== result.id), result.id]
          : ids.filter((id) => id !== result.id),
      );
    },
  });

  const save = (patch: Partial<Settings>): void => {
    if (setTypingFeel({ ...settings(), ...patch })) {
      setSettings(getTypingFeel());
    }
  };

  // Not installed: disabled by the catalogue. A set that failed to load stays selectable to retry.
  const options = createMemo((): readonly KeyboardSoundChoice[] => {
    const loaded = catalog();
    if (loaded === undefined) return [OFF];
    const gone = failed();
    return loaded.options.map((choice) =>
      choice.value !== "off" &&
      choice.disabled !== true &&
      (gone.includes(choice.value) || packState(choice.value) === "failed")
        ? { ...choice, note: LOAD_FAILED }
        : choice,
    );
  });

  const missing = (): boolean => {
    const state = catalog()?.state;
    return state !== undefined && state !== "ready";
  };

  // A stale or legacy id becomes Bright Clack once the catalogue is in.
  createEffect(
    on(catalog, (loaded) => {
      if (loaded === undefined) return;
      const id = settings().keyboardSound;
      const fixed = restoreKeyboardChoice(id, loaded);
      if (fixed !== id) save({ keyboardSound: fixed });
    }),
  );

  // Monkeytype's volume is the master level of the preview too.
  createEffect(
    on(
      () => getConfig.soundVolume,
      () => preview.refreshVolume(),
      { defer: true },
    ),
  );

  onMount(() => {
    // The modal opens from a click: audio may start now.
    preview.unlock();
  });

  onCleanup(() => {
    preview.stop();
    preview.destroy();
    // A pick still loading when the modal closed is finished for typing.
    void syncSavedKeyboard();
  });

  const select = (choice: KeyboardSoundChoice): void => {
    save({ keyboardSound: choice.value });
    preview.select(choice);
    applyKeyboardLevels(settings());
  };

  const soundOff = (): boolean => settings().keyboardSound === "off";
  const effectsOff = (): boolean => settings().effectStrength === "off";

  return (
    <div class="grid gap-2" onPointerDown={() => preview.unlock()}>
      <div class="grid gap-1">
        <SettingHelpLabel
          label="keyboard sound"
          help="Recorded key sounds for each letter you type. Hover or focus a set to hear one second of it; on touch screens use Listen."
        />
        <KeyboardSoundList
          options={options()}
          value={settings().keyboardSound}
          onSelect={select}
          onPreview={(choice, delay) => preview.preview(choice, delay)}
          onStop={() => preview.stop()}
        />
        <Show when={missing()}>
          <div class="text-[0.68rem] text-sub">{NOT_INSTALLED}</div>
        </Show>
        <div class="text-[0.68rem] text-sub">
          master level: Monkeytype sound volume{" "}
          {Math.round(getConfig.soundVolume * 100)}%
        </div>
      </div>

      <div class="grid gap-1">
        <SettingHelpLabel
          label="keyboard volume"
          help="Key sound level under Monkeytype's sound volume. Monkeytype's own click returns when the keyboard sound is off."
        />
        <div class="grid grid-cols-[1fr_auto] items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            aria-label="keyboard volume"
            value={settings().keyboardVolume}
            disabled={soundOff()}
            onInput={(e) => {
              save({ keyboardVolume: e.currentTarget.valueAsNumber });
              applyKeyboardLevels(settings());
              preview.refreshVolume();
            }}
          />
          <span class="min-w-8 text-right text-sub">
            {settings().keyboardVolume}%
          </span>
        </div>
      </div>

      <Separator />

      <div class="grid gap-1">
        <SettingHelpLabel
          label="letter effect"
          help="How a typed letter reacts: Stamp slams a copy down with a paint splat, Flare glows and throws sparks, Smash punches a ring, Shatter splits the letter, Rune traces it in a circle, Minimal only lifts it."
        />
        <div class="grid grid-cols-3 gap-1">
          <For each={TYPING_FX_STYLES}>
            {(style) => (
              <Button
                variant="button"
                text={style}
                class="min-w-0 px-2"
                active={settings().letterEffect === style}
                disabled={effectsOff()}
                onClick={() => save({ letterEffect: style })}
              />
            )}
          </For>
        </div>
      </div>

      <div class="grid gap-1">
        <SettingHelpLabel
          label="effect strength"
          help="Low moves only the letter, Normal adds particles, High and Ultra add more. Off turns letter effects off. Reduced motion in your system keeps the colour and light only."
        />
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-5">
          <For each={TYPING_FX_INTENSITIES}>
            {(strength) => (
              <Button
                variant="button"
                text={strength}
                class="min-w-0 px-2"
                active={settings().effectStrength === strength}
                onClick={() => save({ effectStrength: strength })}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
