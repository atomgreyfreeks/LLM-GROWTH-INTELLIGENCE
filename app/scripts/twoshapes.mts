/**
 * TWO SHAPES — deterministic kernel + experiment runner.
 *
 * Every fleet has two shapes: an H-shape (movement across land) and a V-shape
 * (how its data climbs the slabs). This kernel runs the pre-registered series in
 * docs/two-shapes/EXPERIMENTS.md: E1 frozen-trace V-sweep, E2 H lock-in vs
 * exploration floor, E3 loop-compounding 2x2 (interaction term Q), E4 rescues.
 *
 * Covenant rules hold: no Math.random / Date.now; same seed + config =>
 * byte-identical event log (probed on every arm); replay reads the log.
 *
 * Run:   cd app && npx tsx scripts/twoshapes.mts
 * Bake:  npx tsx scripts/twoshapes.mts --bake <exp:arm> --seed 3   (hero log JSON)
 */

import { makeRng, hashStr, type Rng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- config

type HShape = "physarum" | "uniform" | "oracle";
type VShape = "physarum" | "vascular" | "mycelium" | "transparent";

interface Cfg {
  worldSeed: number;
  S: number;            // settlements
  T: number;            // ticks
  K: number;            // visits per tick
  capSensed: number;    // standing register capacities (settlement-slots)
  capFeatures: number;
  capBriefing: number;
  capDecision: number;
  actionSlots: number;  // help actions per tick (from decision register)
  helpAmount: number;
  H: HShape;
  eps: number;          // exploration floor, fraction of K (H=physarum only)
  V: VShape;
  vFeedback: boolean;   // channel reinforcement on/off (V=physarum only)
  coupling: boolean;    // ON: fleet steers by briefing register. OFF: own memory.
  rescueRho: number;    // fraction of K reserved for re-checks
  rescueMode: "stale" | "random" | "none";
  rescueAnswered: boolean; // true root-down: the query's answer lands in the briefing register directly
  oracleAct: boolean;   // true ceiling: actions target true need directly (bypass registers)
}

const BASE: Omit<Cfg, "worldSeed" | "H" | "eps" | "V" | "vFeedback" | "coupling" | "rescueRho" | "rescueMode"> = {
  S: 64, T: 400, K: 8,
  capSensed: 48, capFeatures: 32, capBriefing: 16, capDecision: 8,
  actionSlots: 4, helpAmount: 2.0,
};

const AGE_DECAY = 0.99;   // per-tick discount institutions apply to old reports
const NAT_RESOLVE = 0.995; // need resolves slightly on its own
const DRIFT = 0.003;      // need creeps up everywhere, always
const H_DECAY = 0.05;     // physarum-H weight decay
const V_DECAY = 0.02;     // physarum-V channel decay
const V_GAIN = 0.3;       // channel reinforcement on decision-layer use
const U_FLOOR = 1e-4;

// ---------------------------------------------------------------- world

interface World {
  pos: [number, number][];
  pop: number[];
  district: number[];          // 8 geographic clusters
  shocks: { t: number; i: number; mag: number }[][]; // indexed by tick
  need0: number[];
}

function makeWorld(cfg: Cfg): World {
  const r = makeRng(hashStr(`world:${cfg.worldSeed}`));
  const centers: [number, number][] = [];
  for (let c = 0; c < 8; c++) centers.push([0.1 + 0.8 * r(), 0.1 + 0.8 * r()]);
  const pos: [number, number][] = [];
  const district: number[] = [];
  for (let i = 0; i < cfg.S; i++) {
    const c = i % 8;
    district.push(c);
    const g = () => {
      const u = 1 - r(), v = r();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    pos.push([centers[c][0] + 0.05 * g(), centers[c][1] + 0.05 * g()]);
  }
  const pop = Array.from({ length: cfg.S }, () => Math.round(Math.exp(5 + 1.2 * (r() * 2 - 1) * 1.5)) + 40);
  // frozen regime generator — its own stream, drawn before any policy exists
  const rr = makeRng(hashStr(`regime:${cfg.worldSeed}`));
  const shocks: World["shocks"] = Array.from({ length: cfg.T }, () => []);
  for (let t = 0; t < cfg.T; t++)
    for (let i = 0; i < cfg.S; i++)
      if (rr() < 0.004) shocks[t].push({ t, i, mag: 2 + 6 * rr() });
  const need0 = Array.from({ length: cfg.S }, () => 0.2 + 0.6 * rr());
  return { pos, pop, district, shocks, need0 };
}

// ---------------------------------------------------------------- events

type Ev =
  | { e: "visit"; t: number; i: number; need: number; kind: "policy" | "explore" | "rescue" }
  | { e: "shock"; t: number; i: number; mag: number }
  | { e: "burn"; t: number; slab: number; i: number }          // burned out at boundary slab->slab+1
  | { e: "top"; t: number; is: number[] }                       // briefing register contents
  | { e: "act"; t: number; i: number; amt: number };

const fnv = (s: string): string => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
};

// ---------------------------------------------------------------- run

interface Entry { i: number; need: number; tick: number; members?: number[] }

interface RunOut {
  logHash: string;
  visitHash: string;
  events: Ev[];
  unmetNeed: number;            // Σ need·pop·dt, scaled to people-need-kiloticks
  extinctPop: number;           // population never in briefing register, final quarter
  reprSettlements: number;      // settlements in briefing register at least once, final quarter
  reprPop: number;
  giniDecision: number;
  meanDiscovery: number;        // mean ticks from shock to next visit (capped 100)
  neverFound: number;           // shocks not visited within 100 ticks (fraction)
  worstStaleTop: number;
  fires: { explore: number; rescue: number; fusion: number; burn: number };
}

function run(cfg: Cfg, keepEvents = false): RunOut {
  const w = makeWorld(cfg);
  const rPolicy = makeRng(hashStr(`policy:${cfg.worldSeed}`));
  const need = [...w.need0];
  const events: Ev[] = [];
  const push = (ev: Ev) => { if (keepEvents || ev.e !== "top") events.push(ev); else events.push(ev); };

  // fleet state — tiny seeded jitter so eps=0 lock-in targets vary by seed
  // instead of always freezing onto settlements 0..K-1 via the index tie-break
  const rInit = makeRng(hashStr(`init:${cfg.worldSeed}`));
  const wH = Array.from({ length: cfg.S }, () => 0.5 + 0.001 * rInit());
  const ownMem = new Array(cfg.S).fill(0);        // fleet's own last-observed need
  const ownMemTick = new Array(cfg.S).fill(-1);
  // V state
  const u = new Array(cfg.S).fill(1.0);           // channel strength
  const lastSeenTop = new Array(cfg.S).fill(-1);
  // registers: settlement -> Entry
  let regSensed: Entry[] = [];
  let regFeatures: Entry[] = [];
  let regBriefing: Entry[] = [];
  let regDecision: Entry[] = [];
  const pendingHelp = new Array(cfg.S).fill(0);

  const decisionCount = new Array(cfg.S).fill(0);
  const shockSeen: { shockT: number; i: number; found: number }[] = [];
  let unmet = 0;
  const inBriefFinal = new Set<number>();
  const fires = { explore: 0, rescue: 0, fusion: 0, burn: 0 };
  const visitTrace: number[] = [];

  const aged = (en: Entry, t: number) => en.need * Math.pow(AGE_DECAY, t - en.tick);

  for (let t = 0; t < cfg.T; t++) {
    // ---- world moves whether or not anyone looks
    for (const s of w.shocks[t]) { need[s.i] += s.mag; push({ e: "shock", t, i: s.i, mag: s.mag }); shockSeen.push({ shockT: t, i: s.i, found: -1 }); }
    for (let i = 0; i < cfg.S; i++) {
      need[i] = Math.max(0, (need[i] + DRIFT - pendingHelp[i]) * NAT_RESOLVE);
      pendingHelp[i] = 0;
    }

    // ---- believed-need map M (the coupling switch)
    const M = new Array(cfg.S).fill(0);
    if (cfg.coupling) {
      for (const en of regBriefing) for (const m of en.members ?? [en.i]) M[m] = Math.max(M[m], aged(en, t));
    } else {
      for (let i = 0; i < cfg.S; i++) if (ownMemTick[i] >= 0) M[i] = ownMem[i] * Math.pow(AGE_DECAY, t - ownMemTick[i]);
    }

    // ---- choose visits (H-shape + rescue reserve), exactly K, no repeats
    const chosen = new Set<number>();
    const visits: { i: number; kind: "policy" | "explore" | "rescue" }[] = [];
    const nRescue = Math.floor(cfg.rescueRho * cfg.K);
    if (cfg.rescueMode !== "none" && nRescue > 0) {
      if (cfg.rescueMode === "stale") {
        const order = Array.from({ length: cfg.S }, (_, i) => i)
          .sort((a, b) => (lastSeenTop[a] - lastSeenTop[b]) || (a - b));
        for (const i of order) { if (visits.length >= nRescue) break; if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "rescue" }); } }
      } else {
        while (visits.length < nRescue) { const i = Math.floor(rPolicy() * cfg.S); if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "rescue" }); } }
      }
      fires.rescue += visits.length;
    }
    // fractional exploration via probabilistic rounding (deterministic given seed);
    // floor() alone silently zeroes any eps below 1/K
    const eK = cfg.eps * cfg.K;
    const nExplore = cfg.H === "physarum" ? Math.floor(eK) + (rPolicy() < eK - Math.floor(eK) ? 1 : 0) : 0;
    const nPolicy = cfg.K - visits.length - nExplore;
    if (cfg.H === "physarum") {
      for (let i = 0; i < cfg.S; i++) wH[i] = (1 - H_DECAY) * wH[i] + M[i];
      const order = Array.from({ length: cfg.S }, (_, i) => i).sort((a, b) => (wH[b] - wH[a]) || (a - b));
      for (const i of order) { if (visits.filter(v => v.kind === "policy").length >= nPolicy) break; if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "policy" }); } }
      let guard = 0;
      while (visits.length < cfg.K && guard++ < 10000) { const i = Math.floor(rPolicy() * cfg.S); if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "explore" }); fires.explore++; } }
    } else if (cfg.H === "uniform") {
      let j = 0;
      while (visits.length < cfg.K) { const i = (t * cfg.K + j++) % cfg.S; if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "policy" }); } }
    } else { // oracle
      const order = Array.from({ length: cfg.S }, (_, i) => i).sort((a, b) => (need[b] - need[a]) || (a - b));
      for (const i of order) { if (visits.length >= cfg.K) break; if (!chosen.has(i)) { chosen.add(i); visits.push({ i, kind: "policy" }); } }
    }

    // ---- sense
    for (const v of visits) {
      const obs = need[v.i];
      push({ e: "visit", t, i: v.i, need: Math.round(obs * 1000) / 1000, kind: v.kind });
      visitTrace.push(v.i);
      ownMem[v.i] = obs; ownMemTick[v.i] = t;
      const ex = regSensed.findIndex(en => en.i === v.i);
      const en: Entry = { i: v.i, need: obs, tick: t };
      if (ex >= 0) regSensed[ex] = en; else regSensed.push(en);
      for (const sh of shockSeen) if (sh.i === v.i && sh.found < 0 && t >= sh.shockT) sh.found = t;
    }
    if (regSensed.length > cfg.capSensed)
      regSensed = [...regSensed].sort((a, b) => (aged(b, t) - aged(a, t)) || (a.i - b.i)).slice(0, cfg.capSensed);

    // ---- climb (V-shape): recompute standing registers top-down each tick
    const score = (en: Entry) => aged(en, t) * (cfg.V === "physarum" ? Math.max(u[en.i], U_FLOOR) : 1);
    const takeTop = (src: Entry[], cap: number): Entry[] =>
      [...src].sort((a, b) => (score(b) - score(a)) || (a.i - b.i)).slice(0, cap);
    const takeQuota = (src: Entry[], cap: number): Entry[] => {
      const per = Math.max(1, Math.floor(cap / 8)); const out: Entry[] = [];
      for (let d = 0; d < 8; d++) {
        const inD = src.filter(en => w.district[en.i] === d).sort((a, b) => (aged(b, t) - aged(a, t)) || (a.i - b.i));
        out.push(...inD.slice(0, per));
      }
      return out.slice(0, cap);
    };

    if (cfg.V === "transparent") {
      regFeatures = [...regSensed]; regBriefing = [...regSensed]; regDecision = takeTop(regSensed, cfg.capDecision);
    } else {
      regFeatures = cfg.V === "vascular" ? takeQuota(regSensed, cfg.capFeatures) : takeTop(regSensed, cfg.capFeatures);
      let briefSrc = regFeatures;
      if (cfg.V === "mycelium") {
        // lateral fusion: same-district entries merge; the cluster takes one slot
        const byD = new Map<number, Entry[]>();
        for (const en of briefSrc) { const d = w.district[en.i]; if (!byD.has(d)) byD.set(d, []); byD.get(d)!.push(en); }
        const fused: Entry[] = [];
        for (const [, list] of [...byD.entries()].sort((a, b) => a[0] - b[0])) {
          if (list.length >= 2) {
            fires.fusion++;
            const best = list.reduce((a, b) => (aged(b, t) > aged(a, t) ? b : a));
            fused.push({ i: best.i, need: best.need, tick: best.tick, members: list.map(e => e.i).sort((x, y) => x - y) });
          } else fused.push(list[0]);
        }
        briefSrc = fused;
      }
      regBriefing = cfg.V === "vascular" ? takeQuota(briefSrc, cfg.capBriefing) : takeTop(briefSrc, cfg.capBriefing);
      // true root-down: a report requested from the top is read by the top.
      // Injected answers hold guaranteed slots; the rest compete for what remains.
      if (cfg.rescueAnswered) {
        const answered = visits.filter(v => v.kind === "rescue").map((v): Entry => ({ i: v.i, need: need[v.i], tick: t }));
        const rest = regBriefing.filter(en => !answered.some(a => a.i === en.i));
        regBriefing = [...answered, ...rest].slice(0, cfg.capBriefing);
      }
      regDecision = cfg.V === "vascular" ? takeQuota(regBriefing, cfg.capDecision) : takeTop(regBriefing, cfg.capDecision);
    }

    // burnout: in a register, absent one above
    const present = (list: Entry[], i: number) => list.some(en => en.i === i || (en.members?.includes(i) ?? false));
    for (const en of regFeatures) if (!present(regBriefing, en.i)) { fires.burn++; push({ e: "burn", t, slab: 2, i: en.i }); }
    for (const en of regBriefing) for (const m of en.members ?? [en.i]) if (!present(regDecision, m)) { fires.burn++; push({ e: "burn", t, slab: 3, i: m }); }

    const topIs: number[] = [];
    for (const en of regBriefing) for (const m of en.members ?? [en.i]) { lastSeenTop[m] = t; topIs.push(m); if (t >= cfg.T * 0.75) inBriefFinal.add(m); }
    if (keepEvents) push({ e: "top", t, is: topIs.sort((a, b) => a - b) });

    // ---- act (decision layer): help flows next tick; V-feedback reinforces channels
    const acted = cfg.oracleAct
      ? Array.from({ length: cfg.S }, (_, i) => i).sort((a, b) => (need[b] - need[a]) || (a - b)).slice(0, cfg.actionSlots).map((i): Entry => ({ i, need: need[i], tick: t }))
      : [...regDecision].sort((a, b) => (aged(b, t) - aged(a, t)) || (a.i - b.i)).slice(0, cfg.actionSlots);
    const usedNow = new Set<number>();
    for (const en of acted) {
      const members = en.members ?? [en.i];
      const amt = cfg.helpAmount / members.length; // dilution is honest
      for (const m of members) { pendingHelp[m] += amt; push({ e: "act", t, i: m, amt: Math.round(amt * 1000) / 1000 }); decisionCount[m]++; usedNow.add(m); }
    }
    if (cfg.V === "physarum" && cfg.vFeedback)
      for (let i = 0; i < cfg.S; i++) u[i] = Math.max(U_FLOOR, u[i] * (1 - V_DECAY) + (usedNow.has(i) ? V_GAIN : 0));

    // ---- book the cost of this tick
    for (let i = 0; i < cfg.S; i++) unmet += need[i] * w.pop[i];
  }

  // ---- metrics
  const totPop = w.pop.reduce((a, b) => a + b, 0);
  let extinctPop = 0;
  for (let i = 0; i < cfg.S; i++) if (!inBriefFinal.has(i)) extinctPop += w.pop[i];
  const reprPop = totPop - extinctPop;
  const sortedDc = [...decisionCount].sort((a, b) => a - b);
  const sumDc = sortedDc.reduce((a, b) => a + b, 0);
  let gini = 0;
  if (sumDc > 0) { let cum = 0, area = 0; for (const x of sortedDc) { cum += x; area += cum; } gini = 1 - 2 * (area / sortedDc.length / sumDc) + 1 / sortedDc.length; }
  const found = shockSeen.filter(s => s.found >= 0 && s.found - s.shockT <= 100);
  const lat = shockSeen.map(s => (s.found >= 0 ? Math.min(s.found - s.shockT, 100) : 100));
  const meanDiscovery = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const worstStaleTop = Math.max(...lastSeenTop.map(v => cfg.T - 1 - v));

  const logStr = JSON.stringify(events);
  return {
    logHash: fnv(logStr),
    visitHash: fnv(JSON.stringify(visitTrace)),
    events,
    unmetNeed: unmet / 1e6,
    extinctPop, reprPop,
    reprSettlements: inBriefFinal.size,
    giniDecision: Math.round(gini * 1000) / 1000,
    meanDiscovery: Math.round(meanDiscovery * 10) / 10,
    neverFound: Math.round((1 - found.length / Math.max(1, shockSeen.length)) * 1000) / 1000,
    worstStaleTop,
    fires,
  };
}

