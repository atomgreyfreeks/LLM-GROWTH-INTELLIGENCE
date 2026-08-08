/**
 * LLM GROWTH INTELLIGENCE — growth substrate.
 *
 * Eight fleets land on one piece of ground and grow. Each one uses a different growth logic
 * from the field guide, and the logic is REAL published mathematics, never a decorated loop:
 *
 *   A  slime mold      Jones 2010 Physarum agent model — 3 sensors, deposit, follow, sharpen
 *   B  mycelium        hyphal tip growth with branching and anastomosis (tip-tip fusion)
 *   C  root            gradient-following tips with tropism and obstacle negotiation
 *   D  vascular        space colonization (Runions 2007) — the standard vein/tree algorithm
 *   E  coral           diffusion-limited aggregation (Witten-Sander) — accretion at the edge
 *   F  lichen          two co-dependent populations, neither viable alone
 *   G  swarm           Keller-Segel chemotaxis with a quorum threshold
 *   H  vine            space colonization restricted to climbing existing structure
 *
 * WHY THIS IS A CONTROL SURFACE
 * Report #5 lists 22 hidden control surfaces. Growth logic is not among them, and it has the
 * same shape as the ones that are: nobody picks it deliberately, it is inherited from the
 * architecture, and it silently decides who the system reaches and who it never touches.
 *
 * DETERMINISM AND REPLAY
 * The field is large, so the event log stores DECISIONS (what each fleet chose to reinforce,
 * prune, branch or abandon on a given tick), not pixels. The field is then a pure function of
 * the decision stream plus the seed. That keeps replay honest when a real model is making the
 * decisions instead of a stub: physics replays byte-identically, the model's choices are the
 * thing on the record. Same rule as everywhere else — no Math.random, no Date.now.
 */

import { makeRng, type Rng } from "./sim";

// ---------------------------------------------------------------- the ground

/** The shared world every fleet grows on. Identical for all eight — that is the whole point. */
export interface Ground {
  w: number;
  h: number;
  /** 0 = impassable, 1 = open. Synthetic terrain; no real territory is ever modelled. */
  pass: Float32Array;
  /** how many people are in each cell. These are the somebodies. */
  people: Float32Array;
  /** how badly each cell still needs to be reached, 0..1. Falls as a fleet arrives. */
  need: Float32Array;
  /** total people on the map, precomputed */
  souls: number;
}

/**
 * Build a synthetic region: a coastal shelf with a spine of high ground, a scatter of
 * settlements, and two hard barriers that every fleet has to negotiate. Deterministic.
 */
export function makeGround(seed: number, w: number, h: number): Ground {
  const r = makeRng(seed >>> 0);
  const pass = new Float32Array(w * h).fill(1);
  const people = new Float32Array(w * h);
  const need = new Float32Array(w * h);

  // low-frequency terrain from summed sine lobes — cheap, smooth, seeded
  const lobes = 6;
  const ax: number[] = [];
  for (let l = 0; l < lobes; l++) {
    ax.push(0.6 + r() * 2.4, r() * Math.PI * 2, 0.6 + r() * 2.4, r() * Math.PI * 2);
  }
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      let e = 0;
      for (let l = 0; l < lobes; l++) {
        const o = l * 4;
        e += Math.sin(u * ax[o] * Math.PI * 2 + ax[o + 1]) * Math.cos(v * ax[o + 2] * Math.PI * 2 + ax[o + 3]);
      }
      height[y * w + x] = e / lobes;
    }
  }

  // two barriers: a ridge and a flooded channel. Both impassable, both shaped by the terrain.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = height[i];
      if (e > 0.42) pass[i] = 0;                        // the ridge
      const chan = Math.abs(y - h * (0.62 + 0.06 * Math.sin((x / w) * 5.1)));
      if (chan < h * 0.035 && x > w * 0.18) pass[i] = 0; // the channel
    }
  }

  // settlements: clusters of people on open ground, denser where the land is kind
  const towns = 26;
  for (let t = 0; t < towns; t++) {
    let cx = 0;
    let cy = 0;
    for (let tries = 0; tries < 40; tries++) {
      cx = Math.floor(r() * w);
      cy = Math.floor(r() * h);
      if (pass[cy * w + cx] > 0) break;
    }
    const mass = 40 + r() * 240;
    const rad = 3 + r() * 7;
    for (let y = Math.max(0, cy - rad | 0); y < Math.min(h, cy + rad + 1); y++) {
      for (let x = Math.max(0, cx - rad | 0); x < Math.min(w, cx + rad + 1); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rad) continue;
        const i = y * w + x;
        if (pass[i] <= 0) continue;
        people[i] += mass * Math.exp(-(d * d) / (2 * (rad / 2) * (rad / 2))) / (rad * rad);
      }
    }
  }

  let souls = 0;
  for (let i = 0; i < w * h; i++) {
    souls += people[i];
    need[i] = people[i] > 0.02 ? 1 : 0;
  }
  return { w, h, pass, people, need, souls };
}

