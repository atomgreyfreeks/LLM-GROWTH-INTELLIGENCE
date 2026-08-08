/**
 * THE MAP — deterministic kernel + pre-registered experiment runner.
 *
 * Binding spec: docs/trust/the-map/PREREG.md. The one knob: what a crew already
 * walking does with a new plan. Arms COMMIT / CHASE / TIPS / ORACLE / STATIC,
 * regimes lambda in {0.05, 0.15, 0.35}, M=20-tick map refresh, tau=5% tail-swap
 * gate, horizon 3, T=300, 8 seeds.
 *
 * Covenant rules hold: no Math.random / Date.now / new Date. All randomness from
 * makeRng(hashStr(...)). The shock schedule is PRE-DRAWN from the world seed in
 * its own stream before any policy exists; the runner asserts its hash is
 * byte-identical across all five arms. Every config runs twice; event-log hashes
 * must match or the runner throws.
 *
 * Run:   cd app && npx tsx scripts/mapworld.mts
 * Bake:  npx tsx scripts/mapworld.mts --bake   (seed 3, MED, CHASE+TIPS hero log)
 */

import { makeRng, hashStr } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- constants (prereg)

const S = 40; // sites
const CREWS = 6; // crews, all arms, same speed
const T = 300; // ticks
const M = 20; // map refresh period (ticks)
const HORIZON = 3; // sites per crew per assignment
const TAU = 0.05; // tail swap fires only if projected people-gain > 5%
const SPEED = 1 / 30; // units/tick — map crossing = 30 ticks
const DECAY = 0.995; // need decays 0.5%/tick naturally
const PATROL_EPS = 1e-9; // zero-need fallback score term — crews never idle
const KM_PER_UNIT = 10; // reporting scale: unit-square side = 10 km
const CREW_KMH = KM_PER_UNIT / 3; // 30 ticks x 6 min/tick = 3 h per crossing
// Free parameters the prereg leaves open, fixed here and disclosed:
const WINDOW_MIN = 25; // service window D ~ uniform integer [25, 55] ticks
const WINDOW_SPAN = 31;
const MAG_MIN = 0.2; // shock need intensity ~ uniform [0.2, 1.0)
const MAG_SPAN = 0.8;

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const REGIMES = [
  { name: "LOW", lambda: 0.05 },
  { name: "MED", lambda: 0.15 },
  { name: "HIGH", lambda: 0.35 },
] as const;
type Regime = (typeof REGIMES)[number];
type Arm = "COMMIT" | "CHASE" | "TIPS" | "ORACLE" | "STATIC";
const ARMS: Arm[] = ["COMMIT", "CHASE", "TIPS", "ORACLE", "STATIC"];

// ---------------------------------------------------------------- helpers

const fnv = (s: string): string => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const round = (x: number, d: number): number => {
  const p = 10 ** d;
  return Math.round(x * p) / p;
};
const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// ---------------------------------------------------------------- world

interface Shock {
  t: number;
  i: number;
  mag: number;
  window: number;
}
interface World {
  xs: number[];
  ys: number[];
  pop: number[];
  crew0: [number, number][];
  shocksByTick: Shock[][];
  totalShocks: number;
  schedHash: string;
}

function makeWorld(seed: number, lambda: number): World {
  const r = makeRng(hashStr(`map:world:${seed}`));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < S; i++) {
    xs.push(0.05 + 0.9 * r());
    ys.push(0.05 + 0.9 * r());
  }
  // heavy-tailed populations (lognormal), normalized to sum ~ 15,000
  const raw: number[] = [];
  for (let i = 0; i < S; i++) {
    const u = 1 - r();
    const v = r();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    raw.push(Math.exp(1.1 * g));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  const pop = raw.map((x) => Math.max(20, Math.round((15000 * x) / sum)));
  const crew0: [number, number][] = [];
  for (let c = 0; c < CREWS; c++) crew0.push([0.1 + 0.8 * r(), 0.1 + 0.8 * r()]);
  // shock schedule — its own stream, pre-drawn before any policy exists.
  // Bernoulli(lambda) arrival per tick (deterministic thinning of the rate).
  const rs = makeRng(hashStr(`map:shocks:${seed}:${lambda}`));
  const shocksByTick: Shock[][] = Array.from({ length: T }, () => []);
  let totalShocks = 0;
  for (let t = 0; t < T; t++) {
    if (rs() < lambda) {
      const i = Math.floor(rs() * S);
      const mag = MAG_MIN + MAG_SPAN * rs();
      const window = WINDOW_MIN + Math.floor(rs() * WINDOW_SPAN);
      shocksByTick[t].push({ t, i, mag, window });
      totalShocks++;
    }
  }
  const schedHash = fnv(JSON.stringify(shocksByTick));
  return { xs, ys, pop, crew0, shocksByTick, totalShocks, schedHash };
}

