/**
 * THE BRIDGE — the same conclusion built twice, and the heal only one of them can perform.
 *
 * Two evidence pyramids over the same dark ground: 256 grains of raw observation, 64
 * readings, 16 findings, 8 claims, and one white sentence at the top of each stack. Both
 * stacks spend exactly the same 156 edge-units of wiring; both lose the same ten workers
 * at the same ticks. The left rule ("THE STRONGEST SUPPORT WINS") thickens one blazing
 * spine and erases everything it prunes. The right rule ("NEIGHBORS CARRY THE PROOF")
 * spreads the budget across distinct neighbors and keeps a tombstone for every link it
 * discards. When the walks run, four of the left stack's claims are lit at the desk with
 * nothing alive beneath them — 14,420 people governed by sentences nobody can audit — and
 * at t≈160 the right stack replays its tombstones, thread by thread, until every claim
 * walks again. The left stack holds still. It has nothing to replay. Forever.
 *
 * NOTHING HERE IS SIMULATED. This file is a consumer of `/bridge-log.json`, the baked
 * event log of seed 5 (B=156, random f=0.3 + heal). Every thread, kill, walk, floater,
 * heal and number on screen is read out of that log's events and metrics. There is no
 * salience rule, no budget rule, no allocation logic anywhere below — search and see.
 *
 * Determinism: every frame is a pure function of ONE number, the playback tick (plus the
 * picked claim, itself defaulted from the log). Particles are evaluated from event ticks,
 * never integrated; the camera and every shimmer are driven by a page-time that is an
 * analytic function of the tick. Pause at tick N, reload, pause at tick N: same pixels.
 */
import * as THREE from "three";

// ------------------------------------------------------------------ geometry of the piece
const STACK_W = 4.2;                   // world footprint of the log's x ∈ [0,1]
const STACK_D = 2.85;                  //   … and y ∈ [0,1]
const TER_W = 5.15, TER_D = 3.55;      // the terrain plate under the stack
const LAYER_Y = [0.06, 1.22, 2.42, 3.62, 4.78]; // ground · readings · findings · claims · desk
const DESK_Y = LAYER_Y[4];
const T = 200;                         // playback ticks (log events end at 187)
const RES = 200;                       // terrain residue texture, per side
const PART_MAX = 1600;                 // particle pool per stack
const JN = 6, QT = JN - 1;             // joints / quads per thread
const MAX_THREADS = 160;               // MESH is 156 wired + 2 healed
const WALK_DUR = 3.3;                  // ticks a full claim→grain walk takes
const HOP = WALK_DUR / 3;              // per-hop duration (constant pace, breaks come early)
const WLOOP = WALK_DUR + 2.4;          // selected-claim replay loop period
const HEAL_SETTLE = 163;               // tick the healed stack's counts settle (after both ignitions)

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const fract = (v: number) => v - Math.floor(v);
/** deterministic per-id jitter — the only "noise" allowed anywhere near a frame */
const hh = (i: number, s = 0) => fract(Math.sin(i * 127.1 + s * 311.7 + 74.7) * 43758.5453);
const el = (id: string) => document.getElementById(id)!;
const commas = (n: number) => Math.round(n).toLocaleString("en-US");

// the register: one cold signal, one burn, white, husk-grey. Nothing else.
const SIG: [number, number, number] = [0.49, 0.976, 1.0];
const EMB: [number, number, number] = [1.0, 0.482, 0.235];
const WHITE: [number, number, number] = [0.88, 0.97, 1.0];
const HUSK: [number, number, number] = [0.13, 0.165, 0.215];

// ------------------------------------------------------------------ the clock is a score
// The log's ticks are played at a phase-dependent rate so the beats that matter get the
// frame: the build sprints, the kills land one by one, the walks and THE HEAL are slow.
// Page-time is an analytic function of tick, so a paused frame is always the same frame.
const SEGR: [number, number][] = [
  [0, 6.5],    // minimum wiring — the same world, twice
  [68, 2.6],   // the budget spends: one spine thickens, many neighbors link
  [120, 0.9],  // ten workers die, one per tick
  [130, 2.2],  // the slack settles
  [140, 0.62], // pre-heal walks, claim by claim
  [152, 2.4],  // the floater tableau
  [158, 0.60], // THE HEAL — tombstones replay, slow enough to watch each note travel
  [166, 3.0],  // healed — the right counter has just fallen to zero
  [180, 0.62], // the walks again — right walks everywhere, left breaks where it broke
  [192, 1.15], // the verdict holds — several seconds of the final contrast
];
const PSEG = (() => {
  const out: { t0: number; t1: number; r: number; p0: number }[] = [];
  let p = 0;
  for (let i = 0; i < SEGR.length; i++) {
    const t0 = SEGR[i][0], r = SEGR[i][1], t1 = i + 1 < SEGR.length ? SEGR[i + 1][0] : T;
    out.push({ t0, t1, r, p0: p });
    p += (t1 - t0) / r;
  }
  return out;
})();
const rateAt = (t: number) => {
  for (let i = PSEG.length - 1; i >= 0; i--) if (t >= PSEG[i].t0) return PSEG[i].r;
  return PSEG[0].r;
};
const pageTimeOf = (t: number) => {
  for (let i = PSEG.length - 1; i >= 0; i--) if (t >= PSEG[i].t0) {
    return PSEG[i].p0 + (Math.min(t, PSEG[i].t1) - PSEG[i].t0) / PSEG[i].r;
  }
  return 0;
};

// ------------------------------------------------------------------ the log, verbatim
type Ev =
  | { e: "node"; id: number; layer: number; x: number; y: number; worker: number; pop?: number }
  | { e: "salience"; id: number; v: number }
  | { e: "link"; t: number; parent: number; child: number; copies: number }
  | { e: "kill"; t: number; worker: number; nodes: number[] }
  | { e: "walk"; t: number; claim: number; ok: boolean; path: number[] }
  | { e: "heal"; t: number; parent: number; child: number }
  | { e: "floater"; claim: number; pop: number };

interface Metrics {
  arm: string; B: number; spend: number; damage: string;
  preWalkability: number; walkabilityPreHeal: number; floaterPopPreHeal: number;
  walkability: number; floaterPop: number; survClaims: number; walksOk: number;
  walkLenMean: number; walksUsingCross: number; crossEdges: number; tombstones: number;
  healsFired: number; healsPossible: number; breaks: number;
  workersKilled: number; nodesKilled: number; totalPop: number;
}
interface RawArm { name: string; metrics: Metrics; logHash: string; events: Ev[] }

/** One provenance thread: born from `link` events, killed by `kill`, or replayed by `heal`. */
interface Thread {
  a: number; b: number;      // parent (upper) → child (lower)
  t0: number;                // birth tick
  hist: number[];            // ticks of every copy laid on this edge (thickness history)
  deadT: number;             // min kill tick of either endpoint (Infinity = survives)
  healed: boolean;           // a tombstone replay, not a build edge
  len: number;
}
interface Walk { t: number; claim: number; ok: boolean; path: number[]; breakU: number }

interface Arm {
  raw: RawArm;
  threads: Thread[];
  threadIdx: Record<string, number>;   // "parent>child" → thread index
  killT: Float64Array;                 // per node, Infinity if immortal/survives
  walksPre: Walk[]; walksPost: Walk[];
  preByClaim: Record<number, Walk>; postByClaim: Record<number, Walk>;
  floaterFrom: Record<number, number>; // claim → tick its pre-walk broke
  floaterTo: Record<number, number>;   //   … → tick the heal relit it (Infinity = never)
  breakMarks: { node: number; from: number; to: number }[];
  heals: { t: number; parent: number; child: number }[];
  spendByTick: Int16Array;             // cumulative edge-units wired, straight off the link events
  workersDeadByTick: Int16Array;       // cumulative workers lost, straight off the kill events
  // scene + buffers
  scene: THREE.Scene;
  bodyGeo: THREE.BufferGeometry; bSize: Float32Array; bAlpha: Float32Array; bCol: Float32Array;
  thrGeo: THREE.BufferGeometry; tPos: Float32Array; tCol: Float32Array;
  litGeo: THREE.BufferGeometry; lPos: Float32Array; lCol: Float32Array;
  partGeo: THREE.BufferGeometry; pPos: Float32Array; pSize: Float32Array;
  pAlpha: Float32Array; pCol: Float32Array;
  ringGeo: THREE.BufferGeometry; rPos: Float32Array; rSize: Float32Array;
  rAlpha: Float32Array; rCol: Float32Array;
  colGeo: THREE.BufferGeometry; cPos: Float32Array; cCol: Float32Array;
  deskMats: THREE.MeshBasicMaterial[];
  boost: Float32Array;                 // per-thread walk highlight, rebuilt each frame
  glow: Float32Array;                  // per-node ember glow, rebuilt each frame
  surf: { ash: Float32Array; cool: Float32Array; data: Uint8Array; tex: THREE.DataTexture };
  resTick: number;
  stampsByTick: { kind: number; node: number; amt: number; rad: number }[][];
}

