/**
 * THE STRATA
 *
 * One territory, five substrates, stacked in the dark.
 *
 * The bottom slab is the world: every settlement, every household, the ridge, the flooded
 * channel. Above it hangs what the satellites actually captured. Above that, what the model
 * extracted. Above that, the page somebody read. At the top, what was acted on.
 *
 * Each slab is the SAME ground at a coarser grain, and each one grows its own network on
 * whatever reached it. The growth is real: Jones Physarum, hyphal anastomosis, edge
 * aggregation, support-seeking climb and chemotaxis, all running on their own slab's grid.
 * On the ground you can tell the five apart by their shape. Three slabs up they are the same
 * four dots, because there is nothing left up there to be different with.
 *
 * Between slabs the sparks are reports crossing upward. A slab can only hold so much, so the
 * loudest reports are admitted and the rest burn out at the boundary in ember. A settlement
 * whose reports never survive a crossing has no column above that height. Look down the column
 * and it is still there, lit, full of people. Look up and there is a hole where it should be.
 *
 * THE ONE KNOB — how much detail survives each step up. Nothing else changes: same seed, same
 * terrain, same settlements, same growth logic, same grids. Turn it down and the upper slabs
 * empty out while the ground stays exactly as full as it was.
 *
 * Determinism: seeded PRNG only. No Math.random, no Date.now, no new Date. Same seed + same
 * config produces a byte-identical log. The render is a log consumer and never re-runs a
 * growth model in the frame loop.
 *
 * Everything here is synthetic — invented terrain, invented settlements. No real place and no
 * real person is modelled.
 */
import { useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { register } from "../registry";
import type { SimConfig, SimResult, SimEvent, WorldSpec } from "../../core/sim";
import { makeRng, worldRng } from "../../core/sim";
import { clamp, damp, ease } from "../../design/system";
import { useAxes, useAxisRef } from "../../design/holo";

// ================================================================= the territory

/** ground-truth grid. Every slab above is a coarsening of exactly this. */
const GW0 = 128;
const GH0 = 76;
/** cells across the topmost slab when abstraction is at full stretch */
const TOP_W = 9;
/** settlements on the ground. Synthetic. */
const COMMUNITIES = 26;
/** a slab pushes what it knows upward every this-many ticks */
const REPORT_EVERY = 2;
/** deposited mass at which a cell counts as held by the network */
const CLAIM = 0.34;
/** terrain texture handed to the render through the log */
const TW = 64;
const TH = 38;

/**
 * The ladder of abstraction. N slabs sample this evenly, so N=5 lands exactly on the five
 * named rungs and N=3 lands on GROUND / FEATURES / DECISION. N is never hardcoded.
 */
const LADDER = [
  { name: "GROUND", gloss: "every person, every building" },
  { name: "SURVEY", gloss: "what a crew walked past" },
  { name: "SENSED", gloss: "what the satellites actually captured" },
  { name: "MOSAIC", gloss: "the photos stitched into one map" },
  { name: "FEATURES", gloss: "the names and places the AI kept" },
  { name: "REGIONS", gloss: "places grouped into areas" },
  { name: "BRIEFING", gloss: "what fits on one page" },
  { name: "SHORTLIST", gloss: "what the room argued about" },
  { name: "DECISION", gloss: "what was acted on" },
] as const;

const rungOf = (i: number, n: number) =>
  n <= 1 ? 0 : Math.round((i * (LADDER.length - 1)) / (n - 1));

/** the growth logics, straight out of the field guide. Five shapes, one substrate each. */
const LOGIC = [
  "Jones Physarum",
  "hyphal anastomosis",
  "aggregation at the edge",
  "support-seeking climb",
  "chemotaxis + quorum",
] as const;
const NLOGIC = LOGIC.length;

// ================================================================= kernel (PURE)

const kernel = (cfg: SimConfig): SimResult => {
  const { seed, n, ticks, axes, interventionTick } = cfg;
  const div = clamp(axes.divergence);
  const wild = clamp(axes.wildness);
  const fid = ease.inOutCubic(clamp(axes.intervention));

  // ---------------------------------------------------------------- the ground
  const r0 = worldRng(seed, "ground");
  const NC0 = GW0 * GH0;
  const elev = new Float32Array(NC0);
  const pass0 = new Uint8Array(NC0).fill(1);
  const people = new Float32Array(NC0);
  const cellComm = new Int16Array(NC0).fill(-1);
  const cellBest = new Float32Array(NC0);

  const lobes = 6;
  const lob: number[] = [];
  for (let l = 0; l < lobes; l++) {
    lob.push(0.7 + r0() * 2.2, r0() * 6.283185, 0.7 + r0() * 2.2, r0() * 6.283185);
  }
  for (let y = 0; y < GH0; y++) {
    for (let x = 0; x < GW0; x++) {
      const u = x / GW0;
      const v = y / GH0;
      let e = 0;
      for (let l = 0; l < lobes; l++) {
        const o = l * 4;
        e += Math.sin(u * lob[o] * 6.283185 + lob[o + 1]) * Math.cos(v * lob[o + 2] * 6.283185 + lob[o + 3]);
      }
      elev[y * GW0 + x] = e / lobes;
    }
  }
  for (let y = 0; y < GH0; y++) {
    for (let x = 0; x < GW0; x++) {
      const i = y * GW0 + x;
      if (elev[i] > 0.40) pass0[i] = 0; // the ridge
      const ch = Math.abs(y - GH0 * (0.66 + 0.05 * Math.sin((x / GW0) * 5.1)));
      if (ch < GH0 * 0.026 && x > GW0 * 0.16) pass0[i] = 0; // the flooded channel
    }
  }

  // settlements. Placed on passable ground, each carrying one growth logic.
  const cX = new Float32Array(COMMUNITIES);
  const cY = new Float32Array(COMMUNITIES);
  const cPop = new Float32Array(COMMUNITIES);
  const cRad = new Float32Array(COMMUNITIES);
  const cLogic = new Int8Array(COMMUNITIES);
  const order = new Int32Array(COMMUNITIES);
  for (let c = 0; c < COMMUNITIES; c++) order[c] = c;
  for (let c = COMMUNITIES - 1; c > 0; c--) {
    const j = (r0() * (c + 1)) | 0;
    const s = order[c];
    order[c] = order[j];
    order[j] = s;
  }
  for (let c = 0; c < COMMUNITIES; c++) cLogic[order[c]] = c % NLOGIC;

  for (let c = 0; c < COMMUNITIES; c++) {
    let px = 0;
    let py = 0;
    for (let k = 0; k < 90; k++) {
      px = 3 + ((r0() * (GW0 - 6)) | 0);
      py = 3 + ((r0() * (GH0 - 6)) | 0);
      if (pass0[py * GW0 + px]) break;
    }
    const rad = 2.6 + r0() * 5.4;
    const pop = 900 + r0() * 5400;
    cX[c] = px;
    cY[c] = py;
    cRad[c] = rad;
    cPop[c] = pop;
    const s2 = 2 * (rad * 0.62) * (rad * 0.62);
    const ri = Math.ceil(rad);
    for (let y = Math.max(0, py - ri); y < Math.min(GH0, py + ri + 1); y++) {
      for (let x = Math.max(0, px - ri); x < Math.min(GW0, px + ri + 1); x++) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) continue;
        const i = y * GW0 + x;
        if (!pass0[i]) continue;
        const w = Math.exp(-d2 / s2);
        const add = (pop * w) / (rad * rad * 2.4);
        people[i] += add;
        if (add > cellBest[i]) {
          cellBest[i] = add;
          cellComm[i] = c;
        }
      }
    }
  }
  // The deposited field is rescaled so its total IS the sum of the settlement populations.
  // Without this the per-slab counts and the punchline are quoted in two different currencies
  // and the ground reads as holding fewer people than there are.
  let fieldSum = 0;
  let nominal = 0;
  for (let i = 0; i < NC0; i++) fieldSum += people[i];
  for (let c = 0; c < COMMUNITIES; c++) nominal += cPop[c];
  const fscale = fieldSum > 1e-6 ? nominal / fieldSum : 1;
  let peopleMax = 1e-6;
  for (let i = 0; i < NC0; i++) {
    people[i] *= fscale;
    if (people[i] > peopleMax) peopleMax = people[i];
  }

  // ---------------------------------------------------------------- the slabs
  // Slab L is the ground coarsened by the abstraction ladder. At DIVERGENCE 0 every slab is
  // the ground grid at full resolution and the stack visibly collapses to one.
  const sF = n > 1 ? Math.pow(TOP_W / GW0, 1 / (n - 1)) : 1;
  const gw: number[] = [];
  const gh: number[] = [];
  for (let L = 0; L < n; L++) {
    const w = Math.max(4, Math.round(GW0 * Math.pow(sF, div * L)));
    gw.push(w);
    gh.push(Math.max(3, Math.round((w * GH0) / GW0)));
  }

  const cells = gw.map((w, L) => w * gh[L]);
  const passL: Uint8Array[] = [];
  const needL: Float32Array[] = [];
  const massL: Float32Array[] = [];
  const peoL: Float32Array[] = [];
  const peoNorm: Float32Array[] = [];
  const ownerL: Int16Array[] = [];
  const claimedL: Uint8Array[] = [];
  const claimList: number[][] = [];
  const upIdx: Int32Array[] = [];
  const evBuf: Float32Array[] = [];
  const idxBuf: Int32Array[] = [];

  const cellOf = (L: number, x0: number, y0: number) => {
    const x = Math.min(gw[L] - 1, Math.floor((x0 * gw[L]) / GW0));
    const y = Math.min(gh[L] - 1, Math.floor((y0 * gh[L]) / GH0));
    return y * gw[L] + x;
  };

  for (let L = 0; L < n; L++) {
    const nc = cells[L];
    const blocked = new Float32Array(nc);
    const total = new Float32Array(nc);
    const peo = new Float32Array(nc);
    const acc = new Float32Array(nc * COMMUNITIES);
    for (let y = 0; y < GH0; y++) {
      for (let x = 0; x < GW0; x++) {
        const i = y * GW0 + x;
        const j = cellOf(L, x, y);
        total[j] += 1;
        if (!pass0[i]) blocked[j] += 1;
        peo[j] += people[i];
        const c = cellComm[i];
        if (c >= 0) acc[j * COMMUNITIES + c] += people[i];
      }
    }
    const pl = new Uint8Array(nc);
    const own = new Int16Array(nc).fill(-1);
    let pmax = 1e-6;
    for (let j = 0; j < nc; j++) {
      pl[j] = blocked[j] / Math.max(1, total[j]) > 0.55 ? 0 : 1;
      if (peo[j] > pmax) pmax = peo[j];
      let best = 0;
      let bc = -1;
      for (let c = 0; c < COMMUNITIES; c++) {
        const v = acc[j * COMMUNITIES + c];
        if (v > best) {
          best = v;
          bc = c;
        }
      }
      own[j] = bc;
    }
    const pn = new Float32Array(nc);
    for (let j = 0; j < nc; j++) pn[j] = peo[j] / pmax;

    passL.push(pl);
    peoL.push(peo);
    peoNorm.push(pn);
    ownerL.push(own);
    massL.push(new Float32Array(nc));
    claimedL.push(new Uint8Array(nc));
    claimList.push([]);
    evBuf.push(new Float32Array(nc));
    const ix = new Int32Array(nc);
    for (let j = 0; j < nc; j++) ix[j] = j;
    idxBuf.push(ix);

    // need: the ground knows its own people; every slab above starts blind.
    const nd = new Float32Array(nc);
    if (L === 0) {
      for (let j = 0; j < nc; j++) nd[j] = pl[j] ? Math.min(1, (peo[j] / pmax) * 3.2) : 0;
    }
    needL.push(nd);
  }
  // where each cell of slab L lands on slab L+1
  for (let L = 0; L < n - 1; L++) {
    const m = new Int32Array(cells[L]);
    for (let j = 0; j < cells[L]; j++) {
      const x = j % gw[L];
      const y = (j / gw[L]) | 0;
      const x0 = Math.min(GW0 - 1, Math.floor(((x + 0.5) * GW0) / gw[L]));
      const y0 = Math.min(GH0 - 1, Math.floor(((y + 0.5) * GH0) / gh[L]));
      m[j] = cellOf(L + 1, x0, y0);
    }
    upIdx.push(m);
  }

  // ---------------------------------------------------------------- the agents
  const tips: number[] = [];
  const aStart: number[] = [];
  let totalA = 0;
  for (let L = 0; L < n; L++) {
    tips.push(Math.max(3, Math.round((14 * cells[L]) / (GW0 * GH0))));
    aStart.push(totalA);
    totalA += COMMUNITIES * tips[L];
  }
  const aX = new Float32Array(totalA);
  const aY = new Float32Array(totalA);
  const aT = new Float32Array(totalA);
  const aE = new Float32Array(totalA);
  const aLive = new Uint8Array(totalA);
  const aG = new Int8Array(totalA);
  const rngL = Array.from({ length: n }, (_, L) => worldRng(seed, `slab-${L}`));

  const events: SimEvent[] = [];
  const reached = new Uint8Array(n * COMMUNITIES);

  const spawn = (L: number, c: number, cell: number, t: number) => {
    const w = gw[L];
    const x = (cell % w) + 0.5;
    const y = ((cell / w) | 0) + 0.5;
    const base = aStart[L] + c * tips[L];
    const r = rngL[L];
    for (let k = 0; k < tips[L]; k++) {
      const a = base + k;
      aX[a] = x;
      aY[a] = y;
      aT[a] = (k / tips[L]) * 6.283185 + r() * 0.5;
      aE[a] = 1;
      aLive[a] = 1;
      aG[a] = cLogic[c];
    }
    if (massL[L][cell] < 0.55) massL[L][cell] = 0.55;
    reached[L * COMMUNITIES + c] = 1;
    events.push({
      t,
      w: L,
      kind: "reach",
      actor: `k${c}`,
      at: [(cell % w + 0.5) / w, (((cell / w) | 0) + 0.5) / gh[L], 0],
      mag: cPop[c] / 6300,
    });
  };

  // ---------------------------------------------------------------- the log preamble
  for (let L = 0; L < n; L++) {
    const r = rungOf(L, n);
    events.push({
      t: 0,
      w: L,
      kind: "slab",
      actor: `L${L}`,
      mag: n > 1 ? L / (n - 1) : 0,
      d: { gw: gw[L], gh: gh[L], name: LADDER[r].name, gloss: LADDER[r].gloss },
    });
  }
  for (let c = 0; c < COMMUNITIES; c++) {
    events.push({
      t: 0,
      w: 0,
      kind: "site",
      actor: `k${c}`,
      at: [(cX[c] + 0.5) / GW0, (cY[c] + 0.5) / GH0, 0],
      mag: cPop[c] / 6300,
      d: { g: cLogic[c], pop: Math.round(cPop[c]), rad: cRad[c] / GW0 },
    });
  }

  // ---------------------------------------------------------------- growth
  // Slab-local scratch, rebound per slab so the steppers never allocate.
  let curW = 0;
  let curH = 0;
  let curMass = massL[0];
  let curNeed = needL[0];
  let curPass = passL[0];
  let curClaim = claimedL[0];
  let curList = claimList[0];
  let curL = 0;
  let curT = 0;
  let curDrain = 0.055;
  let rr: () => number = rngL[0];

  const turn = 0.55 + 1.15 * wild;
  const defect = 0.05 * wild;

  const sense = (x: number, y: number, ang: number, dist: number) => {
    const sx = Math.min(curW - 1, Math.max(0, (x + Math.cos(ang) * dist) | 0));
    const sy = Math.min(curH - 1, Math.max(0, (y + Math.sin(ang) * dist) | 0));
    return sy * curW + sx;
  };
  const draw = (i: number) => (curPass[i] ? curNeed[i] : -1);

  const move = (a: number, ang: number, sp: number) => {
    const nx = aX[a] + Math.cos(ang) * sp;
    const ny = aY[a] + Math.sin(ang) * sp;
    if (nx < 0.5 || nx > curW - 0.5 || ny < 0.5 || ny > curH - 0.5) {
      aT[a] = ang + 3.14159 + (rr() - 0.5) * 0.9;
      return -1;
    }
    const ni = (ny | 0) * curW + (nx | 0);
    if (!curPass[ni]) {
      aT[a] = ang + 2.2 + (rr() - 0.5) * 0.9;
      return -1;
    }
    aX[a] = nx;
    aY[a] = ny;
    aT[a] = ang;
    return ni;
  };

  /**
   * Deposit. An agent standing on ground its slab actually knows about is fully fed; off it,
   * the agent runs on reserves and pays them down. This is why the upper slabs grow only
   * around what crossed up to them, and why they cannot invent the ground back.
   */
  const drop = (a: number, ni: number, amt: number) => {
    const known = curNeed[ni] > 0.02;
    if (known) aE[a] = 1;
    else aE[a] = Math.max(0, aE[a] - curDrain);
    const k = amt * (known ? 1 : 0.28 * aE[a]);
    if (k < 0.004) return;
    const m = Math.min(1, curMass[ni] + k);
    curMass[ni] = m;
    if (m >= CLAIM && !curClaim[ni]) {
      curClaim[ni] = 1;
      curList.push(ni);
      events.push({
        t: curT,
        w: curL,
        kind: "claim",
        actor: `x${ni}`,
        at: [((ni % curW) + 0.5) / curW, (((ni / curW) | 0) + 0.5) / curH, 0],
        mag: m,
        d: { g: aG[a] },
      });
    }
  };

  // -- A · Jones Physarum: three sensors, rotate to the strongest, deposit, repeat
  const SO = 4.0;
  const SA = 0.42;
  const RA = 0.46;
  const stepPhysarum = (a: number) => {
    const x = aX[a];
    const y = aY[a];
    const th = aT[a];
    const c = curMass[sense(x, y, th, SO)] * 1.9 + draw(sense(x, y, th, SO));
    const l = curMass[sense(x, y, th - SA, SO)] * 1.9 + draw(sense(x, y, th - SA, SO));
    const r = curMass[sense(x, y, th + SA, SO)] * 1.9 + draw(sense(x, y, th + SA, SO));
    let na: number;
    if (rr() < defect) na = th + (rr() - 0.5) * 2.6;
    else if (c > l && c > r) na = th;
    else if (l > r) na = th - RA * turn;
    else if (r > l) na = th + RA * turn;
    else na = th + (rr() - 0.5) * RA * 2 * turn;
    const ni = move(a, na, 0.85);
    if (ni >= 0) drop(a, ni, 0.17);
  };

  // -- B · mycelium: branch and FUSE. loops are the product; a mesh survives a cut
  const stepMycelium = (a: number) => {
    const na = aT[a] + (rr() - 0.5) * 0.38 * turn;
    const ni = move(a, na, 0.95);
    if (ni < 0) return;
    if (curMass[ni] > 0.5) curMass[ni] = Math.min(1, curMass[ni] + 0.09); // anastomosis
    drop(a, ni, 0.14);
    if (rr() < 0.024 + 0.05 * Math.max(0, draw(ni))) {
      // branching relocates an existing tip; it never multiplies the fleet
      const c = ((a - aStart[curL]) / tips[curL]) | 0;
      const base = aStart[curL] + c * tips[curL];
      const j = base + ((rr() * tips[curL]) | 0);
      aX[j] = aX[a];
      aY[j] = aY[a];
      aT[j] = na + (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.6);
      aE[j] = aE[a];
      aLive[j] = 1;
    }
  };

  // -- C · coral: accretion only where it already touches itself. slow, permanent
  const stepCoral = (a: number) => {
    const na = aT[a] + (rr() - 0.5) * 1.5 * turn;
    const ni = move(a, na, 1.05);
    if (ni < 0) return;
    const gx = ni % curW;
    const gy = (ni / curW) | 0;
    let touch = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = Math.min(curH - 1, Math.max(0, gy + dy));
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(curW - 1, Math.max(0, gx + dx));
        if (curMass[yy * curW + xx] > 0.3) touch++;
      }
    }
    if (touch > 0) {
      drop(a, ni, 0.32);
      aT[a] = na + (rr() - 0.5) * 2.0;
    }
  };

  // -- D · vine: may only advance along the flank of impassable structure
  const stepVine = (a: number) => {
    let best = -1e9;
    let ba = aT[a];
    for (let s = -3; s <= 3; s++) {
      const ang = aT[a] + s * 0.42;
      const i = sense(aX[a], aY[a], ang, 2.6);
      if (!curPass[i]) continue;
      const sx = i % curW;
      const sy = (i / curW) | 0;
      let sup = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(curH - 1, Math.max(0, sy + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(curW - 1, Math.max(0, sx + dx));
          if (!curPass[yy * curW + xx]) sup++;
        }
      }
      const v = draw(i) + sup * 0.55; // it wants a wall to climb
      if (v > best) {
        best = v;
        ba = ang;
      }
    }
    if (rr() < defect) ba += (rr() - 0.5) * 2.2;
    const ni = move(a, ba, 1.0);
    if (ni >= 0) drop(a, ni, 0.19);
  };

  // -- E · swarm: chemotaxis up the need gradient with a quorum term
  const stepSwarm = (a: number) => {
    let best = -1e9;
    let ba = aT[a];
    for (let s = -1; s <= 1; s++) {
      const ang = aT[a] + s * 0.55;
      const i = sense(aX[a], aY[a], ang, 3.0);
      const v = draw(i) + curMass[i] * 0.6;
      if (v > best) {
        best = v;
        ba = ang;
      }
    }
    ba += (rr() - 0.5) * 0.5 * turn;
    const ni = move(a, ba, 1.4);
    if (ni >= 0) drop(a, ni, 0.11);
  };

  // ---------------------------------------------------------------- the crossing
  // Capacity is the abstraction budget: how many distinct cells a slab is able to hold at all.
  // THE KNOB rides here and nowhere else. Before interventionTick every arm is identical.
  const KEEP_LO = 0.235;
  const KEEP_HI = 0.90;
  const keepAt = (t: number) => {
    if (interventionTick < 0) return KEEP_LO;
    const g = ease.inOutCubic(clamp((t - interventionTick) / 18));
    return KEEP_LO + (KEEP_HI - KEEP_LO) * fid * g;
  };
  /**
   * `keep ^ (L * div)` rather than a lerp toward `keep`, because the loss has to COMPOUND: a
   * lerp floors the survivable fraction at `1 - div` and the top slab then still holds enough
   * cells to name every settlement, which is the opposite of the finding. At DIVERGENCE 0 the
   * exponent is 0, every slab keeps everything, and the stack collapses to one.
   * The `t` term is intake, not capacity: a slab absorbs its budget over the run instead of
   * swallowing it in the first report round and going quiet.
   */
  const capAt = (L: number, t: number) => {
    const intake = Math.min(1, 0.14 + (3.2 * t) / Math.max(1, ticks));
    return Math.max(1, Math.round(cells[L] * 0.36 * Math.pow(keepAt(t), L * div) * intake));
  };
  const admitted = new Int32Array(n);
  /** people the slab has any record of at all — the sum under every cell it admitted */
  const seenPeople = new Float64Array(n);
  /**
   * Threads are logged as a decimated sample of admissions — one row per `stride` crossings —
   * so an ablation at DIVERGENCE 0, where a slab admits thousands of cells at once, does not
   * turn the log into a megabyte of identical rows. The admitted SET is fully recoverable from
   * the claim rows; the thread rows are how many of them the render draws.
   */
  const THREAD_BUDGET = 620;

  const reachedComms: number[][] = Array.from({ length: n }, () => new Array<number>(ticks).fill(0));
  const reachedPeople: number[][] = Array.from({ length: n }, () => new Array<number>(ticks).fill(0));
  const heldCells: number[][] = Array.from({ length: n }, () => new Array<number>(ticks).fill(0));

  for (let c = 0; c < COMMUNITIES; c++) spawn(0, c, cellOf(0, cX[c] | 0, cY[c] | 0), 0);
  // the ground has a record of everyone standing on it, by definition
  for (let j = 0; j < cells[0]; j++) seenPeople[0] += peoL[0][j];

  for (let t = 0; t < ticks; t++) {
    curT = t;

    // ---- reports climb
    if (t % REPORT_EVERY === 0) {
      for (let L = 0; L < n - 1; L++) {
        const U = L + 1;
        const ev = evBuf[U];
        ev.fill(0);
        const src = massL[L];
        const up = upIdx[L];
        const pn = peoNorm[L];
        for (let i = 0; i < src.length; i++) {
          if (src[i] < CLAIM) continue;
          ev[up[i]] += src[i] * (0.28 + pn[i]);
        }
        const idx = idxBuf[U];
        idx.sort((p, q) => ev[q] - ev[p]);
        const cap = capAt(U, t);
        const stride = Math.max(1, Math.ceil(cap / THREAD_BUDGET));
        const ndU = needL[U];
        let q = 0;
        for (; q < idx.length && admitted[U] < cap; q++) {
          const j = idx[q];
          if (ev[j] <= 1e-4) break;
          if (ndU[j] > 0.02) continue;
          ndU[j] = 1;
          admitted[U]++;
          seenPeople[U] += peoL[U][j];
          if (admitted[U] % stride === 0) {
            events.push({
              t,
              w: U,
              kind: "cross",
              actor: `x${j}`,
              at: [((j % gw[U]) + 0.5) / gw[U], (((j / gw[U]) | 0) + 0.5) / gh[U], 0],
              mag: Math.min(1, ev[j] * 0.5),
            });
          }
          const oc = ownerL[U][j];
          if (oc >= 0 && !reached[U * COMMUNITIES + oc]) spawn(U, oc, j, t);
        }
        // the loudest reports that did NOT fit. They die at the boundary, in the open.
        let shown = 0;
        for (; q < idx.length && shown < 2; q++) {
          const j = idx[q];
          if (ev[j] <= 1e-4) break;
          if (ndU[j] > 0.02) continue;
          events.push({
            t,
            w: U,
            kind: "occlude",
            actor: `x${j}`,
            at: [((j % gw[U]) + 0.5) / gw[U], (((j / gw[U]) | 0) + 0.5) / gh[U], 0],
            mag: Math.min(1, ev[j] * 0.5),
          });
          shown++;
        }
      }
    }

    // ---- every slab grows on its own substrate
    for (let L = 0; L < n; L++) {
      curL = L;
      curW = gw[L];
      curH = gh[L];
      curMass = massL[L];
      curNeed = needL[L];
      curPass = passL[L];
      curClaim = claimedL[L];
      curList = claimList[L];
      // reserves are spent per unit of GROUND crossed, not per cell, so "how far a slab may
      // extrapolate past what it knows" means the same fraction of the map on every slab.
      curDrain = 0.10 * (GW0 / curW);
      rr = rngL[L];
      const lo = aStart[L];
      const hi = lo + COMMUNITIES * tips[L];
      for (let a = lo; a < hi; a++) {
        if (!aLive[a]) continue;
        const g = aG[a];
        if (g === 0) stepPhysarum(a);
        else if (g === 1) stepMycelium(a);
        else if (g === 2) stepCoral(a);
        else if (g === 3) stepVine(a);
        else stepSwarm(a);
      }
      // upkeep — holding ground costs, and only the held cells are touched
      const m = massL[L];
      const list = claimList[L];
      for (let k = 0; k < list.length; k++) m[list[k]] *= 0.9985;
      heldCells[L][t] = list.length;
    }

    // ---- who is still represented, and how many people that slab has any record of
    for (let L = 0; L < n; L++) {
      let cn = 0;
      for (let c = 0; c < COMMUNITIES; c++) if (reached[L * COMMUNITIES + c]) cn++;
      reachedComms[L][t] = cn;
      reachedPeople[L][t] = seenPeople[L];
    }
  }

  // ---- terrain, downsampled once, handed to the render through the log
  const terrE = new Array<number>(TW * TH).fill(0);
  const terrP = new Array<number>(TW * TH).fill(0);
  const terrN = new Array<number>(TW * TH).fill(0);
  {
    const cnt = new Float32Array(TW * TH);
    for (let y = 0; y < GH0; y++) {
      for (let x = 0; x < GW0; x++) {
        const i = y * GW0 + x;
        const j = Math.min(TH - 1, Math.floor((y * TH) / GH0)) * TW + Math.min(TW - 1, Math.floor((x * TW) / GW0));
        terrE[j] += elev[i];
        terrP[j] += pass0[i];
        terrN[j] += people[i] / peopleMax;
        cnt[j] += 1;
      }
    }
    for (let j = 0; j < TW * TH; j++) {
      const k = Math.max(1, cnt[j]);
      terrE[j] = terrE[j] / k;
      terrP[j] = terrP[j] / k;
      terrN[j] = terrN[j] / k;
    }
  }

  const worlds: WorldSpec[] = [];
  for (let L = 0; L < n; L++) {
    worlds.push({
      id: `L${L}`,
      label: LADDER[rungOf(L, n)].name,
      knob: n > 1 ? (div * L) / (n - 1) : 0,
    });
  }

  return {
    seed,
    ticks,
    worlds,
    events,
    metrics: {
      communities: reachedComms,
      people: reachedPeople,
      held: heldCells,
      terrain: [terrE, terrP, terrN],
    },
    interventionTick,
  };
};