// ---------------------------------------------------------------- events

type Ev =
  | { e: "world"; sites: { i: number; x: number; y: number; pop: number }[] }
  | { e: "shock"; t: number; i: number; mag: number; window: number }
  | { e: "refresh"; t: number }
  | { e: "assign"; t: number; crew: number; route: number[] }
  | { e: "abandon"; t: number; crew: number; site: number; progressKm: number }
  | { e: "pos"; t: number; crews: [number, number][] }
  | { e: "arrive"; t: number; crew: number; i: number; served: number; pop: number; inWindow: boolean }
  | { e: "miss"; t: number; i: number; pop: number }
  | {
      e: "end";
      t: number;
      served: number;
      missed: number;
      churn: number;
      dist: number;
      assigned: number;
      completed: number;
      abandoned: number;
      swaps: number;
    };

// ---------------------------------------------------------------- run

interface RunOut {
  arm: Arm;
  regime: string;
  lambda: number;
  seed: number;
  served: number;
  missed: number;
  servedShocks: number;
  missedShocks: number;
  totalShocks: number;
  churnUnits: number;
  churnKm: number;
  churnHours: number;
  survival: number;
  assigned: number;
  completed: number;
  abandoned: number;
  medTTS: number;
  distUnits: number;
  distKm: number;
  swapsFired: number;
  extFired: number;
  swapOpps: number;
  logHash: string;
  schedHash: string;
  events: Ev[];
}

