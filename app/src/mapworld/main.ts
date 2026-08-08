/**
 * THE MAP — the seed-3 hero pair of docs/trust/the-map, as one instrument.
 *
 * One territory. The same 39 shocks, tick for tick, hitting two dispatch desks.
 * The only thing that differs is what a desk does with a new map while its crews
 * are mid-stride:
 *
 *   left   "CHASE THE MAP"       every refresh, every crew turns from where it stands
 *   right  "REROUTE AT THE TIPS" the leg being walked is locked; only route tails move
 *
 * The piece exists for one reversal: the scarred panel keeps its people, the clean
 * panel loses them. In CHASE the ember lives on the GROUND — 82 km of cleared road
 * re-ignited behind turning crews — and 37 of 39 service windows close warm. In TIPS
 * the threads run long and clean, zero kilometres wasted, and ten sites go out in
 * ember inside their closing windows. Churn is the price of currency; plan stability
 * is a vanity metric.
 *
 * NOTHING HERE IS SIMULATED. The page is a consumer of `/mapworld-log.json`, the
 * baked event log of seed 3, MED volatility. Every crew position, thread, halo,
 * scar and number on screen is read out of that log: `pos` samples drive the crews,
 * `shock`/`arrive`/`miss` drive the windows and their endings, `abandon` ignites the
 * walked-back stubs, `refresh` fires the stale-map sweep, and `metrics` are the
 * counts. There is no assignment rule, no shock schedule, no policy anywhere in
 * this file — search it and you will not find one.
 *
 * Determinism: every frame is a pure function of ONE number, the playback tick.
 * Effects are evaluated from event ticks rather than integrated, ground residue is
 * re-deposited from tick zero on any rewind, and the camera drift is driven by the
 * tick too. Pause at tick N, reload, pause at tick N: the same pixels. No unseeded
 * random source, no wall clock, anywhere.
 */
import * as THREE from "three";

// ------------------------------------------------------------------ geometry of the piece
const MAP_W = 4.35;        // world units, the footprint of one territory
const MAP_D = 4.35;
const RES = 288;           // ground residue texture, per side
const PART_MAX = 900;      // effect particle pool per desk (measured peak is far lower)
const LOOKBACK = 5;        // ticks of event history an effect can still be burning from
const HOLD = 9;            // ticks the final frame holds before the loop restarts

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const el = (id: string) => document.getElementById(id)!;
const commas = (n: number) => Math.round(n).toLocaleString("en-US");

const SIG: [number, number, number] = [0.49, 0.976, 1.0];    // the cold signal — living threads
const EMB: [number, number, number] = [1.0, 0.482, 0.235];   // the burn — waste, and only waste
const WHITE: [number, number, number] = [0.85, 0.98, 1.0];
const WARM: [number, number, number] = [1.0, 0.90, 0.74];    // served-in-window settle

// ------------------------------------------------------------------ the log, verbatim
interface SiteRec { i: number; x: number; y: number; pop: number }
type Ev =
  | { e: "world"; sites: SiteRec[] }
  | { e: "shock"; t: number; i: number; mag: number; window: number }
  | { e: "refresh"; t: number }
  | { e: "assign"; t: number; crew: number; route: number[] }
  | { e: "abandon"; t: number; crew: number; site: number; progressKm: number }
  | { e: "pos"; t: number; crews: [number, number][] }
  | { e: "arrive"; t: number; crew: number; i: number; served: number; pop: number; inWindow: boolean }
  | { e: "miss"; t: number; i: number; pop: number }
  | { e: "end"; t: number };

interface Metrics {
  served: number; missed: number; servedShocks: number; missedShocks: number;
  totalShocks: number; churnKm: number; churnHours: number; survival: number;
  medTTS: number; distKm: number; swapsFired: number; swapOpps: number;
}
interface RawArm { name: string; metrics: Metrics; logHash: string; events: Ev[] }
interface RawLog {
  seed: number; regime: string; lambda: number; M: number; T: number;
  crews: number; kmPerUnit: number; arms: RawArm[];
}

/** One shock as the log tells it, with its ending attached by pure event lookup. */
interface Shock { t: number; i: number; mag: number; window: number; dl: number; servedAt: number }

interface Arm {
  raw: RawArm;
  // tables, all derived from the event log by re-indexing — never by re-running policy
  NS: number;                       // number of pos samples (every 2 ticks)
  samples: Float32Array;            // [s*C+c]*2 → unit x,y
  segLen: Float32Array;             // C*(NS-1) segment lengths, unit space
  emberTick: Float32Array;          // tick a segment re-ignited at (abandon), else INF
  shocksBySite: Shock[][];
  missBySite: { t: number; pop: number }[][];
  serveBySite: { t: number; served: number }[][];   // in-window arrivals only
  crewAbandons: { t: number; km: number }[][];      // per crew, time-ordered
  byTickShock: Shock[][]; byTickServe: { t: number; i: number; served: number }[][];
  byTickMiss: { t: number; i: number; pop: number }[][];
  byTickAband: { t: number; crew: number; x: number; z: number }[][];
  abandonSegs: { t: number; segs: number[] }[];
  target: Int16Array;               // (T+1)*C → site a crew is walking toward, or -1
  servedCum: Float32Array; missedCum: Float32Array; churnCum: Float32Array;
  winServedCum: Int16Array; winMissedCum: Int16Array; abandCntCum: Int16Array;
  pins: Uint8Array;                 // NR*S — what the desk's stale map shows per refresh
  // scene
  scene: THREE.Scene;
  ash: Float32Array; cool: Float32Array; char: Float32Array;
  resData: Uint8Array; resTex: THREE.DataTexture; resTick: number; resDirty: boolean;
  bodyGeo: THREE.BufferGeometry; bSize: Float32Array; bAlpha: Float32Array; bCol: Float32Array;
  haloGeo: THREE.BufferGeometry; hSize: Float32Array; hAlpha: Float32Array; hCol: Float32Array;
  pinGeo: THREE.BufferGeometry; nSize: Float32Array; nAlpha: Float32Array; nCol: Float32Array;
  crewGeo: THREE.BufferGeometry; cPos: Float32Array; cSize: Float32Array;
  cAlpha: Float32Array; cCol: Float32Array;
  thrGeo: THREE.BufferGeometry; tPos: Float32Array; tCol: Float32Array;
  partGeo: THREE.BufferGeometry; pPos: Float32Array; pSize: Float32Array;
  pAlpha: Float32Array; pCol: Float32Array;
  ringGeo: THREE.BufferGeometry; rPos: Float32Array; rSize: Float32Array;
  rAlpha: Float32Array; rCol: Float32Array;
  sweep: THREE.Mesh; sweepMat: THREE.MeshBasicMaterial;
}

