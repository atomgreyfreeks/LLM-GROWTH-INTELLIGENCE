/**
 * THE BOAT — deterministic kernel + pre-registered experiment runner.
 *
 * Prereg (BINDING): docs/trust/the-boat/PREREG.md. The claim under test:
 * fusing two evidence channels early (one shared belief map) destroys the
 * disagreement that would have warned you, worst exactly where the storm
 * makes both channels fail together. ONE KNOB: the layer where the two
 * witnesses (satellite, phone calls) merge —
 * EARLY (one map) / LATE (two maps + visible disagreement) /
 * PROBE (LATE + go-look when they disagree) / ORACLE (ceiling) / RANDOM (floor).
 *
 * Covenant rules hold: no Math.random / Date.now / new Date. All world
 * randomness (storm paths, occlusion draws, call draws, obs noise,
 * exaggerator identities) is PRE-DRAWN from the world seed before any policy
 * runs; the runner asserts the pre-drawn observation-stream hash is identical
 * across all five arms for every regime x seed. Every config runs twice and
 * the event-log hashes must be byte-identical. Budget matching (one boat,
 * same speed, same rescue capacity in every arm) is asserted, not assumed.
 *
 * Interpretation decisions (disclosed; everything else is prereg-literal):
 *  - LATE's conservative score "mean of the two hypotheses weighted by their
 *    ages" = weighted by FRESHNESS, w = AGE_DECAY^age (weighting stale
 *    readings more would reward staleness, which cannot be the intent).
 *  - The boat's own ground observation on rescue completion (the probe's
 *    write-back is prereg-explicit) merges through the arm's own rule:
 *    EARLY blends it into the one map at equal weight like any arrival;
 *    LATE/PROBE write it into both channel maps fresh. Same observation,
 *    same budget in every arm; only the merge layer differs — the knob.
 *  - RANDOM has no belief, so "believed need" is undefined for it: its
 *    empty-water count is 0 by definition (a boat without confidence cannot
 *    be sent BY confidence into nothing).
 *  - Empty-water is counted on rescue arrivals; probe fly-bys are logged
 *    separately and never counted as empty-water.
 *
 * Run:   cd app && npx tsx scripts/boat.mts
 * Bake:  cd app && npx tsx scripts/boat.mts --bake   (seed 3, STORMY, EARLY+PROBE)
 */

import { makeRng, hashStr, rnorm } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- fixed design
// (frozen before the first run; theta is prereg-fixed at 0.35)

const S = 48;                 // settlements
const T = 240;                // ticks
const THETA = 0.35;           // prereg: fixed before any run, shared LATE/PROBE
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const AGE_DECAY = 0.98;       // per-tick discount on unrefreshed beliefs
const NAT_RESOLVE = 0.995;    // prereg: need resolves 0.5%/tick naturally
const DRIFT = 0.0005;         // need creeps up slowly everywhere
const K_FLOOD = 0.05;         // need gain per tick per unit storm
const NEED_MAX = 3.0;
const SIG_SAT = 0.10;         // satellite obs noise sigma
const SIG_CALL = 0.15;        // call obs noise sigma
const P0_CALL = 0.20;         // base call probability per settlement per tick
const K_CUT = 0.85;           // phone access = 1 - K_CUT * storm
const STORM_ZONE = 0.25;      // storm(i,t) above this counts as "in the storm"
const N_CELLS = 3;            // prereg: three storm cells

const BOAT = { speed: 0.035, rescueTicks: 2, rescuePerTick: 0.8 };

const REGIMES = {
  CALM:     { gain: 0.35, kOcc: 0.9, exagFrac: 0.20, exagFactor: 1.5 },
  STORMY:   { gain: 1.0,  kOcc: 0.9, exagFrac: 0.20, exagFactor: 1.5 },
  POISONED: { gain: 1.0,  kOcc: 0.9, exagFrac: 0.60, exagFactor: 2.0 },
  BLACKOUT: { gain: 1.0,  kOcc: 1.8, exagFrac: 0.20, exagFactor: 1.5 }, // k_occ doubled
} as const;
type Regime = keyof typeof REGIMES;
const REGIME_LIST: Regime[] = ["CALM", "STORMY", "POISONED", "BLACKOUT"];

const ARMS = ["EARLY", "LATE", "PROBE", "ORACLE", "RANDOM"] as const;
type Arm = (typeof ARMS)[number];

interface Cfg {
  worldSeed: number;
  regime: Regime;
  arm: Arm;
  boat: { speed: number; rescueTicks: number; rescuePerTick: number };
  theta: number;
}