function run(arm: Arm, seed: number, reg: Regime, keepEvents = false): RunOut {
  const w = makeWorld(seed, reg.lambda);
  const { xs, ys, pop } = w;
  const events: Ev[] = [];
  const push = (ev: Ev) => events.push(ev);
  if (keepEvents)
    push({ e: "world", sites: xs.map((x, i) => ({ i, x: round(x, 4), y: round(ys[i], 4), pop: pop[i] })) });

  // live shocks: cur decays each tick; removed on serve or window expiry
  const active: { t: number; i: number; window: number; cur: number }[] = [];
  const mapNeed = new Array<number>(S).fill(0); // the dispatcher's stale snapshot
  const crews = w.crew0.map(([x, y]) => ({ x, y, route: [] as number[], lsx: x, lsy: y }));

  let served = 0;
  let missed = 0;
  let servedShocks = 0;
  let missedShocks = 0;
  let churn = 0; // units of abandoned progress
  let dist = 0; // total units walked
  let assigned = 0;
  let completed = 0;
  let abandoned = 0;
  let swapsFired = 0; // TIPS: accepted tail changes that DROP a previously assigned leg
  let extFired = 0; // TIPS: accepted pure extensions (old tail kept as prefix)
  let swapOpps = 0; // TIPS: refresh x crew with a non-empty tail
  const tts: number[] = [];

  const trueNeed = (): number[] => {
    const n = new Array<number>(S).fill(0);
    for (const a of active) n[a.i] += a.cur;
    return n;
  };

  // Greedy scorer (prereg): score = need*pop / distance. PATROL_EPS keeps a
  // pop/distance patrol ordering alive when the map shows zero need, so crews
  // never idle — identical in every arm.
  const score = (cx: number, cy: number, i: number, need: number[]): number => {
    const d = Math.hypot(xs[i] - cx, ys[i] - cy);
    if (d < 1e-6) return -1;
    return ((need[i] + PATROL_EPS) * pop[i]) / Math.max(d, 1e-3);
  };

  // Per-crew greedy route (used for mid-run refills and TIPS tails).
  const buildRoute = (cx: number, cy: number, n: number, claimed: Set<number>, need: number[]): number[] => {
    const out: number[] = [];
    for (let l = 0; l < n; l++) {
      let best = -1;
      let bs = 0;
      for (let i = 0; i < S; i++) {
        if (claimed.has(i)) continue;
        const sc = score(cx, cy, i, need);
        if (sc > bs) {
          bs = sc;
          best = i;
        }
      }
      if (best < 0) break;
      claimed.add(best);
      out.push(best);
      cx = xs[best];
      cy = ys[best];
    }
    return out;
  };

  // The assignment procedure, identical in every arm (prereg): greedy global-
  // best-first over (crew, site) pairs, horizon 3 legs per crew, each site
  // claimed at most once per round. Order-free: the closest/best pairing wins
  // regardless of crew index.
  const fullAssign = (need: number[]): number[][] => {
    const claimed = new Set<number>();
    const routes: number[][] = crews.map(() => []);
    const ex = crews.map((c) => c.x);
    const ey = crews.map((c) => c.y);
    for (;;) {
      let bc = -1;
      let bi = -1;
      let bs = 0;
      for (let c = 0; c < CREWS; c++) {
        if (routes[c].length >= HORIZON) continue;
        for (let i = 0; i < S; i++) {
          if (claimed.has(i)) continue;
          const sc = score(ex[c], ey[c], i, need);
          if (sc > bs) {
            bs = sc;
            bc = c;
            bi = i;
          }
        }
      }
      if (bc < 0) break;
      claimed.add(bi);
      routes[bc].push(bi);
      ex[bc] = xs[bi];
      ey[bc] = ys[bi];
    }
    return routes;
  };

  // Replace a crew's route, accounting for carried legs, abandonment and churn.
  // Churn (prereg): distance already walked toward an abandoned target at the
  // moment of abandonment. Only the current leg has walked progress.
  const applyRoute = (c: number, N: number[], t: number): void => {
    const cr = crews[c];
    const O = cr.route;
    let k = 0;
    while (k < O.length && k < N.length && O[k] === N[k]) k++;
    if (k === O.length && N.length === O.length) return; // unchanged: no event, no churn
    abandoned += O.length - k;
    if (k === 0 && O.length > 0) {
      const tgt = O[0];
      const prog = Math.max(
        0,
        Math.hypot(xs[tgt] - cr.lsx, ys[tgt] - cr.lsy) - Math.hypot(xs[tgt] - cr.x, ys[tgt] - cr.y),
      );
      churn += prog;
      push({ e: "abandon", t, crew: c, site: tgt, progressKm: round(prog * KM_PER_UNIT, 2) });
    }
    assigned += N.length - k;
    cr.route = [...N];
    if (k === 0) {
      cr.lsx = cr.x;
      cr.lsy = cr.y;
    }
    push({ e: "assign", t, crew: c, route: [...N] });
  };

  const arrive = (c: number, t: number): void => {
    const cr = crews[c];
    const site = cr.route[0];
    let sHere = 0;
    let n = 0;
    for (let j = active.length - 1; j >= 0; j--) {
      const a = active[j];
      if (a.i === site && t <= a.t + a.window) {
        sHere += a.cur * pop[site];
        n++;
        tts.push(t - a.t);
        active.splice(j, 1);
      }
    }
    served += sHere;
    servedShocks += n;
    mapNeed[site] = 0; // own-crew arrival report: the dispatcher zeroes a visited site
    completed++;
    cr.route.shift();
    push({ e: "arrive", t, crew: c, i: site, served: round(sHere, 1), pop: pop[site], inWindow: n > 0 });
  };

  const refill = (c: number, t: number): void => {
    if (arm === "STATIC") return; // STATIC never replans; crews stop when done
    const cr = crews[c];
    const claimed = new Set<number>();
    for (let o = 0; o < CREWS; o++) if (o !== c) for (const s of crews[o].route) claimed.add(s);
    const need = arm === "ORACLE" ? trueNeed() : mapNeed;
    applyRoute(c, buildRoute(cr.x, cr.y, HORIZON, claimed, need), t);
  };

  for (let t = 0; t < T; t++) {
    // 1. shocks land (pre-drawn schedule; the world moves whether or not anyone looks)
    for (const s of w.shocksByTick[t]) {
      active.push({ t: s.t, i: s.i, window: s.window, cur: s.mag });
      push({ e: "shock", t, i: s.i, mag: round(s.mag, 3), window: s.window });
    }

    // 2. map refresh + acceptance policy (THE ONE KNOB)
    const isRefresh = arm === "ORACLE" ? true : arm === "STATIC" ? t === 0 : t % M === 0;
    if (isRefresh) {
      const tn = trueNeed();
      for (let i = 0; i < S; i++) mapNeed[i] = tn[i];
      push({ e: "refresh", t });

      if (t === 0 || arm === "CHASE" || arm === "ORACLE") {
        // t=0: every arm takes the same initial assignment.
        // CHASE/ORACLE: full reassignment; current legs abandoned if retargeted.
        const routes = fullAssign(mapNeed);
        for (let c = 0; c < CREWS; c++) applyRoute(c, routes[c], t);
      } else if (arm === "TIPS") {
        // trunk (current target) locked; tail + unassigned sites re-optimized;
        // swap fires only if projected people-gain exceeds tau.
        const inRoutes = new Set<number>();
        for (const cr of crews) for (const s of cr.route) inRoutes.add(s);
        for (let c = 0; c < CREWS; c++) {
          const cr = crews[c];
          if (!cr.route.length) {
            // unreachable with instant refills; kept for safety
            const claimed = new Set(inRoutes);
            const N = buildRoute(cr.x, cr.y, HORIZON, claimed, mapNeed);
            for (const s of N) inRoutes.add(s);
            applyRoute(c, N, t);
            continue;
          }
          const trunk = cr.route[0];
          const oldTail = cr.route.slice(1);
          const claimed = new Set(inRoutes);
          for (const s of oldTail) claimed.delete(s); // own tail is re-optimizable
          const newTail = buildRoute(xs[trunk], ys[trunk], HORIZON - 1, claimed, mapNeed);
          const proj = (tail: number[]): number => tail.reduce((a, s) => a + mapNeed[s] * pop[s], 0);
          const changed = !(newTail.length === oldTail.length && newTail.every((s, j) => s === oldTail[j]));
          if (oldTail.length > 0) swapOpps++;
          if (changed && proj(newTail) > proj(oldTail) * (1 + TAU)) {
            const isExt = oldTail.every((s, j) => newTail[j] === s);
            if (oldTail.length > 0) {
              if (isExt) extFired++;
              else swapsFired++;
            }
            for (const s of oldTail) inRoutes.delete(s);
            for (const s of newTail) inRoutes.add(s);
            applyRoute(c, [trunk, ...newTail], t);
          }
        }
      }
      // COMMIT: the refresh only updates the snapshot. Crews accept new plans
      // exclusively with empty hands — which happens at route completion (refill).
    }

    // 3. movement — every crew walks exactly SPEED per tick while it has a route.
    for (let c = 0; c < CREWS; c++) {
      const cr = crews[c];
      let budget = SPEED;
      while (budget > 1e-12 && cr.route.length) {
        const tgt = cr.route[0];
        const d = Math.hypot(xs[tgt] - cr.x, ys[tgt] - cr.y);
        if (d <= budget) {
          cr.x = xs[tgt];
          cr.y = ys[tgt];
          budget -= d;
          dist += d;
          arrive(c, t);
          if (!cr.route.length) refill(c, t);
          cr.lsx = cr.x; // next leg (if any) starts here
          cr.lsy = cr.y;
        } else {
          cr.x += ((xs[tgt] - cr.x) / d) * budget;
          cr.y += ((ys[tgt] - cr.y) / d) * budget;
          dist += budget;
          budget = 0;
        }
      }
    }
    if (keepEvents && t % 2 === 0)
      push({ e: "pos", t, crews: crews.map((cr) => [round(cr.x, 4), round(cr.y, 4)] as [number, number]) });

    // 4. window expiry — people at a shocked site missed permanently
    for (let j = active.length - 1; j >= 0; j--) {
      const a = active[j];
      if (t >= a.t + a.window) {
        const m = a.cur * pop[a.i];
        missed += m;
        missedShocks++;
        push({ e: "miss", t, i: a.i, pop: round(m, 1) });
        active.splice(j, 1);
      }
    }

    // 5. natural decay
    for (const a of active) a.cur *= DECAY;
  }

  const survival = completed + abandoned > 0 ? completed / (completed + abandoned) : 1;
  const medTTS = tts.length ? med(tts) : -1;
  push({
    e: "end",
    t: T,
    served: round(served, 2),
    missed: round(missed, 2),
    churn: round(churn, 4),
    dist: round(dist, 4),
    assigned,
    completed,
    abandoned,
    swaps: swapsFired,
  });

  return {
    arm,
    regime: reg.name,
    lambda: reg.lambda,
    seed,
    served: round(served, 2),
    missed: round(missed, 2),
    servedShocks,
    missedShocks,
    totalShocks: w.totalShocks,
    churnUnits: round(churn, 4),
    churnKm: round(churn * KM_PER_UNIT, 2),
    churnHours: round((churn * KM_PER_UNIT) / CREW_KMH, 2),
    survival: round(survival, 4),
    assigned,
    completed,
    abandoned,
    medTTS,
    distUnits: round(dist, 4),
    distKm: round(dist * KM_PER_UNIT, 2),
    swapsFired,
    extFired,
    swapOpps,
    logHash: fnv(JSON.stringify(events)),
    schedHash: w.schedHash,
    events,
  };
}

