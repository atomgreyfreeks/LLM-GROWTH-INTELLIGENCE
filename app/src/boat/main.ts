/**
 * THE BOAT — the doubt tax, as one instrument.
 *
 * The same storm over the same coast, twice. The left desk ("ONE MAP") fuses its two
 * witnesses into a single confident belief and its boat commits in long clean arcs.
 * The right desk ("GO AND LOOK") keeps the witnesses apart, and whenever they disagree
 * past the registered threshold the boat flies out to verify before it rescues. The
 * storm makes the witnesses disagree most exactly where rescue matters most, so the
 * right sea fills with ember doubled-back wakes — rescue time burned on doubt.
 *
 * NOTHING HERE IS SIMULATED. This page is a consumer of `/boat-log.json`, the baked
 * event log of seed 3 / STORMY. Every settlement, storm cell, witness curtain, boat
 * leg, ember scribble and number on screen is read out of that log: `world` for the
 * coast and the bodies, `storm` for the blooms, `sat`/`call` for the witnesses,
 * `commit`/`probe`/`arrive` for the boat, `need` for the truth, `metrics` for the
 * counts. There is no need model, no fusion rule, no policy anywhere in this file.
 *
 * Determinism: every frame is a pure function of ONE number, `tickTime`. Boat position
 * is an arc-length lookup on paths precomputed from event pairs, curtains and shimmer
 * are table lookups, residue is an additive replay of ticks 0..t. No unseeded random
 * source and no wall clock is allowed anywhere near the frame; grep this file and see.
 */
import * as THREE from "three";

// ------------------------------------------------------------------ constants of the piece
const MAPW = 4.9;            // world units across the map's x in [0,1]
const MAPD = 3.55;           // world units per map y (depth scale)
const PLANE_D = 5.6;         // the sea plane runs past the map so no seam shows
const YMID = 0.44;           // map y that lands on world Z = 0
const RES_W = 320, RES_H = 208;   // sea residue texture
const PART_MAX = 900;
const WAKE_N = 52;           // wake samples trailing the boat
const CURT_M = 144;          // curtain samples across the coast

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const el = (id: string) => document.getElementById(id)!;
const commas = (n: number) => Math.round(n).toLocaleString("en-US");

// map [0,1]^2 → world XZ (land = larger map y = negative Z, far side)
const WX = (x: number) => (x - 0.5) * MAPW;
const WZ = (y: number) => (YMID - y) * MAPD;

// ------------------------------------------------------------------ the log, verbatim
interface EvWorld { e: "world"; settlements: { i: number; x: number; y: number; pop: number }[];
  coast: [number, number][] }
interface EvStorm { e: "storm"; t: number; cells: { x: number; y: number; r: number; k: number }[] }
interface EvNeed { e: "need"; t: number; vals: number[] }
interface EvSat { e: "sat"; t: number; i: number; v: number; stale?: number }
interface EvCall { e: "call"; t: number; i: number; v: number }
interface EvCommit { e: "commit"; t: number; i: number; expected: number | null; disagreement: number }
interface EvProbe { e: "probe"; t: number; i: number; found: number }
interface EvArrive { e: "arrive"; t: number; i: number; found: number; rescued: number; empty?: number }
type Ev = EvWorld | EvStorm | EvNeed | EvSat | EvCall | EvCommit | EvProbe | EvArrive;

interface Metrics {
  peopleRescued: number; unmetPT: number; stormShare: number; emptyWater: number;
  halfEmpty: number; commitsRescue: number; probes: number; probesChanged: number;
  rescueLat: number;
}
interface RawArm { arm: string; metrics: Metrics; logHash: string; obsHash: string; events: Ev[] }
interface Log {
  generated: string; seed: number; regime: string; theta: number;
  boat: { speed: number; rescueTicks: number; rescuePerTick: number };
  arms: RawArm[];
}

/** One boat mission, paired from a `commit` event and its completing `probe`/`arrive`. */
interface Leg {
  t0: number; t1: number; i: number; probe: boolean;
  pts: Float32Array;     // [n*2] world X,Z along the path
  cum: Float32Array;     // arc length prefix, cum[n-1] = total
}

interface Arm {
  raw: RawArm;
  legs: Leg[];
  arrives: EvArrive[]; probes: EvProbe[]; commits: EvCommit[];
  satV: Float32Array; satFresh: Uint8Array;      // [t*S+i]
  callV: Float32Array; callSeen: Uint8Array; callSeenF: Float32Array; callFresh: Uint8Array;
  needV: Float32Array;
  cumRescued: Float32Array;                       // [t] calibrated to metrics at T-1
  cumProbes: Int16Array; cumChanged: Int16Array;  // [t]
  // residue — the sea remembers
  ash: Float32Array; cool: Float32Array; resData: Uint8Array; resTex: THREE.DataTexture;
  resTick: number; resDirty: boolean;
  // scene
  scene: THREE.Scene;
  bodyGeo: THREE.BufferGeometry; bodySize: Float32Array; bodyAlpha: Float32Array;
  bodyCol: Float32Array; bodyPos: Float32Array;
  curtGeo: THREE.BufferGeometry; curtPos: Float32Array; curtCol: Float32Array;
  arcGeo: THREE.BufferGeometry; arcPos: Float32Array; arcCol: Float32Array;
  wakeGeo: THREE.BufferGeometry; wkPos: Float32Array; wkSize: Float32Array;
  wkAlpha: Float32Array; wkCol: Float32Array;
  partGeo: THREE.BufferGeometry; pPos: Float32Array; pSize: Float32Array;
  pAlpha: Float32Array; pCol: Float32Array;
  ringGeo: THREE.BufferGeometry; rPos: Float32Array; rSize: Float32Array;
  rAlpha: Float32Array; rCol: Float32Array;
  stormMats: THREE.ShaderMaterial[]; stormMeshes: THREE.Mesh[];
  seaMat: THREE.ShaderMaterial;
  /** everything that is not sea or residue — hidden by __HERO.mask() for the covenant's
   *  "distinguishable by residue alone with the bodies masked out" probe */
  masks: THREE.Object3D[];
}