// ================================================================= this instrument's look
//
// Black ground and Helvetica are the house laws. Everything else here is the strata's own:
// one cold light for anything a system can still see, one ember for anything it cannot.

const P = {
  ember: "#ff7a3c",
  emberV: [1.0, 0.478, 0.235] as [number, number, number],
  coolV: [0.5, 0.89, 1.0] as [number, number, number],
  peopleV: [0.91, 0.96, 1.0] as [number, number, number],
} as const;

/** one hue family, five values — the logics are told apart by their SHAPE, not by a legend */
const LOGIC_RGB: Array<[number, number, number]> = [
  [0.52, 0.90, 1.0],
  [0.86, 0.97, 1.0],
  [0.30, 0.64, 0.82],
  [0.70, 0.87, 0.97],
  [0.42, 0.79, 0.96],
];

const PLANE_W = 6.4;
const PLANE_D = (PLANE_W * GH0) / GW0;
const GAP = 1.10;
const GROUP_X = 0.55;
/**
 * A long lens at ~21°. Low enough that you look INTO the stack rather than down onto it —
 * above ~arctan(GAP/PLANE_D) the slabs stop separating on screen and the whole thing reads as
 * one flat map. The long focal length also flattens the near/far size difference between the
 * bottom slab and the top one, so the emptiest slab does not end up the biggest object.
 */