// ---------------------------------------------------------------- harness

function sweep(): RunOut[] {
  const results: RunOut[] = [];
  for (const reg of REGIMES)
    for (const arm of ARMS)
      for (const seed of SEEDS) {
        const r1 = run(arm, seed, reg);
        const r2 = run(arm, seed, reg);
        if (r1.logHash !== r2.logHash) throw new Error(`DETERMINISM FAIL ${arm} ${reg.name} seed ${seed}`);
        results.push(r1);
      }
  // shock schedule identical across arms (pre-drawn from the world seed)
  for (const reg of REGIMES)
    for (const seed of SEEDS) {
      const hs = new Set(
        results.filter((r) => r.regime === reg.name && r.seed === seed).map((r) => r.schedHash),
      );
      if (hs.size !== 1) throw new Error(`SCHEDULE HASH MISMATCH ${reg.name} seed ${seed}`);
    }
  console.log("determinism: every config run twice, event-log hashes byte-identical ✓");
  console.log("shock schedule: pre-drawn from world seed, hash identical across all 5 arms ✓");
  // matching: same crews, same speed; total distance within 5% across non-STATIC arms
  let worst = 0;
  for (const reg of REGIMES)
    for (const seed of SEEDS) {
      const ds = results
        .filter((r) => r.regime === reg.name && r.seed === seed && r.arm !== "STATIC")
        .map((r) => r.distUnits);
      const spread = Math.max(...ds) / Math.min(...ds) - 1;
      if (spread > worst) worst = spread;
      if (spread > 0.05)
        throw new Error(`MATCHING FAIL ${reg.name} seed ${seed}: dist spread ${(spread * 100).toFixed(2)}%`);
    }
  console.log(
    `matching: ${CREWS} crews, speed ${SPEED.toFixed(4)} u/tick everywhere; ` +
      `non-STATIC total-distance spread max ${(worst * 100).toFixed(3)}% (limit 5%) ✓`,
  );
  return results;
}

