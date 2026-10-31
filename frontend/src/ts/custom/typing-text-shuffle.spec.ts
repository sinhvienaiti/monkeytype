import { describe, expect, it } from "vitest";

import { PassageShuffleBag } from "./typing-text-shuffle";

describe("PassageShuffleBag", () => {
  it("uses every passage once before starting a new cycle", () => {
    const bag = new PassageShuffleBag(
      ["a", "b", "c", "d"],
      undefined,
      () => 0,
    );

    const first = bag.take(2);
    const second = bag.take(2);

    expect(new Set([...first, ...second]).size).toBe(4);
  });

  it("does not repeat the final passage at a cycle boundary", () => {
    const bag = new PassageShuffleBag(
      ["a", "b", "c"],
      undefined,
      () => 0,
    );

    const firstCycle = bag.take(3);
    const next = bag.take(1);

    expect(next[0]).not.toBe(firstCycle[2]);
  });

  it("does not duplicate a passage inside a session that crosses cycles", () => {
    const bag = new PassageShuffleBag(
      ["a", "b", "c", "d"],
      undefined,
      () => 0.5,
    );

    bag.take(3);
    const crossingSession = bag.take(3);

    expect(crossingSession).toHaveLength(3);
    expect(new Set(crossingSession).size).toBe(3);
  });

  it("restores only valid unique remaining progress", () => {
    const bag = new PassageShuffleBag(
      ["a", "b", "c"],
      { remainingIds: ["c", "bad", "c"], lastId: "b" },
      () => 0,
    );

    expect(bag.take(1)).toEqual(["c"]);
  });
});
