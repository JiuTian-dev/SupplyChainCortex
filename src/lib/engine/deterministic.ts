/**
 * Deterministic Simulation Engine — seeded PRNG + state snapshots.
 *
 * Provides:
 * - DeterministicRandom: mulberry32-based seeded PRNG (reproducible)
 * - SlidingWindow: inflection-point state logger (memory-bounded)
 * - SimulationContext: combines PRNG + snapshot for run isolation
 *
 * Key properties:
 * - Same seed always produces the same random sequence (cross-platform).
 * - SlidingWindow stores only inflection points (≥ 5% change) to cap memory.
 * - SimulationContext is self-contained — replay requires only the seed + initial state.
 */

// ─── Deterministic PRNG (mulberry32) ────────────────────────────────────────────

export class DeterministicRandom {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = seed;
    this.state = seed | 0;
  }

  /** Get the original seed for replay */
  get seed(): number { return this.initialSeed; }

  /** Next random float in [0, 1) */
  next(): number {
    // mulberry32 algorithm
    this.state |= 0;
    this.state = this.state + 0x6D2B79F5 | 0;
    let t = Math.imul(this.state ^ this.state >>> 15, 1 | this.state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  /** Random integer in [min, max] inclusive */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Random float in [min, max) */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Boolean with given probability */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Pick a random element from an array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Create a clone at current state for forking simulations */
  clone(): DeterministicRandom {
    const clone = new DeterministicRandom(this.initialSeed);
    clone.state = this.state;
    return clone;
  }

  /** Reset to initial seed */
  reset(): void {
    this.state = this.initialSeed | 0;
  }
}

/** Create a seed from a string (for scenario-based seeding) */
export function seedFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

/** Create a seed from current date (for daily-stable seeds) */
export function seedFromDate(date?: Date): number {
  const d = date || new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ─── Sliding Window State Snapshot ──────────────────────────────────────────────

export interface StateSnapshot<T> {
  round: number;
  timestamp: string;
  state: T;
  inflectionPoints: string[];  // which fields changed >= 5%
  delta: Record<string, number>;
}

export class SlidingWindow<T extends Record<string, number>> {
  private windows: StateSnapshot<T>[] = [];
  private readonly maxSize: number;
  private previousState: T | null = null;
  private readonly inflectionThreshold: number;

  constructor(maxSize = 50, inflectionThreshold = 0.05) {
    this.maxSize = maxSize;
    this.inflectionThreshold = inflectionThreshold;
  }

  /** Record a state snapshot. Only stores if there's a ≥ 5% inflection. */
  record(round: number, state: T): StateSnapshot<T> | null {
    const inflectionPoints: string[] = [];
    const delta: Record<string, number> = {};

    if (this.previousState) {
      for (const key of Object.keys(state) as (keyof T)[]) {
        const prev = this.previousState[key];
        const curr = state[key];
        if (prev !== 0 && Math.abs((curr - prev) / prev) >= this.inflectionThreshold) {
          inflectionPoints.push(key as string);
          delta[key as string] = Math.round((curr - prev) / prev * 1000) / 10;
        }
      }
    }

    // Always record first round and inflection points
    if (round === 0 || inflectionPoints.length > 0) {
      const snapshot: StateSnapshot<T> = {
        round,
        timestamp: new Date().toISOString(),
        state: { ...state },
        inflectionPoints,
        delta,
      };

      this.windows.push(snapshot);
      if (this.windows.length > this.maxSize) {
        this.windows.shift();
      }

      this.previousState = { ...state };
      return snapshot;
    }

    this.previousState = { ...state };
    return null; // No inflection — not stored
  }

  /** Get all recorded snapshots */
  getSnapshots(): StateSnapshot<T>[] {
    return [...this.windows];
  }

  /** Get the most recent snapshot */
  getLast(): StateSnapshot<T> | null {
    return this.windows.length > 0 ? this.windows[this.windows.length - 1] : null;
  }

  /** Total snapshots recorded */
  get size(): number { return this.windows.length; }

  /** Clear all snapshots */
  reset(): void {
    this.windows = [];
    this.previousState = null;
  }
}

// ─── Simulation Context ─────────────────────────────────────────────────────────

export interface SimulationRunConfig {
  seed: number | string;
  maxRounds: number;
  initialState: Record<string, number>;
}

export class SimulationContext<S extends Record<string, number>> {
  readonly rng: DeterministicRandom;
  readonly window: SlidingWindow<S>;
  readonly config: SimulationRunConfig;
  private currentRound = 0;
  private startedAt: string;

  constructor(config: SimulationRunConfig, initialState: S) {
    const seed = typeof config.seed === 'string' ? seedFromString(config.seed) : config.seed;
    this.config = { ...config, seed };
    this.rng = new DeterministicRandom(seed);
    this.window = new SlidingWindow<S>(Math.min(config.maxRounds, 50));
    this.startedAt = new Date().toISOString();
  }

  /** Advance one round, record state if inflection detected */
  tick(state: S): StateSnapshot<S> | null {
    this.currentRound++;
    return this.window.record(this.currentRound, state);
  }

  get round(): number { return this.currentRound; }

  /** Export run summary for audit trail */
  summarize(): {
    seed: number; rounds: number; startedAt: string;
    snapshots: number; inflectionRate: number;
  } {
    return {
      seed: this.config.seed as number,
      rounds: this.currentRound,
      startedAt: this.startedAt,
      snapshots: this.window.size,
      inflectionRate: this.currentRound > 0
        ? Math.round(this.window.size / this.currentRound * 100) / 100
        : 0,
    };
  }
}