const get = (rs: RunOut[], arm: Arm, regime: string): RunOut[] =>
  rs.filter((r) => r.arm === arm && r.regime === regime);
const medOf = (rs: RunOut[], arm: Arm, regime: string, key: keyof RunOut): number =>
  med(get(rs, arm, regime).map((r) => r[key] as number));

function tables(results: RunOut[]): void {
  const f = (x: number, d = 0) => x.toFixed(d);
  for (const reg of REGIMES) {
    const nShocks = med(get(results, "COMMIT", reg.name).map((r) => r.totalShocks));
    console.log(
      `\n== ${reg.name} (lambda=${reg.lambda}, median ${f(nShocks)} shocks/run) — median [min..max] across ${SEEDS.length} seeds`,
    );
    console.log(
      "arm".padEnd(8) +
        "served".padStart(22) +
        "missed".padStart(12) +
        "churn-km".padStart(20) +
        "churn-h".padStart(9) +
        "survival".padStart(10) +
        "medTTS".padStart(8) +
        "dist-km".padStart(9),
    );
    for (const arm of ARMS) {
      const rs = get(results, arm, reg.name);
      const served = rs.map((r) => r.served);
      const churn = rs.map((r) => r.churnKm);
      console.log(
        arm.padEnd(8) +
          `${f(med(served))} [${f(Math.min(...served))}..${f(Math.max(...served))}]`.padStart(22) +
          f(medOf(results, arm, reg.name, "missed")).padStart(12) +
          `${f(med(churn), 1)} [${f(Math.min(...churn), 1)}..${f(Math.max(...churn), 1)}]`.padStart(20) +
          f(medOf(results, arm, reg.name, "churnHours"), 1).padStart(9) +
          medOf(results, arm, reg.name, "survival").toFixed(3).padStart(10) +
          f(medOf(results, arm, reg.name, "medTTS"), 1).padStart(8) +
          f(medOf(results, arm, reg.name, "distKm")).padStart(9),
      );
    }
  }
}