const CAM = { dist: 16.0, elev: 0.372, fov: 25.5 };
const TICKS_PER_SEC = 12;
const SPARKS = 12;
const BLOCK_FRAC = 0.44;

// ================================================================= reading the log

interface Slab {
  gw: number;
  gh: number;
  name: string;
  gloss: string;
  y: number;
  /** claims: xyz + birth tick + magnitude + rgb */
  cp: Float32Array;
  cb: Float32Array;
  cm: Float32Array;
  cc: Float32Array;
  cn: number;
}

interface View {
  n: number;
  ticks: number;
  slabs: Slab[];
  /** thread sparks, all boundaries in one buffer */
  tp: Float32Array;
  tb: Float32Array;
  tu: Float32Array;
  ts: Float32Array;
  tn: number;
  /** people dots on the ground */
  pp: Float32Array;
  pn: number;
  /** settlements */
  cx: Float32Array;
  cz: Float32Array;
  cpop: Float32Array;
  /** reachTick[L*C + c] — tick at which community c first showed up on slab L, or -1 */
  reachTick: Int32Array;
  comms: number;
  terrain: THREE.DataTexture;
  metricComms: number[][];
  metricPeople: number[][];
  totalPeople: number;
}

const wx = (nx: number) => GROUP_X + (nx - 0.5) * PLANE_W;
const wz = (ny: number) => (ny - 0.5) * PLANE_D;

