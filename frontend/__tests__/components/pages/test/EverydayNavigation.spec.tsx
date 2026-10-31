import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EverydayNavigation } from "../../../../src/ts/components/pages/test/EverydayNavigation";
import {
  canNavigateEveryday,
  navigateEveryday,
  replayEveryday,
  setEverydayLoading,
  setEverydaySession,
} from "../../../../src/ts/custom/everyday-runtime";
import {
  setResultCalculating,
  setResultVisible,
} from "../../../../src/ts/states/test";

const state = vi.hoisted(() => ({
  source: "everyday",
  learningMode: "normal",
}));

vi.mock("../../../../src/ts/config/store", () => ({
  getConfig: { mode: "custom" },
}));
vi.mock("../../../../src/ts/custom/en-vn-translation/store", () => ({
  getSettings: () => ({ learningMode: state.learningMode }),
}));
vi.mock("../../../../src/ts/custom/typing-text-library", () => ({
  loadTypingTextSettings: () => ({ source: state.source }),
}));
vi.mock("../../../../src/ts/events/test", () => ({
  restartTestEvent: { useListener: vi.fn() },
}));
vi.mock("../../../../src/ts/states/notifications", () => ({
  showErrorNotification: vi.fn(),
}));
vi.mock("../../../../src/ts/states/test", async () => {
  const { createSignal } = await import("solid-js");
  const [getResultVisible, setResultVisible] = createSignal(false);
  const [isResultCalculating, setResultCalculating] = createSignal(false);
  return {
    getResultVisible,
    setResultVisible,
    isResultCalculating,
    setResultCalculating,
  };
});
vi.mock("../../../../src/ts/custom/everyday-runtime", async () => {
  const { createSignal } = await import("solid-js");
  const [getEverydaySession, setEverydaySession] = createSignal(null);
  const [isEverydayLoading, setEverydayLoading] = createSignal(false);
  return {
    getEverydaySession,
    setEverydaySession,
    isEverydayLoading,
    setEverydayLoading,
    canNavigateEveryday: vi.fn(() => true),
    navigateEveryday: vi.fn(async () => undefined),
    replayEveryday: vi.fn(async () => undefined),
  };
});

describe("Everyday navigation placements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.source = "everyday";
    state.learningMode = "normal";
    setResultVisible(false);
    setResultCalculating(false);
    setEverydayLoading(false);
    vi.mocked(canNavigateEveryday).mockReturnValue(true);
    setEverydaySession({
      lessonId: 2,
      title: "Dependency injection",
      start: 3,
      end: 5,
      totalPassages: 7,
      text: "Passage four. Passage five.",
      hasPrevious: true,
      hasNext: true,
    });
  });

  afterEach(cleanup);

  it("moves controls from typing to the result footer after an actual result signal", () => {
    const view = render(() => (
      <>
        <EverydayNavigation />
        <EverydayNavigation placement="result" />
      </>
    ));
    expect(
      view
        .getByRole("navigation", { name: "Everyday passages" })
        .querySelectorAll("button"),
    ).toHaveLength(2);
    expect(
      view.queryByRole("navigation", { name: "Everyday result controls" }),
    ).toBeNull();

    setResultVisible(true);
    expect(
      view.queryByRole("navigation", { name: "Everyday passages" }),
    ).toBeNull();
    const footer = view.getByRole("navigation", {
      name: "Everyday result controls",
    });
    expect(
      [...footer.querySelectorAll("button")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["prev", "replay", "next"]);
    expect(footer).toHaveTextContent("passages 4–5 / 7");
  });

  it("waits for result calculation to finish before exposing result controls", () => {
    setResultVisible(true);
    setResultCalculating(true);
    const view = render(() => <EverydayNavigation placement="result" />);
    expect(view.queryByRole("navigation")).toBeNull();
    setResultCalculating(false);
    expect(
      view.getByRole("navigation", { name: "Everyday result controls" }),
    ).toBeInTheDocument();
  });

  it("replays through the runtime helper without requesting previous or next passages", () => {
    setResultVisible(true);
    const view = render(() => <EverydayNavigation placement="result" />);
    view
      .getByRole("button", { name: "Type these Everyday passages again" })
      .click();
    expect(replayEveryday).toHaveBeenCalledOnce();
    expect(navigateEveryday).not.toHaveBeenCalled();
  });

  it("uses the runtime guard for every action and disables a missing previous passage", () => {
    setEverydaySession(
      (session) => session && { ...session, hasPrevious: false },
    );
    setResultVisible(true);
    const view = render(() => <EverydayNavigation placement="result" />);
    expect(
      view.getByRole("button", { name: "Previous Everyday passages" }),
    ).toBeDisabled();
    expect(
      view.getByRole("button", { name: "Next Everyday passages" }),
    ).not.toBeDisabled();
    setEverydayLoading(true);
    for (const button of view.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    vi.mocked(canNavigateEveryday).mockReturnValue(false);
    setEverydayLoading(false);
    for (const button of view.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("does not expose Everyday controls for other text sources or exclusive learning modes", () => {
    state.source = "custom";
    const otherSource = render(() => <EverydayNavigation />);
    expect(otherSource.queryByRole("navigation")).toBeNull();
    cleanup();
    state.source = "everyday";
    state.learningMode = "context-cloze";
    const exclusiveMode = render(() => <EverydayNavigation />);
    expect(exclusiveMode.queryByRole("navigation")).toBeNull();
  });
});