function scorecard(results: RunOut[]): void {
  const sv = (arm: Arm, reg: string) => medOf(results, arm, reg, "served");
  const ch = (arm: Arm, reg: string) => medOf(results, arm, reg, "churnKm");

  console.log("\n==================== PREDICTION SCORECARD ====================");

  // ---- P1: the crossover exists
  const diffs = REGIMES.map((r) => ({ reg: r.name, chaseMinusCommit: sv("CHASE", r.name) - sv("COMMIT", r.name) }));
  for (const d of diffs)
    console.log(
      `P1 data ${d.reg.padEnd(4)}: CHASE ${sv("CHASE", d.reg).toFixed(0)} vs COMMIT ${sv("COMMIT", d.reg).toFixed(0)}  (CHASE-COMMIT = ${d.chaseMinusCommit >= 0 ? "+" : ""}${d.chaseMinusCommit.toFixed(0)})`,
    );
  const p1low = sv("COMMIT", "LOW") >= sv("CHASE", "LOW");
  const p1high = sv("CHASE", "HIGH") >= sv("COMMIT", "HIGH");
  const p1 = p1low && p1high;
  const falsifierP1 = REGIMES.every((r) => sv("CHASE", r.name) >= sv("COMMIT", r.name));
  const commitWins = diffs.filter((d) => d.chaseMinusCommit < 0).map((d) => d.reg);
  const chaseWins = diffs.filter((d) => d.chaseMinusCommit > 0).map((d) => d.reg);
  console.log(
    `P1 (crossover): LOW COMMIT>=CHASE ${p1low ? "yes" : "NO"}; HIGH CHASE>=COMMIT ${p1high ? "yes" : "NO"} -> ${p1 ? "PASS" : "REFUTED"}`,
  );
  if (falsifierP1)
    console.log("P1 FALSIFIER FIRED: CHASE >= COMMIT at all three lambda — churn is free here; the central claim dies.");
  console.log(
    `P1 crossover location: COMMIT ahead in [${commitWins.join(", ") || "none"}]; CHASE ahead in [${chaseWins.join(", ") || "none"}]`,
  );

  // ---- P2: the vascular law
  const gainRegs = REGIMES.filter((r) => sv("CHASE", r.name) > sv("COMMIT", r.name)).map((r) => r.name);
  let p2 = true;
  const p2lines: string[] = [];
  for (const reg of gainRegs) {
    const gain = sv("CHASE", reg) - sv("COMMIT", reg);
    const cap = (sv("TIPS", reg) - sv("COMMIT", reg)) / gain;
    const cr = ch("CHASE", reg) > 0 ? ch("TIPS", reg) / ch("CHASE", reg) : 0;
    const saving = ch("TIPS", reg) > 0 ? ch("CHASE", reg) / ch("TIPS", reg) : Infinity;
    const ok = cap >= 0.7 && cr <= 0.3;
    if (!ok) p2 = false;
    if (saving < 2) p2 = false;
    p2lines.push(
      `P2 ${reg.padEnd(4)}: gain-capture ${(cap * 100).toFixed(0)}% (need >=70%), churn ratio ${(cr * 100).toFixed(1)}% of CHASE (need <=30%), churn saving ${saving === Infinity ? "inf" : saving.toFixed(1)}x (need >=2x) -> ${ok && saving >= 2 ? "ok" : "FAIL"}`,
    );
  }
  if (!gainRegs.length) p2lines.push("P2: no regime where CHASE beats COMMIT — capture clause vacuous");
  const worstAnywhere = REGIMES.some((r) => ARMS.every((a) => a === "TIPS" || sv("TIPS", r.name) < sv(a, r.name)));
  const belowBoth = REGIMES.filter(
    (r) => sv("TIPS", r.name) < sv("COMMIT", r.name) && sv("TIPS", r.name) < sv("CHASE", r.name),
  ).map((r) => r.name);
  if (worstAnywhere || belowBoth.length) p2 = false;
  for (const l of p2lines) console.log(l);
  console.log(
    `P2 TIPS worst arm anywhere: ${worstAnywhere ? "YES" : "no"}; below both endpoints in: [${belowBoth.join(", ") || "none"}]`,
  );
  console.log(`P2 (vascular law): ${p2 ? "PASS" : "REFUTED"}`);

  // ---- P3: stability predicts outcome at low volatility only
  const nonOracle: Arm[] = ["COMMIT", "CHASE", "TIPS", "STATIC"];
  const holds = (reg: string): { holds: boolean; leaders: Arm[]; top: Arm[] } => {
    const surv = nonOracle.map((a) => medOf(results, a, reg, "survival"));
    const smax = Math.max(...surv);
    const leaders = nonOracle.filter((_, j) => surv[j] >= smax - 1e-9);
    const svs = nonOracle.map((a) => sv(a, reg));
    const vmax = Math.max(...svs);
    const top = nonOracle.filter((_, j) => svs[j] >= vmax - 1e-9);
    return { holds: leaders.some((a) => top.includes(a)), leaders, top };
  };
  const hLow = holds("LOW");
  const hHigh = holds("HIGH");
  console.log(
    `P3 data LOW : max-survival ${hLow.leaders.join("/")}, top-served ${hLow.top.join("/")} -> stability predicts outcome: ${hLow.holds ? "yes" : "no"}`,
  );
  console.log(
    `P3 data HIGH: max-survival ${hHigh.leaders.join("/")}, top-served ${hHigh.top.join("/")} -> stability predicts outcome: ${hHigh.holds ? "yes" : "no"}`,
  );
  const p3 = hLow.holds && !hHigh.holds;
  console.log(`P3 (stability a proxy only at LOW): ${p3 ? "PASS" : "REFUTED"}`);

  // ---- P4 (exploratory): the ceiling's own churn
  for (const r of REGIMES)
    console.log(
      `P4 ${r.name.padEnd(4)}: ORACLE churn ${ch("ORACLE", r.name).toFixed(1)} km vs CHASE churn ${ch("CHASE", r.name).toFixed(1)} km (ORACLE served ${sv("ORACLE", r.name).toFixed(0)})`,
    );
  const oHigh = ch("ORACLE", "HIGH");
  const cHigh = ch("CHASE", "HIGH");
  console.log(
    `P4 (exploratory) REPORTED: at HIGH the ceiling churns ${oHigh.toFixed(1)} km (${cHigh > 0 ? ((oHigh / cHigh) * 100).toFixed(0) : "n/a"}% of CHASE). ` +
      (oHigh >= 0.5 * cHigh
        ? "The ceiling itself churns hard: fresh information justifies churn — the cost was never the replanning itself."
        : "The ceiling churns little: churn tracks stale information, not replanning per se."),
  );

  // ---- inert counter (TIPS tail swaps at MED)
  const tipsMed = get(results, "TIPS", "MED");
  const fired = tipsMed.reduce((a, r) => a + r.swapsFired, 0);
  const ext = tipsMed.reduce((a, r) => a + r.extFired, 0);
  const opps = tipsMed.reduce((a, r) => a + r.swapOpps, 0);
  const rate = opps > 0 ? fired / opps : 0;
  console.log(
    `\ninert counter: TIPS at MED — tail swaps fired ${fired} / ${opps} refresh opportunities = ${(rate * 100).toFixed(1)}% (pure extensions, counted separately: ${ext})`,
  );
  if (rate < 0.05) console.log("INERT: tail swaps fire on <5% of refresh opportunities at MED — TIPS as configured is inert and the claim narrows.");
  console.log("==============================================================");
}