// ---------------------------------------------------------------- hashing

const FNV_INIT = 2166136261 >>> 0;
const fnvAdd = (h: number, s: string): number => {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const fnvHex = (h: number): string => (h >>> 0).toString(16).padStart(8, "0");
const fnv = (s: string): string => fnvHex(fnvAdd(FNV_INIT, s));

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const r5 = (x: number): number => Math.round(x * 100000) / 100000;

// ---------------------------------------------------------------- world
// Everything below is drawn from the world seed BEFORE any policy exists.
// Geography, storm paths, and all uniform/normal draws come from streams that
// do not depend on regime; regimes only change the thresholds/gains applied
// to those same draws. Arms share the world by construction — asserted.

interface StormCellSnap { x: number; y: number; r: number; k: number }

interface World {
  pos: [number, number][];
  pop: number[];
  popSum: number;
  coast: [number, number][];
  storm: Float64Array[];        // [t][i] in [0,1], regime gain applied
  cellsAt: StormCellSnap[][];   // snapshot every 2 ticks: cellsAt[t/2]
  occl: Uint8Array[];           // [t][i] 1 = satellite occluded
  callAt: Uint8Array[];         // [t][i] 1 = call placed at t (arrives t+1)
  satZ: Float64Array[];         // [t][i] pre-drawn N(0,1) for satellite noise
  callZ: Float64Array[];        // [t][i] pre-drawn N(0,1) for call noise
  satZ0: Float64Array;          // baseline satellite pass noise (t=0 init)
  exag: Uint8Array;             // exaggerator identities
  need0: Float64Array;
  obsHash: string;              // hash of the full pre-drawn observation stream
}

function makeWorld(seed: number, regime: Regime): World {
  const R = REGIMES[regime];

  // -- geography (coastline, settlements, populations)
  const rg = makeRng(hashStr(`boat:geo:${seed}`));
  const cA = 1 + rg(), cB = 2 + 2 * rg(), p1 = 2 * Math.PI * rg(), p2 = 2 * Math.PI * rg();
  const coastY = (x: number) =>
    0.45 + 0.12 * Math.sin(2 * Math.PI * cA * x + p1) + 0.06 * Math.sin(2 * Math.PI * cB * x + p2);
  const xs = Array.from({ length: S }, () => 0.04 + 0.92 * rg()).sort((a, b) => a - b);
  const pos = xs.map((x): [number, number] => [x, coastY(x) + 0.01 + 0.02 * rg()]);
  const raw = Array.from({ length: S }, () => Math.exp(0.9 * rnorm(rg))); // heavy tail
  const rawSum = raw.reduce((a, b) => a + b, 0);
  const pop = raw.map((v) => Math.max(30, Math.round((v * 18000) / rawSum)));
  const popSum = pop.reduce((a, b) => a + b, 0);
  const coast = Array.from({ length: 64 }, (_, j): [number, number] => {
    const x = j / 63;
    return [r3(x), r3(coastY(x))];
  });

  // -- storm cells: seeded deterministic paths riding the coast, wrap in x
  const rp = makeRng(hashStr(`boat:storm:${seed}`));
  const cells = Array.from({ length: N_CELLS }, () => ({
    x0: rp(),
    yOff: (rp() - 0.5) * 0.1,
    vx: 0.003 + 0.005 * rp(),
    wF: 1 + 2 * rp(),
    wP: 2 * Math.PI * rp(),
    r: 0.05 + 0.04 * rp(),
    k: 0.7 + 0.3 * rp(),
  }));
  const cellPos = (c: (typeof cells)[number], t: number): [number, number] => {
    const x = (c.x0 + c.vx * t) % 1;
    const y = coastY(x) + c.yOff + 0.06 * Math.sin((2 * Math.PI * c.wF * t) / T + c.wP);
    return [x, y];
  };

  // -- pre-drawn per-tick streams (regime-independent draws, regime-scaled thresholds)
  const rd = makeRng(hashStr(`boat:draws:${seed}`));
  const need0 = Float64Array.from({ length: S }, () => 0.05 + 0.25 * rd());
  const exagU = Array.from({ length: S }, () => rd());
  const exag = Uint8Array.from(exagU.map((u) => (u < R.exagFrac ? 1 : 0)));
  const satZ0 = Float64Array.from({ length: S }, () => rnorm(rd));

  const storm: Float64Array[] = [];
  const occl: Uint8Array[] = [];
  const callAt: Uint8Array[] = [];
  const satZ: Float64Array[] = [];
  const callZ: Float64Array[] = [];
  const cellsAt: StormCellSnap[][] = [];

  let oh = FNV_INIT;
  oh = fnvAdd(oh, `${regime}|${seed}|${JSON.stringify({ pos: pos.map(([x, y]) => [r5(x), r5(y)]), pop })}`);
  oh = fnvAdd(oh, `|need0:${Array.from(need0, r5).join(",")}|exag:${Array.from(exag).join("")}|z0:${Array.from(satZ0, r5).join(",")}`);

  for (let t = 0; t < T; t++) {
    const st = new Float64Array(S);
    const oc = new Uint8Array(S);
    const ca = new Uint8Array(S);
    const sz = new Float64Array(S);
    const cz = new Float64Array(S);
    const cp = cells.map((c) => cellPos(c, t));
    for (let i = 0; i < S; i++) {
      let s = 0;
      for (let c = 0; c < N_CELLS; c++) {
        const dx = pos[i][0] - cp[c][0], dy = pos[i][1] - cp[c][1];
        s += cells[c].k * Math.exp(-(dx * dx + dy * dy) / (2 * cells[c].r * cells[c].r));
      }
      st[i] = Math.min(1, R.gain * s);
      // draws are unconditional so the stream is identical regardless of thresholds
      const uOcc = rd(), uCall = rd();
      sz[i] = rnorm(rd);
      cz[i] = rnorm(rd);
      oc[i] = uOcc < Math.min(1, R.kOcc * st[i]) ? 1 : 0;
      ca[i] = uCall < P0_CALL * Math.max(0, 1 - K_CUT * st[i]) ? 1 : 0;
    }
    storm.push(st); occl.push(oc); callAt.push(ca); satZ.push(sz); callZ.push(cz);
    if (t % 2 === 0)
      cellsAt.push(cp.map((p, c) => ({ x: r3(p[0]), y: r3(p[1]), r: r3(cells[c].r), k: r3(Math.min(1, R.gain * cells[c].k)) })));
    oh = fnvAdd(oh, `|t${t}:${Array.from(st, r5).join(",")};${Array.from(oc).join("")};${Array.from(ca).join("")};${Array.from(sz, r5).join(",")};${Array.from(cz, r5).join(",")}`);
  }

  return { pos, pop, popSum, coast, storm, cellsAt, occl, callAt, satZ, callZ, satZ0, exag, need0, obsHash: fnvHex(oh) };
}

// ---------------------------------------------------------------- run

type Ev = Record<string, unknown> & { e: string; t?: number };

interface RunOut {
  logHash: string;
  obsHash: string;
  peopleRescued: number;   // sum of removed need x pop
  unmetPT: number;         // sum need x pop per tick, in people-need-kiloticks
  stormShare: number;      // share of unmet inside storm cells (storm > STORM_ZONE)
  emptyWater: number;      // rescue arrivals with true need < 0.1 x believed
  halfEmpty: number;       // exploratory diagnostic only: arrivals with found < 0.5 x believed
  commitsRescue: number;
  probes: number;          // probe fly-by commits fired
  probesChanged: number;   // probes after which the recommit target differed
  rescueLat: number;       // mean commit->arrival ticks, rescue missions
  events: Ev[] | null;
  world: World | null;
}

function run(cfg: Cfg, keepAll = false): RunOut {
  const w = makeWorld(cfg.worldSeed, cfg.regime);
  const R = REGIMES[cfg.regime];
  const rPol = makeRng(hashStr(`boat:policy:${cfg.arm}:${cfg.worldSeed}:${cfg.regime}`)); // consumed by RANDOM only
  const need = Float64Array.from(w.need0);
  const events: Ev[] = [];
  const push = (e: Ev) => events.push(e);
  const dk = (age: number) => Math.pow(AGE_DECAY, age);

  // -- witness maps (which of these an arm reads is THE knob)
  const satMap = new Float64Array(S), satTick = new Int32Array(S);
  const callMap = new Float64Array(S), callTick = new Int32Array(S);
  const callSeen = new Uint8Array(S);
  const belief = new Float64Array(S), beliefTick = new Int32Array(S);
  for (let i = 0; i < S; i++) {
    const v = Math.max(0, w.need0[i] + SIG_SAT * w.satZ0[i]); // pre-storm baseline pass
    satMap[i] = v; satTick[i] = 0; belief[i] = v; beliefTick[i] = 0;
  }

  // -- the one boat
  let bx = 0, by = 0;
  { let sx = 0, sy = 0; for (const [x, y] of w.pos) { sx += x; sy += y; } bx = sx / S; by = sy / S; }
  let phase: "idle" | "transit" | "rescue" = "idle";
  let target = -1, arriveT = -1, commitT = -1, rescueLeft = 0;
  let expected: number | null = null;
  let mission: "rescue" | "probe" = "rescue";
  let arriveEv: Ev | null = null;
  let rescuedThis = 0;
  let probePendingFrom = -1;

  // -- metrics
  let rescuedPeople = 0, unmet = 0, stormUnmet = 0, empty = 0, halfEmpty = 0;
  let commitsRescue = 0, probes = 0, probesChanged = 0;
  const lat: number[] = [];
  let pending: { i: number; v: number }[] = []; // calls placed last tick (1-tick delay)

  const groundReport = (i: number, t: number) => {
    // the crew's own observation, merged through the arm's rule — the knob again
    const v = need[i];
    if (cfg.arm === "EARLY") {
      belief[i] = 0.5 * belief[i] * dk(t - beliefTick[i]) + 0.5 * v; beliefTick[i] = t;
    } else if (cfg.arm === "LATE" || cfg.arm === "PROBE") {
      satMap[i] = v; satTick[i] = t; callMap[i] = v; callTick[i] = t; callSeen[i] = 1;
    } // ORACLE reads truth, RANDOM reads nothing
  };

  const decide = (t: number): { i: number; expected: number | null; d: number } | null => {
    if (cfg.arm === "RANDOM") return { i: Math.floor(rPol() * S), expected: null, d: 0 };
    let best = -1, bestScore = 0, bestExp = 0, bestD = 0;
    for (let i = 0; i < S; i++) {
      let est = 0, d = 0;
      if (cfg.arm === "ORACLE") est = need[i];
      else if (cfg.arm === "EARLY") est = belief[i] * dk(t - beliefTick[i]);
      else { // LATE / PROBE — two witnesses, disagreement visible
        const se = satMap[i] * dk(t - satTick[i]);
        if (callSeen[i]) {
          const ce = callMap[i] * dk(t - callTick[i]);
          d = Math.abs(se - ce);
          if (d > cfg.theta) {
            const ws = dk(t - satTick[i]), wc = dk(t - callTick[i]); // freshness weights
            est = (ws * se + wc * ce) / (ws + wc);
          } else est = (se + ce) / 2;
        } else est = se;
      }
      const sc = est * w.pop[i];
      if (sc > bestScore) { bestScore = sc; best = i; bestExp = est; bestD = d; }
    }
    return best < 0 ? null : { i: best, expected: bestExp, d: bestD };
  };

  for (let t = 0; t < T; t++) {
    // ---- the world moves whether or not anyone looks
    for (let i = 0; i < S; i++)
      need[i] = Math.min(NEED_MAX, Math.max(0, (need[i] + DRIFT + K_FLOOD * w.storm[t][i]) * NAT_RESOLVE));

    // ---- observations arrive (draws pre-drawn; only values track this arm's need)
    const arrivals: (number[] | null)[] = new Array(S).fill(null);
    for (const c of pending) {
      callMap[c.i] = c.v; callTick[c.i] = t; callSeen[c.i] = 1;
      (arrivals[c.i] ??= []).push(c.v);
      push({ e: "call", t, i: c.i, v: r3(c.v) });
    }
    pending = [];
    for (let i = 0; i < S; i++) {
      if (!w.occl[t][i]) {
        const v = Math.max(0, need[i] + SIG_SAT * w.satZ[t][i]);
        satMap[i] = v; satTick[i] = t;
        (arrivals[i] ??= []).push(v);
        push({ e: "sat", t, i, v: r3(v) });
      } else push({ e: "sat", t, i, v: r3(satMap[i]), stale: 1 }); // last reading carried, aging
    }
    if (cfg.arm === "EARLY")
      for (let i = 0; i < S; i++) {
        const a = arrivals[i];
        if (a) { // one shared map, whatever arrives, equal weights, age-discounted
          const m = a.reduce((x, y) => x + y, 0) / a.length;
          belief[i] = 0.5 * belief[i] * dk(t - beliefTick[i]) + 0.5 * m; beliefTick[i] = t;
        }
      }

    // ---- calls placed now (arrive t+1; the stranger may be lying)
    for (let i = 0; i < S; i++)
      if (w.callAt[t][i])
        pending.push({ i, v: Math.max(0, need[i] * (w.exag[i] ? R.exagFactor : 1) + SIG_CALL * w.callZ[t][i]) });

    // ---- the one boat
    if (phase === "idle") {
      const dec = decide(t);
      if (dec) {
        if (probePendingFrom >= 0) { if (dec.i !== probePendingFrom) probesChanged++; probePendingFrom = -1; }
        const [tx, ty] = w.pos[dec.i];
        const tt = Math.max(1, Math.ceil(Math.hypot(tx - bx, ty - by) / cfg.boat.speed));
        mission = cfg.arm === "PROBE" && dec.d > cfg.theta ? "probe" : "rescue";
        if (mission === "probe") probes++; else commitsRescue++;
        target = dec.i; arriveT = t + tt; commitT = t; expected = dec.expected;
        push({ e: "commit", t, i: dec.i, expected: dec.expected === null ? null : r3(dec.expected), disagreement: r3(dec.d) });
        phase = "transit";
      }
    } else if (phase === "transit" && t === arriveT) {
      const [tx, ty] = w.pos[target]; bx = tx; by = ty;
      const found = need[target];
      if (mission === "probe") {
        // fly-by: 1 tick observing truth, written into BOTH maps, then recommit
        satMap[target] = found; satTick[target] = t;
        callMap[target] = found; callTick[target] = t; callSeen[target] = 1;
        push({ e: "probe", t, i: target, found: r3(found) });
        probePendingFrom = target;
        phase = "idle"; // recommits next tick from current position
      } else {
        const isEmpty = expected !== null && found < 0.1 * expected;
        if (isEmpty) empty++;
        if (expected !== null && found < 0.5 * expected) halfEmpty++;
        lat.push(t - commitT);
        const rm = Math.min(need[target], cfg.boat.rescuePerTick);
        need[target] -= rm; rescuedThis = rm; rescuedPeople += rm * w.pop[target];
        arriveEv = { e: "arrive", t, i: target, found: r3(found), rescued: 0 };
        if (isEmpty) arriveEv.empty = 1;
        push(arriveEv);
        rescueLeft = cfg.boat.rescueTicks - 1;
        phase = "rescue";
      }
    } else if (phase === "rescue") {
      const rm = Math.min(need[target], cfg.boat.rescuePerTick);
      need[target] -= rm; rescuedThis += rm; rescuedPeople += rm * w.pop[target];
      if (--rescueLeft <= 0) {
        arriveEv!.rescued = r3(rescuedThis);
        groundReport(target, t);
        rescuedThis = 0; arriveEv = null; phase = "idle"; // free to decide next tick
      }
    }

    // ---- book the cost of this tick + residue snapshots
    for (let i = 0; i < S; i++) {
      const u = need[i] * w.pop[i];
      unmet += u;
      if (w.storm[t][i] > STORM_ZONE) stormUnmet += u;
    }
    if (t % 2 === 0) push({ e: "storm", t, cells: w.cellsAt[t >> 1] });
    if (t % 4 === 0) push({ e: "need", t, vals: Array.from(need, r3) });
  }
  if (arriveEv) arriveEv.rescued = r3(rescuedThis); // run ended mid-rescue

  return {
    logHash: fnv(JSON.stringify(events)),
    obsHash: w.obsHash,
    peopleRescued: Math.round(rescuedPeople * 10) / 10,
    unmetPT: Math.round(unmet / 100) / 10,
    stormShare: Math.round((stormUnmet / Math.max(1e-9, unmet)) * 10000) / 10000,
    emptyWater: empty,
    halfEmpty,
    commitsRescue,
    probes,
    probesChanged,
    rescueLat: lat.length ? Math.round((lat.reduce((a, b) => a + b, 0) / lat.length) * 100) / 100 : 0,
    events: keepAll ? events : null,
    world: keepAll ? w : null,
  };
}

// ---------------------------------------------------------------- harness

const cfgOf = (seed: number, regime: Regime, arm: Arm): Cfg => ({
  worldSeed: seed, regime, arm, boat: { ...BOAT }, theta: THETA,
});

type Slim = Omit<RunOut, "events" | "world"> & { seed: number };
const slim = (r: RunOut, seed: number): Slim => {
  const { events: _e, world: _w, ...rest } = r;
  return { ...rest, seed };
};

const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const mn = (xs: number[]) => Math.min(...xs);
const mx = (xs: number[]) => Math.max(...xs);
const f1 = (x: number) => x.toFixed(1);
const mmm = (xs: number[], d = 1) => `${med(xs).toFixed(d)} [${mn(xs).toFixed(d)}..${mx(xs).toFixed(d)}]`;

function main() {
  const bake = process.argv.includes("--bake");

  // ---- budget matching asserted: one boat, same speed, same capacity, every arm
  for (const regime of REGIME_LIST)
    for (const seed of SEEDS) {
      const strips = ARMS.map((a) => JSON.stringify({ ...cfgOf(seed, regime, a), arm: "_" }));
      if (new Set(strips).size !== 1) throw new Error(`BUDGET MISMATCH ${regime} seed ${seed}`);
    }
  console.log(`budget-matched: one boat, speed ${BOAT.speed}, rescue ${BOAT.rescueTicks}x${BOAT.rescuePerTick}, identical config-minus-arm in all 5 arms, all regimes, all seeds ✓`);

  if (bake) { runBake(); return; }

  // ---- world diagnostics (mechanism liveness, seed 1)
  console.log("\n== world diagnostics (seed 1) — the correlated blindness, mechanical");
  for (const regime of REGIME_LIST) {
    const w = makeWorld(1, regime);
    let zone = 0, occZone = 0, calls = 0, accSum = 0;
    for (let t = 0; t < T; t++)
      for (let i = 0; i < S; i++) {
        if (w.storm[t][i] > STORM_ZONE) { zone++; if (w.occl[t][i]) occZone++; }
        if (w.callAt[t][i]) calls++;
        accSum += Math.max(0, 1 - K_CUT * w.storm[t][i]);
      }
    console.log(
      `${regime.padEnd(9)} popSum=${w.popSum}  stormZone=${((zone / (S * T)) * 100).toFixed(1)}% of settlement-ticks` +
      `  satOccludedInZone=${zone ? ((occZone / zone) * 100).toFixed(1) : "0.0"}%  meanPhoneAccess=${(accSum / (S * T)).toFixed(2)}  calls/tick=${(calls / T).toFixed(1)}`);
  }

  // ---- full sweep: 4 regimes x 5 arms x 8 seeds, every config twice
  const results = {} as Record<Regime, Record<Arm, Slim[]>>;
  for (const regime of REGIME_LIST) {
    results[regime] = {} as Record<Arm, Slim[]>;
    for (const arm of ARMS) results[regime][arm] = [];
    for (const seed of SEEDS) {
      const obsHashes: string[] = [];
      for (const arm of ARMS) {
        const cfg = cfgOf(seed, regime, arm);
        const r1 = run(cfg), r2 = run(cfg);
        if (r1.logHash !== r2.logHash) throw new Error(`DETERMINISM FAIL ${arm} ${regime} seed ${seed}: ${r1.logHash} vs ${r2.logHash}`);
        obsHashes.push(r1.obsHash);
        results[regime][arm].push(slim(r1, seed));
      }
      if (new Set(obsHashes).size !== 1)
        throw new Error(`OBS-STREAM DIVERGENCE ${regime} seed ${seed}: ${obsHashes.join(",")}`);
    }
  }
  console.log("\ndeterminism: every config ran twice; event-log hashes byte-identical ✓");
  console.log("obs stream: pre-drawn observation-stream hash identical across all 5 arms, every regime x seed ✓");

  // ---- per-regime tables
  for (const regime of REGIME_LIST) {
    console.log(`\n== ${regime} (8 seeds; median [min..max])`);
    console.log(
      "arm".padEnd(8) + "peopleRescued".padStart(26) + "emptyWater".padStart(16) + "half*".padStart(12) + "unmetPT".padStart(24) +
      "stormShare".padStart(12) + "commits".padStart(9) + "probes".padStart(8) + "chg".padStart(5) + "lat".padStart(7));
    for (const arm of ARMS) {
      const rs = results[regime][arm];
      const g = (k: keyof Slim) => rs.map((r) => r[k] as number);
      console.log(
        arm.padEnd(8) + mmm(g("peopleRescued"), 0).padStart(26) + mmm(g("emptyWater"), 0).padStart(16) +
        mmm(g("halfEmpty"), 0).padStart(12) +
        mmm(g("unmetPT"), 1).padStart(24) + med(g("stormShare")).toFixed(3).padStart(12) +
        String(g("commitsRescue").reduce((a, b) => a + b, 0)).padStart(9) +
        String(g("probes").reduce((a, b) => a + b, 0)).padStart(8) +
        String(g("probesChanged").reduce((a, b) => a + b, 0)).padStart(5) +
        med(g("rescueLat")).toFixed(1).padStart(7));
    }
  }
  console.log("(RANDOM emptyWater is 0 by definition: no belief, so no confident commit to falsify)");
  console.log("(half* = arrivals with found < 0.5 x believed — exploratory diagnostic only, feeds no prediction)");

  // ---- probe fire rate + inert rule (prereg: <5% of commits in STORMY => INERT)
  const probeRates: string[] = [];
  let inert = false;
  for (const regime of REGIME_LIST) {
    const rs = results[regime].PROBE;
    const p = rs.reduce((a, r) => a + r.probes, 0);
    const c = rs.reduce((a, r) => a + r.commitsRescue + r.probes, 0);
    const rate = c ? p / c : 0;
    probeRates.push(`${regime}=${p}/${c} (${(rate * 100).toFixed(1)}%)`);
    if (regime === "STORMY" && rate < 0.05) inert = true;
  }
  console.log(`\n== probe fire rate (probes fired / all commits): ${probeRates.join("  ")}`);
  const chg = results.STORMY.PROBE.reduce((a, r) => a + r.probesChanged, 0);
  const pTot = results.STORMY.PROBE.reduce((a, r) => a + r.probes, 0);
  console.log(`probes that changed the target (STORMY): ${chg}/${pTot} (${pTot ? ((chg / pTot) * 100).toFixed(1) : "0.0"}%)`);
  if (inert) console.log("INERT: probes fired < 5% of commits in STORMY — theta was mis-set; the PROBE claim narrows to what fired");

  // ---- prediction scorecard, mechanical
  const M = (regime: Regime, arm: Arm, k: keyof Slim) => med(results[regime][arm].map((r) => r[k] as number));
  console.log("\n==================== PREDICTION SCORECARD (medians across 8 seeds) ====================");

  { // P1 — STORMY empty-water: EARLY >= 1.5x LATE; falsifier: LATE within 10% of EARLY
    const E = M("STORMY", "EARLY", "emptyWater"), L = M("STORMY", "LATE", "emptyWater");
    const refuted = L >= 0.9 * E;
    const pass = !refuted && E >= 1.5 * L;
    const verdict = pass ? "PASS" : refuted ? "REFUTED" : "NEITHER (between pass bar and falsifier)";
    console.log(`P1  STORMY empty-water commits: EARLY med=${E}, LATE med=${L}, ratio=${L > 0 ? (E / L).toFixed(2) : E > 0 ? "inf" : "0/0"}`);
    console.log(`    bar: EARLY >= 1.5x LATE. falsifier: LATE within 10% of EARLY.  -> ${verdict}`);
  }

  { // P2 — STORMY rescued PROBE >= LATE >= EARLY; CALM PROBE <= LATE (visible tax);
    // falsifier: PROBE never beats LATE in any regime
    const sr = (a: Arm) => M("STORMY", a, "peopleRescued");
    const cr = (a: Arm) => M("CALM", a, "peopleRescued");
    const beatsAnywhere = REGIME_LIST.some((rg) => M(rg, "PROBE", "peopleRescued") > M(rg, "LATE", "peopleRescued"));
    const orderStormy = sr("PROBE") >= sr("LATE") && sr("LATE") >= sr("EARLY");
    const calmTax = cr("PROBE") <= cr("LATE");
    const verdict = !beatsAnywhere ? "REFUTED (PROBE never beats LATE anywhere — root-foraging support claim dies)"
      : orderStormy && calmTax ? "PASS" : "NEITHER (partial: see legs)";
    console.log(`P2  STORMY rescued: PROBE=${f1(sr("PROBE"))} LATE=${f1(sr("LATE"))} EARLY=${f1(sr("EARLY"))} (order ${orderStormy ? "holds" : "BROKEN"})`);
    console.log(`    CALM rescued: PROBE=${f1(cr("PROBE"))} LATE=${f1(cr("LATE"))} (probe tax ${calmTax ? "visible" : "NOT visible"})`);
    console.log(`    PROBE beats LATE in >=1 regime: ${beatsAnywhere}  -> ${verdict}`);
  }

  { // P3 — POISONED: EARLY loses more vs its own STORMY number than LATE
    const dEabs = M("STORMY", "EARLY", "peopleRescued") - M("POISONED", "EARLY", "peopleRescued");
    const dLabs = M("STORMY", "LATE", "peopleRescued") - M("POISONED", "LATE", "peopleRescued");
    const dErel = dEabs / Math.max(1e-9, M("STORMY", "EARLY", "peopleRescued"));
    const dLrel = dLabs / Math.max(1e-9, M("STORMY", "LATE", "peopleRescued"));
    const pass = dErel > dLrel;
    console.log(`P3  POISONED degradation vs own STORMY: EARLY ${f1(M("STORMY", "EARLY", "peopleRescued"))} -> ${f1(M("POISONED", "EARLY", "peopleRescued"))} (loss ${f1(dEabs)}, ${(dErel * 100).toFixed(1)}%)`);
    console.log(`    LATE ${f1(M("STORMY", "LATE", "peopleRescued"))} -> ${f1(M("POISONED", "LATE", "peopleRescued"))} (loss ${f1(dLabs)}, ${(dLrel * 100).toFixed(1)}%)`);
    console.log(`    bar: EARLY relative loss > LATE relative loss.  -> ${pass ? "PASS" : "REFUTED (channel identity bought nothing under poison)"}`);
  }

  { // P4 — STORMY storm-zone unmet share: EARLY > LATE
    const E = M("STORMY", "EARLY", "stormShare"), L = M("STORMY", "LATE", "stormShare");
    console.log(`P4  STORMY storm-zone unmet share: EARLY=${E.toFixed(3)}, LATE=${L.toFixed(3)}`);
    console.log(`    bar: EARLY > LATE.  -> ${E > L ? "PASS" : "REFUTED (correlated-failure geography claim dies)"}`);
  }

  { // P5 — exploratory: where does PROBE's advantage over LATE peak?
    const adv = REGIME_LIST.map((rg) => ({ rg, a: M(rg, "PROBE", "peopleRescued") - M(rg, "LATE", "peopleRescued") }));
    const peak = adv.reduce((a, b) => (b.a > a.a ? b : a));
    console.log(`P5  (exploratory) PROBE - LATE rescued advantage by regime: ${adv.map((x) => `${x.rg}=${f1(x.a)}`).join("  ")}`);
    console.log(`    peak: ${peak.rg} (expectation on record was BLACKOUT). Reported, not scored.`);
  }
  console.log("========================================================================================");

  // ---- raw record: every arm x seed x regime
  const dest = join(HERE, "..", "..", "docs", "trust", "the-boat", "raw-results.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify({
    prereg: "docs/trust/the-boat/PREREG.md",
    kernel: "app/scripts/boat.mts",
    design: { S, T, theta: THETA, seeds: SEEDS, boat: BOAT, ageDecay: AGE_DECAY, natResolve: NAT_RESOLVE, drift: DRIFT, kFlood: K_FLOOD, needMax: NEED_MAX, sigSat: SIG_SAT, sigCall: SIG_CALL, p0Call: P0_CALL, kCut: K_CUT, stormZone: STORM_ZONE, nCells: N_CELLS, regimes: REGIMES },
    results,
  }, null, 2));
  console.log(`\nraw results -> ${dest}`);
}

