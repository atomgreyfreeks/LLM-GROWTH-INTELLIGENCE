/**
 * AURAWORLD — deterministic simulation core.
 *
 * RULE 1: no Math.random, no Date.now, no `new Date()` anywhere in simulation state.
 *         Same seed + same config => byte-identical event log, forever.
 * RULE 2: scenes render FROM the event log. They never re-run agent logic in useFrame.
 *         (Real LLM sampling is non-deterministic across backends; replay must read logs.)
 * RULE 3: world count N is a config value. Never hardcode 7.
 */

// ---------------------------------------------------------------- rng

/** mulberry32 — fast, seedable, deterministic. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const rnorm = (r: Rng): number => {
  // Box-Muller, deterministic given r
  const u = 1 - r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

/** Stable string -> uint32, for deriving per-world seeds from a world id. */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const seedHex = (seed: number): string =>
  (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");

// ---------------------------------------------------------------- axes

/** The five shared direction axes. Same name, same meaning, every scene. */
export interface Axes {
  /** 0.2–2.4 — world clock multiplier. Applied ONCE at the clock; no domain keeps a private clock. */
  tempo: number;
  /** 0–1 — how far apart the worlds' control surfaces are set. 0 = all worlds identical. THE knob's magnitude. */
  divergence: number;
  /** 0–1 — residue persistence. 0 = the field forgets instantly, 1 = marks are permanent. */
  memory: number;
  /** 0–1 — agent variance: defection rate, strategy mutation, noise in every local decision. */
  wildness: number;
  /** 0–1 — the intervention. 0 = baseline, 1 = intervention fully applied. Eased, never stepped. */
  intervention: number;
}

export const DEFAULT_AXES: Axes = {
  tempo: 1,
  divergence: 0.65,
  memory: 0.5,
  wildness: 0.35,
  intervention: 0,
};

export const AXIS_RANGE: Record<keyof Axes, [number, number]> = {
  tempo: [0.2, 2.4],
  divergence: [0, 1],
  memory: [0, 1],
  wildness: [0, 1],
  intervention: [0, 1],
};

// ---------------------------------------------------------------- events

/** One thing that happened. The event log is the single source of truth for every render. */
export interface SimEvent {
  /** integer tick */
  t: number;
  /** which world produced it — index into SimResult.worlds */
  w: number;
  /** event kind, scene-defined (e.g. "observe" | "decide" | "transfer" | "omit" | "fail") */
  kind: string;
  /** stable actor id within the world */
  actor: string;
  /** world-space position, if the event has a place. Scenes use this to site residue. */
  at?: [number, number, number];
  /** scalar magnitude 0–1, for visual weight */
  mag?: number;
  /** anything else the scene needs; keep it flat and numeric where possible */
  d?: Record<string, number | string>;
}

export interface WorldSpec {
  id: string;
  /** human label, printed in chrome */
  label: string;
  /** the one control-surface value that differs between worlds */
  knob: number;
}

export interface SimResult {
  seed: number;
  ticks: number;
  worlds: WorldSpec[];
  events: SimEvent[];
  /** per-world metric series, metrics[name][worldIndex][tick] */
  metrics: Record<string, number[][]>;
  /** tick at which the intervention front was released, or -1 for a baseline run */
  interventionTick: number;
}

/** Config every scene kernel accepts. */
export interface SimConfig {
  seed: number;
  /** number of worlds — NEVER hardcode this at the call site */
  n: number;
  ticks: number;
  axes: Axes;
  /** -1 = baseline arm (no intervention), otherwise the tick the knob turns */
  interventionTick: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 0x5eed,
  n: 7,
  ticks: 240,
  axes: DEFAULT_AXES,
  interventionTick: 120,
};

/** A scene kernel: pure function, config in, log out. No side effects, no I/O, no clock reads. */
export type Kernel = (cfg: SimConfig) => SimResult;

// ---------------------------------------------------------------- helpers

/** Per-world rng derived from run seed + world id, so worlds are independent but reproducible. */
export const worldRng = (seed: number, worldId: string): Rng =>
  makeRng((seed ^ hashStr(worldId)) >>> 0);

/** Index events by tick once, then read per frame. Never filter the whole log in useFrame. */
export function indexByTick(events: SimEvent[], ticks: number): SimEvent[][] {
  const out: SimEvent[][] = Array.from({ length: ticks + 1 }, () => []);
  for (const e of events) {
    if (e.t >= 0 && e.t <= ticks) out[e.t].push(e);
  }
  return out;
}

/** Cumulative view: every event at or before tick t. Precomputed counts, not slices. */
export function cumulativeCounts(byTick: SimEvent[][]): number[] {
  const out = new Array(byTick.length).fill(0);
  let acc = 0;
  for (let i = 0; i < byTick.length; i++) {
    acc += byTick[i].length;
    out[i] = acc;
  }
  return out;
}

/** Jensen-Shannon divergence between two normalized distributions. The house divergence metric. */
export function jsd(p: number[], q: number[]): number {
  const sp = p.reduce((a, b) => a + b, 0) || 1;
  const sq = q.reduce((a, b) => a + b, 0) || 1;
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const pi = p[i] / sp;
    const qi = q[i] / sq;
    const mi = 0.5 * (pi + qi);
    if (pi > 0) d += 0.5 * pi * Math.log2(pi / mi);
    if (qi > 0) d += 0.5 * qi * Math.log2(qi / mi);
  }
  return d;
}

/** Mean pairwise JSD across all worlds at a tick — "how far apart did the worlds get". */
export function spread(dists: number[][]): number {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < dists.length; i++) {
    for (let j = i + 1; j < dists.length; j++) {
      acc += jsd(dists[i], dists[j]);
      n++;
    }
  }
  return n ? acc / n : 0;
}