async function boot() {
  const log = await (await fetch("/boat-log.json")).json() as Log;
  const A = log.arms[0], B = log.arms[1];        // EARLY = one map, PROBE = go and look
  const world = A.events.find((e) => e.e === "world") as EvWorld;
  const S = world.settlements.length;
  const T = 240;
  const pop = world.settlements.map((s) => s.pop);
  const sx = world.settlements.map((s) => s.x);
  const sy = world.settlements.map((s) => s.y);
  const totPop = pop.reduce((a, b) => a + b, 0);
  const maxPop = Math.max(...pop);
  const bodyR = pop.map((p) => 0.052 + 0.128 * Math.sqrt(p / maxPop));

  // the coast, as a function: linear interpolation over the logged polyline
  const coast = world.coast;
  const coastY = (x: number) => {
    const u = clamp(x) * (coast.length - 1);
    const j = Math.min(coast.length - 2, Math.floor(u));
    return lerp(coast[j][1], coast[j + 1][1], u - j);
  };
  // waterfront of settlement i — where its rescue light lands on the sea
  const frontY = (i: number) => coastY(sx[i]) - 0.028;

  // storm snapshots, shared by construction (the runner asserts it; we read arm 0's)
  const stormEvs = A.events.filter((e) => e.e === "storm") as EvStorm[];
  const cellsAt = (tt: number) => {
    const u = clamp(tt / 2, 0, stormEvs.length - 1.001);
    const j = Math.floor(u), f = u - j;
    const c0 = stormEvs[j].cells, c1 = stormEvs[Math.min(stormEvs.length - 1, j + 1)].cells;
    return c0.map((c, k) => {
      let dx = c1[k].x - c.x;
      if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;   // cells wrap in x
      return { x: c.x + dx * f, y: lerp(c.y, c1[k].y, f), r: lerp(c.r, c1[k].r, f),
        k: lerp(c.k, c1[k].k, f) };
    });
  };
  // The log samples the satellite witness at every 4th settlement (each tick); those are
  // the anchors of the cold field. Calls reach all settlements, sparsely in time.
  const satIdx = [...new Set((A.events.filter((e) => e.e === "sat") as EvSat[]).map((e) => e.i))]
    .sort((a, b) => a - b);

  const stormAt = (i: number, cells: { x: number; y: number; r: number; k: number }[]) => {
    let s = 0;
    for (const c of cells) {
      const dx = sx[i] - c.x, dy = sy[i] - c.y;
      s += c.k * Math.exp(-(dx * dx + dy * dy) / (2 * c.r * c.r));
    }
    return Math.min(1, s);
  };

  // ---------------------------------------------------------------- per-arm tables
  function prep(raw: RawArm): Arm {
    const satV = new Float32Array(T * S), satFresh = new Uint8Array(T * S);
    const callV = new Float32Array(T * S), callSeen = new Uint8Array(T * S);
    const callFresh = new Uint8Array(T * S);
    const needV = new Float32Array(T * S);
    const byTick: Ev[][] = Array.from({ length: T }, () => []);
    for (const e of raw.events) if ("t" in e) byTick[(e as { t: number }).t].push(e);

    // carry-forward witness maps; the log samples 1-in-4, staleness is flagged
    const satNow = new Float32Array(S), callNow = new Float32Array(S);
    const seenNow = new Uint8Array(S);
    let needPrev: number[] | null = null, needPrevT = 0;
    let needNext: number[] | null = null, needNextT = 0;
    const needSnaps = raw.events.filter((e) => e.e === "need") as EvNeed[];
    let snapIdx = 0;
    for (let t = 0; t < T; t++) {
      for (const e of byTick[t]) {
        if (e.e === "sat") { satNow[e.i] = e.v; if (!e.stale) satFresh[t * S + e.i] = 1; }
        else if (e.e === "call") { callNow[e.i] = e.v; seenNow[e.i] = 1; callFresh[t * S + e.i] = 1; }
      }
      satV.set(satNow, t * S); callV.set(callNow, t * S);
      callSeen.set(seenNow, t * S);
      while (snapIdx < needSnaps.length && needSnaps[snapIdx].t <= t) {
        needPrev = needSnaps[snapIdx].vals; needPrevT = needSnaps[snapIdx].t;
        needNext = needSnaps[snapIdx + 1]?.vals ?? needPrev;
        needNextT = needSnaps[snapIdx + 1]?.t ?? needPrevT;
        snapIdx++;
      }
      const f = needNextT > needPrevT ? (t - needPrevT) / (needNextT - needPrevT) : 0;
      for (let i = 0; i < S; i++)
        needV[t * S + i] = lerp(needPrev![i], needNext![i], clamp(f));
    }

    // pair commits with their completing probe/arrive — the whole flight plan is in the log
    const legs: Leg[] = [];
    const seq = raw.events.filter((e) => e.e === "commit" || e.e === "probe" || e.e === "arrive") as
      (EvCommit | EvProbe | EvArrive)[];
    let px = sx.reduce((a, b) => a + b, 0) / S, py = sy.reduce((a, b) => a + b, 0) / S;
    let open: { t0: number; i: number; fx: number; fy: number } | null = null;
    for (const e of seq) {
      if (e.e === "commit") open = { t0: e.t, i: e.i, fx: px, fy: py };
      else if (open) {
        legs.push(makeLeg(open.t0, e.t, open.i, e.e === "probe", open.fx, open.fy));
        px = sx[open.i]; py = sy[open.i]; open = null;
      }
    }
    if (open) {   // the run ends mid-transit; travel time follows the logged boat config
      const d = Math.hypot(sx[open.i] - open.fx, sy[open.i] - open.fy);
      const eta = open.t0 + Math.max(1, Math.ceil(d / log.boat.speed));
      const probing = raw.arm === "PROBE" &&
        (raw.events.filter((e) => e.e === "commit") as EvCommit[])
          .find((c) => c.t === open!.t0)!.disagreement > log.theta;
      legs.push(makeLeg(open.t0, eta, open.i, probing, open.fx, open.fy));
    }

    const arrives = raw.events.filter((e) => e.e === "arrive") as EvArrive[];
    const probes = raw.events.filter((e) => e.e === "probe") as EvProbe[];
    const commits = raw.events.filter((e) => e.e === "commit") as EvCommit[];

    // live counts, calibrated so the last tick lands exactly on the log's metric
    // (per-event `rescued` values are rounded to 3 decimals in the log; the metric is
    // the unrounded truth, so the running sum is scaled by metric/sum — a display
    // calibration of ~0.01%, disclosed here)
    const cumRescued = new Float32Array(T);
    let evSum = 0;
    for (const a of arrives) evSum += a.rescued * pop[a.i];
    const factor = raw.metrics.peopleRescued / evSum;
    const cumProbes = new Int16Array(T), cumChanged = new Int16Array(T);
    for (let t = 0; t < T; t++) {
      cumRescued[t] = t ? cumRescued[t - 1] : 0;
      cumProbes[t] = t ? cumProbes[t - 1] : 0;
      cumChanged[t] = t ? cumChanged[t - 1] : 0;
      for (const a of arrives) if (a.t === t) cumRescued[t] += a.rescued * pop[a.i] * factor;
      for (const p of probes) if (p.t === t) {
        cumProbes[t]++;
        const next = commits.find((c) => c.t > p.t);
        if (next && next.i !== p.i) cumChanged[t]++;
      }
    }

    const resData = new Uint8Array(RES_W * RES_H * 4);
    const resTex = new THREE.DataTexture(resData, RES_W, RES_H, THREE.RGBAFormat);
    resTex.minFilter = resTex.magFilter = THREE.LinearFilter;

    return {
      raw, legs, arrives, probes, commits, satV, satFresh, callV, callSeen,
      callSeenF: Float32Array.from(callSeen), callFresh,
      needV, cumRescued, cumProbes, cumChanged,
      ash: new Float32Array(RES_W * RES_H), cool: new Float32Array(RES_W * RES_H),
      resData, resTex, resTick: -1, resDirty: true,
      scene: new THREE.Scene(),
    } as Arm;
  }

  /** Path of one leg in world XZ. Rescue legs bow gently seaward; verification legs
   *  overshoot the settlement and loop back — the doubling-back is the doubt made visible. */
  function makeLeg(t0: number, t1: number, i: number, probe: boolean,
    fx: number, fy: number): Leg {
    const tx = sx[i], ty = sy[i];
    const raw: number[] = [];
    const dist = Math.hypot(tx - fx, ty - fy);
    if (dist < 0.012) {
      // recommit on the spot after a fly-by: a tight loop out over the water and back
      const r = 0.045;
      const cy0 = ty - 0.02;
      for (let k = 0; k <= 40; k++) {
        const a = Math.PI * 0.5 + (k / 40) * Math.PI * 2;
        raw.push(tx + Math.cos(a) * r * 0.8, cy0 - r + Math.sin(a) * r);
      }
    } else {
      // control point pushed seaward (smaller map y): the bow of the arc
      let nx = ty - fy, ny = -(tx - fx);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      if (ny > 0) { nx = -nx; ny = -ny; }
      const bow = 0.26 * dist + 0.02;
      const cx = (fx + tx) / 2 + nx * bow, cy = (fy + ty) / 2 + ny * bow;
      const endX = probe ? tx + ((tx - fx) / dist) * 0.10 : tx;
      const endY = probe ? ty + ((ty - fy) / dist) * 0.10 - 0.025 : ty;
      for (let k = 0; k <= 40; k++) {
        const u = k / 40, v = 1 - u;
        raw.push(v * v * fx + 2 * v * u * cx + u * u * endX,
          v * v * fy + 2 * v * u * cy + u * u * endY);
      }
      if (probe) {
        // the loop back onto the settlement — a low verification pass, not a landing
        const ox = raw[raw.length - 2], oy = raw[raw.length - 1];
        const lx = (ox + tx) / 2, ly = Math.min(oy, ty) - 0.075;
        for (let k = 1; k <= 22; k++) {
          const u = k / 22, v = 1 - u;
          raw.push(v * v * ox + 2 * v * u * lx + u * u * tx,
            v * v * oy + 2 * v * u * ly + u * u * ty);
        }
      }
    }
    const n = raw.length / 2;
    const pts = new Float32Array(n * 2);
    const cum = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      pts[k * 2] = WX(raw[k * 2]); pts[k * 2 + 1] = WZ(raw[k * 2 + 1]);
      if (k) cum[k] = cum[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2],
        pts[k * 2 + 1] - pts[k * 2 - 1]);
    }
    return { t0, t1, i, probe, pts, cum };
  }

  const arms = [prep(A), prep(B)];

  /** Where the boat is at tickTime — pure lookup, arc-length parameterized. */
  function boatState(arm: Arm, tt: number): { x: number; z: number; leg: Leg | null; u: number } {
    const legs = arm.legs;
    let last: Leg | null = null;
    for (const L of legs) {
      if (tt < L.t0) break;
      if (tt <= L.t1) {
        const u = ease(clamp((tt - L.t0) / Math.max(1e-6, L.t1 - L.t0)));
        const target = u * L.cum[L.cum.length - 1];
        let lo = 0, hi = L.cum.length - 1;
        while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (L.cum[m] < target) lo = m; else hi = m; }
        const f = (target - L.cum[lo]) / Math.max(1e-6, L.cum[hi] - L.cum[lo]);
        return { x: lerp(L.pts[lo * 2], L.pts[hi * 2], f),
          z: lerp(L.pts[lo * 2 + 1], L.pts[hi * 2 + 1], f), leg: L, u };
      }
      last = L;
    }
    if (last) return { x: WX(sx[last.i]), z: WZ(sy[last.i]), leg: null, u: 0 };
    const cx = sx.reduce((a, b) => a + b, 0) / S, cy = sy.reduce((a, b) => a + b, 0) / S;
    return { x: WX(cx), z: WZ(cy), leg: null, u: 0 };
  }

  // ---------------------------------------------------------------- shared materials
  const POINT_V = `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uPix; uniform float uSizeMul; uniform float uGain;
    varying vec3 vCol; varying float vA;
    void main(){
      vCol = aColor; vA = aAlpha * uGain;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(aSize * uSizeMul * uPix / max(0.02, -mv.z), 1.0, 420.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const POINT_F = `
    uniform float uPow; uniform float uWhite; uniform float uRing;
    varying vec3 vCol; varying float vA;
    void main(){
      float r = min(1.0, length(gl_PointCoord - 0.5) * 2.0);
      float a = uRing > 0.5
        ? exp(-pow((r - 0.74) * 11.0, 2.0))
        : pow(1.0 - r, uPow);
      a *= vA;
      if (a <= 0.003) discard;
      gl_FragColor = vec4(mix(vCol, vec3(1.0), uWhite) * a, a);
    }`;
  const allPointMats: THREE.ShaderMaterial[] = [];
  const mkPoint = (pow: number, sizeMul: number, gain: number, white: number, ring = 0) => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uPix: { value: 400 }, uSizeMul: { value: sizeMul }, uGain: { value: gain },
        uPow: { value: pow }, uWhite: { value: white }, uRing: { value: ring },
      },
      vertexShader: POINT_V, fragmentShader: POINT_F,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    allPointMats.push(m);
    return m;
  };

  /** tapered stroke profile — wakes, arcs and threads are light, never 1px combs */
  function taperTex(): THREE.DataTexture {
    const N = 128, d = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1;
      const v = Math.exp(-x * x * 3.1) * 0.42 + Math.exp(-x * x * 26) * 0.72;
      const c = clamp(v, 0, 1) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, 1, THREE.RGBAFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  }
  const TAPER = taperTex();

  // ---------------------------------------------------------------- build one panel
  const SIG: [number, number, number] = [0.49, 0.976, 1.0];    // the cold signal
  const EMB: [number, number, number] = [1.0, 0.482, 0.235];   // the burn
  const WARM: [number, number, number] = [0.84, 0.70, 0.53];   // phoned-in word: warm grey
  const WHITE = [0.88, 0.97, 1.0] as const;

  const SEA_V = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  const SEA_F = `
    uniform float uT; uniform sampler2D uRes; uniform float uGain;
    varying vec2 vUv;
    void main(){
      // black depth with the faintest swell — the sea is material, not paper
      float depth = 1.0 - vUv.y;                 // plane v=1 is the far (land) edge
      vec3 col = mix(vec3(0.005,0.011,0.022), vec3(0.016,0.034,0.056), depth);
      float sw = sin(vUv.x*52.0 + uT*0.50 + sin(vUv.y*34.0 - uT*0.31)*2.0)
               * sin(vUv.y*44.0 - uT*0.36 + sin(vUv.x*23.0 + uT*0.22)*1.6);
      float sw2 = 0.5 + 0.5*sin(vUv.x*9.0 - uT*0.14 + vUv.y*7.0);
      float cur = 0.5 + 0.5*sin(vUv.x*4.5 + vUv.y*11.0 - uT*0.07);
      col += (0.016 + 0.013*sw2) * max(0.0, sw) * vec3(0.30, 0.55, 0.72) * (0.30+0.70*depth);
      col += 0.008 * cur * vec3(0.22, 0.42, 0.55) * depth;
      col += texture2D(uRes, vUv).rgb * uGain;   // what the run has left in the water
      float ex = abs(vUv.x - 0.5) * 2.0;
      col *= 1.0 - 0.42 * pow(ex, 3.0);          // soft edge vignette
      gl_FragColor = vec4(col, 1.0);
    }`;
  const STORM_F = `
    uniform float uT; uniform float uK; uniform float uSeed;
    varying vec2 vUv;
    void main(){
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float ang = atan(p.y, p.x);
      float churn = 1.0 + 0.16 * sin(ang * 3.0 - uT * 0.9 + uSeed)
                        + 0.10 * sin(ang * 7.0 + uT * 0.6 + uSeed * 2.1);
      float a = uK * exp(-r * r * 3.4) * 0.82 * churn;
      gl_FragColor = vec4(vec3(0.001, 0.002, 0.004), clamp(a, 0.0, 0.92));
    }`;
  const CHURN_F = `
    uniform float uT; uniform float uK; uniform float uSeed;
    varying vec2 vUv;
    void main(){
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float ang = atan(p.y, p.x);
      float arm1 = 0.5 + 0.5 * sin(ang * 5.0 - uT * 1.35 + uSeed * 3.0 + r * 7.0);
      float arm2 = 0.5 + 0.5 * sin(ang * 3.0 + uT * 0.8 - uSeed * 1.7 + r * 4.0);
      float a = uK * exp(-pow(r - 0.55, 2.0) * 9.0) * (arm1 * 0.6 + arm2 * 0.4) * 0.10;
      gl_FragColor = vec4(vec3(0.30, 0.44, 0.55) * a, a);
    }`;

  // curtain sampling rail: even in x across the coast, hovering just offshore
  const railX = new Float32Array(CURT_M);
  const railZ = new Float32Array(CURT_M);
  const X0 = Math.min(...sx) - 0.025, X1 = Math.max(...sx) + 0.025;
  for (let m = 0; m < CURT_M; m++) {
    const x = X0 + (X1 - X0) * (m / (CURT_M - 1));
    railX[m] = x; railZ[m] = WZ(coastY(x) - 0.16);
  }
  /** interpolate a per-settlement value across the rail (settlements are x-sorted) */
  function railInterp(vals: Float32Array, t: number, out: Float32Array) {
    let j = 0;
    for (let m = 0; m < CURT_M; m++) {
      const x = railX[m];
      while (j + 1 < S - 1 && sx[j + 1] < x) j++;
      const x0 = sx[j], x1 = sx[j + 1];
      const f = clamp((x - x0) / Math.max(1e-6, x1 - x0));
      out[m] = lerp(vals[t * S + j], vals[t * S + j + 1], f);
    }
  }
  /** same, but across a subset of settlements (the log's satellite anchors) */
  function railInterpIdx(vals: Float32Array, t: number, idx: number[], out: Float32Array) {
    let j = 0;
    for (let m = 0; m < CURT_M; m++) {
      const x = railX[m];
      while (j + 1 < idx.length - 1 && sx[idx[j + 1]] < x) j++;
      const i0 = idx[j], i1 = idx[j + 1];
      const f = clamp((x - sx[i0]) / Math.max(1e-6, sx[i1] - sx[i0]));
      out[m] = lerp(vals[t * S + i0], vals[t * S + i1], f);
    }
  }
  /** the cold field's value at an arbitrary x — what the curtain shows there */
  function satFieldAt(arm: Arm, t: number, x: number): number {
    let j = 0;
    while (j + 1 < satIdx.length - 1 && sx[satIdx[j + 1]] < x) j++;
    const i0 = satIdx[j], i1 = satIdx[j + 1];
    const f = clamp((x - sx[i0]) / Math.max(1e-6, sx[i1] - sx[i0]));
    return lerp(arm.satV[t * S + i0], arm.satV[t * S + i1], f);
  }
  const beliefH = (v: number) => 0.10 + 0.20 * Math.min(v, 2.9);

  // scratch buffers for curtain assembly (module-lived: no per-frame allocation)
  const smpA = new Float32Array(CURT_M), smpB = new Float32Array(CURT_M);
  const smpC = new Float32Array(CURT_M), smpD = new Float32Array(CURT_M);
  const edgeLo = new Float32Array(CURT_M), edgeHi = new Float32Array(CURT_M);
  const warmA = new Float32Array(CURT_M), warmB = new Float32Array(CURT_M);
  const shimLo = new Float32Array(CURT_M), shimHi = new Float32Array(CURT_M);
  const shimA = new Float32Array(CURT_M);
  const smooth = (a: Float32Array, passes: number) => {
    for (let p = 0; p < passes; p++) {
      let prev = a[0];
      for (let m = 1; m < CURT_M - 1; m++) {
        const cur = a[m];
        a[m] = (prev + cur * 2 + a[m + 1]) * 0.25;
        prev = cur;
      }
    }
  };

  function build(arm: Arm) {
    const sc = arm.scene;
    arm.masks = [];

    // ---- the sea: one full-bleed plane carrying swell + residue
    const seaMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uRes: { value: arm.resTex }, uGain: { value: 1 } },
      vertexShader: SEA_V, fragmentShader: SEA_F, depthWrite: false, depthTest: false,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(MAPW, PLANE_D), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0; sea.renderOrder = 0; sea.frustumCulled = false;
    sc.add(sea);
    arm.seaMat = seaMat;

    // ---- the land: a dark mass from the coast to the back edge, coast as a drawn line
    {
      const NCst = coast.length;
      const pos: number[] = [], idx: number[] = [];
      for (let j = 0; j < NCst; j++) {
        pos.push(WX(coast[j][0]), 0.012, WZ(coast[j][1]));
        pos.push(WX(coast[j][0]), 0.012, WZ(1.5));
        if (j) idx.push((j - 1) * 2, j * 2, (j - 1) * 2 + 1, j * 2, j * 2 + 1, (j - 1) * 2 + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setIndex(idx);
      const land = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0x080d15, depthWrite: false, depthTest: false }));
      land.renderOrder = 2; land.frustumCulled = false; sc.add(land);

      // shoreline: a tapered ribbon of cold-white light where the water ends
      const sp: number[] = [], suv: number[] = [], sidx: number[] = [];
      const w = 0.024;
      for (let j = 0; j < NCst; j++) {
        const x = WX(coast[j][0]), z = WZ(coast[j][1]);
        const x2 = WX(coast[Math.min(NCst - 1, j + 1)][0]);
        const z2 = WZ(coast[Math.min(NCst - 1, j + 1)][1]);
        let dx = x2 - x, dz = z2 - z;
        const dl = Math.hypot(dx, dz) || 1;
        const nx = -dz / dl * w, nz = dx / dl * w;
        sp.push(x - nx, 0.016, z - nz, x + nx, 0.016, z + nz);
        suv.push(0, j / NCst, 1, j / NCst);
        if (j) sidx.push((j - 1) * 2, j * 2, (j - 1) * 2 + 1, j * 2, j * 2 + 1, (j - 1) * 2 + 1);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sp), 3));
      sg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(suv), 2));
      sg.setIndex(sidx);
      const shore = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
        map: TAPER, color: new THREE.Color(0.45, 0.66, 0.74), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      }));
      shore.renderOrder = 3; shore.frustumCulled = false; sc.add(shore);
    }

    // ---- the storm: three dark blooms with a faint churn of spray, identical panels
    arm.stormMats = []; arm.stormMeshes = [];
    for (let c = 0; c < 6; c++) {
      const dark = c < 3;
      const m = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 0 }, uSeed: { value: (c % 3) * 2.399 } },
        vertexShader: SEA_V, fragmentShader: dark ? STORM_F : CHURN_F,
        transparent: true, depthWrite: false, depthTest: false,
        blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = dark ? 0.05 : 0.06;
      mesh.renderOrder = dark ? 6 : 7;
      mesh.frustumCulled = false;
      sc.add(mesh);
      arm.stormMats.push(m); arm.stormMeshes.push(mesh);
      arm.masks.push(mesh);
    }

    // ---- witness curtains: translucent belief layers over the water.
    // Right panel: cold satellite + warm phoned-in word + shimmer where they split.
    // Left panel: one fused curtain, smooth and confident — no shimmer anywhere.
    // Strips: [0] cold body, [1] cold edge, [2] warm body, [3] warm edge, [4] shimmer.
    const NSTRIP = 5;
    const vertsPer = CURT_M * 2;
    arm.curtPos = new Float32Array(NSTRIP * vertsPer * 3);
    arm.curtCol = new Float32Array(NSTRIP * vertsPer * 4);
    const cidx: number[] = [];
    for (let s = 0; s < NSTRIP; s++)
      for (let m = 0; m + 1 < CURT_M; m++) {
        const b = s * vertsPer + m * 2;
        cidx.push(b, b + 2, b + 1, b + 2, b + 3, b + 1);
      }
    arm.curtGeo = new THREE.BufferGeometry();
    arm.curtGeo.setAttribute("position", new THREE.BufferAttribute(arm.curtPos, 3));
    arm.curtGeo.setAttribute("color", new THREE.BufferAttribute(arm.curtCol, 4));
    arm.curtGeo.setIndex(cidx);
    const curt = new THREE.Mesh(arm.curtGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    }));
    curt.renderOrder = 8; curt.frustumCulled = false; sc.add(curt);
    arm.masks.push(curt);

    // ---- the committed arc + the look-up thread, as tapered light (quads 0..NARC-1 arc,
    //      quad NARC = thread)
    const NARC = 40;
    arm.arcPos = new Float32Array((NARC + 1) * 4 * 3);
    arm.arcCol = new Float32Array((NARC + 1) * 4 * 4);
    const auv: number[] = [], aidx: number[] = [];
    for (let q = 0; q <= NARC; q++) {
      auv.push(0, 0, 1, 0, 1, 1, 0, 1);
      aidx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    }
    arm.arcGeo = new THREE.BufferGeometry();
    arm.arcGeo.setAttribute("position", new THREE.BufferAttribute(arm.arcPos, 3));
    arm.arcGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(auv), 2));
    arm.arcGeo.setAttribute("color", new THREE.BufferAttribute(arm.arcCol, 4));
    arm.arcGeo.setIndex(aidx);
    const arcMesh = new THREE.Mesh(arm.arcGeo, new THREE.MeshBasicMaterial({
      map: TAPER, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    }));
    arcMesh.renderOrder = 10; arcMesh.frustumCulled = false; sc.add(arcMesh);
    arm.masks.push(arcMesh);

    // ---- bodies: 48 settlements, three passes of layered light + one mirrored glint
    arm.bodyPos = new Float32Array(S * 2 * 3);
    arm.bodySize = new Float32Array(S * 2);
    arm.bodyAlpha = new Float32Array(S * 2);
    arm.bodyCol = new Float32Array(S * 2 * 3);
    arm.bodyGeo = new THREE.BufferGeometry();
    arm.bodyGeo.setAttribute("position", new THREE.BufferAttribute(arm.bodyPos, 3));
    arm.bodyGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.bodySize, 1));
    arm.bodyGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.bodyAlpha, 1));
    arm.bodyGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.bodyCol, 3));
    for (const [pw, szm, gn, wh] of [[1.7, 3.2, 0.30, 0], [3.2, 1.3, 0.85, 0.10],
      [9.0, 0.5, 1.0, 0.72]] as [number, number, number, number][]) {
      const p = new THREE.Points(arm.bodyGeo, mkPoint(pw, szm, gn, wh));
      p.renderOrder = 12; p.frustumCulled = false; sc.add(p);
      arm.masks.push(p);
    }

    // ---- the wake: trailing samples of the boat's own recent path
    arm.wkPos = new Float32Array(WAKE_N * 3);
    arm.wkSize = new Float32Array(WAKE_N);
    arm.wkAlpha = new Float32Array(WAKE_N);
    arm.wkCol = new Float32Array(WAKE_N * 3);
    arm.wakeGeo = new THREE.BufferGeometry();
    arm.wakeGeo.setAttribute("position", new THREE.BufferAttribute(arm.wkPos, 3));
    arm.wakeGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.wkSize, 1));
    arm.wakeGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.wkAlpha, 1));
    arm.wakeGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.wkCol, 3));
    for (const [pw, szm, gn, wh] of [[1.9, 2.4, 0.5, 0], [4.0, 0.9, 1.0, 0.35]] as
      [number, number, number, number][]) {
      const p = new THREE.Points(arm.wakeGeo, mkPoint(pw, szm, gn, wh));
      p.renderOrder = 14; p.frustumCulled = false; sc.add(p);
      arm.masks.push(p);
    }

    // ---- particles: witness pips (satellite falling, calls rising), truth flashes
    arm.pPos = new Float32Array(PART_MAX * 3);
    arm.pSize = new Float32Array(PART_MAX);
    arm.pAlpha = new Float32Array(PART_MAX);
    arm.pCol = new Float32Array(PART_MAX * 3);
    arm.partGeo = new THREE.BufferGeometry();
    arm.partGeo.setAttribute("position", new THREE.BufferAttribute(arm.pPos, 3));
    arm.partGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.pSize, 1));
    arm.partGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.pAlpha, 1));
    arm.partGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.pCol, 3));
    for (const [pw, szm, gn, wh] of [[1.9, 2.2, 0.35, 0], [3.8, 0.85, 1.0, 0.3]] as
      [number, number, number, number][]) {
      const p = new THREE.Points(arm.partGeo, mkPoint(pw, szm, gn, wh));
      p.renderOrder = 16; p.frustumCulled = false; sc.add(p);
      arm.masks.push(p);
    }

    // ---- rings: rescue blooms, probe flashes, look-up markers
    const NRING = 24;
    arm.rPos = new Float32Array(NRING * 3);
    arm.rSize = new Float32Array(NRING);
    arm.rAlpha = new Float32Array(NRING);
    arm.rCol = new Float32Array(NRING * 3);
    arm.ringGeo = new THREE.BufferGeometry();
    arm.ringGeo.setAttribute("position", new THREE.BufferAttribute(arm.rPos, 3));
    arm.ringGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.rSize, 1));
    arm.ringGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.rAlpha, 1));
    arm.ringGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.rCol, 3));
    const rings = new THREE.Points(arm.ringGeo, mkPoint(1, 1, 1, 0, 1));
    rings.renderOrder = 18; rings.frustumCulled = false; sc.add(rings);
    arm.masks.push(rings);
  }
  arms.forEach(build);

  // ---------------------------------------------------------------- residue — the sea remembers
  // texture space: u = map x, v = map y flipped so v grows seaward on screen
  function stamp(f: Float32Array, mx: number, my: number, amt: number, rad: number) {
    const cx = clamp(mx) * (RES_W - 1), cy = clamp(my) * (RES_H - 1);
    const r = Math.ceil(rad), s2 = 2 * (rad * 0.55) * (rad * 0.55);
    const xa = Math.max(0, (cx - r) | 0), xb = Math.min(RES_W - 1, (cx + r) | 0);
    const ya = Math.max(0, (cy - r) | 0), yb = Math.min(RES_H - 1, (cy + r) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      f[y * RES_W + x] += amt * Math.exp(-d2 / s2);
    }
  }
  const toTex = (wx: number, wz: number): [number, number] =>
    [wx / MAPW + 0.5, 0.5 - wz / PLANE_D];   // plane uv: v=0 at +Z (near/sea edge)

  /** Everything the water remembers about tick t. Additive only — nothing here forgets. */
  function depositTick(arm: Arm, t: number) {
    // the boat's passage: rescue wake in cold light, verification wake in ember
    for (let sub = 0; sub < 5; sub++) {
      const q = boatState(arm, t + sub / 5);
      if (!q.leg) continue;
      const [u, v] = toTex(q.x, q.z);
      if (q.leg.probe) stamp(arm.ash, u, v, 0.30, 2.7);
      else stamp(arm.cool, u, v, 0.12, 2.2);
    }
    // rescues land as signal at the waterfront; probes scorch it
    for (const a of arm.arrives) if (a.t === t) {
      const [u, v] = toTex(WX(sx[a.i]), WZ(frontY(a.i)));
      stamp(arm.cool, u, v, 0.45, 5.0);
    }
    for (const p of arm.probes) if (p.t === t) {
      const [u, v] = toTex(WX(sx[p.i]), WZ(frontY(p.i)));
      stamp(arm.ash, u, v, 0.5, 4.2);
    }
    arm.resDirty = true;
  }
  function residueTo(arm: Arm, t: number) {
    if (t < arm.resTick) { arm.ash.fill(0); arm.cool.fill(0); arm.resTick = -1; }
    for (let k = arm.resTick + 1; k <= t; k++) depositTick(arm, k);
    arm.resTick = t;
  }
  /** Reinhard per channel: deposits arrive forever, the frame never saturates white. */
  function paintResidue(arm: Arm) {
    const d = arm.resData, ash = arm.ash, co = arm.cool;
    for (let p = 0, j = 0; p < RES_W * RES_H; p++, j += 4) {
      const a = ash[p] / (ash[p] + 0.55), c = co[p] / (co[p] + 0.55);
      d[j] = clamp(a * 225 + c * 24, 0, 255);
      d[j + 1] = clamp(a * 86 + c * 100, 0, 255);
      d[j + 2] = clamp(a * 36 + c * 132, 0, 255);
      d[j + 3] = 255;
    }
    arm.resTex.needsUpdate = true;
    arm.resDirty = false;
  }

  // ---------------------------------------------------------------- three, two viewports
  const canvas = el("gl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;
  const cam = new THREE.PerspectiveCamera(33, 1.2, 0.1, 120);
  const VIEW = { elev: 54, azim: 0, dist: 4.7, gain: 1.0 };
  function placeCamera(tt: number) {
    // a slow breath on the playback clock — a paused frame is always the same frame
    const a = (VIEW.azim + Math.sin(tt * 0.011) * 1.1) * Math.PI / 180;
    const e = (VIEW.elev + Math.sin(tt * 0.0083) * 0.5) * Math.PI / 180;
    const r = VIEW.dist;
    const ly = 0.10, lz = 0.45;
    cam.position.set(r * Math.cos(e) * Math.sin(a), r * Math.sin(e) + ly,
      lz + r * Math.cos(e) * Math.cos(a));
    cam.lookAt(0, ly, lz);
  }

  let W = 0, H = 0, bandTop = 0, bandBot = 0, stageH = 0, halfW = 0;
  const GUT = 4;
  function resize() {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    bandTop = el("head").offsetHeight;
    bandBot = el("foot").offsetHeight;
    stageH = Math.max(80, H - bandTop - bandBot);
    halfW = W / 2;
    cam.aspect = (halfW - GUT) / stageH;
    cam.updateProjectionMatrix();
    const pix = (stageH * renderer.getPixelRatio()) * 0.5 / Math.tan(cam.fov * Math.PI / 360);
    for (const m of allPointMats) m.uniforms.uPix.value = pix;
    const box = (id: string, x: number, w: number) => {
      const s = el(id).style;
      s.left = `${x}px`; s.width = `${w}px`; s.top = `${bandTop}px`; s.height = `${stageH}px`;
    };
    box("gut", halfW - GUT, GUT * 2);
    box("gutline", halfW, 1);
    box("plateA", 0, halfW - GUT - 2);
    box("plateB", halfW + GUT, halfW - GUT - 2);
  }
  addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------- playback
  const P = { tick: 0, playing: true, rate: 2.4 };   // 240 ticks / 2.4 = 100 s per pass
  const scrub = el("scrub") as HTMLInputElement;
  scrub.max = String(T - 1);
  let scrubbing = false;
  scrub.addEventListener("pointerdown", () => { scrubbing = true; });
  addEventListener("pointerup", () => { scrubbing = false; });
  scrub.addEventListener("input", () => { P.tick = parseFloat(scrub.value); });
  addEventListener("keydown", (e) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && e.key !== "l" && e.key !== "L") return;
    if (e.key === " ") { P.playing = !P.playing; e.preventDefault(); }
    if (e.key === "r" || e.key === "R") { P.tick = 0; }
    if (e.key === "l" || e.key === "L") el("panel").classList.toggle("on");
    if (e.key === "Escape") el("panel").classList.remove("on");
  });

  // ---------------------------------------------------------------- the look-up
  const scrX = new Float32Array(S), scrY = new Float32Array(S);
  let hover = -1;
  // the piece opens on its own question: the settlement whose witnesses split hardest,
  // read straight out of the right-hand log's commit record — never chosen by hand
  let pinned = 0, worstD = -1;
  for (const c of arms[1].commits) if (c.disagreement > worstD) { worstD = c.disagreement; pinned = c.i; }
  const nearest = (e: PointerEvent) => {
    const side = e.clientX < halfW ? 0 : 1;
    const ox = side ? halfW + GUT : 0;
    let best = -1, bd = 32 * 32;
    for (let i = 0; i < S; i++) {
      const dx = e.clientX - (ox + scrX[i]), dy = e.clientY - scrY[i];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  canvas.addEventListener("pointermove", (e) => {
    hover = nearest(e);
    canvas.style.cursor = hover >= 0 ? "crosshair" : "default";
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; });
  canvas.addEventListener("pointerdown", (e) => {
    const b = nearest(e);
    if (b >= 0) pinned = pinned === b ? -1 : b;
  });
  const picked = () => (hover >= 0 ? hover : pinned);

  // ---------------------------------------------------------------- per-frame assembly
  let partCount = 0, partPeak = 0;
  let paintBudget = 1;
  const v3 = new THREE.Vector3();

  function updateArm(arm: Arm, k: number, tt: number) {
    const t = Math.min(T - 1, Math.floor(tt));
    const t1 = Math.min(T - 1, t + 1);
    const f = tt - Math.floor(tt);
    const sel = picked();
    const right = k === 1;

    // ---- storm blooms (shared table — identical panels by construction)
    const cells = cellsAt(tt);
    for (let c = 0; c < 6; c++) {
      const cell = cells[c % 3], mesh = arm.stormMeshes[c], mat = arm.stormMats[c];
      mesh.position.x = WX(cell.x); mesh.position.z = WZ(cell.y);
      const sc = cell.r * 7.2 * MAPW;
      mesh.scale.set(sc, sc, 1);
      mat.uniforms.uT.value = tt;
      mat.uniforms.uK.value = cell.k;
    }

    // ---- bodies: everything is somebody; the storm cools and dims them
    const bs = arm.bodySize, ba = arm.bodyAlpha, bc = arm.bodyCol, bp = arm.bodyPos;
    for (let i = 0; i < S; i++) {
      const st = stormAt(i, cells);
      const need = lerp(arm.needV[t * S + i], arm.needV[t1 * S + i], f);
      // distress flickers with true need; rescue arrival blooms and lifts
      let bloom = 0, lift = 0;
      for (const a of arm.arrives) {
        if (a.i !== i) { if (a.t > tt + 4) break; continue; }
        const age = tt - a.t;
        if (age >= 0 && age < 3.2) {
          const env = age < 0.5 ? age / 0.5 : Math.exp(-(age - 0.5) * 1.15);
          bloom = Math.max(bloom, env); lift = Math.max(lift, env);
        }
        if (a.t > tt + 4) break;
      }
      const flick = 1 + 0.16 * Math.min(need, 2.5) * Math.sin(tt * 5.3 + i * 2.31);
      const dim = 1 - 0.72 * st;
      const popN = pop[i] / maxPop;
      const selBoost = i === sel ? 1.55 : 1;
      bs[i] = bodyR[i] * (1 + 0.28 * bloom) * selBoost;
      ba[i] = (0.72 + 0.55 * popN) * dim * flick * (1 + 0.9 * bloom) * selBoost;
      bp[i * 3] = WX(sx[i]);
      bp[i * 3 + 1] = 0.045 + 0.07 * lift;
      bp[i * 3 + 2] = WZ(sy[i]);
      // cooled by storm: white light falls toward a cold grey-blue
      const cw = clamp(st * 1.2);
      bc[i * 3] = lerp(WHITE[0], 0.30, cw);
      bc[i * 3 + 1] = lerp(WHITE[1], 0.42, cw);
      bc[i * 3 + 2] = lerp(WHITE[2], 0.55, cw);
      // the glint in the water below the body
      const gj = S + i;
      bs[gj] = bodyR[i] * 0.8;
      ba[gj] = ba[i] * 0.16;
      bp[gj * 3] = WX(sx[i]); bp[gj * 3 + 1] = 0.012; bp[gj * 3 + 2] = WZ(frontY(i)) + 0.05;
      bc[gj * 3] = bc[i * 3] * 0.7; bc[gj * 3 + 1] = bc[i * 3 + 1] * 0.8; bc[gj * 3 + 2] = bc[i * 3 + 2];
    }
    (arm.bodyGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;

    // ---- witness curtains
    const cp = arm.curtPos, cc = arm.curtCol;
    const vertsPer = CURT_M * 2;
    const setStrip = (s: number, hBot: Float32Array | number, hTop: Float32Array,
      col: readonly [number, number, number], aBot: Float32Array | number,
      aTop: Float32Array | number) => {
      for (let m = 0; m < CURT_M; m++) {
        const b = (s * vertsPer + m * 2) * 3;
        const x = WX(railX[m]), z = railZ[m];
        const hb = typeof hBot === "number" ? hBot : hBot[m];
        cp[b] = x; cp[b + 1] = hb; cp[b + 2] = z;
        cp[b + 3] = x; cp[b + 4] = hTop[m]; cp[b + 5] = z;
        const cb = (s * vertsPer + m * 2) * 4;
        const ab = typeof aBot === "number" ? aBot : aBot[m];
        const at = typeof aTop === "number" ? aTop : aTop[m];
        cc[cb] = col[0]; cc[cb + 1] = col[1]; cc[cb + 2] = col[2]; cc[cb + 3] = ab;
        cc[cb + 4] = col[0]; cc[cb + 5] = col[1]; cc[cb + 6] = col[2]; cc[cb + 7] = at;
      }
    };
    if (!right) {
      // ONE MAP: a single fused curtain — the same observations, drawn certain.
      // Extra smoothing IS the statement: confidence with the disagreement averaged away.
      railInterpIdx(arm.satV, t, satIdx, smpA); railInterpIdx(arm.satV, t1, satIdx, smpB);
      railInterp(arm.callV, t, smpC); railInterp(arm.callV, t1, smpD);
      for (let m = 0; m < CURT_M; m++) {
        const sat = lerp(smpA[m], smpB[m], f), call = lerp(smpC[m], smpD[m], f);
        smpA[m] = beliefH((sat + call) / 2);
      }
      smooth(smpA, 4);
      setStrip(0, 0.02, smpA, SIG, 0.012, 0.10);
      for (let m = 0; m < CURT_M; m++) { edgeLo[m] = smpA[m] - 0.010; edgeHi[m] = smpA[m] + 0.010; }
      setStrip(1, edgeLo, edgeHi, SIG, 0.65, 0.65);
      // strips 2..4 unused on the left: zero alpha
      for (let s = 2; s < 5; s++) setStrip(s, 0, edgeLo, SIG, 0, 0);
    } else {
      // GO AND LOOK: two witnesses, apart; the water between them shimmers where they split
      railInterpIdx(arm.satV, t, satIdx, smpA); railInterpIdx(arm.satV, t1, satIdx, smpB);
      for (let m = 0; m < CURT_M; m++) smpA[m] = beliefH(lerp(smpA[m], smpB[m], f));
      smooth(smpA, 1);
      railInterp(arm.callV, t, smpC); railInterp(arm.callV, t1, smpD);
      for (let m = 0; m < CURT_M; m++) smpC[m] = beliefH(lerp(smpC[m], smpD[m], f));
      smooth(smpC, 1);
      railInterp(arm.callSeenF, t, smpD);   // seen fraction along rail
      setStrip(0, 0.02, smpA, SIG, 0.010, 0.075);
      for (let m = 0; m < CURT_M; m++) { edgeLo[m] = smpA[m] - 0.009; edgeHi[m] = smpA[m] + 0.009; }
      setStrip(1, edgeLo, edgeHi, SIG, 0.58, 0.58);
      for (let m = 0; m < CURT_M; m++) {
        warmA[m] = 0.012 * clamp(smpD[m] * 2); warmB[m] = 0.085 * clamp(smpD[m] * 2);
      }
      setStrip(2, 0.02, smpC, WARM, warmA, warmB);
      for (let m = 0; m < CURT_M; m++) {
        edgeLo[m] = smpC[m] - 0.009; edgeHi[m] = smpC[m] + 0.009;
        warmB[m] = 0.52 * clamp(smpD[m] * 2);
      }
      setStrip(3, edgeLo, edgeHi, WARM, warmB, warmB);
      // shimmer, driven by the log's commit.disagreement: recent high-d commits pulse it
      let pulse = 0;
      for (const c of arm.commits) {
        const age = tt - c.t;
        if (age >= 0 && age < 2.6) pulse = Math.max(pulse, c.disagreement * (1 - age / 2.6));
      }
      for (let m = 0; m < CURT_M; m++) {
        const lo = Math.min(smpA[m], smpC[m]), hi = Math.max(smpA[m], smpC[m]);
        const d = (hi - lo) / 0.20;       // back to belief units
        shimLo[m] = lo; shimHi[m] = hi;
        const flick = 0.55 + 0.45 * Math.sin(tt * 5.1 + m * 1.71);
        shimA[m] = clamp((d - 0.05) * 1.8) * (0.24 + 0.85 * clamp(pulse)) * flick
          * clamp(smpD[m] * 2);
      }
      setStrip(4, shimLo, shimHi, [0.75, 0.92, 1.0], shimA, shimA);
    }
    (arm.curtGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.curtGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- the boat, its committed arc, its wake
    const q = boatState(arm, tt);
    const ap = arm.arcPos, ac = arm.arcCol;
    const NARC = 40;
    if (q.leg) {
      const L = q.leg;
      const col = L.probe ? EMB : SIG;
      const aBase = (L.probe ? 0.26 : 0.13) * (0.75 + 0.25 * Math.sin(tt * 2.6));
      const total = L.cum[L.cum.length - 1];
      for (let s = 0; s < NARC; s++) {
        const g0 = (s / NARC) * total, g1 = ((s + 1) / NARC) * total;
        const p0 = sampleLeg(L, g0), p1 = sampleLeg(L, g1);
        let dx = p1[0] - p0[0], dz = p1[1] - p0[1];
        const dl = Math.hypot(dx, dz) || 1;
        const w = 0.0105;
        const nx = -dz / dl * w, nz = dx / dl * w;
        const o = s * 12;
        ap[o] = p0[0] - nx; ap[o + 1] = 0.022; ap[o + 2] = p0[1] - nz;
        ap[o + 3] = p0[0] + nx; ap[o + 4] = 0.022; ap[o + 5] = p0[1] + nz;
        ap[o + 6] = p1[0] + nx; ap[o + 7] = 0.022; ap[o + 8] = p1[1] + nz;
        ap[o + 9] = p1[0] - nx; ap[o + 10] = 0.022; ap[o + 11] = p1[1] - nz;
        const behind = (s + 0.5) / NARC < q.u;
        const al = aBase * (behind ? 0.35 : 1);
        const oc = s * 16;
        for (let vi = 0; vi < 4; vi++) {
          ac[oc + vi * 4] = col[0]; ac[oc + vi * 4 + 1] = col[1]; ac[oc + vi * 4 + 2] = col[2];
          ac[oc + vi * 4 + 3] = al;
        }
      }
    } else for (let s = 0; s < NARC; s++)
      for (let vi = 0; vi < 4; vi++) arm.arcCol[s * 16 + vi * 4 + 3] = 0;

    // the look-up thread: quad NARC — vertical, from the water through the witnesses
    {
      const oc = NARC * 16, o = NARC * 12;
      if (sel >= 0) {
        const x = WX(railX[Math.round(clamp((sx[sel] - X0) / (X1 - X0)) * (CURT_M - 1))]);
        const z = WZ(coastY(sx[sel]) - 0.16);
        const hs = beliefH(lerp(satFieldAt(arm, t, sx[sel]), satFieldAt(arm, t1, sx[sel]), f));
        const hc = beliefH(lerp(arm.callV[t * S + sel], arm.callV[t1 * S + sel], f));
        const seen = arm.callSeen[t * S + sel];
        const fused = seen ? (hs + hc) / 2 : hs;
        const top = right ? Math.max(hs, seen ? hc : hs) + 0.05 : fused + 0.05;
        const w = 0.008;
        ap[o] = x - w; ap[o + 1] = 0.015; ap[o + 2] = z;
        ap[o + 3] = x + w; ap[o + 4] = 0.015; ap[o + 5] = z;
        ap[o + 6] = x + w; ap[o + 7] = top; ap[o + 8] = z;
        ap[o + 9] = x - w; ap[o + 10] = top; ap[o + 11] = z;
        const pulse = 0.55 + 0.35 * Math.sin(tt * 3.1);
        for (let vi = 0; vi < 4; vi++) {
          ac[oc + vi * 4] = 0.85; ac[oc + vi * 4 + 1] = 0.95; ac[oc + vi * 4 + 2] = 1.0;
          ac[oc + vi * 4 + 3] = 0.30 * pulse;
        }
      } else for (let vi = 0; vi < 4; vi++) ac[oc + vi * 4 + 3] = 0;
    }
    (arm.arcGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.arcGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // wake — trailing lookups of the boat's own recent past; ember where it was doubting
    const wp = arm.wkPos, ws = arm.wkSize, wa = arm.wkAlpha, wc = arm.wkCol;
    for (let s = 0; s < WAKE_N; s++) {
      const back = s * 0.22;
      const qs = boatState(arm, Math.max(0, tt - back));
      const fade = Math.pow(1 - s / WAKE_N, 1.5);
      wp[s * 3] = qs.x; wp[s * 3 + 1] = 0.028; wp[s * 3 + 2] = qs.z;
      ws[s] = s === 0 ? 0.115 : 0.085 * (1 - s / WAKE_N) + 0.018;
      wa[s] = s === 0 ? 1.8 : fade * (qs.leg ? 1.0 : 0.2);
      const col = s === 0 ? WHITE : (qs.leg && qs.leg.probe ? EMB : SIG);
      wc[s * 3] = col[0]; wc[s * 3 + 1] = col[1]; wc[s * 3 + 2] = col[2];
    }
    (arm.wakeGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.wakeGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.wakeGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.wakeGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- particles: the witnesses working — and going quiet where the storm sits
    const pp = arm.pPos, ps = arm.pSize, pa = arm.pAlpha, pc = arm.pCol;
    let n = 0;
    const emit = (x: number, y: number, z: number, sz: number, al: number,
      c: readonly [number, number, number]) => {
      if (n >= PART_MAX) return;
      pp[n * 3] = x; pp[n * 3 + 1] = y; pp[n * 3 + 2] = z;
      ps[n] = sz; pa[n] = al; pc[n * 3] = c[0]; pc[n * 3 + 1] = c[1]; pc[n * 3 + 2] = c[2];
      n++;
    };
    for (let back = 0; back <= 2; back++) {
      const et = Math.floor(tt) - back;
      if (et < 0 || et >= T) continue;
      const age = tt - et;
      // fresh satellite readings fall from the sky; where occluded, nothing falls
      let p = age / 1.9;
      if (p < 1) {
        const al = Math.sin(Math.PI * clamp(p)) * 0.5;
        for (let i = 0; i < S; i++) if (arm.satFresh[et * S + i])
          emit(WX(sx[i]), lerp(0.95, 0.06, ease(p)), WZ(sy[i]) - 0.02, 0.030, al, SIG);
      }
      // phoned-in word rises from the settlement; the storm cuts the phones
      p = age / 1.6;
      if (p < 1) {
        const al = Math.sin(Math.PI * clamp(p)) * 0.75;
        for (let i = 0; i < S; i++) if (arm.callFresh[et * S + i])
          emit(WX(sx[i]) + 0.02, lerp(0.05, 0.62, ease(p)), WZ(sy[i]), 0.036, al, WARM);
      }
      // a verification pass lights the settlement's truth for a beat
      for (const pr of arm.probes) if (pr.t === et) {
        const pe = age / 1.5;
        if (pe < 1) {
          const al = Math.pow(1 - pe, 1.3) * 1.6;
          for (let s = 0; s < 9; s++)
            emit(WX(sx[pr.i]), 0.05 + s * 0.052 * (0.3 + ease(pe)), WZ(sy[pr.i]),
              0.042 - s * 0.003, al * (1 - s * 0.09), [1, 1, 1]);
        }
      }
    }
    arm.partGeo.setDrawRange(0, n);
    (arm.partGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    partCount += n;

    // ---- rings: rescue blooms in signal, probe scars in ember, look-up marks
    const rp = arm.rPos, rs = arm.rSize, ra = arm.rAlpha, rc = arm.rCol;
    ra.fill(0);
    let rn = 0;
    const put = (x: number, y: number, z: number, sz: number, al: number,
      c: readonly [number, number, number]) => {
      if (rn >= 24) return;
      rp[rn * 3] = x; rp[rn * 3 + 1] = y; rp[rn * 3 + 2] = z;
      rs[rn] = sz; ra[rn] = al; rc[rn * 3] = c[0]; rc[rn * 3 + 1] = c[1]; rc[rn * 3 + 2] = c[2];
      rn++;
    };
    for (const a of arm.arrives) {
      const age = tt - a.t;
      if (age >= 0 && age < 2.4)
        put(WX(sx[a.i]), 0.03, WZ(frontY(a.i)), 0.14 + 0.62 * ease(age / 2.4),
          Math.pow(1 - age / 2.4, 1.3) * 0.95, SIG);
    }
    for (const pr of arm.probes) {
      const age = tt - pr.t;
      if (age >= 0 && age < 2.0)
        put(WX(sx[pr.i]), 0.03, WZ(frontY(pr.i)), 0.12 + 0.5 * ease(age / 2),
          Math.pow(1 - age / 2, 1.2) * 1.0, EMB);
    }
    if (sel >= 0) {
      const pulse = 0.6 + 0.4 * Math.sin(tt * 1.9);
      put(WX(sx[sel]), 0.045, WZ(sy[sel]), bodyR[sel] * 2.2, 0.5 * pulse, WHITE);
      // witness markers on the thread
      const x = WX(railX[Math.round(clamp((sx[sel] - X0) / (X1 - X0)) * (CURT_M - 1))]);
      const z = WZ(coastY(sx[sel]) - 0.16);
      const hs = beliefH(lerp(satFieldAt(arm, t, sx[sel]), satFieldAt(arm, t1, sx[sel]), f));
      const hc = beliefH(lerp(arm.callV[t * S + sel], arm.callV[t1 * S + sel], f));
      const ht = beliefH(lerp(arm.needV[t * S + sel], arm.needV[t1 * S + sel], f));
      const seen = arm.callSeen[t * S + sel];
      if (right) {
        put(x, hs, z, 0.055, 0.9, SIG);
        if (seen) put(x, hc, z, 0.055, 0.9, WARM);
        put(x, ht, z, 0.042, 0.95, [1, 1, 1]);      // the truth, between the witnesses
      } else {
        put(x, seen ? (hs + hc) / 2 : hs, z, 0.06, 0.95, SIG);   // only the fused value
      }
    }
    (arm.ringGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- residue moves only forward with the tick; repaint at most one sea per frame
    arm.seaMat.uniforms.uT.value = tt;
    arm.seaMat.uniforms.uGain.value = VIEW.gain;
    residueTo(arm, t);
    if (arm.resDirty && paintBudget > 0) { paintResidue(arm); paintBudget--; }
  }

  function sampleLeg(L: Leg, g: number): [number, number] {
    let lo = 0, hi = L.cum.length - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (L.cum[m] < g) lo = m; else hi = m; }
    const f = (g - L.cum[lo]) / Math.max(1e-6, L.cum[hi] - L.cum[lo]);
    return [lerp(L.pts[lo * 2], L.pts[hi * 2], clamp(f)),
      lerp(L.pts[lo * 2 + 1], L.pts[hi * 2 + 1], clamp(f))];
  }

  // ---------------------------------------------------------------- chrome
  const mA = A.metrics, mB = B.metrics;
  el("meta").textContent = `seed ${log.seed} · ${log.regime} · ${T} ticks · ${S} settlements`
    + ` · ${commas(totPop)} people`;
  el("meta2").textContent = `one boat · same storm, same witnesses in both halves`
    + (A.obsHash === B.obsHash ? ` · obs ${A.obsHash} = ${B.obsHash}` : "");
  el("meta3").textContent = `log ${A.logHash} / ${B.logHash}`;
  el("finA").innerHTML = `by the end · <b class="cold">${commas(mA.peopleRescued)}</b> rescued`
    + ` · <b>${mA.commitsRescue}</b> rescue runs · <b>${mA.probes}</b> verification passes`;
  el("finB").innerHTML = `by the end · <b class="ember">${commas(mB.peopleRescued)}</b> rescued`
    + ` · <b>${mB.commitsRescue}</b> rescue runs · <b>${mB.probes}</b> verification passes`
    + ` · <b>${mB.probesChanged}</b> changed its mind`;
  el("liveA2").innerHTML = "&nbsp;";

  const bind = (id: string, vid: string, dp: number, set: (n: number) => void) => {
    const e = el(id) as HTMLInputElement;
    e.addEventListener("input", () => {
      const n = parseFloat(e.value); set(n); el(vid).textContent = n.toFixed(dp);
    });
  };
  bind("pGain", "vGain", 2, (n) => { VIEW.gain = n; });
  bind("pElev", "vElev", 1, (n) => { VIEW.elev = n; });
  bind("pAzim", "vAzim", 1, (n) => { VIEW.azim = n; });
  bind("pDist", "vDist", 2, (n) => { VIEW.dist = n; });
  bind("pRate", "vRate", 2, (n) => { P.rate = n; });

  let msAvg = 0, msMax = 0, msWin = 0, frame = 0, last = -1;

  function chrome(tt: number) {
    const ti = Math.min(T - 1, Math.floor(tt));
    el("tick").textContent = `${String(ti).padStart(3, "0")} / ${T}`;
    if (!scrubbing) scrub.value = String(ti);
    el("liveA").textContent = commas(arms[0].cumRescued[ti]);
    el("liveB").textContent = commas(arms[1].cumRescued[ti]);
    const chg = arms[1].cumChanged[ti];
    el("liveB2").textContent = `${arms[1].cumProbes[ti]} verification passes flown · `
      + `${chg} ${chg === 1 ? "commitment" : "commitments"} changed`;
    const sel = picked();
    if (sel < 0) {
      el("pick").textContent = "point at a settlement — both desks answer the same gesture";
    } else {
      const t = ti, r = arms[1], l = arms[0];
      const sat = satFieldAt(r, t, sx[sel]), call = r.callV[t * S + sel];
      const seen = r.callSeen[t * S + sel];
      const fSat = satFieldAt(l, t, sx[sel]), fCall = l.callV[t * S + sel];
      const fSeen = l.callSeen[t * S + sel];
      const fused = fSeen ? (fSat + fCall) / 2 : fSat;
      const truth = r.needV[t * S + sel];
      el("pick").textContent = `settlement ${String(sel).padStart(2, "0")}`
        + ` · ${commas(pop[sel])} people`
        + ` · one map believes ${fused.toFixed(2)}`
        + ` · go and look: satellite ${sat.toFixed(2)} / phoned-in ${seen ? call.toFixed(2) : "—"}`
        + ` · truth ${truth.toFixed(2)}`;
    }
    el("meter").textContent = `${msAvg.toFixed(2)} ms/frame · worst ${msMax.toFixed(2)}`;
    el("meter2").textContent = `${partPeak} sparks · dpr ${renderer.getPixelRatio().toFixed(0)}`
      + ` · ${(halfW - GUT) | 0}×${stageH | 0} ×2 · log ${A.logHash}/${B.logHash}`;
    partPeak = 0;
  }

  // ---------------------------------------------------------------- the loop
  function loop(now: number) {
    requestAnimationFrame(loop);
    const t0 = performance.now();
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    const want = Math.min(devicePixelRatio, 2);
    if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize(); }
    if (el("gl").clientWidth !== W || el("gl").clientHeight !== H) resize();
    if (P.playing && !scrubbing) {
      P.tick += dt * P.rate;
      if (P.tick >= T) {         // a new pass starts on clean water
        P.tick -= T;
        for (const a of arms) { a.ash.fill(0); a.cool.fill(0); a.resTick = -1; }
      }
    }
    const tt = clamp(P.tick, 0, T - 0.001);

    placeCamera(tt);
    paintBudget = 1;
    partCount = 0;
    updateArm(arms[0], 0, tt);
    updateArm(arms[1], 1, tt);
    partPeak = Math.max(partPeak, partCount);

    // where every settlement lands on screen, for the look-up
    for (let i = 0; i < S; i++) {
      v3.set(WX(sx[i]), 0.05, WZ(sy[i])).project(cam);
      scrX[i] = (v3.x * 0.5 + 0.5) * (halfW - GUT);
      scrY[i] = bandTop + (1 - (v3.y * 0.5 + 0.5)) * stageH;
    }

    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (let k = 0; k < 2; k++) {
      const x = k ? halfW + GUT : 0;
      renderer.setViewport(x, bandBot, halfW - GUT, stageH);
      renderer.setScissor(x, bandBot, halfW - GUT, stageH);
      renderer.render(arms[k].scene, cam);
    }

    const ms = performance.now() - t0;
    msAvg = msAvg ? msAvg * 0.92 + ms * 0.08 : ms;
    msWin = Math.max(msWin, ms);
    if ((frame % 120) === 119) { msMax = msWin; msWin = 0; }
    if ((frame & 7) === 0) chrome(tt);
    frame++;
  }
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------- verification handle
  (window as unknown as { __HERO: unknown }).__HERO = {
    seek(tick: number) {
      P.tick = clamp(tick, 0, T - 1); P.playing = false;
      paintBudget = 2;
      placeCamera(P.tick);
      updateArm(arms[0], 0, P.tick); updateArm(arms[1], 1, P.tick);
      chrome(P.tick);
    },
    tick: () => P.tick,
    maxTick: () => T - 1,
    pause() { P.playing = false; },
    play() { P.playing = true; },
    pick(i: number) { pinned = i; hover = -1; },
    /** hide every body, wake, curtain and bloom — the sea and its residue stand alone */
    mask(on: boolean) { for (const a of arms) for (const o of a.masks) o.visible = !on; },
    state: () => ({
      tick: P.tick, ms: +msAvg.toFixed(2), msMax: +msMax.toFixed(2), picked: picked(),
      liveA: Math.round(arms[0].cumRescued[Math.floor(P.tick)]),
      liveB: Math.round(arms[1].cumRescued[Math.floor(P.tick)]),
      probesB: arms[1].cumProbes[Math.floor(P.tick)],
      changedB: arms[1].cumChanged[Math.floor(P.tick)],
      metrics: [mA, mB], totPop, seed: log.seed, regime: log.regime,
      logHash: [A.logHash, B.logHash], obsHash: [A.obsHash, B.obsHash],
      legs: arms.map((a) => a.legs.length),
      probeLegs: arms.map((a) => a.legs.filter((L) => L.probe).length),
    }),
  };
}

boot();