// ---------------------------------------------------------------- bake
// Hero log: seed 3, STORMY, arms EARLY and PROBE. sat/call sampled 1-in-4.

function runBake() {
  const payload: Record<string, unknown> & { arms: unknown[] } = {
    generated: "boat.mts", seed: 3, regime: "STORMY", theta: THETA, boat: BOAT, arms: [],
  };
  for (const arm of ["EARLY", "PROBE"] as const) {
    const cfg = cfgOf(3, "STORMY", arm);
    const r1 = run(cfg, true), r2 = run(cfg, true);
    if (r1.logHash !== r2.logHash) throw new Error(`BAKE DETERMINISM FAIL ${arm}`);
    const w = r1.world!;
    let cs = 0, cc = 0;
    const evs: Ev[] = [{
      e: "world",
      settlements: w.pos.map(([x, y], i) => ({ i, x: r3(x), y: r3(y), pop: w.pop[i] })),
      coast: w.coast,
    }];
    for (const ev of r1.events!) {
      if (ev.e === "sat") { if (cs++ % 4 === 0) evs.push(ev); }
      else if (ev.e === "call") { if (cc++ % 4 === 0) evs.push(ev); }
      else evs.push(ev);
    }
    const { events: _e, world: _w, obsHash, logHash, ...metrics } = r1;
    payload.arms.push({ arm, metrics, logHash, obsHash, events: evs });
  }
  const dest = join(HERE, "..", "public", "boat-log.json");
  const json = JSON.stringify(payload);
  writeFileSync(dest, json);
  console.log(`hero log -> ${dest} (${(json.length / 1e6).toFixed(2)} MB; sat/call sampled 1-in-4, need every 4 ticks, storm every 2)`);
}

main();