// ---------------------------------------------------------------- the eight logics

export type LogicKey = "slime" | "mycelium" | "root" | "vascular" | "coral" | "lichen" | "swarm" | "vine";

export interface LogicSpec {
  key: LogicKey;
  /** the field-guide family letter */
  letter: string;
  /** what a person calls it */
  name: string;
  /** the actual named mathematics, printed so a reader can check the claim */
  model: string;
  /** what this logic is good at, in plain words */
  strength: string;
  /** what it gives up, in plain words. Every growth logic has a cost. */
  cost: string;
}

export const LOGICS: readonly LogicSpec[] = [
  {
    key: "slime",
    letter: "A",
    name: "slime mould",
    model: "Jones 2010 Physarum agent model",
    strength: "finds the cheapest route and keeps reinforcing it",
    cost: "prunes away everything that is not on the efficient path",
  },
  {
    key: "mycelium",
    letter: "B",
    name: "mycelium",
    model: "hyphal tip growth with anastomosis",
    strength: "cross-links into a mesh that survives being cut",
    cost: "spends a great deal of mass on redundancy",
  },
  {
    key: "root",
    letter: "C",
    name: "roots",
    model: "gradient-following tips with tropism",
    strength: "negotiates obstacles and works uncertain terrain",
    cost: "commits to the first good patch and stops looking",
  },
  {
    key: "vascular",
    letter: "D",
    name: "vascular tree",
    model: "space colonization (Runions 2007)",
    strength: "moves volume down the trunk very fast",
    cost: "the far leaves starve when the trunk is busy",
  },
  {
    key: "coral",
    letter: "E",
    name: "coral",
    model: "diffusion-limited aggregation",
    strength: "builds permanent structure and holds ground",
    cost: "only ever grows at its own edge",
  },
  {
    key: "lichen",
    letter: "F",
    name: "lichen",
    model: "two co-dependent populations",
    strength: "combines capabilities neither half has alone",
    cost: "fails completely if either partner fails",
  },
  {
    key: "swarm",
    letter: "G",
    name: "swarm",
    model: "Keller-Segel chemotaxis with quorum",
    strength: "adapts locally and reaches ground nobody else wanted",
    cost: "holds nothing it has taken",
  },
  {
    key: "vine",
    letter: "H",
    name: "vine",
    model: "support-seeking space colonization",
    strength: "climbs whatever structure already exists",
    cost: "goes nowhere without something to attach to",
  },
] as const;

// ---------------------------------------------------------------- fleet state

/** One fleet: a population of tips growing across the ground, plus what it has claimed. */
export interface Fleet {
  spec: LogicSpec;
  /** trail / occupancy field this fleet has laid down, 0..1 */
  mass: Float32Array;
  /** live growth tips */
  tx: Float32Array;
  ty: Float32Array;
  /** heading, radians */
  th: Float32Array;
  /** 1 = alive, 0 = pruned */
  alive: Uint8Array;
  n: number;
  cap: number;
  rng: Rng;
  /** running tally: people this fleet has reached */
  reached: number;
  /** mass spent — every logic gets the same budget */
  spent: number;
}

export function makeFleet(spec: LogicSpec, seed: number, g: Ground, cap: number): Fleet {
  const rng = makeRng((seed ^ hash(spec.key)) >>> 0);
  const mass = new Float32Array(g.w * g.h);
  const tx = new Float32Array(cap);
  const ty = new Float32Array(cap);
  const th = new Float32Array(cap);
  const alive = new Uint8Array(cap);
  return { spec, mass, tx, ty, th, alive, n: 0, cap, rng, reached: 0, spent: 0 };
}

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** All eight land at the same place at the same moment, so the start is not a variable. */
export function seedFleet(f: Fleet, g: Ground, landing: [number, number], tips: number) {
  for (let i = 0; i < tips && i < f.cap; i++) {
    f.tx[i] = landing[0];
    f.ty[i] = landing[1];
    f.th[i] = (i / tips) * Math.PI * 2;
    f.alive[i] = 1;
  }
  f.n = Math.min(tips, f.cap);
  const li = (landing[1] | 0) * g.w + (landing[0] | 0);
  if (li >= 0 && li < f.mass.length) f.mass[li] = 1;
}