function buildView(result: SimResult): View {
  const n = result.worlds.length;
  const ticks = result.ticks;
  const yOf = (L: number) => (L - (n - 1) / 2) * GAP;

  const slabMeta: Array<{ gw: number; gh: number; name: string; gloss: string }> = [];
  for (let L = 0; L < n; L++) slabMeta.push({ gw: 1, gh: 1, name: "", gloss: "" });

  const claims: Array<SimEvent[]> = Array.from({ length: n }, () => []);
  const crosses: SimEvent[] = [];
  const sites: SimEvent[] = [];
  const reachTick = new Int32Array(n * COMMUNITIES).fill(-1);

  for (const e of result.events) {
    if (e.kind === "slab") {
      const d = e.d as Record<string, number | string>;
      slabMeta[e.w] = {
        gw: Number(d.gw),
        gh: Number(d.gh),
        name: String(d.name),
        gloss: String(d.gloss),
      };
    } else if (e.kind === "claim") claims[e.w].push(e);
    else if (e.kind === "cross" || e.kind === "occlude") crosses.push(e);
    else if (e.kind === "site") sites.push(e);
    else if (e.kind === "reach") {
      const c = parseInt(e.actor.slice(1), 10);
      const k = e.w * COMMUNITIES + c;
      if (reachTick[k] < 0) reachTick[k] = e.t;
    }
  }

  const slabs: Slab[] = [];
  for (let L = 0; L < n; L++) {
    const rows = claims[L];
    const cnum = rows.length;
    const cp = new Float32Array(cnum * 3);
    const cb = new Float32Array(cnum);
    const cm = new Float32Array(cnum);
    const cc = new Float32Array(cnum * 3);
    const y = yOf(L);
    for (let k = 0; k < cnum; k++) {
      const e = rows[k];
      const a = e.at ?? [0.5, 0.5, 0];
      cp[k * 3] = wx(a[0]);
      cp[k * 3 + 1] = y;
      cp[k * 3 + 2] = wz(a[1]);
      cb[k] = e.t;
      cm[k] = e.mag ?? 0.5;
      const g = LOGIC_RGB[Number((e.d as Record<string, number>)?.g ?? 0) % LOGIC_RGB.length];
      cc[k * 3] = g[0];
      cc[k * 3 + 1] = g[1];
      cc[k * 3 + 2] = g[2];
    }
    slabs.push({ ...slabMeta[L], y, cp, cb, cm, cc, cn: cnum });
  }

  // ---- threads: each crossing becomes a column of sparks between two slabs
  const tn = crosses.length * SPARKS;
  const tp = new Float32Array(tn * 3);
  const tb = new Float32Array(tn);
  const tu = new Float32Array(tn);
  const ts = new Float32Array(tn);
  for (let k = 0; k < crosses.length; k++) {
    const e = crosses[k];
    const a = e.at ?? [0.5, 0.5, 0];
    const blocked = e.kind === "occlude" ? 1 : 0;
    const y0 = yOf(e.w - 1);
    const y1 = blocked ? y0 + GAP * BLOCK_FRAC : yOf(e.w);
    const x = wx(a[0]);
    const z = wz(a[1]);
    for (let s = 0; s < SPARKS; s++) {
      const i = k * SPARKS + s;
      const u = SPARKS > 1 ? s / (SPARKS - 1) : 0;
      tp[i * 3] = x;
      tp[i * 3 + 1] = y0 + (y1 - y0) * u;
      tp[i * 3 + 2] = z;
      tb[i] = e.t;
      tu[i] = u;
      ts[i] = blocked;
    }
  }

  // ---- the somebodies. Deterministic scatter, seeded off the run, around each settlement.
  const pr = makeRng((result.seed ^ 0x50454f50) >>> 0);
  const cx = new Float32Array(COMMUNITIES);
  const cz = new Float32Array(COMMUNITIES);
  const cpop = new Float32Array(COMMUNITIES);
  const dots: number[] = [];
  let totalPeople = 0;
  for (const e of sites) {
    const c = parseInt(e.actor.slice(1), 10);
    const a = e.at ?? [0.5, 0.5, 0];
    const d = e.d as Record<string, number>;
    const pop = Number(d.pop);
    const rad = Number(d.rad) * PLANE_W;
    cx[c] = wx(a[0]);
    cz[c] = wz(a[1]);
    cpop[c] = pop;
    totalPeople += pop;
    const many = Math.max(24, Math.min(460, Math.round(pop / 15)));
    for (let k = 0; k < many; k++) {
      // box-muller, so the crowd thins outward instead of ending at a hard rim
      const u = 1 - pr();
      const v = pr();
      const g = Math.sqrt(-2 * Math.log(u)) * 0.34;
      const th = v * 6.283185;
      dots.push(cx[c] + Math.cos(th) * g * rad, Math.sin(th) * g * rad * 0.9 + cz[c]);
    }
  }
  const pn = dots.length / 2;
  const pp = new Float32Array(pn * 3);
  const y0 = yOf(0);
  for (let k = 0; k < pn; k++) {
    pp[k * 3] = dots[k * 2];
    pp[k * 3 + 1] = y0;
    pp[k * 3 + 2] = dots[k * 2 + 1];
  }

  // ---- terrain texture
  const te = result.metrics.terrain?.[0] ?? [];
  const tpz = result.metrics.terrain?.[1] ?? [];
  const tne = result.metrics.terrain?.[2] ?? [];
  const buf = new Uint8Array(TW * TH * 4);
  for (let j = 0; j < TW * TH; j++) {
    buf[j * 4] = Math.max(0, Math.min(255, Math.round(((te[j] ?? 0) * 0.5 + 0.5) * 255)));
    buf[j * 4 + 1] = Math.max(0, Math.min(255, Math.round((tpz[j] ?? 1) * 255)));
    buf[j * 4 + 2] = Math.max(0, Math.min(255, Math.round(Math.min(1, (tne[j] ?? 0) * 2.4) * 255)));
    buf[j * 4 + 3] = 255;
  }
  const terrain = new THREE.DataTexture(buf, TW, TH, THREE.RGBAFormat);
  terrain.minFilter = THREE.LinearFilter;
  terrain.magFilter = THREE.LinearFilter;
  terrain.needsUpdate = true;

  return {
    n,
    ticks,
    slabs,
    tp,
    tb,
    tu,
    ts,
    tn,
    pp,
    pn,
    cx,
    cz,
    cpop,
    reachTick,
    comms: COMMUNITIES,
    terrain,
    metricComms: result.metrics.communities ?? [],
    metricPeople: result.metrics.people ?? [],
    totalPeople,
  };
}

// ================================================================= the playhead
// The canvas writes here once per frame; the DOM overlay reads it in its own rAF. Neither
// ever calls setState inside a frame loop.

const PLAY = {
  t: 0,
  n: 0,
  lx: new Float32Array(16),
  ly: new Float32Array(16),
  comms: new Int32Array(16),
  people: new Float32Array(16),
  lost: 0,
  lostPeople: 0,
  totalPeople: 1,
};

// ================================================================= shaders

const CLAIM_VERT = /* glsl */ `
  attribute float aBirth;
  attribute float aMag;
  attribute vec3  aTint;
  uniform float uT, uSize, uScale, uMemBase, uMemTau, uSizeMul;
  varying vec3  vTint;
  varying float vFresh;
  varying float vAlpha;
  void main() {
    float age = uT - aBirth;
    vTint = aTint;
    if (age < 0.0) { vAlpha = 0.0; vFresh = 0.0; gl_PointSize = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    float grow  = clamp(age / 5.0, 0.0, 1.0);
    float fresh = exp(-age / 7.0);
    vFresh = fresh;
    vAlpha = (uMemBase + (1.0 - uMemBase) * exp(-age / uMemTau)) * (0.34 + 0.66 * aMag);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float s = uSize * uSizeMul * (0.5 + 0.5 * grow) * (1.0 + fresh * 1.1) * uScale / max(0.001, -mv.z);
    gl_PointSize = min(s, 230.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const CLAIM_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform vec3  uHot;
  varying vec3  vTint;
  varying float vFresh;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.4);
    vec3 c = mix(vTint, uHot, vFresh * 0.5);
    gl_FragColor = vec4(c * (glow * 1.5 + core * 0.22) * uOpacity * vAlpha, uOpacity * vAlpha * core);
  }
`;

const THREAD_VERT = /* glsl */ `
  attribute float aBirth;
  attribute float aU;
  attribute float aState;
  uniform float uT, uRise, uSize, uScale, uMemBase, uMemTau, uSizeMul;
  varying float vNear;
  varying float vState;
  varying float vAlpha;
  void main() {
    float age = uT - aBirth;
    vState = aState;
    if (age < 0.0) { vAlpha = 0.0; vNear = 0.0; gl_PointSize = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    float head  = clamp(age / uRise, 0.0, 1.0);
    float near  = exp(-abs(aU - head) * 9.0);
    float trail = aU <= head ? (uMemBase + (1.0 - uMemBase) * exp(-age / uMemTau)) * 0.5 : 0.0;
    float burn  = aState > 0.5 ? exp(-age / 14.0) : 1.0;
    vAlpha = (near + trail * (1.0 - aState)) * burn;
    vNear = near;
    if (vAlpha < 0.004) { gl_PointSize = 0.0; gl_Position = vec4(2.0,2.0,2.0,1.0); return; }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(uSize * uSizeMul * (0.55 + near * 1.5) * uScale / max(0.001, -mv.z), 180.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const THREAD_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform vec3  uCool;
  uniform vec3  uEmber;
  varying float vNear;
  varying float vState;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);
    vec3 c = mix(uCool, uEmber, vState);
    gl_FragColor = vec4(c * (glow * 1.9 + core * 0.35) * uOpacity * vAlpha, uOpacity * vAlpha * core);
  }
`;

