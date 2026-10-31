// Source: new for the kit: a fixed particle pool for the typing feedback (no allocation per key)
/**
 * Particles as columns over a dense range [0, count): spawning appends,
 * expiry swaps the last one in. Past `cap` a spawn takes the slot of the
 * lowest-priority, oldest particle. Positions are closed-form from the
 * spawn values (drag and gravity), so a frame is a pure function of time
 * and captures can be stepped exactly.
 */
export const PK = {
  spark: 0, // a streak along its velocity
  shard: 1, // a spinning triangle
  ring: 2, // an expanding stroked circle
  disc: 3, // a soft filled disc (flash)
  smash: 4, // T2's stepped two-tone key ring (one particle)
  ink: 5, // an ink drop
  rune: 6, // a rotating rune circle with ticks
  trace: 7, // a glyph outline drawn by its dash
  crack: 8, // a zigzag line across a glyph
  shock: 9, // an ellipse around the whole word
  star: 10, // a four-point glint
  splat: 11, // a paint splat with a dark under-edge (or an ink texture cell)
  contact: 12, // a flat ring where a stamp meets the line
  seal: 13, // a seal frame stamped over the whole word (or a seal texture)
  bar: 14, // a wrong key's underline kick under the due letter
  glyph: 15, // the wrong letter the player typed, bouncing off above the row
  beam: 16, // a light beam along the whole word (Flare's release)
  sweep: 17, // an underline drawn across the whole word (Minimal's release)
  smashWord: 18, // T2's stepped two-tone ring round the whole word (Smash's release)
} as const;
export type ParticleKind = (typeof PK)[keyof typeof PK];

export class ParticlePool {
  count = 0;
  /** Spawns refused because the cap is 0 (Low, Off). */
  refused = 0;
  /** Spawns that took a live particle's slot. */
  stolen = 0;
  readonly kind: Uint8Array;
  readonly prio: Uint8Array;
  /** Palette index the renderer maps to a colour. */
  readonly tone: Uint8Array;
  readonly owner: Int32Array;
  readonly born: Float64Array;
  readonly life: Float32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Drag rate (1/s) and gravity (px/s²). */
  readonly drag: Float32Array;
  readonly grav: Float32Array;
  readonly size: Float32Array;
  readonly size2: Float32Array;
  readonly rot: Float32Array;
  readonly spin: Float32Array;
  /** Free per-kind value (glyph index for a trace, gap for a ring…). */
  readonly aux: Float32Array;
  /** Which cell of a texture atlas (or which procedural shape) the particle draws. */
  readonly variant: Uint8Array;
  /** Vertical scale the renderer applies around (x, y): word-wide rings drawn as ellipses (1: none). */
  readonly sy: Float32Array;
  private live: number;

  constructor(readonly capacity: number) {
    this.kind = new Uint8Array(capacity);
    this.prio = new Uint8Array(capacity);
    this.tone = new Uint8Array(capacity);
    this.owner = new Int32Array(capacity);
    this.born = new Float64Array(capacity);
    this.life = new Float32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.size2 = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.aux = new Float32Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.sy = new Float32Array(capacity);
    this.live = capacity;
  }

  /** The active ceiling (≤ capacity): an intensity level's cap. */
  get cap(): number {
    return this.live;
  }

  set cap(value: number) {
    this.live = Math.max(0, Math.min(this.capacity, value | 0));
    while (this.count > this.live) this.remove(this.count - 1);
  }

  /**
   * A new particle's slot (its fields set to rest values: no motion, size 1),
   * or −1 when the cap is 0. Full: the lowest priority, then the oldest, gives
   * its slot; a spawn of lower priority than every live one is refused.
   */
  spawn(kind: ParticleKind, owner: number, prio: number, x: number, y: number, now: number, lifeMs: number): number {
    if (this.live === 0) {
      this.refused += 1;
      return -1;
    }
    let slot = this.count;
    if (this.count >= this.live) {
      slot = -1;
      let bestPrio = 256;
      let bestBorn = Infinity;
      for (let i = 0; i < this.count; i += 1) {
        const p = this.prio[i]!;
        const b = this.born[i]!;
        if (p < bestPrio || (p === bestPrio && b < bestBorn)) {
          bestPrio = p;
          bestBorn = b;
          slot = i;
        }
      }
      if (slot < 0 || bestPrio > prio) {
        this.refused += 1;
        return -1;
      }
      this.stolen += 1;
    } else this.count += 1;
    this.kind[slot] = kind;
    this.prio[slot] = prio;
    this.tone[slot] = 0;
    this.owner[slot] = owner;
    this.born[slot] = now;
    this.life[slot] = Math.max(1, lifeMs);
    this.x[slot] = x;
    this.y[slot] = y;
    this.vx[slot] = 0;
    this.vy[slot] = 0;
    this.drag[slot] = 0;
    this.grav[slot] = 0;
    this.size[slot] = 1;
    this.size2[slot] = 1;
    this.rot[slot] = 0;
    this.spin[slot] = 0;
    this.aux[slot] = 0;
    this.variant[slot] = 0;
    this.sy[slot] = 1;
    return slot;
  }

  /** Removes every particle of `owner` (a word effect replacing its last letter's): how many went. */
  killOwner(owner: number): number {
    let removed = 0;
    for (let i = this.count - 1; i >= 0; i -= 1) {
      if (this.owner[i] !== owner) continue;
      this.remove(i);
      removed += 1;
    }
    return removed;
  }

  /** Drops particles at or past their life at `now`: how many are left. */
  expire(now: number): number {
    for (let i = this.count - 1; i >= 0; i -= 1) if (now - this.born[i]! >= this.life[i]!) this.remove(i);
    return this.count;
  }

  clear(): void {
    this.count = 0;
  }

  /** Age 0 … 1 of particle `i` at `now`. */
  age(i: number, now: number): number {
    return Math.max(0, Math.min(1, (now - this.born[i]!) / this.life[i]!));
  }

  /** Position of `i` at `now` into out[0], out[1]: velocity with drag (closed form) plus gravity. */
  position(i: number, now: number, out: Float32Array): Float32Array {
    const t = Math.max(0, now - this.born[i]!) / 1000;
    const k = this.drag[i]!;
    const travel = k > 0 ? (1 - Math.exp(-k * t)) / k : t;
    out[0] = this.x[i]! + this.vx[i]! * travel;
    out[1] = this.y[i]! + this.vy[i]! * travel + 0.5 * this.grav[i]! * t * t;
    return out;
  }

  private remove(i: number): void {
    const last = this.count - 1;
    if (i !== last) {
      this.kind[i] = this.kind[last]!;
      this.prio[i] = this.prio[last]!;
      this.tone[i] = this.tone[last]!;
      this.owner[i] = this.owner[last]!;
      this.born[i] = this.born[last]!;
      this.life[i] = this.life[last]!;
      this.x[i] = this.x[last]!;
      this.y[i] = this.y[last]!;
      this.vx[i] = this.vx[last]!;
      this.vy[i] = this.vy[last]!;
      this.drag[i] = this.drag[last]!;
      this.grav[i] = this.grav[last]!;
      this.size[i] = this.size[last]!;
      this.size2[i] = this.size2[last]!;
      this.rot[i] = this.rot[last]!;
      this.spin[i] = this.spin[last]!;
      this.aux[i] = this.aux[last]!;
      this.variant[i] = this.variant[last]!;
      this.sy[i] = this.sy[last]!;
    }
    this.count = last;
  }
}