// ---------------------------------------------------------------- bake

function doBake(): void {
  const reg = REGIMES[1]; // MED
  const seed = 3;
  const arms: { name: Arm; metrics: Record<string, number>; logHash: string; events: Ev[] }[] = [];
  for (const arm of ["CHASE", "TIPS"] as Arm[]) {
    const r1 = run(arm, seed, reg, true);
    const r2 = run(arm, seed, reg, true);
    if (r1.logHash !== r2.logHash) throw new Error(`BAKE DETERMINISM FAIL ${arm}`);
    arms.push({
      name: arm,
      metrics: {
        served: r1.served,
        missed: r1.missed,
        servedShocks: r1.servedShocks,
        missedShocks: r1.missedShocks,
        totalShocks: r1.totalShocks,
        churnKm: r1.churnKm,
        churnHours: r1.churnHours,
        survival: r1.survival,
        medTTS: r1.medTTS,
        distKm: r1.distKm,
        swapsFired: r1.swapsFired,
        swapOpps: r1.swapOpps,
      },
      logHash: r1.logHash,
      events: r1.events,
    });
  }
  if (arms[0].logHash === arms[1].logHash) throw new Error("bake: arms identical");
  const payload = {
    generated: "mapworld.mts",
    prereg: "docs/trust/the-map/PREREG.md",
    seed,
    regime: reg.name,
    lambda: reg.lambda,
    M,
    tau: TAU,
    horizon: HORIZON,
    T,
    crews: CREWS,
    kmPerUnit: KM_PER_UNIT,
    arms,
  };
  const s = JSON.stringify(payload);
  const dest = join(HERE, "..", "public", "mapworld-log.json");
  writeFileSync(dest, s);
  console.log(`hero log -> ${dest} (${(s.length / 1e6).toFixed(2)} MB)`);
  for (const a of arms) console.log(`  ${a.name}: ${JSON.stringify(a.metrics)} logHash=${a.logHash}`);
}

// ---------------------------------------------------------------- main

function main(): void {
  if (process.argv.includes("--bake")) {
    doBake();
    return;
  }
  const t0 = process.hrtime.bigint(); // harness wall-clock only; never simulation state
  const results = sweep();
  tables(results);
  scorecard(results);

  const raw = {
    generated: "mapworld.mts",
    prereg: "docs/trust/the-map/PREREG.md",
    config: {
      S,
      CREWS,
      T,
      M,
      HORIZON,
      TAU,
      SPEED,
      DECAY,
      KM_PER_UNIT,
      windowTicks: [WINDOW_MIN, WINDOW_MIN + WINDOW_SPAN - 1],
      magRange: [MAG_MIN, MAG_MIN + MAG_SPAN],
      seeds: SEEDS,
      regimes: REGIMES.map((r) => ({ name: r.name, lambda: r.lambda })),
      arms: ARMS,
    },
    results: results.map(({ events, ...rest }) => rest),
  };
  const dest = join(HERE, "..", "..", "docs", "trust", "the-map", "raw-results.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(raw, null, 2));
  console.log(`\nraw results -> ${dest}`);
  console.log(`runtime ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)}s`);
}

main();