const PEOPLE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uScale, uSize;
  varying float vSh;
  void main() {
    vSh = 0.72 + 0.28 * sin(uTime * 1.1 + aSeed * 37.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(uSize * uScale / max(0.001, -mv.z), 60.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const PEOPLE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  uniform vec3  uCol;
  varying float vSh;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uCol * (pow(core, 3.0) * 1.5 + core * 0.4) * vSh * uOpacity, uOpacity * core * vSh);
  }
`;

/**
 * The slab itself. A filled sheet of faint light with its OWN grid drawn on it — the grid is
 * the abstraction, not decoration: the ground's mesh is a weave you cannot resolve, the top
 * slab's is nine cells you could count out loud.
 */
const SLAB_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const SLAB_FRAG = /* glsl */ `
  precision highp float;
  uniform vec2  uRes;
  uniform vec3  uTint;
  uniform float uGrid;
  uniform float uBody;
  uniform float uRim;
  varying vec2  vUv;
  varying float vDepth;
  void main() {
    vec2 g = fract(vUv * uRes);
    vec2 dd = min(g, 1.0 - g);
    float lw = 0.055;
    float line = 1.0 - smoothstep(0.0, lw, min(dd.x, dd.y));

    vec2 e = min(vUv, 1.0 - vUv);
    float em = min(e.x, e.y);
    float edge = 1.0 - smoothstep(0.0, 0.006, em);
    float rimGlow = exp(-em * 13.0);

    float soft = 0.45 + 0.55 * exp(-em * 3.4);
    float body = uBody * (0.55 + 0.85 * rimGlow) * soft;
    float haze = 0.60 + 0.40 * smoothstep(0.0, 0.6, vUv.y);

    vec3 col = uTint * (body * haze + line * uGrid) + uTint * edge * uRim
             + uTint * rimGlow * 0.09;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** the ground alone still has terrain. Nothing above it does — that is what was lost first. */
const TERRAIN_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec3  uTint;
  uniform vec3  uCool;
  uniform float uAmt;
  varying vec2  vUv;
  varying float vDepth;
  void main() {
    vec4 s = texture2D(uMap, vUv);
    float e = s.r;          // elevation
    float p = s.g;          // passable
    float pop = s.b;        // people density
    float relief = pow(clamp(e, 0.0, 1.0), 2.6);
    float band = abs(fract(e * 22.0) - 0.5);
    float contour = smoothstep(0.40, 0.5, band);
    vec3 col = uTint * (0.10 + relief * 0.85 + contour * 0.16);
    col += uTint * (1.0 - p) * 0.70;                 // ridge and flooded channel
    col += uCool * pop * 0.55;                       // the crowd's own glow
    gl_FragColor = vec4(col * uAmt, 1.0);
  }
`;

/** a settlement's column of light, exactly as tall as the highest slab that still holds it */
const SHAFT_VERT = /* glsl */ `
  attribute vec3 aTint;
  varying vec3  vTint;
  varying float vY;
  varying float vF;
  void main() {
    vTint = aTint;
    vY = position.y;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 nrm = normalize(mat3(instanceMatrix) * normal);
    vec3 vw = normalize(-mv.xyz);
    vF = 1.0 - abs(dot(normalize(normalMatrix * nrm), vw));
    gl_Position = projectionMatrix * mv;
  }
`;

const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying vec3  vTint;
  varying float vY;
  varying float vF;
  void main() {
    float grad = 0.30 + 0.70 * pow(clamp(vY, 0.0, 1.0), 1.6);
    float rim = pow(clamp(vF, 0.0, 1.0), 1.7);
    gl_FragColor = vec4(vTint * rim * grad * uOpacity, 1.0);
  }
`;

// ================================================================= the world

const SC_V = new THREE.Vector3();
const SC_M = new THREE.Matrix4();
const SC_Q = new THREE.Quaternion();
const SC_S = new THREE.Vector3();

function World({ result }: { result: SimResult }) {
  const view = useMemo(() => buildView(result), [result]);
  const { n, ticks, slabs } = view;
  const ax = useAxisRef();
  const camera = useThree((s) => s.camera);
  const clock = useRef(0);

  // ---- camera: a raking angle, low enough that you look INTO the stack, not down on it
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.fov = CAM.fov;
    c.near = 0.1;
    c.far = 90;
    c.position.set(GROUP_X, CAM.dist * Math.sin(CAM.elev), CAM.dist * Math.cos(CAM.elev));
    c.lookAt(GROUP_X, 0.15, 0);
    c.updateProjectionMatrix();
  }, [camera]);

  // ---- geometry, built once from the log
  const claimGeos = useMemo(
    () =>
      slabs.map((s) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(s.cp, 3));
        g.setAttribute("aBirth", new THREE.BufferAttribute(s.cb, 1));
        g.setAttribute("aMag", new THREE.BufferAttribute(s.cm, 1));
        g.setAttribute("aTint", new THREE.BufferAttribute(s.cc, 3));
        return g;
      }),
    [slabs],
  );

  const threadGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(view.tp, 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(view.tb, 1));
    g.setAttribute("aU", new THREE.BufferAttribute(view.tu, 1));
    g.setAttribute("aState", new THREE.BufferAttribute(view.ts, 1));
    return g;
  }, [view]);

  const peopleGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(view.pp, 3));
    const sd = new Float32Array(view.pn);
    const r = makeRng((result.seed ^ 0x53484d52) >>> 0);
    for (let i = 0; i < view.pn; i++) sd[i] = r();
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    return g;
  }, [view, result.seed]);

  // ---- materials
  const mkClaim = (mul: number, op: number) =>
    new THREE.ShaderMaterial({
      vertexShader: CLAIM_VERT,
      fragmentShader: CLAIM_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 },
        uSize: { value: 0.05 },
        uSizeMul: { value: mul },
        uScale: { value: 900 },
        uMemBase: { value: 0.3 },
        uMemTau: { value: 90 },
        uOpacity: { value: op },
        uHot: { value: new THREE.Vector3(1, 1, 1) },
      },
    });

  const claimCore = useMemo(() => slabs.map(() => mkClaim(1.0, 0.95)), [slabs]);
  const claimHalo = useMemo(() => slabs.map(() => mkClaim(2.1, 0.10)), [slabs]);

  const threadCore = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: THREAD_VERT,
        fragmentShader: THREAD_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uT: { value: 0 },
          uRise: { value: 9 },
          uSize: { value: 0.045 },
          uSizeMul: { value: 1 },
          uScale: { value: 900 },
          uMemBase: { value: 0.12 },
          uMemTau: { value: 60 },
          uOpacity: { value: 0.9 },
          uCool: { value: new THREE.Vector3(...P.coolV) },
          uEmber: { value: new THREE.Vector3(...P.emberV) },
        },
      }),
    [],
  );
  const threadHalo = useMemo(() => {
    const m = threadCore.clone();
    m.uniforms.uSizeMul.value = 3.4;
    m.uniforms.uOpacity.value = 0.16;
    return m;
  }, [threadCore]);

  const peopleCore = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PEOPLE_VERT,
        fragmentShader: PEOPLE_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: 900 },
          uSize: { value: 0.016 },
          uOpacity: { value: 0.85 },
          uCol: { value: new THREE.Vector3(...P.peopleV) },
        },
      }),
    [],
  );
  const peopleHalo = useMemo(() => {
    const m = peopleCore.clone();
    m.uniforms.uSize.value = 0.062;
    m.uniforms.uOpacity.value = 0.1;
    return m;
  }, [peopleCore]);

  const slabMats = useMemo(
    () =>
      slabs.map((s, L) => {
        const fine = Math.max(s.gw, 1);
        return new THREE.ShaderMaterial({
          vertexShader: SLAB_VERT,
          fragmentShader: SLAB_FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uRes: { value: new THREE.Vector2(s.gw, s.gh) },
            uTint: { value: new THREE.Vector3(0.20, 0.50, 0.62) },
            uGrid: { value: Math.min(0.38, 22 / fine) * (0.6 + 0.4 * (L / Math.max(1, n - 1))) },
            uBody: { value: 0.115 },
            uRim: { value: 1.05 },
          },
        });
      }),
    [slabs, n],
  );

  const terrainMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SLAB_VERT,
        fragmentShader: TERRAIN_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uMap: { value: view.terrain },
          uTint: { value: new THREE.Vector3(0.17, 0.42, 0.55) },
          uCool: { value: new THREE.Vector3(...P.coolV) },
          uAmt: { value: 1 },
        },
      }),
    [view.terrain],
  );

  const shaftGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.040, 0.066, 1, 12, 1, true);
    g.translate(0, 0.5, 0);
    const tint = new Float32Array(COMMUNITIES * 3);
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    return g;
  }, []);
  const shaftMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uOpacity: { value: 0.62 } },
      }),
    [],
  );

  const capGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COMMUNITIES * 3), 3));
    g.setAttribute("aBirth", new THREE.BufferAttribute(new Float32Array(COMMUNITIES), 1));
    g.setAttribute("aU", new THREE.BufferAttribute(new Float32Array(COMMUNITIES), 1));
    g.setAttribute("aState", new THREE.BufferAttribute(new Float32Array(COMMUNITIES).fill(1), 1));
    return g;
  }, []);
  const capMat = useMemo(() => {
    const m = threadCore.clone();
    m.uniforms.uSizeMul.value = 4.6;
    m.uniforms.uOpacity.value = 1.0;
    m.uniforms.uMemBase.value = 1;
    m.uniforms.uRise.value = 1;
    return m;
  }, [threadCore]);

  const shaftRef = useRef<THREE.InstancedMesh>(null);
  /** eased shaft heights so a settlement climbing a slab is a rise, not a pop */
  const reachY = useMemo(() => new Float32Array(COMMUNITIES), []);

  useEffect(
    () => () => {
      claimGeos.forEach((g) => g.dispose());
      threadGeo.dispose();
      peopleGeo.dispose();
      capGeo.dispose();
      shaftGeo.dispose();
      claimCore.forEach((m) => m.dispose());
      claimHalo.forEach((m) => m.dispose());
      slabMats.forEach((m) => m.dispose());
      threadCore.dispose();
      threadHalo.dispose();
      peopleCore.dispose();
      peopleHalo.dispose();
      terrainMat.dispose();
      shaftMat.dispose();
      capMat.dispose();
      view.terrain.dispose();
    },
    [
      claimGeos, threadGeo, peopleGeo, capGeo, shaftGeo, claimCore, claimHalo, slabMats,
      threadCore, threadHalo, peopleCore, peopleHalo, terrainMat, shaftMat, capMat, view,
    ],
  );

  useEffect(() => {
    PLAY.n = n;
    PLAY.totalPeople = view.totalPeople;
    if (PLAY.lx.length < n) {
      PLAY.lx = new Float32Array(n);
      PLAY.ly = new Float32Array(n);
      PLAY.comms = new Int32Array(n);
      PLAY.people = new Float32Array(n);
    }
  }, [n, view.totalPeople]);

  const topY = (n - 1) / 2 * GAP;
  const botY = -topY;

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const A = ax.current;
    clock.current += d * TICKS_PER_SEC * A.tempo;
    const tf = clock.current % ticks;
    const t = Math.floor(tf);

    // memory governs how much of an old mark is still lit — the world remembers
    const memBase = 0.10 + 0.62 * A.memory;
    const memTau = 14 + 420 * A.memory;
    const projScale = (state.size.height * state.viewport.dpr) / (2 * Math.tan((CAM.fov * Math.PI) / 360));

    for (let L = 0; L < n; L++) {
      const a = claimCore[L].uniforms;
      const b = claimHalo[L].uniforms;
      // A dot is drawn at the size of the cell it stands for — one mark on the top slab really
      // is that much ground. Sub-linear, because at true cell size the coarse slabs' marks
      // overlap into a solid sheet and the emptiness stops being visible, which is the point.
      const cw = 1.62 * Math.pow(1 / Math.max(1, slabs[L].gw), 0.62);
      a.uT.value = tf;
      a.uSize.value = cw;
      a.uScale.value = projScale;
      a.uMemBase.value = memBase;
      a.uMemTau.value = memTau;
      b.uT.value = tf;
      b.uSize.value = cw;
      b.uScale.value = projScale;
      b.uMemBase.value = memBase;
      b.uMemTau.value = memTau;
    }
    threadCore.uniforms.uT.value = tf;
    threadCore.uniforms.uScale.value = projScale;
    threadCore.uniforms.uMemBase.value = memBase * 0.4;
    threadCore.uniforms.uMemTau.value = memTau;
    threadHalo.uniforms.uT.value = tf;
    threadHalo.uniforms.uScale.value = projScale;
    threadHalo.uniforms.uMemBase.value = memBase * 0.4;
    threadHalo.uniforms.uMemTau.value = memTau;
    peopleCore.uniforms.uTime.value = state.clock.elapsedTime;
    peopleCore.uniforms.uScale.value = projScale;
    peopleHalo.uniforms.uTime.value = state.clock.elapsedTime;
    peopleHalo.uniforms.uScale.value = projScale;
    capMat.uniforms.uT.value = tf;
    capMat.uniforms.uScale.value = projScale;

    // ---- shafts: each settlement's column reaches the highest slab that still holds it
    const mesh = shaftRef.current;
    const tint = shaftGeo.getAttribute("aTint") as THREE.BufferAttribute;
    const ta = tint.array as Float32Array;
    const cpos = capGeo.getAttribute("position") as THREE.BufferAttribute;
    const cposA = cpos.array as Float32Array;
    const cst = capGeo.getAttribute("aState") as THREE.BufferAttribute;
    const cstA = cst.array as Float32Array;
    const cbi = capGeo.getAttribute("aU") as THREE.BufferAttribute;
    const cbiA = cbi.array as Float32Array;
    let lost = 0;
    let lostPeople = 0;
    for (let c = 0; c < COMMUNITIES; c++) {
      let top = -1;
      for (let L = 0; L < n; L++) {
        const rt = view.reachTick[L * COMMUNITIES + c];
        if (rt >= 0 && rt <= t) top = L;
        else break;
      }
      const wantY = top < 0 ? botY : botY + top * GAP;
      reachY[c] = damp(reachY[c], wantY, 4.5, d);
      const h = Math.max(0.001, reachY[c] - botY);
      const full = top >= n - 1;
      if (!full) {
        lost++;
        lostPeople += view.cpop[c];
      }
      if (mesh) {
        SC_V.set(view.cx[c], botY, view.cz[c]);
        SC_S.set(1, h, 1);
        SC_M.compose(SC_V, SC_Q, SC_S);
        mesh.setMatrixAt(c, SC_M);
      }
      const col = full ? P.coolV : P.emberV;
      const dim = full ? 1 : 0.85;
      ta[c * 3] = col[0] * dim;
      ta[c * 3 + 1] = col[1] * dim;
      ta[c * 3 + 2] = col[2] * dim;
      // the cap sits on top of the column: cool if it made it all the way, ember if it stopped
      cposA[c * 3] = view.cx[c];
      cposA[c * 3 + 1] = reachY[c];
      cposA[c * 3 + 2] = view.cz[c];
      cstA[c] = full ? 0 : 1;
      cbiA[c] = 0;
    }
    if (mesh) mesh.instanceMatrix.needsUpdate = true;
    tint.needsUpdate = true;
    cpos.needsUpdate = true;
    cst.needsUpdate = true;
    cbi.needsUpdate = true;

    // ---- the numbers the overlay reads
    PLAY.t = t;
    PLAY.lost = lost;
    PLAY.lostPeople = lostPeople;
    for (let L = 0; L < n; L++) {
      PLAY.comms[L] = view.metricComms[L]?.[t] ?? 0;
      PLAY.people[L] = view.metricPeople[L]?.[t] ?? 0;
      SC_V.set(GROUP_X - PLANE_W / 2 - 0.10, slabs[L].y, 0).project(state.camera);
      PLAY.lx[L] = SC_V.x * 0.5 + 0.5;
      PLAY.ly[L] = -SC_V.y * 0.5 + 0.5;
    }
  });

  return (
    <group>
      {/* Camera control. The useLayoutEffect above sets the opening framing ONCE on mount, so
          the scene still loads on the raking angle it was composed for and these controls simply
          take over from there — drag to orbit, scroll to zoom, right-drag to pan. */}
      <OrbitControls
        makeDefault
        target={[GROUP_X, 0.15, 0]}
        enableDamping
        dampingFactor={0.07}
        minDistance={4}
        maxDistance={44}
        maxPolarAngle={Math.PI * 0.92}
        zoomSpeed={0.75}
      />
      {/* the substrates */}
      {slabs.map((s, L) => (
        <group key={L} position={[GROUP_X, s.y, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} material={slabMats[L]}>
            <planeGeometry args={[PLANE_W, PLANE_D, 1, 1]} />
          </mesh>
          {L === 0 && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} material={terrainMat}>
              <planeGeometry args={[PLANE_W, PLANE_D, 1, 1]} />
            </mesh>
          )}
        </group>
      ))}

      {/* the columns — a settlement's own light, as high as anyone still sees it */}
      <instancedMesh
        ref={shaftRef}
        args={[shaftGeo, shaftMat, COMMUNITIES]}
        frustumCulled={false}
      />

      {/* the crossings */}
      <points geometry={threadGeo} material={threadHalo} frustumCulled={false} />
      <points geometry={threadGeo} material={threadCore} frustumCulled={false} />

      {/* the somebodies */}
      <points geometry={peopleGeo} material={peopleHalo} frustumCulled={false} />
      <points geometry={peopleGeo} material={peopleCore} frustumCulled={false} />

      {/* the networks each slab grew for itself */}
      {slabs.map((_s, L) => (
        <group key={`c${L}`}>
          <points geometry={claimGeos[L]} material={claimHalo[L]} frustumCulled={false} />
          <points geometry={claimGeos[L]} material={claimCore[L]} frustumCulled={false} />
        </group>
      ))}

      {/* where a column stops */}
      <points geometry={capGeo} material={capMat} frustumCulled={false} />
    </group>
  );
}