// ---------------------------------------------------------------- harness

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

interface ArmDef { name: string; cfg: (seed: number) => Cfg }

function arm(name: string, over: Partial<Cfg>): ArmDef {
  return {
    name,
    cfg: (seed) => ({
      ...BASE, worldSeed: seed,
      H: "physarum", eps: 0, V: "physarum", vFeedback: true, coupling: true,
      rescueRho: 0, rescueMode: "none", rescueAnswered: false, oracleAct: false,
      ...over,
    }),
  };
}

interface ArmOut { name: string; mean: Record<string, number>; sd: Record<string, number>; runs: RunOut[] }

const KEYS = ["unmetNeed", "extinctPop", "reprSettlements", "reprPop", "giniDecision", "meanDiscovery", "neverFound", "worstStaleTop"] as const;

function runArm(a: ArmDef): ArmOut {
  const runs: RunOut[] = [];
  for (const seed of SEEDS) {
    const cfg = a.cfg(seed);
    const r1 = run(cfg), r2 = run(cfg);
    if (r1.logHash !== r2.logHash) throw new Error(`DETERMINISM FAIL ${a.name} seed ${seed}`);
    runs.push(r1);
  }
  const mean: Record<string, number> = {}, sd: Record<string, number> = {};
  for (const k of KEYS) {
    const xs = runs.map(r => r[k] as number);
    const m = xs.reduce((x, y) => x + y, 0) / xs.length;
    mean[k] = m;
    sd[k] = Math.sqrt(xs.reduce((x, y) => x + (y - m) ** 2, 0) / xs.length);
  }
  return { name: a.name, mean, sd, runs };
}

