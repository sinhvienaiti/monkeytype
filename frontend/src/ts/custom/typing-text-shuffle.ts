export type PassageShuffleState = {
  remainingIds: string[];
  lastId: string | null;
};

export class PassageShuffleBag {
  private readonly ids: string[];
  private remainingIds: string[];
  private lastId: string | null;
  private readonly random: () => number;

  constructor(
    ids: string[],
    state?: PassageShuffleState,
    random: () => number = Math.random,
  ) {
    this.ids = [...new Set(ids)];
    const validIds = new Set(this.ids);
    const seen = new Set<string>();

    this.remainingIds =
      state?.remainingIds.filter((id) => {
        if (!validIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      }) ?? [];

    this.lastId =
      state?.lastId !== null &&
      state?.lastId !== undefined &&
      validIds.has(state.lastId)
        ? state.lastId
        : null;

    this.random = random;
  }

  take(count: number): string[] {
    const target = Math.min(this.ids.length, Math.max(0, Math.floor(count)));
    const selected: string[] = [];
    const selectedIds = new Set<string>();

    while (selected.length < target && this.ids.length > 0) {
      if (this.remainingIds.length === 0) {
        this.refill(selectedIds);
      }

      const id = this.remainingIds.shift();
      if (id === undefined) break;
      if (selectedIds.has(id)) continue;

      selected.push(id);
      selectedIds.add(id);
      this.lastId = id;
    }

    return selected;
  }

  snapshot(): PassageShuffleState {
    return {
      remainingIds: [...this.remainingIds],
      lastId: this.lastId,
    };
  }

  private refill(selectedIds: Set<string>): void {
    const pool = [...this.ids];

    for (let index = pool.length - 1; index > 0; index--) {
      const swap = Math.floor(this.random() * (index + 1));
      [pool[index], pool[swap]] = [
        pool[swap] as string,
        pool[index] as string,
      ];
    }

    const fresh = pool.filter((id) => !selectedIds.has(id));
    const alreadySelected = pool.filter((id) => selectedIds.has(id));
    const ordered = [...fresh, ...alreadySelected];

    if (ordered.length > 1 && ordered[0] === this.lastId) {
      const replacementIndex = ordered.findIndex(
        (id) => id !== this.lastId && !selectedIds.has(id),
      );
      const fallbackIndex = ordered.findIndex((id) => id !== this.lastId);
      const swapIndex =
        replacementIndex > 0 ? replacementIndex : fallbackIndex;

      if (swapIndex > 0) {
        const first = ordered[0];
        const replacement = ordered[swapIndex];
        if (first !== undefined && replacement !== undefined) {
          ordered[0] = replacement;
          ordered[swapIndex] = first;
        }
      }
    }

    this.remainingIds = ordered;
  }
}