// ================================================================= what you read
// Plain DOM over the canvas. Real type at a real size — nothing a viewer must read is baked
// into WebGL at nine pixels.

const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const fmt = (x: number) => Math.round(x).toLocaleString("en-US");

function Overlay({ result }: { result: SimResult }) {
  const n = result.worlds.length;
  const ax = useAxes();
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cntRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const popRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const lostRef = useRef<HTMLSpanElement>(null);
  const lostPplRef = useRef<HTMLSpanElement>(null);

  const names = useMemo(() => {
    const out: Array<{ name: string; gloss: string }> = [];
    for (let L = 0; L < n; L++) {
      const e = result.events.find((v) => v.kind === "slab" && v.w === L);
      const d = (e?.d ?? {}) as Record<string, string>;
      out.push({ name: String(d.name ?? ""), gloss: String(d.gloss ?? "") });
    }
    return out;
  }, [result, n]);

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (PLAY.t === last) return;
      last = PLAY.t;
      for (let L = 0; L < n; L++) {
        const el = rowRefs.current[L];
        if (el) {
          el.style.left = `${PLAY.lx[L] * 100}%`;
          el.style.top = `${PLAY.ly[L] * 100}%`;
        }
        const c = cntRefs.current[L];
        if (c) c.textContent = String(PLAY.comms[L]);
        const p = popRefs.current[L];
        if (p) p.textContent = fmt(PLAY.people[L]);
      }
      if (lostRef.current) lostRef.current.textContent = String(PLAY.lost);
      if (lostPplRef.current) lostPplRef.current.textContent = fmt(PLAY.lostPeople);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);

  const wide = ax.intervention > 0.5;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        color: "#fff",
        fontFamily: FONT,
      }}
    >
      <style>{`
        input[type=range].st-lever {
          -webkit-appearance: none; appearance: none;
          height: 3px; background: #1e2a31; outline: none; accent-color: ${P.ember};
        }
        input[type=range].st-lever::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 13px; height: 13px; border-radius: 50%;
          background: ${P.ember}; cursor: pointer; border: none;
        }
        input[type=range].st-lever::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%;
          background: ${P.ember}; cursor: pointer; border: none;
        }
      `}</style>

      <div style={{ position: "absolute", left: 44, top: 38, maxWidth: 430 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          The Strata
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 600, lineHeight: 1.4, marginTop: 12, opacity: 0.95 }}>
          Watch exactly where real people fall out of the picture on their way to the person
          who decides.
        </div>
      </div>

      <div style={{ position: "absolute", left: 44, bottom: 34, maxWidth: 356 }}>
        <div style={{ fontSize: 13, lineHeight: 1.55, opacity: 0.55 }}>
          After a disaster, a fleet of AI agents summarizes this territory upward, and each
          slab grows as its own living network — slime mould, fungal threads, swarming cells.
          The climbing sparks are the agents' reports. Every orange ember is a report that
          burned out on the way up, and a settlement's column stops where the fleet lost
          track of it.
        </div>
      </div>

      {/* one line per slab, pinned to its own left edge */}
      {Array.from({ length: n }, (_, L) => (
        <div
          key={L}
          ref={(el) => {
            rowRefs.current[L] = el;
          }}
          style={{
            position: "absolute",
            transform: "translate(-100%, -50%)",
            textAlign: "right",
            width: 224,
            paddingRight: 13,
            lineHeight: 1.4,
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.15em" }}>
            {names[L]?.name}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.42, marginTop: 2 }}>{names[L]?.gloss}</div>
          <div style={{ fontSize: 11.5, opacity: 0.72, marginTop: 4 }}>
            <span
              ref={(el) => {
                cntRefs.current[L] = el;
              }}
            >
              0
            </span>
            {" of "}
            {COMMUNITIES} settlements ·{" "}
            <span
              ref={(el) => {
                popRefs.current[L] = el;
              }}
            >
              0
            </span>
            {" people"}
          </div>
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          left: 380,
          right: 60,
          bottom: 30,
          textAlign: "center",
          fontSize: 16.5,
          lineHeight: 1.5,
        }}
      >
        <span ref={lostRef} style={{ color: P.ember, fontWeight: 700 }}>
          0
        </span>
        <span style={{ opacity: 0.82 }}> settlements — </span>
        <span ref={lostPplRef} style={{ color: P.ember, fontWeight: 700 }}>
          0
        </span>
        <span style={{ opacity: 0.82 }}>
          {" "}people — never reach the top slab. Their columns stop where the fleet stopped
          carrying them.
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          right: 44,
          top: 40,
          width: 268,
          pointerEvents: "auto",
          textAlign: "right",
        }}
      >
        <div style={{ fontSize: 11.5, opacity: 0.45, marginBottom: 10, letterSpacing: "0.05em" }}>
          HOW MUCH DETAIL SURVIVES EACH STEP UP
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={ax.intervention}
          onChange={(e) => ax.set({ intervention: parseFloat(e.target.value) })}
          className="st-lever"
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 7 }}>
          <span style={{ opacity: wide ? 0.3 : 0.85 }}>almost none</span>
          <span style={{ opacity: wide ? 0.85 : 0.3 }}>nearly all</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 16, opacity: 0.5 }}>
          Nothing else moves — same ground, same people, same living growth rules, same grids. Slide
          right and the upper slabs fill back in. Slide left and they empty while the ground
          stays exactly as full as it was.
        </div>
      </div>
    </div>
  );
}

register({
  code: "the-strata-plain",
  title: "The Strata, in plain words",
  question:
    "After a disaster, a fleet of AI agents summarizes one territory five times over, and each summary layer grows like a living network. Which settlements survive every step up, and which disappear on the way?",
  surface: "how much detail survives each upward crossing",
  heroImage:
    "A stack of translucent slabs hanging in the dark, seen at a raking angle so you look into the stack. The bottom slab is the full world, dense with people and five different growth networks. Each slab above holds less. Sparks climb between them where a report survived the crossing and burn out in ember where it did not, and each settlement's column of light stops at the highest slab that still holds it — so a community lit on the ground has a hole where it should be three slabs up.",
  kernel,
  World,
  Overlay,
  camera: { position: [GROUP_X, CAM.dist * Math.sin(CAM.elev), CAM.dist * Math.cos(CAM.elev)], fov: CAM.fov },
  defaultN: 5,
});