const fmt = (x: number, d = 2) => x.toFixed(d).padStart(9);
function table(title: string, arms: ArmOut[], keys: readonly string[] = KEYS) {
  console.log(`\n== ${title}`);
  console.log("arm".padEnd(26) + keys.map(k => k.padStart(14)).join(""));
  for (const a of arms)
    console.log(a.name.padEnd(26) + keys.map(k => `${fmt(a.mean[k])}±${a.sd[k].toFixed(1).padStart(4)}`.padStart(14)).join(""));
}

// ---------------------------------------------------------------- experiments

function main() {
  const bakeIdx = process.argv.indexOf("--bake");
  const out: Record<string, ArmOut[]> = {};

  // E1 — frozen ground, sweep the climb. H uniform + coupling OFF => identical visits.
  const e1 = [
    arm("E1 V=physarum", { H: "uniform", coupling: false, V: "physarum" }),
    arm("E1 V=vascular", { H: "uniform", coupling: false, V: "vascular" }),
    arm("E1 V=mycelium", { H: "uniform", coupling: false, V: "mycelium" }),
  ].map(runArm);
  for (let s = 0; s < SEEDS.length; s++) {
    const hs = e1.map(a => a.runs[s].visitHash);
    if (new Set(hs).size !== 1) throw new Error(`E1 FROZEN-TRACE VIOLATION seed ${SEEDS[s]}: ${hs.join(",")}`);
  }
  console.log("E1 frozen-trace assert: visit sequences byte-identical across V-arms ✓");
  table("E1 — same ground, different climbs", e1);
  out.E1 = e1;

  // E2 — lock-in vs exploration floor. V transparent so only H moves.
  // eps labeled by mean explore visits/tick (K=8). oracle-sensor kept beside the
  // true ceiling deliberately: the gap between them is the register-staleness finding.
  const e2 = [
    ...[0, 0.0625, 0.125, 0.25, 0.5].map(eps => arm(`E2 explore=${eps * 8}/tick`, { V: "transparent", vFeedback: false, eps })),
    arm("E2 uniform (null)", { V: "transparent", vFeedback: false, H: "uniform" }),
    arm("E2 oracle-sensor", { V: "transparent", vFeedback: false, H: "oracle" }),
    arm("E2 oracle+ (ceiling)", { V: "transparent", vFeedback: false, H: "oracle", oracleAct: true }),
  ].map(runArm);
  table("E2 — exploration floor sweep", e2);
  out.E2 = e2;

  // E2b — sparse budget: K=4 (6.25% coverage/tick). Does uniform's freshness
  // advantage survive when rotation takes 16 ticks?
  const e2b = [
    arm("E2b uniform K=4", { K: 4, V: "transparent", vFeedback: false, H: "uniform" }),
    arm("E2b phys e=1/tick K=4", { K: 4, V: "transparent", vFeedback: false, eps: 0.25 }),
    arm("E2b phys e=0 K=4", { K: 4, V: "transparent", vFeedback: false, eps: 0 }),
    arm("E2b oracle+ K=4", { K: 4, V: "transparent", vFeedback: false, H: "oracle", oracleAct: true }),
  ].map(runArm);
  table("E2b — sparse budget", e2b);
  out.E2b = e2b;

  // E3 — compounding 2x2: V-feedback x coupling.
  // AMENDED after first run (disclosed in RESULTS.md): at eps=0 the H-lock is so
  // total that registers never compete (burn fires = 0, inert rule) and all four
  // cells are byte-identical. eps=0.25 gives the fleet real sensing so the climb
  // loop and the steering loop have something to fight over.
  const e3 = [
    arm("E3 fb=on cpl=on", { eps: 0.25, vFeedback: true, coupling: true }),
    arm("E3 fb=on cpl=off", { eps: 0.25, vFeedback: true, coupling: false }),
    arm("E3 fb=off cpl=on", { eps: 0.25, vFeedback: false, coupling: true }),
    arm("E3 fb=off cpl=off", { eps: 0.25, vFeedback: false, coupling: false }),
  ].map(runArm);
  table("E3 — the two loops, crossed", e3);
  for (const k of ["extinctPop", "unmetNeed", "reprPop"] as const) {
    const f = (n: string) => e3.find(a => a.name.includes(n))!.mean[k];
    const Q = f("fb=on cpl=on") - f("fb=on cpl=off") - f("fb=off cpl=on") + f("fb=off cpl=off");
    console.log(`E3 interaction Q[${k}] = ${Q.toFixed(2)}  (compounding harm: positive for extinctPop/unmetNeed, negative for reprPop)`);
  }
  out.E3 = e3;

  // E4 — rescues at matched budget, applied to E3's worst cell (fb=on, cpl=on, eps=0.25).
  const e4base = { eps: 0.25, vFeedback: true, coupling: true } as const;
  const e4 = [
    arm("E4 none (worst cell)", { ...e4base }),
    arm("E4 a) explore x2", { ...e4base, eps: 0.5 }),
    arm("E4 b) mycelium-V", { ...e4base, V: "mycelium", vFeedback: false }),
    arm("E4 c) rootdown stale", { ...e4base, rescueRho: 0.15, rescueMode: "stale" }),
    arm("E4 c') rootdown random", { ...e4base, rescueRho: 0.15, rescueMode: "random" }),
    arm("E4 c2) rootdown answered", { ...e4base, rescueRho: 0.15, rescueMode: "stale", rescueAnswered: true }),
    arm("E4 d) b+c combined", { ...e4base, V: "mycelium", vFeedback: false, rescueRho: 0.15, rescueMode: "stale" }),
    arm("E4 d2) b+c2 combined", { ...e4base, V: "mycelium", vFeedback: false, rescueRho: 0.15, rescueMode: "stale", rescueAnswered: true }),
    arm("E4 oracle+ (ceiling)", { H: "oracle", V: "transparent", vFeedback: false, oracleAct: true }),
  ].map(runArm);
  table("E4 — rescues, one at a time", e4);
  {
    const none = e4[0].mean, ceil = e4[e4.length - 1].mean;
    console.log("E4 gap-to-ceiling closed (unmetNeed):");
    for (const a of e4.slice(1, -1)) {
      const g = (none.unmetNeed - a.mean.unmetNeed) / Math.max(1e-9, none.unmetNeed - ceil.unmetNeed);
      console.log(`  ${a.name.padEnd(26)} ${(g * 100).toFixed(0)}%`);
    }
  }
  out.E4 = e4;

  // E5 — rescues run on the E1 world itself (H=uniform, coupling off), so the
  // explainer's erasure numbers and rescue numbers come from ONE world. Seed 3 is
  // the world on camera; the 8-seed aggregate is the record.
  const e5base = { H: "uniform" as const, coupling: false };
  const e5 = [
    arm("E5 none (= E1 erased)", { ...e5base, V: "physarum" }),
    arm("E5 c) re-visit stale", { ...e5base, V: "physarum", rescueRho: 0.15, rescueMode: "stale" }),
    arm("E5 c2) rootdown answered", { ...e5base, V: "physarum", rescueRho: 0.15, rescueMode: "stale", rescueAnswered: true }),
    arm("E5 b) mycelium (= held)", { ...e5base, V: "mycelium" }),
    arm("E5 d2) b+c2 pairing", { ...e5base, V: "mycelium", rescueRho: 0.15, rescueMode: "stale", rescueAnswered: true }),
    arm("E5 ceiling (oracle acts)", { ...e5base, V: "transparent", vFeedback: false, oracleAct: true }),
  ].map(runArm);
  table("E5 — rescues on the E1 world", e5);
  {
    const s3 = SEEDS.indexOf(3);
    const none = e5[0].runs[s3], ceil = e5[e5.length - 1].runs[s3];
    console.log("E5 SEED-3 (the world on camera):");
    for (const a of e5) {
      const r = a.runs[s3];
      const g = (none.unmetNeed - r.unmetNeed) / Math.max(1e-9, none.unmetNeed - ceil.unmetNeed);
      console.log(`  ${a.name.padEnd(28)} unmet=${r.unmetNeed.toFixed(2)} erasedPop=${r.extinctPop} repr=${r.reprSettlements}/64 gapClosed=${(g * 100).toFixed(0)}%`);
    }
    const noneM = e5[0].mean, ceilM = e5[e5.length - 1].mean;
    console.log("E5 8-SEED gap closed (unmetNeed):");
    for (const a of e5.slice(1, -1))
      console.log(`  ${a.name.padEnd(28)} ${(((noneM.unmetNeed - a.mean.unmetNeed) / Math.max(1e-9, noneM.unmetNeed - ceilM.unmetNeed)) * 100).toFixed(0)}%`);
  }
  out.E5 = e5;

  // mechanism fire counts (inert-component rule)
  console.log("\n== mechanism fires (inert if <5% of opportunities)");
  for (const [exp, arms] of Object.entries(out))
    for (const a of arms) {
      const f = a.runs.reduce((acc, r) => ({ explore: acc.explore + r.fires.explore, rescue: acc.rescue + r.fires.rescue, fusion: acc.fusion + r.fires.fusion, burn: acc.burn + r.fires.burn }), { explore: 0, rescue: 0, fusion: 0, burn: 0 });
      console.log(`${exp} ${a.name.padEnd(26)} explore=${f.explore} rescue=${f.rescue} fusion=${f.fusion} burn=${f.burn}`);
    }

  // raw record
  const rec = Object.fromEntries(Object.entries(out).map(([k, arms]) => [k, arms.map(a => ({ name: a.name, mean: a.mean, sd: a.sd }))]));
  const dest = join(HERE, "..", "..", "docs", "two-shapes", "raw-results.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(rec, null, 2));
  console.log(`\nraw results -> ${dest}`);

  // hero bake
  if (bakeIdx >= 0) {
    const which = process.argv[bakeIdx + 1]; // e.g. "E3:fb=on cpl=on"
    const seedIdx = process.argv.indexOf("--seed");
    const seed = seedIdx >= 0 ? Number(process.argv[seedIdx + 1]) : 3;
    const [expName, armName] = which.split(":");
    const armsAll: Record<string, ArmDef[]> = {}; // rebuild defs for bake
    void armsAll; void expName;
    // bake both worlds of the chosen contrast for the hero: worst cell vs rescued
    const bake = (name: string, over: Partial<Cfg>) => {
      const cfg: Cfg = { ...BASE, worldSeed: seed, H: "physarum", eps: 0, V: "physarum", vFeedback: true, coupling: true, rescueRho: 0, rescueMode: "none", rescueAnswered: false, oracleAct: false, ...over };
      const r = run(cfg, true);
      const w = makeWorld(cfg);
      return { name, cfg, world: { pos: w.pos, pop: w.pop, district: w.district }, metrics: Object.fromEntries(KEYS.map(k => [k, r[k]])), events: r.events, logHash: r.logHash };
    };
    void armName;
    // the hero contrast is E1: identical ground trace, two climbs
    const payload = {
      generated: "twoshapes.mts",
      seed,
      arms: [
        bake("erased", { H: "uniform", coupling: false, V: "physarum" }),
        bake("held", { H: "uniform", coupling: false, V: "mycelium" }),
      ],
    };
    if (payload.arms[0].logHash === payload.arms[1].logHash) throw new Error("bake: arms identical");
    const heroDest = join(HERE, "..", "public", "twoshapes-log.json");
    writeFileSync(heroDest, JSON.stringify(payload));
    console.log(`hero log -> ${heroDest} (${(JSON.stringify(payload).length / 1e6).toFixed(1)} MB)`);
  }
}

main();