async function boot() {
  const log = await (await fetch("/mapworld-log.json")).json() as RawLog;
  const T = log.T, C = log.crews, KM = log.kmPerUnit;
  const A = log.arms[0], B = log.arms[1];
  const world = A.events.find((e): e is Extract<Ev, { e: "world" }> => e.e === "world")!;
  const sites = world.sites, S = sites.length;
  const pop = sites.map((s) => s.pop);
  const totPop = pop.reduce((a, b) => a + b, 0);
  const maxPop = Math.max(...pop);
  const refreshTicks = A.events.filter((e) => e.e === "refresh").map((e) => (e as { t: number }).t);
  const NR = refreshTicks.length;
  const totalShocks = A.metrics.totalShocks;

  // ---- ground placement: the log's unit square, centred. Everything is somebody:
  //      a site is people waiting, sized by how many of them there are.
  const wx = new Float32Array(S), wz = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    wx[i] = (sites[i].x - 0.5) * MAP_W;
    wz[i] = (0.5 - sites[i].y) * MAP_D;
  }
  const bodyR = new Float32Array(S);
  for (let i = 0; i < S; i++) bodyR[i] = 0.048 + 0.132 * Math.sqrt(pop[i] / maxPop);

  // ------------------------------------------------------------------ per-desk tables
  function prep(raw: RawArm): Arm {
    const evByTick: Ev[][] = Array.from({ length: T + 1 }, () => []);
    for (const e of raw.events) if (e.e !== "world") evByTick[Math.min(T, (e as { t: number }).t)].push(e);

    // crew positions, straight from the `pos` samples
    const posEvs = raw.events.filter((e): e is Extract<Ev, { e: "pos" }> => e.e === "pos");
    const NS = posEvs.length;
    const samples = new Float32Array(NS * C * 2);
    for (let s = 0; s < NS; s++) for (let c = 0; c < C; c++) {
      samples[(s * C + c) * 2] = posEvs[s].crews[c][0];
      samples[(s * C + c) * 2 + 1] = posEvs[s].crews[c][1];
    }
    const segLen = new Float32Array(C * (NS - 1));
    for (let c = 0; c < C; c++) for (let j = 0; j < NS - 1; j++) {
      const a0 = (j * C + c) * 2, a1 = ((j + 1) * C + c) * 2;
      segLen[c * (NS - 1) + j] = Math.hypot(samples[a1] - samples[a0], samples[a1 + 1] - samples[a0 + 1]);
    }

    // shocks and their endings. An in-window arrival at a site settles every window
    // open there; a `miss` event is a window that closed on people. Verified against
    // the log's own metrics (servedShocks / missedShocks) — see __HERO.state().
    const shocksBySite: Shock[][] = Array.from({ length: S }, () => []);
    const serveBySite: { t: number; served: number }[][] = Array.from({ length: S }, () => []);
    const missBySite: { t: number; pop: number }[][] = Array.from({ length: S }, () => []);
    for (const e of raw.events) {
      if (e.e === "shock") shocksBySite[e.i].push({ t: e.t, i: e.i, mag: e.mag, window: e.window, dl: e.t + e.window, servedAt: Infinity });
      else if (e.e === "arrive" && e.inWindow) serveBySite[e.i].push({ t: e.t, served: e.served });
      else if (e.e === "miss") missBySite[e.i].push({ t: e.t, pop: e.pop });
    }
    for (let i = 0; i < S; i++) for (const sh of shocksBySite[i]) {
      for (const sv of serveBySite[i]) if (sv.t >= sh.t && sv.t <= sh.dl) { sh.servedAt = sv.t; break; }
    }

    // the walked-back stubs: at each abandon, the log's progressKm of trail behind the
    // turning crew re-ignites. Segment indices are stored so the residue deposit and the
    // thread colours agree forever.
    const emberTick = new Float32Array(C * (NS - 1)).fill(Infinity);
    const crewAbandons: { t: number; km: number }[][] = Array.from({ length: C }, () => []);
    const abandonSegs: { t: number; segs: number[] }[] = [];
    const byTickAband: { t: number; crew: number; x: number; z: number }[][] =
      Array.from({ length: T + 1 }, () => []);
    const crewAt = (tt: number, c: number): [number, number] => {
      const s = clamp(tt, 0, 2 * (NS - 1)) / 2, j = Math.floor(s), f = s - j;
      const j1 = Math.min(NS - 1, j + 1);
      const a0 = (j * C + c) * 2, a1 = (j1 * C + c) * 2;
      return [lerp(samples[a0], samples[a1], f), lerp(samples[a0 + 1], samples[a1 + 1], f)];
    };
    for (const e of raw.events) {
      if (e.e !== "abandon") continue;
      crewAbandons[e.crew].push({ t: e.t, km: e.progressKm });
      const [ux, uy] = crewAt(e.t, e.crew);
      byTickAband[Math.min(T, e.t)].push({ t: e.t, crew: e.crew, x: (ux - 0.5) * MAP_W, z: (0.5 - uy) * MAP_D });
      let remain = e.progressKm / KM;
      const segs: number[] = [];
      for (let j = Math.min(NS - 2, Math.ceil(e.t / 2) - 1); j >= 0 && remain > 0; j--) {
        const k = e.crew * (NS - 1) + j;
        if (e.t < emberTick[k]) emberTick[k] = e.t;
        segs.push(k);
        remain -= segLen[k];
      }
      abandonSegs.push({ t: e.t, segs });
    }

    // what each crew is walking toward, per tick — assign sets a route, arrivals walk it
    const target = new Int16Array((T + 1) * C).fill(-1);
    const routes: number[][] = Array.from({ length: C }, () => []);
    const ptr = new Int32Array(C);
    for (let t = 0; t <= T; t++) {
      for (const e of evByTick[t]) {
        if (e.e === "assign") { routes[e.crew] = e.route.slice(); ptr[e.crew] = 0; }
        else if (e.e === "arrive" && routes[e.crew][ptr[e.crew]] === e.i) ptr[e.crew]++;
      }
      for (let c = 0; c < C; c++)
        target[t * C + c] = ptr[c] < routes[c].length ? routes[c][ptr[c]] : -1;
    }

    // the running counts — prefix sums over the events, never retyped
    const servedCum = new Float32Array(T + 1), missedCum = new Float32Array(T + 1);
    const churnCum = new Float32Array(T + 1);
    const winServedCum = new Int16Array(T + 1), winMissedCum = new Int16Array(T + 1);
    const abandCntCum = new Int16Array(T + 1);
    const byTickShock: Shock[][] = Array.from({ length: T + 1 }, () => []);
    const byTickServe: { t: number; i: number; served: number }[][] = Array.from({ length: T + 1 }, () => []);
    const byTickMiss: { t: number; i: number; pop: number }[][] = Array.from({ length: T + 1 }, () => []);
    for (let i = 0; i < S; i++) for (const sh of shocksBySite[i]) byTickShock[Math.min(T, sh.t)].push(sh);
    let sv = 0, ms = 0, ch = 0, ws = 0, wm = 0, ab = 0;
    const servedAtTicks: number[] = [];
    for (let i = 0; i < S; i++) for (const sh of shocksBySite[i])
      if (sh.servedAt <= sh.dl) servedAtTicks.push(sh.servedAt);
    for (let t = 0; t <= T; t++) {
      for (const e of evByTick[t]) {
        if (e.e === "arrive") {
          sv += e.served;
          if (e.inWindow) byTickServe[t].push({ t, i: e.i, served: e.served });
        } else if (e.e === "miss") { ms += e.pop; wm++; byTickMiss[t].push({ t, i: e.i, pop: e.pop }); }
        else if (e.e === "abandon") { ch += e.progressKm; ab++; }
      }
      for (const st of servedAtTicks) if (st === t) ws++;
      servedCum[t] = sv; missedCum[t] = ms; churnCum[t] = ch;
      winServedCum[t] = ws; winMissedCum[t] = wm; abandCntCum[t] = ab;
    }

    // THE STALE MAP, literal: what the desk's snapshot showed at each refresh. A pin is
    // a site the last photograph said was burning. New shocks stay invisible until the
    // next refresh; a site already served keeps its pin until the next refresh too —
    // the photograph is old in both directions.
    const pins = new Uint8Array(NR * S);
    for (let r = 0; r < NR; r++) {
      const tr = refreshTicks[r];
      for (let i = 0; i < S; i++) for (const sh of shocksBySite[i])
        if (sh.t <= tr && sh.dl > tr && !(sh.servedAt <= tr)) pins[r * S + i] = 1;
    }

    return {
      raw, NS, samples, segLen, emberTick, shocksBySite, missBySite, serveBySite,
      crewAbandons, byTickShock, byTickServe, byTickMiss, byTickAband, abandonSegs,
      target, servedCum, missedCum, churnCum, winServedCum, winMissedCum, abandCntCum,
      pins, scene: new THREE.Scene(),
    } as Arm;
  }
  const arms: Arm[] = [prep(A), prep(B)];

  /** crew position in world space at a fractional tick — pos samples, interpolated */
  function crewWorld(arm: Arm, tt: number, c: number, out: THREE.Vector2) {
    const s = clamp(tt, 0, 2 * (arm.NS - 1)) / 2, j = Math.floor(s), f = s - j;
    const j1 = Math.min(arm.NS - 1, j + 1);
    const a0 = (j * C + c) * 2, a1 = (j1 * C + c) * 2;
    out.set(
      (lerp(arm.samples[a0], arm.samples[a1], f) - 0.5) * MAP_W,
      (0.5 - lerp(arm.samples[a0 + 1], arm.samples[a1 + 1], f)) * MAP_D,
    );
  }

  // ------------------------------------------------------------------ shared materials
  /** Layered light: every body is drawn multiple times — halo, body, core. */
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

  /** the tapered profile a thread of light is stroked with — soft flanks, hot core */
  const TAPER = (() => {
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
  })();

  /** the material ground: terrain grain, graticule, the settlements' anchor glow.
   *  Fixed constants and an integer hash — deterministic, no random source. */
  const GRAIN = new Float32Array(RES * RES);
  const BASE = (() => {
    const b = new Float32Array(RES * RES * 3);
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const u = x / RES, v = y / RES;
      let e = Math.sin(u * 7.3 + 1.7) * Math.cos(v * 5.9 + 0.4)
        + 0.6 * Math.sin(u * 13.1 + 4.2) * Math.cos(v * 11.7 + 2.9)
        + 0.35 * Math.sin(u * 23.7 + 0.8) * Math.cos(v * 19.3 + 5.1);
      let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      const g = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      GRAIN[y * RES + x] = g;
      let val = 0.010 + 0.0032 * e + 0.005 * g;
      if (x % 36 === 0 || y % 36 === 0) val += 0.006;
      if (x % 144 === 0 || y % 144 === 0) val += 0.008;
      for (let i = 0; i < S; i++) {
        const dx = u - sites[i].x, dy = v - sites[i].y;
        const s2 = 0.00035 + 0.0016 * (pop[i] / maxPop);
        val += 0.055 * (pop[i] / maxPop) * Math.exp(-(dx * dx + dy * dy) / s2);
      }
      const ex = Math.abs(u - 0.5) * 2, ey = Math.abs(v - 0.5) * 2;
      val *= clamp(1.18 - Math.pow(Math.max(ex, ey), 6) * 1.18, 0, 1);
      const j = (y * RES + x) * 3;
      b[j] = val * 0.40; b[j + 1] = val * 0.80; b[j + 2] = val * 1.0;
    }
    return b;
  })();

  /** the void behind the instrument — a wide, soft, cold bloom, never a visible disc */
  const HAZE = (() => {
    const N = 160, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.44;
      const v = Math.exp(-(dx * dx * 1.1 + dy * dy * 2.4) * 9.5);
      const j = (y * N + x) * 4;
      d[j] = v * 8; d[j + 1] = v * 18; d[j + 2] = v * 25; d[j + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  })();

  // ------------------------------------------------------------------ build one desk
  const NSEG = C * (arms[0].NS - 1);       // history quads per desk
  const NQ = NSEG + C + C;                  // + walking heads + intent ghosts
  function build(arm: Arm) {
    const sc = arm.scene;

    // ---- the ground: one opaque plate whose texture IS the world's memory
    arm.ash = new Float32Array(RES * RES);
    arm.cool = new Float32Array(RES * RES);
    arm.char = new Float32Array(RES * RES);
    arm.resData = new Uint8Array(RES * RES * 4);
    arm.resTex = new THREE.DataTexture(arm.resData, RES, RES, THREE.RGBAFormat);
    arm.resTex.minFilter = arm.resTex.magFilter = THREE.LinearFilter;
    arm.resTick = -1; arm.resDirty = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_W, MAP_D),
      new THREE.MeshBasicMaterial({ map: arm.resTex, depthWrite: false, depthTest: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = 0;
    sc.add(ground);

    // ---- the refresh sweep: the new photograph arriving, one pass of cold light
    arm.sweepMat = new THREE.MeshBasicMaterial({
      map: TAPER, color: new THREE.Color(SIG[0], SIG[1], SIG[2]), transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    arm.sweep = new THREE.Mesh(new THREE.PlaneGeometry(0.85, MAP_D * 1.02), arm.sweepMat);
    arm.sweep.rotation.x = -Math.PI / 2;
    arm.sweep.position.y = 0.015;
    arm.sweep.renderOrder = 1;
    sc.add(arm.sweep);

    // ---- threads: tapered additive ribbons lying on the ground (a 1px line is a comb).
    //      History quad positions are built ONCE from the pos samples; per frame only
    //      colours move. The heads and intent ghosts are the 12 dynamic quads at the end.
    arm.tPos = new Float32Array(NQ * 4 * 3);
    arm.tCol = new Float32Array(NQ * 4 * 4);
    const tuv = new Float32Array(NQ * 4 * 2);
    const tidx = new Uint32Array(NQ * 6);
    for (let q = 0; q < NQ; q++) {
      tuv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      tidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    const W_HIST = 0.016, Y_THR = 0.012;
    for (let c = 0; c < C; c++) for (let j = 0; j < arm.NS - 1; j++) {
      const a0 = (j * C + c) * 2, a1 = ((j + 1) * C + c) * 2;
      const x0 = (arm.samples[a0] - 0.5) * MAP_W, z0 = (0.5 - arm.samples[a0 + 1]) * MAP_D;
      const x1 = (arm.samples[a1] - 0.5) * MAP_W, z1 = (0.5 - arm.samples[a1 + 1]) * MAP_D;
      const inv = 1 / Math.max(1e-5, Math.hypot(x1 - x0, z1 - z0));
      const nx = -(z1 - z0) * inv * W_HIST, nz = (x1 - x0) * inv * W_HIST;
      const o = (c * (arm.NS - 1) + j) * 12;
      arm.tPos[o] = x0 - nx; arm.tPos[o + 1] = Y_THR; arm.tPos[o + 2] = z0 - nz;
      arm.tPos[o + 3] = x0 + nx; arm.tPos[o + 4] = Y_THR; arm.tPos[o + 5] = z0 + nz;
      arm.tPos[o + 6] = x1 + nx; arm.tPos[o + 7] = Y_THR; arm.tPos[o + 8] = z1 + nz;
      arm.tPos[o + 9] = x1 - nx; arm.tPos[o + 10] = Y_THR; arm.tPos[o + 11] = z1 - nz;
    }
    arm.thrGeo = new THREE.BufferGeometry();
    arm.thrGeo.setAttribute("position", new THREE.BufferAttribute(arm.tPos, 3));
    arm.thrGeo.setAttribute("uv", new THREE.BufferAttribute(tuv, 2));
    arm.thrGeo.setAttribute("color", new THREE.BufferAttribute(arm.tCol, 4));
    arm.thrGeo.setIndex(new THREE.BufferAttribute(tidx, 1));
    const thrMesh = new THREE.Mesh(arm.thrGeo, new THREE.MeshBasicMaterial({
      map: TAPER, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    }));
    thrMesh.renderOrder = 2; thrMesh.frustumCulled = false; sc.add(thrMesh);

    // ---- sites: three passes of light over one buffer — halo, body, core
    arm.bSize = new Float32Array(S); arm.bAlpha = new Float32Array(S);
    arm.bCol = new Float32Array(S * 3);
    const bPos = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) { bPos[i * 3] = wx[i]; bPos[i * 3 + 1] = 0.02; bPos[i * 3 + 2] = wz[i]; }
    arm.bodyGeo = new THREE.BufferGeometry();
    arm.bodyGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
    arm.bodyGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.bSize, 1));
    arm.bodyGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.bAlpha, 1));
    arm.bodyGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.bCol, 3));
    for (const [pw, sz, gn, wh] of [[1.7, 3.3, 0.30, 0], [3.2, 1.35, 0.85, 0.10],
      [9.0, 0.52, 1.0, 0.72]] as [number, number, number, number][]) {
      const p = new THREE.Points(arm.bodyGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 4; p.frustumCulled = false; sc.add(p);
    }

    // ---- service windows: one contracting ring per shocked site
    arm.hSize = new Float32Array(S); arm.hAlpha = new Float32Array(S);
    arm.hCol = new Float32Array(S * 3);
    arm.haloGeo = new THREE.BufferGeometry();
    arm.haloGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
    arm.haloGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.hSize, 1));
    arm.haloGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.hAlpha, 1));
    arm.haloGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.hCol, 3));
    const halos = new THREE.Points(arm.haloGeo, mkPoint(1, 1, 1, 0, 1));
    halos.renderOrder = 3; halos.frustumCulled = false; sc.add(halos);

    // ---- the stale map's pins, floating above the ground they describe
    arm.nSize = new Float32Array(S); arm.nAlpha = new Float32Array(S);
    arm.nCol = new Float32Array(S * 3);
    const nPos = new Float32Array(S * 3);
    for (let i = 0; i < S; i++) { nPos[i * 3] = wx[i]; nPos[i * 3 + 1] = 0.34; nPos[i * 3 + 2] = wz[i]; }
    arm.pinGeo = new THREE.BufferGeometry();
    arm.pinGeo.setAttribute("position", new THREE.BufferAttribute(nPos, 3));
    arm.pinGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.nSize, 1));
    arm.pinGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.nAlpha, 1));
    arm.pinGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.nCol, 3));
    const pins = new THREE.Points(arm.pinGeo, mkPoint(1, 1, 1, 0, 1));
    pins.renderOrder = 5; pins.frustumCulled = false; sc.add(pins);

    // ---- crews: people walking — bright cores with halos
    arm.cPos = new Float32Array(C * 3); arm.cSize = new Float32Array(C);
    arm.cAlpha = new Float32Array(C); arm.cCol = new Float32Array(C * 3);
    arm.crewGeo = new THREE.BufferGeometry();
    arm.crewGeo.setAttribute("position", new THREE.BufferAttribute(arm.cPos, 3));
    arm.crewGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.cSize, 1));
    arm.crewGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.cAlpha, 1));
    arm.crewGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.cCol, 3));
    for (const [pw, sz, gn, wh] of [[1.8, 3.8, 0.40, 0], [8.0, 1.0, 1.0, 0.75]] as
      [number, number, number, number][]) {
      const p = new THREE.Points(arm.crewGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 7; p.frustumCulled = false; sc.add(p);
    }

    // ---- effect particles: shock rings, serve blooms, miss implosions, turn flashes
    arm.pPos = new Float32Array(PART_MAX * 3); arm.pSize = new Float32Array(PART_MAX);
    arm.pAlpha = new Float32Array(PART_MAX); arm.pCol = new Float32Array(PART_MAX * 3);
    arm.partGeo = new THREE.BufferGeometry();
    arm.partGeo.setAttribute("position", new THREE.BufferAttribute(arm.pPos, 3));
    arm.partGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.pSize, 1));
    arm.partGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.pAlpha, 1));
    arm.partGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.pCol, 3));
    for (const [pw, sz, gn, wh] of [[1.8, 2.4, 0.34, 0], [3.6, 1.0, 1.0, 0.30]] as
      [number, number, number, number][]) {
      const p = new THREE.Points(arm.partGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 6; p.frustumCulled = false; sc.add(p);
    }

    // ---- look-up rings
    arm.rPos = new Float32Array(4 * 3); arm.rSize = new Float32Array(4);
    arm.rAlpha = new Float32Array(4); arm.rCol = new Float32Array(4 * 3);
    arm.ringGeo = new THREE.BufferGeometry();
    arm.ringGeo.setAttribute("position", new THREE.BufferAttribute(arm.rPos, 3));
    arm.ringGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.rSize, 1));
    arm.ringGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.rAlpha, 1));
    arm.ringGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.rCol, 3));
    const rings = new THREE.Points(arm.ringGeo, mkPoint(1, 1, 1, 0, 1));
    rings.renderOrder = 8; rings.frustumCulled = false; sc.add(rings);

    // ---- atmosphere: one very wide, very soft card far behind the plate
    const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), new THREE.MeshBasicMaterial({
      map: HAZE, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    m.position.set(0, 1.0, -13); m.renderOrder = -10; sc.add(m);
  }
  arms.forEach(build);

  // ------------------------------------------------------------------ residue — the world remembers
  /** One radial deposit into a field, in unit-map coordinates. Stamped, not stroked. */
  function stamp(f: Float32Array, u: number, v: number, amt: number, rad: number) {
    const cx = u * RES, cy = v * RES;
    const r = Math.ceil(rad), s2 = 2 * (rad * 0.55) * (rad * 0.55);
    const xa = Math.max(0, (cx - r) | 0), xb = Math.min(RES - 1, (cx + r) | 0);
    const ya = Math.max(0, (cy - r) | 0), yb = Math.min(RES - 1, (cy + r) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      f[y * RES + x] += amt * Math.exp(-d2 / s2);
    }
  }
  /** a deposit whose weight follows the terrain grain — burns are mottled, never flat */
  function stampG(f: Float32Array, u: number, v: number, amt: number, rad: number) {
    const cx = u * RES, cy = v * RES;
    const r = Math.ceil(rad), s2 = 2 * (rad * 0.55) * (rad * 0.55);
    const xa = Math.max(0, (cx - r) | 0), xb = Math.min(RES - 1, (cx + r) | 0);
    const ya = Math.max(0, (cy - r) | 0), yb = Math.min(RES - 1, (cy + r) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      f[y * RES + x] += amt * Math.exp(-d2 / s2) * (0.45 + 1.1 * GRAIN[y * RES + x]);
    }
  }
  function stampLine(f: Float32Array, x0: number, y0: number, x1: number, y1: number,
    amt: number, rad: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * RES / 1.4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      stamp(f, lerp(x0, x1, t), lerp(y0, y1, t), amt / (steps + 1) * 3, rad);
    }
  }
  const su = (x: number) => x / MAP_W + 0.5;           // world → unit, for segment stamps
  const sv2 = (z: number) => 0.5 - z / MAP_D;
  /** Everything the world remembers about tick t. Additive only — nothing here forgets. */
  function depositTick(arm: Arm, t: number) {
    if (t >= 1) {
      // every crew's step this tick becomes faint permanent road — trunks brighten where
      // the same ground is walked again, which is the vascular story telling itself
      for (let c = 0; c < C; c++) {
        const s0 = clamp(t - 1, 0, 2 * (arm.NS - 1)) / 2, s1 = clamp(t, 0, 2 * (arm.NS - 1)) / 2;
        const j0 = Math.floor(s0), f0 = s0 - j0, j1 = Math.floor(s1), f1 = s1 - j1;
        const k0 = (j0 * C + c) * 2, k0b = (Math.min(arm.NS - 1, j0 + 1) * C + c) * 2;
        const k1 = (j1 * C + c) * 2, k1b = (Math.min(arm.NS - 1, j1 + 1) * C + c) * 2;
        stampLine(arm.cool,
          lerp(arm.samples[k0], arm.samples[k0b], f0), lerp(arm.samples[k0 + 1], arm.samples[k0b + 1], f0),
          lerp(arm.samples[k1], arm.samples[k1b], f1), lerp(arm.samples[k1 + 1], arm.samples[k1b + 1], f1),
          0.08, 1.8);
      }
    }
    // the walked-back stubs re-ignite in ember and stay
    for (const ab of arm.abandonSegs) if (ab.t === t) {
      for (const k of ab.segs) {
        const c = Math.floor(k / (arm.NS - 1)), j = k % (arm.NS - 1);
        const a0 = (j * C + c) * 2, a1 = ((j + 1) * C + c) * 2;
        stampLine(arm.ash, arm.samples[a0], arm.samples[a0 + 1],
          arm.samples[a1], arm.samples[a1 + 1], 0.10, 2.1);
      }
    }
    for (const ab of arm.byTickAband[t])
      stamp(arm.ash, su(ab.x), sv2(ab.z), 0.32, 3.0);
    // a missed window scars the ground around its people, loudly and forever:
    // a charred heart the base light dies inside, ringed by grain-mottled ember
    for (const mi of arm.byTickMiss[t]) {
      const rr = 5.5 + 7.5 * Math.sqrt(pop[mi.i] / maxPop);
      stamp(arm.char, sites[mi.i].x, sites[mi.i].y, 1.7, rr * 0.9);
      for (let m = 0; m < 12; m++) {
        const th = (m / 12) * 6.283 + mi.i * 0.7;
        stampG(arm.ash, sites[mi.i].x + Math.cos(th) * rr * 1.05 / RES,
          sites[mi.i].y + Math.sin(th) * rr * 1.05 / RES, 0.42, rr * 0.62);
      }
      stampG(arm.ash, sites[mi.i].x, sites[mi.i].y, 0.22, rr * 2.3);
    }
    // a window served in time settles a calm mark of light
    for (const sv of arm.byTickServe[t])
      stamp(arm.cool, sites[sv.i].x, sites[sv.i].y, 0.30, 3.6);
    arm.resDirty = true;
  }
  /** Residue is a fact about the past: rebuilt from tick zero on any rewind. */
  function residueTo(arm: Arm, t: number) {
    if (t < arm.resTick) { arm.ash.fill(0); arm.cool.fill(0); arm.char.fill(0); arm.resTick = -1; }
    for (let k = arm.resTick + 1; k <= t; k++) depositTick(arm, k);
    arm.resTick = t;
  }
  /** Reinhard on every channel — deposits keep arriving forever, the frame never blows out.
   *  Char is the one subtractive mark: where a window closed on people, the ground's own
   *  light dies, and the ember rim glows around a smoldering dark heart. */
  function paintSurface(arm: Arm) {
    const d = arm.resData, ash = arm.ash, co = arm.cool, chr = arm.char;
    for (let p = 0, j = 0; p < RES * RES; p++, j += 4) {
      const a = ash[p] / (ash[p] + 0.8), c = co[p] / (co[p] + 0.9);
      const ch = chr[p] / (chr[p] + 1.0);
      const m = 1 - ch * 0.72;
      const b = p * 3;
      d[j] = clamp((BASE[b] * 255 + c * 28) * m + a * 168 + ch * 26, 0, 255);
      d[j + 1] = clamp((BASE[b + 1] * 255 + c * 92) * m + a * 60 + ch * 9, 0, 255);
      d[j + 2] = clamp((BASE[b + 2] * 255 + c * 118) * m + a * 22 + ch * 3, 0, 255);
      d[j + 3] = 255;
    }
    arm.resTex.needsUpdate = true;
    arm.resDirty = false;
  }

  // ------------------------------------------------------------------ three, two viewports
  const canvas = el("gl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;
  const cam = new THREE.PerspectiveCamera(34, 1.2, 0.1, 120);
  const LOOK = new THREE.Vector3(0, 0, 0.06);
  const VIEW = { elev: 54, azim: 0, dist: 5.95, gain: 1.0 };
  function placeCamera(tt: number) {
    // a slow breath, driven by the playback clock so a paused frame is always the same frame
    const a = (VIEW.azim + Math.sin(tt * 0.017) * 2.0) * Math.PI / 180;
    const e = (VIEW.elev + Math.sin(tt * 0.011) * 0.8) * Math.PI / 180;
    const r = VIEW.dist;
    cam.position.set(LOOK.x + r * Math.cos(e) * Math.sin(a), r * Math.sin(e),
      LOOK.z + r * Math.cos(e) * Math.cos(a));
    cam.lookAt(LOOK);
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
  const P = { tick: 0, playing: true, rate: 3.0 };    // 300 ticks / 3.0 = 100 s per pass
  const scrub = el("scrub") as HTMLInputElement;
  scrub.max = String(T);
  let scrubbing = false;
  scrub.addEventListener("pointerdown", () => { scrubbing = true; });
  addEventListener("pointerup", () => { scrubbing = false; });
  scrub.addEventListener("input", () => { P.tick = parseFloat(scrub.value); });
  addEventListener("keydown", (e) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && e.key !== "l" && e.key !== "L") return;
    if (e.key === " ") { P.playing = !P.playing; e.preventDefault(); }
    if (e.key === "r" || e.key === "R") P.tick = 0;
    if (e.key === "l" || e.key === "L") el("panel").classList.toggle("on");
    if (e.key === "Escape") el("panel").classList.remove("on");
  });

  // ------------------------------------------------------------------ the look-up
  const sX = new Float32Array(S), sY = new Float32Array(S);          // sites, panel-local
  const cX = [new Float32Array(C), new Float32Array(C)];             // crews, per desk
  const cY = [new Float32Array(C), new Float32Array(C)];
  let hoverSite = -1, hoverCrew = -1, pinnedSite = -1, pinnedCrew = -1;
  // The piece opens already asking its question: the default pick is the largest body
  // of people the tidy desk lost — read straight out of the log's `miss` events.
  {
    let bp = -1;
    for (const k of [0, 1]) for (let i = 0; i < S; i++) {
      if (arms[k].missBySite[i].length && pop[i] > bp) { bp = pop[i]; pinnedSite = i; }
    }
    if (pinnedSite < 0) pinnedSite = 0;
  }
  function pickAt(px: number, py: number) {
    const side = px < halfW ? 0 : 1;
    const ox = side ? halfW + GUT : 0;
    const lx = px - ox;
    let bc = -1, bcd = 20 * 20;
    for (let c = 0; c < C; c++) {
      const dx = lx - cX[side][c], dy = py - cY[side][c], d = dx * dx + dy * dy;
      if (d < bcd) { bcd = d; bc = c; }
    }
    let bs = -1, bsd = 26 * 26;
    for (let i = 0; i < S; i++) {
      const dx = lx - sX[i], dy = py - sY[i], d = dx * dx + dy * dy;
      if (d < bsd) { bsd = d; bs = i; }
    }
    return { crew: bc, site: bc >= 0 ? -1 : bs };
  }
  canvas.addEventListener("pointermove", (e) => {
    const p = pickAt(e.clientX, e.clientY);
    hoverCrew = p.crew; hoverSite = p.site;
    canvas.style.cursor = (p.crew >= 0 || p.site >= 0) ? "crosshair" : "default";
  });
  canvas.addEventListener("pointerleave", () => { hoverCrew = -1; hoverSite = -1; });
  canvas.addEventListener("pointerdown", (e) => {
    const p = pickAt(e.clientX, e.clientY);
    if (p.crew >= 0) { pinnedCrew = pinnedCrew === p.crew ? -1 : p.crew; pinnedSite = -1; }
    else if (p.site >= 0) { pinnedSite = pinnedSite === p.site ? -1 : p.site; pinnedCrew = -1; }
  });
  const selSite = () => (hoverCrew >= 0 ? -1 : hoverSite >= 0 ? hoverSite : pinnedCrew >= 0 ? -1 : pinnedSite);
  const selCrew = () => (hoverCrew >= 0 ? hoverCrew : hoverSite >= 0 ? -1 : pinnedCrew);

  // ------------------------------------------------------------------ per-frame assembly
  const v3 = new THREE.Vector3();
  const cw = new THREE.Vector2();
  let partCount = 0, paintBudget = 1;

  /** the tightest open service window at a site, and whether one exists */
  function windowAt(arm: Arm, i: number, tt: number): number {
    let frac = -1;
    for (const sh of arm.shocksBySite[i]) {
      if (tt < sh.t || tt >= sh.dl || sh.servedAt <= tt) continue;
      const f = (sh.dl - tt) / sh.window;
      if (frac < 0 || f < frac) frac = f;
    }
    return frac;
  }
  function scarTick(arm: Arm, i: number, tt: number): number {
    for (const m of arm.missBySite[i]) if (m.t <= tt) return m.t;
    return Infinity;
  }
  function servedTick(arm: Arm, i: number, tt: number): number {
    for (const s of arm.serveBySite[i]) if (s.t <= tt) return s.t;
    return Infinity;
  }

  function updateArm(k: number, tt: number) {
    const arm = arms[k];
    const ti = Math.min(T, Math.floor(tt));
    const sSite = selSite(), sCrew = selCrew();

    // ---- sites: calm bodies, flaring windows, warm settles, ember scars
    for (let i = 0; i < S; i++) {
      const frac = windowAt(arm, i, tt);
      const scT = scarTick(arm, i, tt);
      const svT = servedTick(arm, i, tt);
      let a = 0.42 + 0.50 * (pop[i] / maxPop);
      let sz = bodyR[i];
      let r = lerp(SIG[0], 1, 0.35), g = lerp(SIG[1], 1, 0.35), b = lerp(SIG[2], 1, 0.35);
      if (svT < Infinity && scT === Infinity) {
        // served inside the window: settles warm-white and calm
        const gl = Math.exp(-(tt - svT) / 3);
        r = WARM[0]; g = WARM[1]; b = WARM[2];
        a = a * 1.1 + 0.5 * gl; sz *= 1 + 0.25 * gl;
      }
      if (frac >= 0) {
        // an open window: the site flares and pulses harder as the deadline closes
        const urg = 1 - frac;
        a += 0.55 + 0.18 * Math.sin(tt * (2.2 + 2.2 * urg) + i * 1.7);
        sz *= 1.10 + 0.06 * urg;
        r = lerp(r, 1, 0.5); g = lerp(g, 1, 0.5); b = lerp(b, 1, 0.5);
      }
      if (scT < Infinity) {
        // missed: the site goes out in ember and stays scarred
        const fl = Math.exp(-(tt - scT) / 3.2);
        r = EMB[0]; g = EMB[1]; b = EMB[2];
        a = 0.40 + 1.1 * fl; sz = bodyR[i] * (0.95 + 0.5 * fl);
      }
      if (i === sSite) { a = Math.min(1.6, a * 1.8 + 0.2); sz *= 1.2; }
      arm.bSize[i] = sz; arm.bAlpha[i] = a;
      arm.bCol[i * 3] = r; arm.bCol[i * 3 + 1] = g; arm.bCol[i * 3 + 2] = b;

      // the window halo: contracts as the deadline approaches, cold → ember
      if (frac >= 0) {
        const urg = Math.pow(1 - frac, 1.6);
        arm.hSize[i] = (bodyR[i] * 1.15 + (bodyR[i] * 1.9 + 0.10) * frac) * 2.7;
        arm.hAlpha[i] = 0.34 + 0.34 * urg + 0.08 * Math.sin(tt * 2.6 + i);
        arm.hCol[i * 3] = lerp(0.55, EMB[0], urg);
        arm.hCol[i * 3 + 1] = lerp(0.92, EMB[1], urg);
        arm.hCol[i * 3 + 2] = lerp(1.0, EMB[2], urg);
      } else {
        arm.hAlpha[i] = 0; arm.hSize[i] = 0.01;
      }

      // the pin layer: what the desk's last photograph said. Lags the truth on purpose.
      const r0 = Math.max(0, Math.min(NR - 1, Math.floor(tt / log.M)));
      const swAge = tt - refreshTicks[r0];
      const swX = -MAP_W * 0.55 + (MAP_W * 1.1) * ease(clamp(swAge / 1.6));
      const useNew = swAge >= 1.6 || wx[i] <= swX;
      const rEff = useNew ? r0 : Math.max(0, r0 - 1);
      const pin = arm.pins[rEff * S + i];
      if (pin) {
        const fresh = useNew && !arm.pins[Math.max(0, r0 - 1) * S + i] && r0 > 0
          ? ease(clamp((swAge - 1.6) / 0.8 + 1)) : 1;
        arm.nSize[i] = (0.045 + bodyR[i] * 0.25) * 2.7 * fresh;
        arm.nAlpha[i] = 0.72 * fresh;
        arm.nCol[i * 3] = SIG[0]; arm.nCol[i * 3 + 1] = SIG[1]; arm.nCol[i * 3 + 2] = SIG[2];
      } else { arm.nAlpha[i] = 0; arm.nSize[i] = 0.01; }
    }
    for (const g of [arm.bodyGeo, arm.haloGeo, arm.pinGeo]) {
      (g.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    }

    // ---- the refresh sweep: the new photograph passing over the desk
    {
      const r0 = Math.max(0, Math.min(NR - 1, Math.floor(tt / log.M)));
      const swAge = tt - refreshTicks[r0];
      if (swAge < 1.6) {
        const p = swAge / 1.6;
        arm.sweep.position.x = -MAP_W * 0.55 + (MAP_W * 1.1) * ease(p);
        arm.sweepMat.opacity = 0.14 * Math.sin(Math.PI * clamp(p, 0.02, 0.98));
      } else arm.sweepMat.opacity = 0;
    }

    // ---- threads: the walked history, cold where it served, ember where it was wasted
    const tc = arm.tCol;
    const NHIST = C * (arm.NS - 1);
    const sCur = Math.floor(clamp(tt, 0, 2 * (arm.NS - 1)) / 2);
    for (let c = 0; c < C; c++) {
      const hovered = sCrew === c, dimmed = sCrew >= 0 && !hovered;
      for (let j = 0; j < arm.NS - 1; j++) {
        const q = c * (arm.NS - 1) + j;
        const te = 2 * j + 2;
        let alpha = 0;
        let r = SIG[0], g = SIG[1], b = SIG[2];
        if (j < sCur || (j === sCur && tt >= te)) {
          const age = tt - te;
          const ig = arm.emberTick[q];
          if (ig <= tt) {
            // ground cleared, then wasted: the stub re-ignites at the abandon and stays
            const fl = Math.exp(-(tt - ig) / 1.6);
            r = lerp(EMB[0], 1, fl * 0.6); g = lerp(EMB[1], 1, fl * 0.6); b = lerp(EMB[2], 1, fl * 0.6);
            alpha = 0.46 + 1.0 * fl;
          } else {
            alpha = 0.11 + 0.60 * Math.exp(-age / 15);
          }
          if (hovered) alpha = Math.min(1.5, alpha * 2.4 + 0.16);
          else if (dimmed) alpha *= 0.30;
        }
        const o = q * 16;
        for (let vi = 0; vi < 4; vi++) {
          tc[o + vi * 4] = r; tc[o + vi * 4 + 1] = g; tc[o + vi * 4 + 2] = b; tc[o + vi * 4 + 3] = alpha;
        }
      }
    }
    // the walking heads: the current, still-growing stretch of each thread
    const tp = arm.tPos, W_HEAD = 0.023, Y_THR = 0.013;
    for (let c = 0; c < C; c++) {
      const q = NHIST + c;
      const a0 = (Math.min(arm.NS - 1, sCur) * C + c) * 2;
      const x0 = (arm.samples[a0] - 0.5) * MAP_W, z0 = (0.5 - arm.samples[a0 + 1]) * MAP_D;
      crewWorld(arm, tt, c, cw);
      const inv = 1 / Math.max(1e-5, Math.hypot(cw.x - x0, cw.y - z0));
      const nx = -(cw.y - z0) * inv * W_HEAD, nz = (cw.x - x0) * inv * W_HEAD;
      const o = q * 12;
      tp[o] = x0 - nx; tp[o + 1] = Y_THR; tp[o + 2] = z0 - nz;
      tp[o + 3] = x0 + nx; tp[o + 4] = Y_THR; tp[o + 5] = z0 + nz;
      tp[o + 6] = cw.x + nx; tp[o + 7] = Y_THR; tp[o + 8] = cw.y + nz;
      tp[o + 9] = cw.x - nx; tp[o + 10] = Y_THR; tp[o + 11] = cw.y - nz;
      const hb = sCrew === c ? 1.5 : sCrew >= 0 ? 0.5 : 1;
      const oc = q * 16;
      for (let vi = 0; vi < 4; vi++) {
        tc[oc + vi * 4] = lerp(SIG[0], 1, 0.15); tc[oc + vi * 4 + 1] = lerp(SIG[1], 1, 0.15);
        tc[oc + vi * 4 + 2] = lerp(SIG[2], 1, 0.15); tc[oc + vi * 4 + 3] = 0.75 * hb;
      }
      // the intent ghost: the site this crew is walking toward on its desk's plan
      const iq = NHIST + C + c, io = iq * 12, ic = iq * 16;
      const tgt = arm.target[Math.min(T, ti) * C + c];
      if (tgt >= 0) {
        const W_INT = 0.009;
        const inv2 = 1 / Math.max(1e-5, Math.hypot(wx[tgt] - cw.x, wz[tgt] - cw.y));
        const mx = -(wz[tgt] - cw.y) * inv2 * W_INT, mz = (wx[tgt] - cw.x) * inv2 * W_INT;
        tp[io] = cw.x - mx; tp[io + 1] = Y_THR; tp[io + 2] = cw.y - mz;
        tp[io + 3] = cw.x + mx; tp[io + 4] = Y_THR; tp[io + 5] = cw.y + mz;
        tp[io + 6] = wx[tgt] + mx; tp[io + 7] = Y_THR; tp[io + 8] = wz[tgt] + mz;
        tp[io + 9] = wx[tgt] - mx; tp[io + 10] = Y_THR; tp[io + 11] = wz[tgt] - mz;
        const ia = (sCrew === c ? 0.22 : 0.07);
        for (let vi = 0; vi < 4; vi++) {
          tc[ic + vi * 4] = SIG[0]; tc[ic + vi * 4 + 1] = SIG[1]; tc[ic + vi * 4 + 2] = SIG[2];
          tc[ic + vi * 4 + 3] = ia;
        }
      } else for (let vi = 0; vi < 4; vi++) tc[ic + vi * 4 + 3] = 0;
    }
    (arm.thrGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.thrGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- crews: six walkers, brighter when looked at
    for (let c = 0; c < C; c++) {
      crewWorld(arm, tt, c, cw);
      arm.cPos[c * 3] = cw.x; arm.cPos[c * 3 + 1] = 0.03; arm.cPos[c * 3 + 2] = cw.y;
      const hb = sCrew === c ? 1.6 : 1;
      arm.cSize[c] = 0.058 * hb;
      arm.cAlpha[c] = 1.2 * hb;
      arm.cCol[c * 3] = lerp(SIG[0], 1, 0.3); arm.cCol[c * 3 + 1] = lerp(SIG[1], 1, 0.3);
      arm.cCol[c * 3 + 2] = lerp(SIG[2], 1, 0.3);
      cX[k][c] = 0; cY[k][c] = 0;  // filled after projection below
    }
    (arm.crewGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.crewGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.crewGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.crewGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- effects, evaluated straight off the event ticks — never integrated
    const pp = arm.pPos, ps = arm.pSize, pa = arm.pAlpha, pc = arm.pCol;
    let n = 0;
    const emit = (x: number, y: number, z: number, szp: number, al: number,
      col: readonly [number, number, number]) => {
      if (n >= PART_MAX) return;
      pp[n * 3] = x; pp[n * 3 + 1] = y; pp[n * 3 + 2] = z;
      ps[n] = szp; pa[n] = al;
      pc[n * 3] = col[0]; pc[n * 3 + 1] = col[1]; pc[n * 3 + 2] = col[2];
      n++;
    };
    for (let back = 0; back <= LOOKBACK; back++) {
      const et = Math.floor(tt) - back;
      if (et < 0 || et > T) continue;
      const age = tt - et;
      // a shock lands: the world rings, identically on both desks
      let p = age / 2.2;
      if (p < 1) for (const sh of arm.byTickShock[et]) {
        const rad = bodyR[sh.i] * 0.8 + (0.10 + 0.42 * sh.mag) * ease(p);
        const al = Math.pow(1 - p, 1.5) * 0.9;
        for (let m = 0; m < 14; m++) {
          const th = (m / 14) * 6.283 + sh.i;
          emit(wx[sh.i] + Math.cos(th) * rad, 0.05, wz[sh.i] + Math.sin(th) * rad * 0.92,
            0.030, al, WHITE);
        }
        emit(wx[sh.i], 0.06, wz[sh.i], 0.10 * (1 - p * 0.5), al * 1.3, WHITE);
      }
      // a window served in time: relief blooms outward, warm-white
      p = age / 2.0;
      if (p < 1) for (const sv of arm.byTickServe[et]) {
        const rad = bodyR[sv.i] * (0.6 + 2.2 * ease(p));
        const al = Math.pow(1 - p, 1.3) * 1.0;
        for (let m = 0; m < 12; m++) {
          const th = (m / 12) * 6.283 + sv.i * 2.1;
          emit(wx[sv.i] + Math.cos(th) * rad, 0.05 + 0.16 * p, wz[sv.i] + Math.sin(th) * rad,
            0.034, al, WARM);
        }
      }
      // a window closes on its people: the halo collapses inward and the light goes out
      p = age / 3.2;
      if (p < 1) for (const mi of arm.byTickMiss[et]) {
        const rad = bodyR[mi.i] * (2.6 * (1 - ease(p)) + 0.15);
        const al = Math.sin(Math.PI * clamp(p, 0.02, 0.98)) * 1.25;
        for (let m = 0; m < 16; m++) {
          const th = (m / 16) * 6.283 + mi.i * 1.3;
          emit(wx[mi.i] + Math.cos(th) * rad, 0.05, wz[mi.i] + Math.sin(th) * rad * 0.95,
            0.040, al, EMB);
        }
        if (p < 0.4) emit(wx[mi.i], 0.07, wz[mi.i], 0.16, (1 - p / 0.4) * 1.5, EMB);
      }
      // a crew turns its back on ground it cleared
      p = age / 2.0;
      if (p < 1) for (const ab of arm.byTickAband[et]) {
        const rad = 0.05 + 0.26 * ease(p);
        const al = Math.pow(1 - p, 1.4) * 0.95;
        for (let m = 0; m < 10; m++) {
          const th = (m / 10) * 6.283 + ab.crew;
          emit(ab.x + Math.cos(th) * rad, 0.04, ab.z + Math.sin(th) * rad, 0.030, al, EMB);
        }
      }
    }
    arm.partGeo.setDrawRange(0, n);
    (arm.partGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    partCount = Math.max(partCount, n);

    // ---- the look-up marks
    arm.rAlpha.fill(0);
    const pulse = 0.55 + 0.45 * Math.sin(tt * 1.7);
    if (sSite >= 0) {
      arm.rPos[0] = wx[sSite]; arm.rPos[1] = 0.03; arm.rPos[2] = wz[sSite];
      arm.rSize[0] = bodyR[sSite] * 2.4 * 2.7; arm.rAlpha[0] = 0.55 + 0.30 * pulse;
      const scarred = scarTick(arm, sSite, tt) < Infinity;
      arm.rCol[0] = scarred ? EMB[0] : WHITE[0];
      arm.rCol[1] = scarred ? EMB[1] : WHITE[1];
      arm.rCol[2] = scarred ? EMB[2] : WHITE[2];
    }
    if (sCrew >= 0) {
      crewWorld(arm, tt, sCrew, cw);
      arm.rPos[3] = cw.x; arm.rPos[4] = 0.03; arm.rPos[5] = cw.y;
      arm.rSize[1] = 0.30; arm.rAlpha[1] = 0.5 + 0.3 * pulse;
      arm.rCol[3] = WHITE[0]; arm.rCol[4] = WHITE[1]; arm.rCol[5] = WHITE[2];
    }
    (arm.ringGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- residue only ever moves forward with the tick; rewinds rebuild it.
    //      P.tick (not the render clamp) so deposits at t=T land during the end hold.
    residueTo(arm, Math.min(T, Math.floor(P.tick)));
    if (arm.resDirty && paintBudget > 0) { paintSurface(arm); paintBudget--; }
  }

  // ------------------------------------------------------------------ chrome
  const mA = A.metrics, mB = B.metrics;
  el("meta").textContent =
    `seed ${log.seed} · ${log.regime} volatility · ${T} ticks · ${S} sites · ${commas(totPop)} people`;
  el("meta2").textContent =
    `${totalShocks} shocks, identical on both desks · the map refreshes every ${log.M} ticks`;
  el("meta3").textContent = `${C} crews each · log ${A.logHash} / ${B.logHash}`;

  function armSiteState(arm: Arm, i: number, tt: number): string {
    const scT = scarTick(arm, i, tt);
    if (scT < Infinity) return `LOST at tick ${scT}`;
    const frac = windowAt(arm, i, tt);
    if (frac >= 0) {
      let left = Infinity;
      for (const sh of arm.shocksBySite[i])
        if (tt >= sh.t && tt < sh.dl && !(sh.servedAt <= tt)) left = Math.min(left, sh.dl - Math.floor(tt));
      return `window closing — ${left} ticks left`;
    }
    const svT = servedTick(arm, i, tt);
    if (svT < Infinity) return `served in window at tick ${svT}`;
    return arm.shocksBySite[i].length ? "calm" : "quiet";
  }
  function crewLine(c: number, tt: number): string {
    const upTo = (arm: Arm) => {
      let n = 0, km = 0;
      for (const a of arm.crewAbandons[c]) if (a.t <= tt) { n++; km += a.km; }
      return { n, km };
    };
    const a0 = upTo(arms[0]), a1 = upTo(arms[1]);
    return `crew ${c} · chase the map: ${a0.n} turnaround${a0.n === 1 ? "" : "s"}, `
      + `${a0.km.toFixed(1)} km walked back · reroute at the tips: `
      + `${a1.n === 0 ? "thread unbroken — 0 km walked back" : `${a1.n} turnarounds, ${a1.km.toFixed(1)} km`}`;
  }

  let msAvg = 0, msMax = 0, msWin = 0, frame = 0, last = -1;
  const baseGain = allPointMats.map((m) => m.uniforms.uGain.value as number);

  function chrome(tt: number) {
    const ti = Math.min(T, Math.floor(P.tick));
    el("tick").textContent = `${String(ti).padStart(3, "0")} / ${T}`;
    if (!scrubbing) scrub.value = String(ti);
    for (const [k, sid, mid, cid, fid] of [[0, "servedA", "missA", "churnA", "finA"],
      [1, "servedB", "missB", "churnB", "finB"]] as [number, string, string, string, string][]) {
      const arm = arms[k];
      el(sid).textContent = commas(arm.servedCum[ti]);
      el(mid).textContent = commas(arm.missedCum[ti]);
      el(cid).textContent = commas(arm.churnCum[ti]);
      const m = arm.raw.metrics;
      // crews walk 3.33 km/h (10 km side, 6-minute ticks) — km × 0.3 is hours wasted
      el(fid).textContent =
        `${arm.winServedCum[ti]} of ${totalShocks} windows served · ${arm.winMissedCum[ti]} lost`
        + ` · ${arm.abandCntCum[ti]} turnarounds · ${Math.round(arm.churnCum[ti] * 0.3)} h`
        + ` of walking wasted · plan survival ${m.survival.toFixed(2)}`;
    }
    const sS = selSite(), sC = selCrew();
    el("pick").textContent = sC >= 0 ? crewLine(sC, tt)
      : sS >= 0
        ? `site ${String(sS).padStart(2, "0")} · ${commas(pop[sS])} people · left desk: `
          + `${armSiteState(arms[0], sS, tt)} · right desk: ${armSiteState(arms[1], sS, tt)}`
        : "point at a crew to trace its thread · point at a site for its people and window";
    el("meter").textContent = `${msAvg.toFixed(2)} ms/frame · worst ${msMax.toFixed(2)}`;
    el("meter2").textContent = `${partCount} sparks · dpr ${renderer.getPixelRatio().toFixed(0)}`
      + ` · ${(halfW - GUT) | 0}×${stageH | 0} ×2 · log ${A.logHash}/${B.logHash}`;
    partCount = 0;
  }

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

  // ------------------------------------------------------------------ the loop
  function frameAt(tt: number) {
    placeCamera(tt);
    for (let i = 0; i < allPointMats.length; i++)
      allPointMats[i].uniforms.uGain.value = baseGain[i] * VIEW.gain;
    updateArm(0, tt);
    updateArm(1, tt);
    // where every body and every walker lands on screen, for the look-up
    for (let i = 0; i < S; i++) {
      v3.set(wx[i], 0.02, wz[i]).project(cam);
      sX[i] = (v3.x * 0.5 + 0.5) * (halfW - GUT);
      sY[i] = bandTop + (1 - (v3.y * 0.5 + 0.5)) * stageH;
    }
    for (let k = 0; k < 2; k++) for (let c = 0; c < C; c++) {
      crewWorld(arms[k], tt, c, cw);
      v3.set(cw.x, 0.03, cw.y).project(cam);
      cX[k][c] = (v3.x * 0.5 + 0.5) * (halfW - GUT);
      cY[k][c] = bandTop + (1 - (v3.y * 0.5 + 0.5)) * stageH;
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
  }

  function loop(now: number) {
    requestAnimationFrame(loop);
    const t0 = performance.now();
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    // a display-density change fires no resize event; the framing law has to survive it
    const want = Math.min(devicePixelRatio, 2);
    if (renderer.getPixelRatio() !== want) { renderer.setPixelRatio(want); resize(); }
    if (el("gl").clientWidth !== W || el("gl").clientHeight !== H) resize();
    if (P.playing && !scrubbing) {
      P.tick += dt * P.rate;
      if (P.tick >= T + HOLD) P.tick = 0;   // residueTo sees the rewind and starts clean
    }
    const tt = clamp(P.tick, 0, T - 0.001);
    paintBudget = 1;
    frameAt(tt);
    const ms = performance.now() - t0;
    msAvg = msAvg ? msAvg * 0.92 + ms * 0.08 : ms;
    msWin = Math.max(msWin, ms);
    if ((frame % 120) === 119) { msMax = msWin; msWin = 0; }
    if ((frame & 7) === 0) chrome(tt);
    frame++;
  }
  requestAnimationFrame(loop);

  // ---- the verification handle: seek is deterministic — same tick, same pixels
  (window as unknown as { __HERO: unknown }).__HERO = {
    seek(t: number) {
      P.tick = clamp(t, 0, T); P.playing = false;
      paintBudget = 99;
      frameAt(clamp(P.tick, 0, T - 0.001));
      chrome(clamp(P.tick, 0, T - 0.001));
    },
    tick: () => P.tick,
    maxTick: () => T,
    pause() { P.playing = false; },
    play() { P.playing = true; },
    state: () => ({
      tick: P.tick, ms: +msAvg.toFixed(2), msMax: +msMax.toFixed(2),
      seed: log.seed, regime: log.regime, hashes: [A.logHash, B.logHash],
      metrics: [mA, mB],
      counts: arms.map((a) => ({
        served: Math.round(a.servedCum[T]), missed: Math.round(a.missedCum[T]),
        churnKm: Math.round(a.churnCum[T]), winServed: a.winServedCum[T],
        winMissed: a.winMissedCum[T], turnarounds: a.abandCntCum[T],
      })),
      pinned: { site: pinnedSite, crew: pinnedCrew },
      // the residue fields ARE the world's memory with every body excluded by
      // construction — their checksum distinguishes two ticks by residue alone
      residueHash: arms.map((a) => {
        let h = 0;
        const sum = (f: Float32Array) => {
          for (let p = 0; p < f.length; p += 7) h = (h + Math.round(f[p] * 1e4) * (p + 1)) >>> 0;
        };
        sum(a.ash); sum(a.cool); sum(a.char);
        return h.toString(16);
      }),
      screen: {
        sites: Array.from({ length: S }, (_, i) => [Math.round(sX[i]), Math.round(sY[i])]),
        crews: [0, 1].map((k) => Array.from({ length: C }, (_, c) =>
          [Math.round(cX[k][c]), Math.round(cY[k][c])])),
        halfW, gut: GUT,
      },
    }),
  };
}

boot();