async function boot() {
  const log = await (await fetch("/bridge-log.json")).json() as
    { seed: number; B: number; damage: string; arms: RawArm[] };
  const A = log.arms[0], B = log.arms[1];
  const mA = A.metrics, mB = B.metrics;

  // ---- the roster (identical in both arms — same ids, same places, same workers)
  const nodesEv = A.events.filter((e) => e.e === "node") as Extract<Ev, { e: "node" }>[];
  const N = nodesEv.length;
  const layerOf = new Int8Array(N), workerOf = new Int16Array(N);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const popOf = new Float32Array(N);
  for (const n of nodesEv) {
    layerOf[n.id] = n.layer; workerOf[n.id] = n.worker;
    px[n.id] = (n.x - 0.5) * STACK_W;
    pz[n.id] = (n.y - 0.5) * STACK_D;
    py[n.id] = LAYER_Y[n.layer];
    popOf[n.id] = n.pop ?? 0;
  }
  const sal = new Float32Array(N);
  for (const e of A.events) if (e.e === "salience") sal[e.id] = e.v;
  const claims = nodesEv.filter((n) => n.layer === 3).map((n) => n.id);
  const NWORK = nodesEv.reduce((m, n) => Math.max(m, n.worker + 1), 0);
  const maxPop = Math.max(...claims.map((c) => popOf[c]));
  const totalPop = mA.totalPop;
  const claimR = (c: number) => 0.135 + 0.155 * Math.sqrt(popOf[c] / maxPop);
  const uOf = (id: number) => 0.5 + px[id] / TER_W;   // node → terrain texture coords
  const vOf = (id: number) => 0.5 + pz[id] / TER_D;

  // ------------------------------------------------------------------ per-arm tables
  function prep(raw: RawArm): Arm {
    const killT = new Float64Array(N).fill(Infinity);
    for (const e of raw.events) if (e.e === "kill") for (const n of e.nodes) killT[n] = e.t;

    const threads: Thread[] = [];
    const threadIdx: Record<string, number> = {};
    for (const e of raw.events) {
      if (e.e !== "link") continue;
      const k = `${e.parent}>${e.child}`;
      if (threadIdx[k] === undefined) {
        threadIdx[k] = threads.length;
        threads.push({ a: e.parent, b: e.child, t0: e.t, hist: [e.t],
          deadT: Math.min(killT[e.parent], killT[e.child]), healed: false, len: 0 });
      } else threads[threadIdx[k]].hist.push(e.t);
    }
    const heals = raw.events.filter((e) => e.e === "heal") as { t: number; parent: number; child: number }[];
    for (const h of heals) {
      const k = `${h.parent}>${h.child}`;
      threadIdx[k] = threads.length;
      threads.push({ a: h.parent, b: h.child, t0: h.t, hist: [h.t],
        deadT: Math.min(killT[h.parent], killT[h.child]), healed: true, len: 0 });
    }
    for (const th of threads) {
      const dx = px[th.a] - px[th.b], dy = py[th.a] - py[th.b], dz = pz[th.a] - pz[th.b];
      th.len = Math.hypot(dx, dy, dz);
    }

    const walksPre: Walk[] = [], walksPost: Walk[] = [];
    for (const e of raw.events) {
      if (e.e !== "walk") continue;
      // a failed walk's ignition dies the moment its head lands on the last living node
      const breakU = e.ok ? Infinity : Math.max(0, e.path.length - 1) * HOP;
      (e.t < 160 ? walksPre : walksPost).push({ t: e.t, claim: e.claim, ok: e.ok, path: e.path, breakU });
    }
    const preByClaim: Record<number, Walk> = {}, postByClaim: Record<number, Walk> = {};
    for (const w of walksPre) preByClaim[w.claim] = w;
    for (const w of walksPost) postByClaim[w.claim] = w;

    // floaters: claims whose pre-heal walk broke while the claim itself survived. The log's
    // `floater` events carry the same populations; the walk events carry the WHEN.
    const floaterFrom: Record<number, number> = {}, floaterTo: Record<number, number> = {};
    const breakMarks: { node: number; from: number; to: number }[] = [];
    for (const w of walksPre) {
      if (w.ok || killT[w.claim] !== Infinity) continue;
      const from = w.t + w.breakU;
      floaterFrom[w.claim] = from;
      const post = postByClaim[w.claim];
      floaterTo[w.claim] = post && post.ok ? HEAL_SETTLE : Infinity;
      const node = w.path.length ? w.path[w.path.length - 1] : w.claim;
      breakMarks.push({ node, from, to: post && post.ok ? heals[0] ? heals[0].t + 1.2 : HEAL_SETTLE : Infinity });
    }

    // residue: everything the run leaves on the terrain, indexed by the tick it happened
    const stampsByTick: Arm["stampsByTick"] = Array.from({ length: T }, () => []);
    const put = (t: number, kind: number, node: number, amt: number, rad: number) => {
      const k = clamp(Math.floor(t), 0, T - 1);
      stampsByTick[k].push({ kind, node, amt, rad });
    };
    for (const e of raw.events) {
      if (e.e === "link") put(e.t, 0, e.child, e.copies > 1 ? 0.020 : 0.012, 2.7);
      else if (e.e === "kill") for (const n of e.nodes) put(e.t, 1, n, 0.055 + 0.02 * layerOf[n], 3.1 + 1.15 * layerOf[n]);
      else if (e.e === "walk") {
        if (e.ok) { put(e.t + WALK_DUR, 0, e.path[e.path.length - 1], 0.055, 3.6);
          for (const n of e.path) put(e.t + WALK_DUR, 0, n, 0.015, 2.4); }
        else if (killT[e.claim] === Infinity) {
          put(e.t + Math.max(0, e.path.length - 1) * HOP, 1,
            e.path.length ? e.path[e.path.length - 1] : e.claim, 0.05, 3.5);
        }
      } else if (e.e === "heal") { put(e.t + 2.2, 0, e.child, 0.06, 3.3); put(e.t + 2.2, 0, e.parent, 0.03, 2.6); }
    }
    // floaters smoulder onto the ground beneath them for as long as they burn
    for (const c of Object.keys(floaterFrom)) {
      const ci = +c, from = Math.ceil(floaterFrom[ci]), to = Math.min(T, floaterTo[ci]);
      for (let k = from; k < to; k++) stampsByTick[k].push({ kind: 1, node: ci, amt: 0.0028, rad: 5.2 });
    }

    const spendByTick = new Int16Array(T);
    const workersDeadByTick = new Int16Array(T);
    for (const e of raw.events) {
      if (e.e === "link") spendByTick[clamp(e.t, 0, T - 1)]++;
      else if (e.e === "kill") workersDeadByTick[clamp(e.t, 0, T - 1)]++;
    }
    for (let k = 1; k < T; k++) {
      spendByTick[k] += spendByTick[k - 1];
      workersDeadByTick[k] += workersDeadByTick[k - 1];
    }

    return {
      raw, threads, threadIdx, killT, walksPre, walksPost, preByClaim, postByClaim,
      floaterFrom, floaterTo, breakMarks, heals, spendByTick, workersDeadByTick,
      scene: new THREE.Scene(),
      boost: new Float32Array(MAX_THREADS), glow: new Float32Array(N),
      resTick: -1, stampsByTick,
    } as Arm;
  }
  const arms = [prep(A), prep(B)];

  // ------------------------------------------------------------------ shared materials
  /** Layered light: every body is drawn three times — halo, body, core. */
  const POINT_V = `
    attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
    uniform float uPix; uniform float uSizeMul; uniform float uGain;
    varying vec3 vCol; varying float vA;
    void main(){
      vCol = aColor; vA = aAlpha * uGain;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = clamp(aSize * uSizeMul * uPix / max(0.02, -mv.z), 1.0, 460.0);
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

  /** the tapered profile every thread of light is stroked with — soft flanks, hot core */
  const TAPER = (() => {
    const NT = 128, d = new Uint8Array(NT * 4);
    for (let i = 0; i < NT; i++) {
      const x = (i + 0.5) / NT * 2 - 1;
      const v = Math.exp(-x * x * 3.1) * 0.42 + Math.exp(-x * x * 26) * 0.72;
      const c = clamp(v, 0, 1) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(d, NT, 1, THREE.RGBAFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  })();
  const ribbonMat = () => new THREE.MeshBasicMaterial({
    map: TAPER, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide,
  });

  /** the void behind the instrument — a wide, soft, cold bloom, never a visible disc */
  const HAZE = (() => {
    const NH = 160, d = new Uint8Array(NH * NH * 4);
    for (let y = 0; y < NH; y++) for (let x = 0; x < NH; x++) {
      const dx = (x + 0.5) / NH - 0.5, dy = (y + 0.5) / NH - 0.44;
      const v = Math.exp(-(dx * dx * 1.1 + dy * dy * 2.4) * 9.5);
      const j = (y * NH + x) * 4;
      d[j] = v * 8; d[j + 1] = v * 17; d[j + 2] = v * 24; d[j + 3] = 255;
    }
    const t = new THREE.DataTexture(d, NH, NH, THREE.RGBAFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  })();

  // ---- the terrain the grains live in: relief from the grains themselves, lit cold.
  const BASE = (() => {
    const b = new Float32Array(RES * RES * 3);
    const hf = new Float32Array(RES * RES);
    for (let g = 0; g < N; g++) {
      if (layerOf[g] !== 0) continue;
      const cx = (0.06 + 0.88 * uOf(g)) * RES, cy = (1 - (0.06 + 0.88 * vOf(g))) * RES;
      const s = 30 + 240 * sal[g];
      const r = 16;
      for (let y = Math.max(0, cy - r | 0); y <= Math.min(RES - 1, cy + r | 0); y++)
        for (let x = Math.max(0, cx - r | 0); x <= Math.min(RES - 1, cx + r | 0); x++) {
          const dx = x - cx, dy = y - cy;
          hf[y * RES + x] += sal[g] * Math.exp(-(dx * dx + dy * dy) / s);
        }
    }
    let hMax = 0;
    for (let i = 0; i < RES * RES; i++) hMax = Math.max(hMax, hf[i]);
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const j = (y * RES + x) * 3, i = y * RES + x;
      const h = hf[i] / hMax;
      // relief shading: light raking in from the upper-left, so the ground reads as terrain
      const gx = (hf[Math.max(0, i - 1)] - hf[Math.min(RES * RES - 1, i + 1)]) / hMax;
      const gy = (hf[Math.max(0, i - RES)] - hf[Math.min(RES * RES - 1, i + RES)]) / hMax;
      let v = 0.014 + 0.075 * h + clamp((gx + gy) * 0.9, -0.02, 0.05);
      if (x % 25 === 0 || y % 25 === 0) v += 0.012;
      if (x % 100 === 0 || y % 100 === 0) v += 0.016;
      const ex = Math.abs(x / RES - 0.5) * 2, ey = Math.abs(y / RES - 0.5) * 2;
      v *= clamp(1.3 - Math.pow(Math.max(ex, ey), 5) * 1.3, 0, 1);
      b[j] = v * 0.34; b[j + 1] = v * 0.78; b[j + 2] = v * 1.0;
    }
    return b;
  })();

  // ------------------------------------------------------------------ build one stack
  function build(arm: Arm) {
    const sc = arm.scene;

    // atmosphere — the cold bloom behind, and the breath of the pit below the ground plane
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(50, 32), new THREE.MeshBasicMaterial({
      map: HAZE, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    haze.position.set(0, 1.9, -14); haze.renderOrder = -10; sc.add(haze);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({
      map: HAZE, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    pit.position.set(0, -3.4, -6); pit.renderOrder = -9; sc.add(pit);

    // the terrain plate — dark ground, lit only by what the log leaves on it
    const data = new Uint8Array(RES * RES * 4);
    const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    arm.surf = { ash: new Float32Array(RES * RES), cool: new Float32Array(RES * RES), data, tex };
    // transparent:true keeps the plate in the transparent pass, so painter's order puts it
    // OVER the haze behind it (the haze is a void glow, never a wash on the ground itself)
    const ter = new THREE.Mesh(new THREE.PlaneGeometry(TER_W, TER_D),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    ter.rotation.x = -Math.PI / 2; ter.position.y = 0; ter.renderOrder = 0; sc.add(ter);
    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(TER_W, TER_D)),
      new THREE.LineBasicMaterial({ color: 0x63b9d2, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.005; rim.renderOrder = 1; sc.add(rim);

    // threads — tapered additive ribbons, never 1px lines
    arm.tPos = new Float32Array(MAX_THREADS * QT * 4 * 3);
    arm.tCol = new Float32Array(MAX_THREADS * QT * 4 * 4);
    const tuv = new Float32Array(MAX_THREADS * QT * 4 * 2);
    const tidx = new Uint32Array(MAX_THREADS * QT * 6);
    for (let q = 0; q < MAX_THREADS * QT; q++) {
      tuv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      tidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    arm.thrGeo = new THREE.BufferGeometry();
    arm.thrGeo.setAttribute("position", new THREE.BufferAttribute(arm.tPos, 3));
    arm.thrGeo.setAttribute("uv", new THREE.BufferAttribute(tuv, 2));
    arm.thrGeo.setAttribute("color", new THREE.BufferAttribute(arm.tCol, 4));
    arm.thrGeo.setIndex(new THREE.BufferAttribute(tidx, 1));
    const thr = new THREE.Mesh(arm.thrGeo, ribbonMat());
    thr.renderOrder = 20; thr.frustumCulled = false; sc.add(thr);

    // the desk lights — a hairline from the sentence down to every claim it still holds
    arm.lPos = new Float32Array(8 * 4 * 3);
    arm.lCol = new Float32Array(8 * 4 * 4);
    const luv = new Float32Array(8 * 4 * 2), lidx = new Uint16Array(8 * 6);
    for (let q = 0; q < 8; q++) {
      luv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      lidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    arm.litGeo = new THREE.BufferGeometry();
    arm.litGeo.setAttribute("position", new THREE.BufferAttribute(arm.lPos, 3));
    arm.litGeo.setAttribute("uv", new THREE.BufferAttribute(luv, 2));
    arm.litGeo.setAttribute("color", new THREE.BufferAttribute(arm.lCol, 4));
    arm.litGeo.setIndex(new THREE.BufferAttribute(lidx, 1));
    const lit = new THREE.Mesh(arm.litGeo, ribbonMat());
    lit.renderOrder = 19; lit.frustumCulled = false; sc.add(lit);

    // bodies — every node is somebody: grains, readings, findings, claims
    arm.bSize = new Float32Array(N); arm.bAlpha = new Float32Array(N);
    arm.bCol = new Float32Array(N * 3);
    const bPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      bPos[i * 3] = px[i]; bPos[i * 3 + 1] = py[i] + (layerOf[i] === 0 ? 0.03 : 0); bPos[i * 3 + 2] = pz[i];
    }
    arm.bodyGeo = new THREE.BufferGeometry();
    arm.bodyGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
    arm.bodyGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.bSize, 1));
    arm.bodyGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.bAlpha, 1));
    arm.bodyGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.bCol, 3));
    for (const [pw, sz, gn, wh] of [[1.7, 3.4, 0.32, 0], [3.2, 1.35, 0.85, 0.10],
      [9.0, 0.52, 1.00, 0.72]] as [number, number, number, number][]) {
      const p = new THREE.Points(arm.bodyGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 30; p.frustumCulled = false; sc.add(p);
    }

    // the sentence — a white beam at the top of the stack: the desk that holds the claims
    arm.deskMats = [];
    for (const [w, h, op] of [[2.5, 0.40, 0.16], [2.05, 0.135, 0.50], [1.8, 0.05, 0.95]]) {
      const m = new THREE.MeshBasicMaterial({ map: TAPER, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        color: new THREE.Color(0.92, 0.98, 1.0) });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      q.position.set(0, DESK_Y, 0); q.renderOrder = 25; sc.add(q);
      arm.deskMats.push(m);
    }

    // particles — sparks, drains, walkers, embers, the pit's slow fog
    arm.pPos = new Float32Array(PART_MAX * 3);
    arm.pSize = new Float32Array(PART_MAX);
    arm.pAlpha = new Float32Array(PART_MAX);
    arm.pCol = new Float32Array(PART_MAX * 3);
    arm.partGeo = new THREE.BufferGeometry();
    arm.partGeo.setAttribute("position", new THREE.BufferAttribute(arm.pPos, 3));
    arm.partGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.pSize, 1));
    arm.partGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.pAlpha, 1));
    arm.partGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.pCol, 3));
    for (const [pw, sz, gn, wh] of [[1.8, 2.6, 0.34, 0], [3.6, 1.0, 1.0, 0.30]] as
      [number, number, number, number][]) {
      const p = new THREE.Points(arm.partGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 40; p.frustumCulled = false; sc.add(p);
    }

    // rings — the look-up marks: a walk arriving on the ground, a break burning mid-air
    arm.rPos = new Float32Array(12 * 3); arm.rSize = new Float32Array(12);
    arm.rAlpha = new Float32Array(12); arm.rCol = new Float32Array(12 * 3);
    arm.ringGeo = new THREE.BufferGeometry();
    arm.ringGeo.setAttribute("position", new THREE.BufferAttribute(arm.rPos, 3));
    arm.ringGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.rSize, 1));
    arm.ringGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.rAlpha, 1));
    arm.ringGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.rCol, 3));
    const rings = new THREE.Points(arm.ringGeo, mkPoint(1, 1, 1, 0, 1));
    rings.renderOrder = 45; rings.frustumCulled = false; sc.add(rings);

    // dark columns — a floater's shadow shaft: normal-blended black, it dims the threads
    // and terrain behind it so the emptiness under a burning claim is visible as darkness
    arm.cPos = new Float32Array(claims.length * 4 * 3);
    arm.cCol = new Float32Array(claims.length * 4 * 4);
    const cidx = new Uint16Array(claims.length * 6);
    for (let q = 0; q < claims.length; q++)
      cidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    arm.colGeo = new THREE.BufferGeometry();
    arm.colGeo.setAttribute("position", new THREE.BufferAttribute(arm.cPos, 3));
    arm.colGeo.setAttribute("color", new THREE.BufferAttribute(arm.cCol, 4));
    arm.colGeo.setIndex(new THREE.BufferAttribute(cidx, 1));
    const colMesh = new THREE.Mesh(arm.colGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.NormalBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    }));
    colMesh.renderOrder = 22; colMesh.frustumCulled = false; sc.add(colMesh);

    // level rims — one faint rail per summary layer, sized to that layer's own bodies,
    // so the five levels of the tower read from the picture alone
    for (const L of [1, 2, 3]) {
      let ex = 0, ez = 0;
      for (let i = 0; i < N; i++) if (layerOf[i] === L) {
        ex = Math.max(ex, Math.abs(px[i])); ez = Math.max(ez, Math.abs(pz[i]));
      }
      const rimL = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(ex * 2 + 0.5, ez * 2 + 0.36)),
        new THREE.LineBasicMaterial({ color: 0x63b9d2, transparent: true,
          opacity: 0.055 + 0.02 * L, blending: THREE.AdditiveBlending,
          depthWrite: false, depthTest: false }));
      rimL.rotation.x = -Math.PI / 2; rimL.position.y = LAYER_Y[L]; rimL.renderOrder = 1;
      sc.add(rimL);
    }
  }
  arms.forEach(build);

  // ------------------------------------------------------------------ residue
  /** One deposit into the terrain. Stamped, not stroked. kind 0 = cool light, 1 = ash. */
  function stamp(arm: Arm, kind: number, node: number, amt: number, rad: number) {
    const f = kind ? arm.surf.ash : arm.surf.cool;
    const cx = (0.06 + 0.88 * uOf(node)) * RES, cy = (1 - (0.06 + 0.88 * vOf(node))) * RES;
    const r = Math.ceil(rad), s2 = 2 * (rad * 0.55) * (rad * 0.55);
    const xa = Math.max(0, (cx - r) | 0), xb = Math.min(RES - 1, (cx + r) | 0);
    const ya = Math.max(0, (cy - r) | 0), yb = Math.min(RES - 1, (cy + r) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      f[y * RES + x] += amt * Math.exp(-d2 / s2);
    }
  }
  /** THE WORLD REMEMBERS: residue is a fact about the past — additive, forward-only. */
  function residueTo(arm: Arm, t: number) {
    if (t < arm.resTick) { arm.surf.ash.fill(0); arm.surf.cool.fill(0); arm.resTick = -1; }
    for (let k = arm.resTick + 1; k <= t; k++)
      for (const s of arm.stampsByTick[k]) stamp(arm, s.kind, s.node, s.amt, s.rad);
    arm.resTick = t;
  }
  /** Reinhard per channel — deposits arrive forever and the plate never blows out. */
  function paintSurface(arm: Arm) {
    const { ash, cool, data, tex } = arm.surf;
    for (let p = 0, j = 0; p < RES * RES; p++, j += 4) {
      const a = ash[p] / (ash[p] + 0.8), c = cool[p] / (cool[p] + 0.8);
      const b = p * 3;
      data[j] = clamp(BASE[b] * 255 + a * 155 + c * 30, 0, 255);
      data[j + 1] = clamp(BASE[b + 1] * 255 + a * 50 + c * 96, 0, 255);
      data[j + 2] = clamp(BASE[b + 2] * 255 + a * 18 + c * 122, 0, 255);
      data[j + 3] = 255;
    }
    tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ three, two viewports
  const canvas = el("gl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;
  const cam = new THREE.PerspectiveCamera(34, 1.2, 0.1, 140);
  const VIEW = { elev: 13.2, azim: 21, dist: 10.9, gain: 1.0, tempo: 1.0 };

  function placeCamera(tt: number) {
    const pt = pageTimeOf(tt);
    // THE HEAL gets the frame: the camera leans in while the tombstones replay, then settles
    const healK = ease(clamp((tt - 157) / 3)) * (1 - ease(clamp((tt - 167) / 6)));
    const e = (VIEW.elev + 0.55 * Math.sin(pt * 0.049)) * Math.PI / 180;
    const a = (VIEW.azim + 2.3 * Math.sin(pt * 0.030)) * Math.PI / 180;
    const r = VIEW.dist - 1.35 * healK + 0.12 * Math.sin(pt * 0.021);
    const ly = 2.16;
    cam.position.set(r * Math.cos(e) * Math.sin(a), r * Math.sin(e) + ly, r * Math.cos(e) * Math.cos(a));
    cam.lookAt(0, ly, 0);
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
    // gl_PointSize is in device pixels, so the world→pixel scale must follow the dpr
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

  // ------------------------------------------------------------------ playback
  const P = { tick: 0, playing: true };
  let forcePaint = true;
  const scrub = el("scrub") as HTMLInputElement;
  let scrubbing = false;
  scrub.addEventListener("pointerdown", () => { scrubbing = true; });
  addEventListener("pointerup", () => { scrubbing = false; });
  scrub.addEventListener("input", () => { P.tick = parseFloat(scrub.value); forcePaint = true; });
  addEventListener("keydown", (e) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && e.key !== "l" && e.key !== "L") return;
    if (e.key === " ") { P.playing = !P.playing; e.preventDefault(); }
    if (e.key === "r" || e.key === "R") { P.tick = 0; forcePaint = true; }
    if (e.key === "l" || e.key === "L") el("panel").classList.toggle("on");
    if (e.key === "Escape") el("panel").classList.remove("on");
  });

  // ------------------------------------------------------------------ the look-up
  // The piece opens already asking its question: claim 343 is the one the log heals on the
  // right and abandons on the left — picked from the events, not by hand.
  let pinned = (() => {
    for (const w of arms[1].walksPre) {
      if (!w.ok && arms[1].killT[w.claim] === Infinity && arms[1].postByClaim[w.claim]?.ok) return w.claim;
    }
    return claims[0];
  })();
  let hover = -1;
  const picked = () => (hover >= 0 ? hover : pinned);
  const scrX = new Float32Array(claims.length), scrY = new Float32Array(claims.length);
  const pickAt = (cx: number, cy: number) => {
    const ox = cx < halfW ? 0 : halfW + GUT;
    let best = -1, bd = 36 * 36;
    for (let k = 0; k < claims.length; k++) {
      const dx = cx - (ox + scrX[k]), dy = cy - scrY[k];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = claims[k]; }
    }
    return best;
  };
  canvas.addEventListener("pointermove", (e) => {
    hover = pickAt(e.clientX, e.clientY);
    canvas.style.cursor = hover >= 0 ? "crosshair" : "default";
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; });
  canvas.addEventListener("pointerdown", (e) => {
    const b = pickAt(e.clientX, e.clientY);
    if (b >= 0) pinned = b;
  });

  // ------------------------------------------------------------------ per-frame assembly
  const v3 = new THREE.Vector3();
  const bez = (a: number, c: number, b: number, s: number) =>
    lerp(lerp(a, c, s), lerp(c, b, s), s);
  const WB = [0, 0.020, 0.025, 0.030, 0.036];   // thread base width by parent layer
  let partCount = 0, partPeak = 0;

  interface Live { walks: Walk[]; sel: Walk | null; selU: number }
  /** which logged walks are on stage at this tick, plus the picked claim's looping replay */
  function liveWalks(arm: Arm, tt: number): Live {
    const walks: Walk[] = [];
    for (const w of arm.walksPre) if (tt >= w.t && tt < w.t + WALK_DUR + 2.0) walks.push(w);
    for (const w of arm.walksPost) if (tt >= w.t && tt < w.t + WALK_DUR + 2.0) walks.push(w);
    let sel: Walk | null = null, selU = 0;
    const c = picked();
    if (c >= 0 && tt >= 140) {
      sel = (tt < HEAL_SETTLE ? arm.preByClaim[c] : arm.postByClaim[c]) ?? null;
      selU = fract(tt / WLOOP) * WLOOP;
    }
    return { walks, sel, selU };
  }

  function updateArm(arm: Arm, tt: number, expo: number) {
    const pt = pageTimeOf(tt);
    const boost = arm.boost, glow = arm.glow;
    boost.fill(0); glow.fill(0);
    // the verdict hold: floaters burn hardest at the end (the right stack has none left)
    const finK = ease(clamp((tt - 190) / 4));

    // ---- particle pool: immediate mode, evaluated from ticks, never integrated
    const pp = arm.pPos, ps = arm.pSize, pa = arm.pAlpha, pc = arm.pCol;
    let n = 0;
    const emit = (x: number, y: number, z: number, sz: number, al: number,
      c: readonly [number, number, number]) => {
      if (n >= PART_MAX) return;
      pp[n * 3] = x; pp[n * 3 + 1] = y; pp[n * 3 + 2] = z;
      ps[n] = sz; pa[n] = al; pc[n * 3] = c[0]; pc[n * 3 + 1] = c[1]; pc[n * 3 + 2] = c[2];
      n++;
    };
    let ringN = 0;
    const ring = (x: number, y: number, z: number, sz: number, al: number,
      c: readonly [number, number, number]) => {
      if (ringN >= 12) return;
      const k = ringN++;
      arm.rPos[k * 3] = x; arm.rPos[k * 3 + 1] = y; arm.rPos[k * 3 + 2] = z;
      arm.rSize[k] = sz; arm.rAlpha[k] = al;
      arm.rCol[k * 3] = c[0]; arm.rCol[k * 3 + 1] = c[1]; arm.rCol[k * 3 + 2] = c[2];
    };

    // the pit breathes — slow cold fog under the ground plane
    for (let k = 0; k < 7; k++) {
      const drift = fract(pt * 0.012 * (0.5 + hh(k, 1)) + hh(k, 2));
      emit((hh(k, 3) - 0.5) * 7.5 + Math.sin(pt * 0.05 + k * 2.1) * 0.5,
        -0.55 - 2.1 * drift, (hh(k, 4) - 0.5) * 2.6 - 0.8,
        1.6 + 1.6 * hh(k, 5), 0.030 * (1 - drift), SIG);
    }

    // the walks — ignition running down the logged path, breaking exactly where it broke
    const lw = liveWalks(arm, tt);
    const runWalk = (w: Walk, u: number, strong: number) => {
      if (!w.path.length) return;
      const hops = w.path.length - 1;
      const uEnd = w.ok ? WALK_DUR : w.breakU;
      if (u < uEnd && hops > 0) {
        const h = Math.min(hops - 1, Math.floor(u / HOP));
        const f = ease(clamp((u - h * HOP) / HOP));
        const a0 = w.path[h], b0 = w.path[h + 1];
        const x = lerp(px[a0], px[b0], f), y = lerp(py[a0], py[b0], f), z = lerp(pz[a0], pz[b0], f);
        emit(x, y, z, 0.115, 1.5 * strong, WHITE);
        for (let k = 1; k <= 4; k++) {
          const fb = clamp(f - k * 0.09);
          emit(lerp(px[a0], px[b0], fb), lerp(py[a0], py[b0], fb), lerp(pz[a0], pz[b0], fb),
            0.07 - k * 0.011, (1 - k * 0.2) * 0.8 * strong, SIG);
        }
        const ti = arm.threadIdx[`${a0}>${b0}`];
        if (ti !== undefined) boost[ti] = Math.max(boost[ti], Math.sin(Math.PI * f) * strong);
        for (let hb = 0; hb < h; hb++) {
          const tb = arm.threadIdx[`${w.path[hb]}>${w.path[hb + 1]}`];
          if (tb !== undefined) boost[tb] = Math.max(boost[tb], 0.45 * strong);
        }
      }
      if (w.ok && u >= WALK_DUR) {              // arrival: the reason, touched
        const g = w.path[w.path.length - 1];
        const age = clamp((u - WALK_DUR) / 1.6);
        ring(px[g], 0.07, pz[g], 0.34 + 1.1 * ease(age), (1 - age) * 0.85 * strong, SIG);
        for (let k = 0; k < 10; k++) {
          const th = k / 10 * 6.283 + hh(g + k) * 0.5, rr = (0.1 + 0.5 * ease(age));
          emit(px[g] + Math.cos(th) * rr, 0.07, pz[g] + Math.sin(th) * rr * 0.8,
            0.045, (1 - age) * 0.8 * strong, WHITE);
        }
      }
      if (!w.ok && u >= w.breakU) {             // the break: ember, earned exactly here
        const bn = w.path[w.path.length - 1];
        const age = clamp((u - w.breakU) / 1.5);
        glow[bn] = Math.max(glow[bn], (1 - age * 0.5) * strong);
        ring(px[bn], py[bn], pz[bn], 0.24 + 0.55 * ease(age), (1 - age) * 0.95 * strong, EMB);
        for (let k = 0; k < 8; k++) {
          const th2 = hh(bn * 7 + k) * 6.283, rr = 0.06 + 0.34 * ease(age) * (0.4 + 0.6 * hh(k, 8));
          emit(px[bn] + Math.cos(th2) * rr, py[bn] + 0.16 * age * hh(k, 9), pz[bn] + Math.sin(th2) * rr * 0.7,
            0.05 * (1 + age), (1 - age) * 0.9 * strong, EMB);
        }
      }
    };
    for (const w of lw.walks) runWalk(w, tt - w.t, 1);
    if (lw.sel) runWalk(lw.sel, lw.selU, 0.85);

    // kills — light draining out of the bodies, falling back to the ground it came from
    for (const e of arm.raw.events) {
      if (e.e !== "kill") continue;
      const age = tt - e.t;
      if (age < 0 || age > 2.6) continue;
      for (const nd of e.nodes) {
        for (let k = 0; k < 6; k++) {
          const d0 = hh(nd * 11 + k) * 0.6, pr = clamp((age - d0) / 1.8);
          if (pr <= 0 || pr >= 1) continue;
          const fall = pr * pr;
          emit(px[nd] + (hh(nd + k, 5) - 0.5) * 0.14, lerp(py[nd], 0.07, fall),
            pz[nd] + (hh(nd + k, 6) - 0.5) * 0.10,
            0.062 - 0.03 * pr, (1 - pr) * 0.95,
            [lerp(WHITE[0], EMB[0], pr), lerp(WHITE[1], EMB[1], pr), lerp(WHITE[2], EMB[2], pr)]);
        }
        if (age < 0.7) glow[nd] = Math.max(glow[nd], 1 - age / 0.7);
      }
    }

    // build sparks — each new unit of budget arrives as a mote sliding down its thread
    for (const th of arm.threads) {
      for (let hI = th.hist.length - 1; hI >= 0; hI--) {
        const ht = th.hist[hI];
        if (ht > tt) continue;
        if (tt - ht > 1.1) break;
        const f = ease((tt - ht) / 1.1);
        emit(lerp(px[th.a], px[th.b], f), lerp(py[th.a], py[th.b], f), lerp(pz[th.a], pz[th.b], f),
          0.075, Math.sin(Math.PI * f) * 1.1, hI ? SIG : WHITE);
      }
    }

    // THE HEAL — a replayed note made unmissable: a bright comet head rides the re-ignited
    // link down, then the weld flares and holds a beat (right stack only, by the log)
    for (const h of arm.heals) {
      const age = tt - h.t;
      if (age < 0 || age > 3.6) continue;
      if (age <= 2.2) {                          // the traveling head
        const f = ease(clamp(age / 2.2));
        const x = lerp(px[h.parent], px[h.child], f), y = lerp(py[h.parent], py[h.child], f),
          z = lerp(pz[h.parent], pz[h.child], f);
        emit(x, y, z, 0.22, 2.1, WHITE);
        for (let k = 1; k <= 5; k++) {           // the comet tail, back up the thread
          const fb = clamp(f - k * 0.06);
          emit(lerp(px[h.parent], px[h.child], fb), lerp(py[h.parent], py[h.child], fb),
            lerp(pz[h.parent], pz[h.child], fb), 0.10 - k * 0.013, (1 - k * 0.16) * 1.1, SIG);
        }
        for (let k = 0; k < 6; k++) {
          emit(x + (hh(k, 21) - 0.5) * 0.18, y + (hh(k, 22) - 0.5) * 0.18, z + (hh(k, 23) - 0.5) * 0.14,
            0.055, (1 - f) * 0.9, SIG);
        }
        if (age < 0.9) ring(px[h.parent], py[h.parent], pz[h.parent],
          0.16 + 0.30 * ease(age / 0.9), (1 - age / 0.9) * 0.8, WHITE);
        ring(px[h.child], py[h.child], pz[h.child], 0.2 + 0.5 * f, 0.4 + 0.5 * f, SIG);
      } else {                                   // the weld holds — the beat of arrival
        const a2 = clamp((age - 2.2) / 1.4);
        emit(px[h.child], py[h.child], pz[h.child], 0.24 * (1 - a2 * 0.5), (1 - a2) * 1.4, WHITE);
        ring(px[h.child], py[h.child], pz[h.child], 0.3 + 0.9 * ease(a2), (1 - a2) * 0.95, SIG);
        for (let k = 0; k < 8; k++) {
          const th3 = k / 8 * 6.283 + hh(h.child + k, 24) * 0.6, rr = 0.08 + 0.42 * ease(a2);
          emit(px[h.child] + Math.cos(th3) * rr, py[h.child] + 0.10 * ease(a2) * (hh(k, 25) - 0.3),
            pz[h.child] + Math.sin(th3) * rr * 0.7, 0.05, (1 - a2) * 0.9, SIG);
        }
      }
    }

    // floaters — claims still lit at the desk with nothing alive beneath: they BURN.
    // This is the human number made visible; it must read from across the room.
    for (const c of claims) {
      const from = arm.floaterFrom[c];
      if (from === undefined || tt < from || tt >= arm.floaterTo[c]) continue;
      const on = ease(clamp((tt - from) / 1.2)) * (1 + 0.55 * finK);
      emit(px[c], py[c], pz[c], 0.50 * on, (0.34 + 0.14 * Math.sin(pt * 2.1 + c)) * on, EMB);
      for (let k = 0; k < 6; k++) {
        const cyc = fract(pt * 0.10 * (0.7 + 0.6 * hh(c + k, 31)) + hh(c + k, 32));
        emit(px[c] + Math.sin(pt * 0.4 + k * 2.2 + c) * 0.10, py[c] + 0.14 + 0.66 * cyc,
          pz[c] + Math.cos(pt * 0.3 + k * 1.7) * 0.08,
          0.085, Math.sin(Math.PI * cyc) * 0.9 * on, EMB);
      }
    }
    // the dark column beneath each floater — a shadow shaft that grows down from the
    // burning claim to the ground, so "nothing alive underneath" is visible as darkness
    const cp = arm.cPos, cc = arm.cCol;
    for (let k = 0; k < claims.length; k++) {
      const c = claims[k], o12 = k * 12, o16 = k * 16;
      const from = arm.floaterFrom[c];
      const on = from === undefined || tt < from || tt >= arm.floaterTo[c]
        ? 0 : ease(clamp((tt - from) / 1.6));
      if (on <= 0) { for (let vi = 0; vi < 4; vi++) cc[o16 + vi * 4 + 3] = 0; continue; }
      const yTop = py[c] - 0.10, yBot = lerp(py[c] - 0.55, 0.10, on);
      const txc = cam.position.x - px[c], tzc = cam.position.z - pz[c];
      const invc = 1 / Math.max(1e-5, Math.hypot(txc, tzc));
      const wc = claimR(c) * 1.5, nxc = -tzc * invc * wc, nzc = txc * invc * wc;
      cp[o12] = px[c] - nxc; cp[o12 + 1] = yTop; cp[o12 + 2] = pz[c] - nzc;
      cp[o12 + 3] = px[c] + nxc; cp[o12 + 4] = yTop; cp[o12 + 5] = pz[c] + nzc;
      cp[o12 + 6] = px[c] + nxc; cp[o12 + 7] = yBot; cp[o12 + 8] = pz[c] + nzc;
      cp[o12 + 9] = px[c] - nxc; cp[o12 + 10] = yBot; cp[o12 + 11] = pz[c] - nzc;
      const aTop = (0.66 + 0.20 * finK) * on, aBot = 0.34 * on;
      for (let vi = 0; vi < 4; vi++) {
        cc[o16 + vi * 4] = 0; cc[o16 + vi * 4 + 1] = 0; cc[o16 + vi * 4 + 2] = 0;
        cc[o16 + vi * 4 + 3] = vi < 2 ? aTop : aBot;
      }
    }
    (arm.colGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.colGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // persistent break marks — the ember knots where the path died (left: forever)
    for (const bm of arm.breakMarks) {
      if (tt < bm.from || tt >= bm.to) continue;
      glow[bm.node] = Math.max(glow[bm.node], 0.9 + 0.25 * Math.sin(pt * 1.9 + bm.node));
      emit(px[bm.node], py[bm.node], pz[bm.node], 0.30,
        0.40 + 0.18 * Math.sin(pt * 1.9 + bm.node), EMB);
    }

    // each claim carries its district as living light — a slow orbit of souls, sized by pop
    for (const c of claims) {
      if (arm.killT[c] !== Infinity && tt > arm.killT[c] + 0.7) continue;
      const nSat = 3 + Math.round(9 * popOf[c] / maxPop);
      const flo = arm.floaterFrom[c] !== undefined && tt >= arm.floaterFrom[c] && tt < arm.floaterTo[c];
      const rr = claimR(c) * 1.55 + 0.06;
      for (let k = 0; k < nSat; k++) {
        const ang = pt * (0.10 + 0.10 * hh(c + k, 41)) * (hh(c + k, 42) > 0.5 ? 1 : -1)
          + k * 6.283 / nSat;
        emit(px[c] + Math.cos(ang) * rr, py[c] + 0.05 * Math.sin(pt * 0.6 + k),
          pz[c] + Math.sin(ang) * rr * 0.55,
          0.040, 0.34, flo ? EMB : SIG);
      }
    }

    // the selected claim: a quiet ring on the body, so the question has a subject
    const selC = picked();
    if (selC >= 0) {
      const flo = arm.floaterFrom[selC] !== undefined && tt >= arm.floaterFrom[selC]
        && tt < arm.floaterTo[selC];
      ring(px[selC], py[selC], pz[selC], claimR(selC) * 2.4,
        0.5 + 0.22 * Math.sin(pt * 1.8), flo ? EMB : WHITE);
    }
    arm.partGeo.setDrawRange(0, n);
    (arm.partGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    partCount = Math.max(partCount, n);
    for (let k = ringN; k < 12; k++) arm.rAlpha[k] = 0;
    (arm.ringGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- threads: tapered, thickened by the log, slack when their people die
    const tp = arm.tPos, tc = arm.tCol;
    for (let ti = 0; ti < arm.threads.length; ti++) {
      const th = arm.threads[ti];
      const o16 = ti * QT * 4 * 4;
      const born = tt >= th.t0;
      const ghost = th.healed && !born && tt >= 148;   // the tombstone, flickering in the archive
      if (!born && !ghost) {
        for (let q = 0; q < QT * 4; q++) tc[o16 + q * 4 + 3] = 0;
        continue;
      }
      let copies = 0;
      for (const htick of th.hist) if (htick <= tt) copies++;
      const grow = th.healed && born ? ease(clamp((tt - th.t0) / 2.2)) : ease(clamp((tt - th.t0) / 1.4));
      const deadF = th.deadT === Infinity ? 0 : ease(clamp((tt - th.deadT) / 2.4));
      // thickness IS the left rule made visible: 18 copies reads as a pillar, 1 as a hair
      const w0 = WB[layerOf[th.a]] * (0.34 + 0.92 * Math.sqrt(Math.max(1, copies)));
      const sag = deadF * th.len * (0.16 + 0.10 * hh(ti, 51));
      const bst = boost[ti];
      // colour of the thread at this tick
      let cr: number, cg: number, cb: number, aBase: number;
      if (ghost) {
        const flick = 0.5 + 0.5 * Math.sin(pt * 2.3 + ti * 1.7);
        const flare = tt >= 158 ? 2.6 : 1;               // the archive lights up just before replay
        cr = SIG[0]; cg = SIG[1]; cb = SIG[2];
        aBase = 0.030 * flick * flare;
      } else {
        const alive = 1 - deadF;
        cr = lerp(HUSK[0], SIG[0], alive); cg = lerp(HUSK[1], SIG[1], alive);
        cb = lerp(HUSK[2], SIG[2], alive);
        aBase = (0.115 + 0.105 * Math.sqrt(copies)) * (1 - 0.90 * deadF);
        // a many-copies pillar burns with a white-hot core — the left rule's whole budget
        const pillar = clamp((copies - 1) / 14) * 0.45 * alive;
        if (pillar > 0) {
          cr = lerp(cr, WHITE[0], pillar); cg = lerp(cg, WHITE[1], pillar);
          cb = lerp(cb, WHITE[2], pillar);
        }
        if (th.healed && born) {                         // the repaired weld stays brighter
          aBase *= 1.65;
          cr = lerp(cr, WHITE[0], 0.22); cg = lerp(cg, WHITE[1], 0.22);
          cb = lerp(cb, WHITE[2], 0.22);
        }
      }
      // idle motion keyed to the wiring itself, so the two textures differ at every pause:
      // single-copy lace glints laterally; a thick spine pumps a pulse down its length
      let glintU = -1, glintW = 0;
      if (!ghost && born && deadF < 0.5) {
        if (copies === 1 && tt > th.t0 + 1.5) {
          glintU = fract(pt * (0.030 + 0.028 * hh(ti, 61)) + hh(ti, 62)); glintW = 0.30;
        } else if (copies >= 4) {
          glintU = fract(pt * 0.16 + hh(ti, 63)); glintW = 0.55;
        }
      }
      // reinforcement pulses — budget landing on the spine, running down the thread
      let pulseU = -1;
      if (th.healed && born && tt - th.t0 <= 2.2) pulseU = ease((tt - th.t0) / 2.2);
      else for (let hI = th.hist.length - 1; hI >= 0; hI--) {
        const htk = th.hist[hI];
        if (htk > tt) continue;
        if (tt - htk > 1.0) break;
        pulseU = ease(tt - htk); break;
      }
      const midX = (px[th.a] + px[th.b]) / 2, midY = (py[th.a] + py[th.b]) / 2 - sag,
        midZ = (pz[th.a] + pz[th.b]) / 2;
      for (let j = 0; j < JN; j++) {
        const s = (j / (JN - 1)) * (th.healed && born ? grow : 1);
        const gx = bez(px[th.a], midX, px[th.b], s);
        const gy = bez(py[th.a], midY, py[th.b], s);
        const gz = bez(pz[th.a], midZ, pz[th.b], s);
        const s2 = Math.min(1, s + 0.02);
        const dxx = bez(px[th.a], midX, px[th.b], s2) - gx;
        const dyy = bez(py[th.a], midY, py[th.b], s2) - gy;
        const dzz = bez(pz[th.a], midZ, pz[th.b], s2) - gz;
        // ribbon width axis = tangent × view, so a thread never turns edge-on
        const tx = cam.position.x - gx, ty = cam.position.y - gy, tz = cam.position.z - gz;
        let nx2 = dyy * tz - dzz * ty, ny2 = dzz * tx - dxx * tz, nz2 = dxx * ty - dyy * tx;
        const inv = 1 / Math.max(1e-5, Math.hypot(nx2, ny2, nz2));
        const wj = w0 * (1 - 0.40 * s) * 0.5 * (1 + bst * 0.7);
        nx2 *= inv * wj; ny2 *= inv * wj; nz2 *= inv * wj;
        // grow-in for build threads: the not-yet-wired remainder is dark
        const growA = th.healed ? 1 : (s <= grow ? 1 : 0);
        let aj = aBase * (1 - 0.30 * s) * growA;
        let rj = cr, gj = cg, bj = cb;
        if (ghost && (j & 1)) aj *= 0.25;                // the tombstone reads as a dashed memory
        if (pulseU >= 0) {
          const d = Math.abs(s - pulseU);
          const k = Math.exp(-d * d * 90) * 1.6;
          aj += k * 0.85; rj = lerp(rj, WHITE[0], clamp(k)); gj = lerp(gj, WHITE[1], clamp(k));
          bj = lerp(bj, WHITE[2], clamp(k));
        }
        if (glintU >= 0) {
          const dg = Math.abs(s - glintU);
          const kg = Math.exp(-dg * dg * 70) * glintW;
          aj += kg; rj = lerp(rj, WHITE[0], clamp(kg * 1.5)); gj = lerp(gj, WHITE[1], clamp(kg * 1.5));
          bj = lerp(bj, WHITE[2], clamp(kg * 1.5));
        }
        if (bst > 0) { rj = lerp(rj, WHITE[0], bst * 0.7); gj = lerp(gj, WHITE[1], bst * 0.7);
          bj = lerp(bj, WHITE[2], bst * 0.7); aj += bst * 0.30; }
        aj *= expo;
        // two verts per joint; quads join consecutive joints
        for (const side of [0, 1]) {
          const sgn = side ? 1 : -1;
          // vertex slots: quad q uses joints q (v0,v1) and q+1 (v2,v3)
          if (j < JN - 1) {
            const q = ti * QT + j, vo = q * 4 + side;      // v0 (left) / v1 (right) of quad j
            tp[vo * 3] = gx + sgn * nx2; tp[vo * 3 + 1] = gy + sgn * ny2; tp[vo * 3 + 2] = gz + sgn * nz2;
            tc[vo * 4] = rj; tc[vo * 4 + 1] = gj; tc[vo * 4 + 2] = bj; tc[vo * 4 + 3] = aj;
          }
          if (j > 0) {
            const q = ti * QT + (j - 1), vo = q * 4 + 3 - side; // v3 (left) / v2 (right)
            tp[vo * 3] = gx + sgn * nx2; tp[vo * 3 + 1] = gy + sgn * ny2; tp[vo * 3 + 2] = gz + sgn * nz2;
            tc[vo * 4] = rj; tc[vo * 4 + 1] = gj; tc[vo * 4 + 2] = bj; tc[vo * 4 + 3] = aj;
          }
        }
      }
    }
    // zero any unused thread slots once per frame (cheap, keeps seeks clean)
    for (let ti = arm.threads.length; ti < MAX_THREADS; ti++) {
      const o16 = ti * QT * 4 * 4;
      for (let q = 0; q < QT * 4; q++) tc[o16 + q * 4 + 3] = 0;
    }
    (arm.thrGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.thrGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- the desk lights: every surviving claim hangs from the sentence on a hairline.
    //      A floater's hairline burns ember — lit at the top, nothing alive beneath.
    const lp = arm.lPos, lc = arm.lCol;
    for (let k = 0; k < claims.length; k++) {
      const c = claims[k];
      const o12 = k * 12, o16 = k * 16;
      const dead = arm.killT[c] !== Infinity && tt > arm.killT[c];
      const deadF = dead ? ease(clamp((tt - arm.killT[c]) / 2.0)) : 0;
      const flo = arm.floaterFrom[c] !== undefined && tt >= arm.floaterFrom[c] && tt < arm.floaterTo[c];
      const y0 = py[c] + 0.14, y1 = DESK_Y - 0.10;
      const tx = cam.position.x - px[c], tz = cam.position.z - pz[c];
      const inv = 1 / Math.max(1e-5, Math.hypot(tx, tz));
      const w = flo ? 0.018 : 0.0075, nx2 = -tz * inv * w, nz2 = tx * inv * w;
      const col = flo ? EMB : WHITE;
      const al = ((flo ? 0.34 * (0.7 + 0.3 * Math.sin(pt * 1.7 + c)) : 0.05) * (1 - deadF)) * expo;
      lp[o12] = px[c] - nx2; lp[o12 + 1] = y0; lp[o12 + 2] = pz[c] - nz2;
      lp[o12 + 3] = px[c] + nx2; lp[o12 + 4] = y0; lp[o12 + 5] = pz[c] + nz2;
      lp[o12 + 6] = px[c] + nx2; lp[o12 + 7] = y1; lp[o12 + 8] = pz[c] + nz2;
      lp[o12 + 9] = px[c] - nx2; lp[o12 + 10] = y1; lp[o12 + 11] = pz[c] - nz2;
      for (let vi = 0; vi < 4; vi++) {
        lc[o16 + vi * 4] = col[0]; lc[o16 + vi * 4 + 1] = col[1]; lc[o16 + vi * 4 + 2] = col[2];
        lc[o16 + vi * 4 + 3] = al * (vi < 2 ? 1 : 0.55);
      }
    }
    (arm.litGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.litGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- bodies
    const bs = arm.bSize, ba = arm.bAlpha, bc = arm.bCol;
    for (let i = 0; i < N; i++) {
      const L = layerOf[i];
      if (L === 4) { ba[i] = 0; continue; }              // the sentence is the beam, not a dot
      let sz: number, al: number;
      let cr = SIG[0], cg = SIG[1], cb = SIG[2];
      if (L === 0) {
        sz = 0.050 + 0.070 * sal[i]; al = 0.28 + 0.55 * sal[i];
        cr = lerp(SIG[0], WHITE[0], 0.3); cg = lerp(SIG[1], WHITE[1], 0.3); cb = lerp(SIG[2], WHITE[2], 0.3);
      } else if (L === 1) { sz = 0.075; al = 0.42; }
      else if (L === 2) { sz = 0.105; al = 0.60; }
      else {
        sz = claimR(i); al = 0.95;
        const flo = arm.floaterFrom[i] !== undefined && tt >= arm.floaterFrom[i] && tt < arm.floaterTo[i];
        if (flo) {
          const p2 = 0.70 + 0.30 * Math.sin(pt * 2.1 + i * 1.3);
          cr = EMB[0]; cg = EMB[1]; cb = EMB[2];
          al = (1.6 + 0.8 * finK) * p2; sz *= 1.18 + 0.10 * finK;
        }
      }
      const kt = arm.killT[i];
      if (kt !== Infinity && tt >= kt) {
        const flash = clamp((tt - kt) / 0.7);
        const drain = ease(clamp((tt - kt - 0.7) / 1.7));
        if (flash < 1) { cr = EMB[0]; cg = EMB[1]; cb = EMB[2]; al = al * 1.2 + 1.0 * (1 - flash); sz *= 1.25; }
        else {
          cr = lerp(EMB[0], HUSK[0], drain); cg = lerp(EMB[1], HUSK[1], drain);
          cb = lerp(EMB[2], HUSK[2], drain);
          al = lerp(al, 0.06, drain); sz *= lerp(1.1, 0.55, drain);
        }
      }
      const g = glow[i];
      if (g > 0) { cr = lerp(cr, EMB[0], clamp(g)); cg = lerp(cg, EMB[1], clamp(g));
        cb = lerp(cb, EMB[2], clamp(g)); al += g * 0.7; }
      if (i === selC) { al = Math.min(1.7, al * 1.6 + 0.2); sz *= 1.18; }
      bs[i] = sz; ba[i] = al; bc[i * 3] = cr; bc[i * 3 + 1] = cg; bc[i * 3 + 2] = cb;
    }
    (arm.bodyGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // the sentence breathes; both stacks hold it at the same height, the whole run long
    const breathe = 0.90 + 0.10 * Math.sin(pt * 0.55);
    arm.deskMats[0].opacity = 0.16 * breathe * expo;
    arm.deskMats[1].opacity = 0.50 * breathe * expo;
    arm.deskMats[2].opacity = 0.95 * breathe * expo;
  }

  // ------------------------------------------------------------------ chrome
  const LNAME = ["grain", "reading", "finding", "claim", "the desk"];
  const preOkA = Math.round(mA.walkabilityPreHeal * mA.survClaims);
  const preOkB = Math.round(mB.walkabilityPreHeal * mB.survClaims);
  el("meta").textContent = `seed ${log.seed} · ${N} nodes · ${commas(totalPop)} people · `
    + `${mA.spend} of ${log.B} edge-units spent in each stack`;
  el("meta2").textContent = `the same ${mA.workersKilled} computers fail in both · `
    + `logs ${A.logHash} / ${B.logHash}`;
  el("meta3").textContent = `top to bottom: the sentence · claims · findings · readings · the ground`;
  el("recA").textContent = `records kept at pruning: ${mA.tombstones} — nothing to replay`;
  el("recB").textContent = `records kept at pruning: ${mB.tombstones} tombstones · `
    + `${mB.crossEdges} cross-links`;
  el("finA").textContent = `breaks ${mA.breaks} · tombstones ${mA.tombstones} · `
    + `heals ${mA.healsFired} — permanent`;

  // the narration — one plain sentence per phase, every number read from the log's metrics.
  // It lives in #story in the foot band; #phase carries only the act count.
  const NARR: [number, number, string][] = [
    [0, 1, `Both towers of summaries are being wired right now — the same ${mA.spend} links, `
      + `spent under two different rules.`],
    [68, 1, `The left tower keeps only each conclusion's single strongest support, thickening `
      + `one spine. The right tower spreads the same links across many neighbors.`],
    [120, 2, `${mA.workersKilled} of the ${NWORK} computers doing the summarizing have just `
      + `failed — the same ${mA.workersKilled} in both towers.`],
    [130, 2, `Every link that ran through a failed computer has gone dark and slack, in both `
      + `towers alike.`],
    [140, 3, `Every surviving claim is now asked one question: can an engineer still trace it `
      + `down to a real sensor reading on the ground?`],
    [152, 3, `Claims that stay lit with nothing alive beneath them now hold `
      + `${commas(mA.floaterPopPreHeal)} people in the left tower and `
      + `${commas(mB.floaterPopPreHeal)} in the right.`],
    [158, 4, `The right tower replays the notes it kept when it discarded links, and repairs `
      + `every break. The left tower kept no notes, so its breaks are permanent.`],
    [166, 4, `The right tower's ${mB.healsFired} repairs are complete, and every one of its `
      + `${mB.survClaims} surviving claims can reach a real sensor reading again.`],
    [180, 5, `The trace test runs again: the right tower traces down from every claim, and `
      + `the left tower breaks in the same ${mA.breaks} places as before.`],
    [192, 5, `The left tower ends with ${mA.walksOk} of ${mA.survClaims} claims traceable and `
      + `${commas(mA.floaterPop)} people crossing on conclusions nobody can check. The right `
      + `tower traces down everywhere.`],
  ];
  function walkDesc(arm: Arm, c: number, post: boolean): string {
    if (arm.killT[c] !== Infinity) return `the claim died with computer ${workerOf[c]}`;
    const w = post ? arm.postByClaim[c] : arm.preByClaim[c];
    if (!w) return "—";
    if (w.ok) {
      const g = w.path[w.path.length - 1];
      const healed = arm.heals.some((h) =>
        w.path.some((p2, i2) => i2 < w.path.length - 1 && p2 === h.parent && w.path[i2 + 1] === h.child));
      return `walks ${w.path.length - 1} steps to grain ${g}${healed ? " — over the healed thread" : ""}`;
    }
    if (w.path.length <= 1) return "breaks at the claim itself";
    const bn = w.path[w.path.length - 1];
    return `breaks at ${LNAME[layerOf[bn]]} ${bn} — nothing living below`;
  }

  let msAvg = 0, msMax = 0, msWin = 0, frame = 0, last = -1;
  function chrome(tt: number) {
    const ti = Math.min(T - 1, Math.floor(tt));
    el("tick").textContent = `${String(ti).padStart(3, "0")} / ${T}`;
    if (!scrubbing) scrub.value = String(Math.min(T - 1, tt));
    let ph = NARR[0];
    for (const p of NARR) if (tt >= p[0]) ph = p;
    el("phase").textContent = `act ${ph[1]} of 5`;
    if (el("story").textContent !== ph[2]) {
      el("story").textContent = ph[2];
      // the story line may wrap differently between phases; keep the GL strip honest
      if (el("foot").offsetHeight !== bandBot) resize();
    }
    const post = tt >= HEAL_SETTLE;
    if (tt < 140) {
      // before the walks there is no walk to count. What IS on the record is the budget
      // being spent and the workers dying — both identical across the stacks, on purpose.
      for (const [ok, oks, pop, pops, arm] of
        [["okA", "okAs", "popA", "popAs", arms[0]], ["okB", "okBs", "popB", "popBs", arms[1]]] as
        [string, string, string, string, Arm][]) {
        el(ok).textContent = `${arm.spendByTick[ti]} of ${arm.raw.metrics.B}`;
        el(oks).textContent = " edge-units wired";
        el(pop).className = "num";
        el(pop).textContent = String(NWORK - arm.workersDeadByTick[ti]);
        el(pops).textContent = ` of ${NWORK} computers alive`;
      }
    } else {
      // the counts — read from the log's metrics, switched (and, once, counted down) by the
      // heal the log actually performed. The left number never moves. That is the piece.
      el("okAs").textContent = el("okBs").textContent = " claims can still be traced to a sensor reading";
      el("popAs").textContent = el("popBs").textContent =
        " people crossing on claims nobody can check";
      el("popA").className = "ember num"; el("popB").className = "cold num";
      el("okA").textContent = `${preOkA} of ${mA.survClaims}`;
      el("popA").textContent = commas(mA.floaterPopPreHeal);
      if (!post) {
        el("okB").textContent = `${preOkB} of ${mB.survClaims}`;
        el("popB").textContent = commas(mB.floaterPopPreHeal);
      } else {
        // the fall to zero happens inside the slow heal act, so a viewer can watch it move
        const f = ease(clamp((tt - HEAL_SETTLE - 0.5) / 3.0));
        el("okB").textContent = `${f > 0.5 ? mB.walksOk : preOkB} of ${mB.survClaims}`;
        el("popB").textContent = commas(lerp(mB.floaterPopPreHeal, mB.floaterPop, f));
      }
    }
    const fired = arm1FiredHeals(tt);
    el("finB").textContent = `breaks ${mB.breaks} · tombstones ${mB.tombstones} · `
      + `heals ${fired} of ${mB.healsFired}${fired === mB.healsFired && post ? " — restored" : ""}`;
    const c = picked();
    el("pick").textContent = c < 0
      ? "point at a claim on either stack"
      : tt < 140
        ? `claim ${c} · ${commas(popOf[c])} people · the walks begin at t140`
        : `claim ${c} · ${commas(popOf[c])} people · left: ${walkDesc(arms[0], c, post)} · `
          + `right: ${walkDesc(arms[1], c, post)}`;
    el("meter").textContent = `${msAvg.toFixed(2)} ms/frame · worst ${msMax.toFixed(2)}`;
    el("meter2").textContent = `${partPeak} sparks · dpr ${renderer.getPixelRatio().toFixed(0)} · `
      + `${(halfW - GUT) | 0}×${stageH | 0} ×2`;
    el("meterM").textContent = `walkability ${mA.walkabilityPreHeal}→${mA.walkability} / `
      + `${mB.walkabilityPreHeal}→${mB.walkability} · heals ${mB.healsFired} fired of `
      + `${mB.healsPossible} replayable`;
    partPeak = partCount; partCount = 0;
  }
  const arm1FiredHeals = (tt: number) => {
    let f = 0;
    for (const h of arms[1].heals) if (tt >= h.t + 1.1) f++;
    return f;
  };

  const bind = (id: string, vid: string, dp: number, set: (n: number) => void) => {
    const e = el(id) as HTMLInputElement;
    e.addEventListener("input", () => {
      const v = parseFloat(e.value); set(v); el(vid).textContent = v.toFixed(dp);
    });
  };
  bind("pGain", "vGain", 2, (v) => { VIEW.gain = v; });
  bind("pElev", "vElev", 1, (v) => { VIEW.elev = v; });
  bind("pAzim", "vAzim", 1, (v) => { VIEW.azim = v; });
  bind("pDist", "vDist", 2, (v) => { VIEW.dist = v; });
  bind("pRate", "vRate", 2, (v) => { VIEW.tempo = v; });

  // ------------------------------------------------------------------ the loop
  const baseGain = allPointMats.map((m) => m.uniforms.uGain.value as number);
  function loop(now: number) {
    requestAnimationFrame(loop);
    const t0 = performance.now();
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    const want = Math.min(devicePixelRatio, 2);
    if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize(); }
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    if (P.playing && !scrubbing) {
      P.tick += dt * rateAt(P.tick) * VIEW.tempo;
      if (P.tick >= T) { P.tick -= T; forcePaint = true; }   // a new pass starts on a clean plate
    }
    const tt = clamp(P.tick, 0, T - 0.001);
    placeCamera(tt);
    for (let i = 0; i < allPointMats.length; i++)
      allPointMats[i].uniforms.uGain.value = baseGain[i] * VIEW.gain;

    for (const arm of arms) {
      residueTo(arm, Math.floor(tt));
      updateArm(arm, tt, VIEW.gain);
    }
    // residue repaint: amortised to one plate per frame; a seek repaints both, so a paused
    // frame is complete and pixel-stable
    if (forcePaint) { paintSurface(arms[0]); paintSurface(arms[1]); forcePaint = false; }
    else paintSurface(arms[frame & 1]);

    // claim screen positions, for the look-up (both stacks share them)
    for (let k = 0; k < claims.length; k++) {
      v3.set(px[claims[k]], py[claims[k]], pz[claims[k]]).project(cam);
      scrX[k] = (v3.x * 0.5 + 0.5) * (halfW - GUT);
      scrY[k] = bandTop + (1 - (v3.y * 0.5 + 0.5)) * stageH;
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
    if ((frame & 1) === 0) chrome(tt);
    frame++;
  }
  requestAnimationFrame(loop);

  // ------------------------------------------------------------------ the hero handle
  // seek is deterministic: the frame is a pure function of the tick (plus the pinned claim,
  // itself read from the log), and a seek forces a complete residue repaint.
  (window as unknown as { __HERO: unknown }).__HERO = {
    seek(tick: number) { P.tick = clamp(tick, 0, T - 0.001); P.playing = false; forcePaint = true; },
    tick() { return P.tick; },
    maxTick() { return T - 1; },
    pause() { P.playing = false; },
    play() { P.playing = true; },
    pick(id: number) { pinned = id; hover = -1; },
    claims() {
      return claims.map((c, k) => ({ id: c, pop: popOf[c],
        leftX: scrX[k], rightX: halfW + GUT + scrX[k], y: scrY[k] }));
    },
    state() {
      return {
        tick: P.tick, ms: +msAvg.toFixed(2), msMax: +msMax.toFixed(2), picked: picked(),
        seed: log.seed, budget: log.B, hashes: [A.logHash, B.logHash],
        metrics: [mA, mB],
        counts: {
          left: { ok: el("okA").textContent, pop: el("popA").textContent, fin: el("finA").textContent },
          right: { ok: el("okB").textContent, pop: el("popB").textContent, fin: el("finB").textContent },
        },
        phase: el("phase").textContent,
        story: el("story").textContent,
      };
    },
  };
}

boot();
