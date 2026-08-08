/**
 * THE TWO SHAPES — the headline result of the two-shapes series, as one instrument.
 *
 * One territory. One fleet. One stream of visits that is byte-identical in both halves.
 * The only thing that differs is the VERTICAL shape — how a report climbs from the ground
 * to the people deciding things.
 *
 *   left   "THE LOUDEST GET IN"        reports compete on a channel that reinforces itself
 *   right  "NEIGHBORS CARRY EACH OTHER" a district fuses and travels on one slot
 *
 * NOTHING HERE IS SIMULATED. The page is a consumer of `/twoshapes-log.json`, the baked
 * event log of seed 3. Every body, column, ember and number on screen is read out of that
 * log: `visit` sparks leaving the ground, `top` deciding which bodies are alive on the
 * decision slab, `burn` igniting the embers at the slab boundaries, `act` raining help back
 * down, and `metrics` supplying the two headline counts. There is no need model, no
 * selection rule, no policy anywhere in this file — search it and you will not find one.
 *
 * Determinism: every frame is a pure function of ONE number, `tickTime`. Particles are
 * evaluated from the event tick rather than integrated per frame, the column heights come
 * out of a table precomputed once at load, and the camera drift is driven by tickTime too.
 * Pause at tick N, reload, pause at tick N: the same pixels. Neither an unseeded random
 * source nor a wall clock is allowed anywhere near the frame; grep this file and see.
 */
import * as THREE from "three";

// ------------------------------------------------------------------ geometry of the piece
const SLAB_W = 4.15;      // world units, the footprint of one slab
const SLAB_D = 2.95;
const GAP = 1.22;         // vertical spacing between slabs
const THICK = 0.062;      // slab thickness — the exposed edge is half the picture
const NSLAB = 4;          // ground · sensed · named · the briefing
const TOP_Y = (NSLAB - 1) * GAP;
const RES = 208;          // ground residue texture, per side
const PART_MAX = 1400;    // particle pool per side (measured peak is ~230)

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);
const fnv = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const el = (id: string) => document.getElementById(id)!;
const commas = (n: number) => Math.round(n).toLocaleString("en-US");

// ------------------------------------------------------------------ the log, verbatim
type Ev =
  | { e: "visit"; t: number; i: number; need: number; kind: string }
  | { e: "shock"; t: number; i: number; mag: number }
  | { e: "burn"; t: number; slab: number; i: number }
  | { e: "top"; t: number; is: number[] }
  | { e: "act"; t: number; i: number; amt: number };

interface RawArm {
  name: string;
  cfg: { V: string; T: number; S: number; K: number; worldSeed: number };
  world: { pos: [number, number][]; pop: number[]; district: number[] };
  metrics: {
    unmetNeed: number; extinctPop: number; reprSettlements: number; reprPop: number;
    giniDecision: number; worstStaleTop: number;
  };
  events: Ev[];
  logHash: string;
}

/** Per-side tables, all derived from the event log by pure re-indexing. */
interface Arm {
  raw: RawArm;
  /** who the fleet touched this tick — IDENTICAL in both arms, by construction */
  visits: number[][];
  /** the briefing register's contents, cluster members expanded (the `top` event) */
  top: number[][];
  /** what got named: everything that reached the features register = briefing ∪ burned-at-2 */
  feat: number[][];
  burn2: number[][];          // died between "named" and "the briefing"
  burn3: number[][];          // reached the briefing and still was never acted on
  acts: number[][];
  shocks: number[][];         // the world moving on its own — the same in both arms
  reach: Float32Array;        // [tick*S + i] → 0..3, how far up this settlement survives
  heat: Float32Array;         // [tick*S + i] → recent burn intensity
  drain: Int16Array;          // [tick*S + i] → ticks since last in the briefing
  livePop: Int32Array;        // people in the briefing at this tick
  liveN: Int32Array;          // settlements in the briefing at this tick
  // scene
  scene: THREE.Scene;
  bodyPos: Float32Array; bodySize: Float32Array; bodyAlpha: Float32Array; bodyCol: Float32Array;
  bodyGeo: THREE.BufferGeometry;
  colGeo: THREE.BufferGeometry; colPos: Float32Array; colCol: Float32Array;
  weaveGeo: THREE.BufferGeometry; weavePos: Float32Array; weaveCol: Float32Array;
  partGeo: THREE.BufferGeometry; pPos: Float32Array; pSize: Float32Array;
  pAlpha: Float32Array; pCol: Float32Array;
  ringGeo: THREE.BufferGeometry; rPos: Float32Array; rSize: Float32Array;
  rAlpha: Float32Array; rCol: Float32Array;
  slabMats: THREE.MeshBasicMaterial[];
  faceMats: THREE.MeshBasicMaterial[];
  surf: Surface[];            // one memory per slab
  resTick: number;
}

/** A slab's memory. `cool` is what passed; `ash` is what burned. Additive, never wiped. */
interface Surface {
  ash: Float32Array; cool: Float32Array; base: Float32Array;
  data: Uint8Array; tex: THREE.DataTexture; dirty: boolean;
}

async function boot() {
  const log = await (await fetch("/twoshapes-log.json")).json() as
    { seed: number; arms: RawArm[] };
  const A = log.arms[0], B = log.arms[1];
  const S = A.world.pop.length, T = A.cfg.T;
  const pop = A.world.pop, district = A.world.district;
  const totPop = pop.reduce((a, b) => a + b, 0);
  const maxPop = Math.max(...pop);

  // ---- ground coordinates: normalise the log's ~[0,1]² positions into the slab footprint
  const px = A.world.pos.map((p) => p[0]), py = A.world.pos.map((p) => p[1]);
  const x0 = Math.min(...px), x1 = Math.max(...px);
  const y0 = Math.min(...py), y1 = Math.max(...py);
  const ux = new Float32Array(S), uz = new Float32Array(S);
  const wx = new Float32Array(S), wz = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    ux[i] = 0.075 + 0.85 * ((px[i] - x0) / (x1 - x0));
    uz[i] = 0.075 + 0.85 * ((py[i] - y0) / (y1 - y0));
    wx[i] = (ux[i] - 0.5) * SLAB_W;
    wz[i] = (uz[i] - 0.5) * SLAB_D;
  }
  const bodyR = new Float32Array(S);   // body radius from population — everything is somebody
  for (let i = 0; i < S; i++) bodyR[i] = 0.055 + 0.135 * Math.sqrt(pop[i] / maxPop);

  // ---- the claim, checked here rather than asserted: the two visit streams hash the same
  const visitHash = (r: RawArm) =>
    fnv(JSON.stringify(r.events.filter((e) => e.e === "visit").map((e) => (e as { i: number }).i)));
  const hA = visitHash(A), hB = visitHash(B);
  const nVisits = A.events.filter((e) => e.e === "visit").length;

  // ------------------------------------------------------------------ per-side tables
  function prep(raw: RawArm): Arm {
    const mk = () => Array.from({ length: T }, () => [] as number[]);
    const visits = mk(), top = mk(), burn2 = mk(), burn3 = mk(), acts = mk(), shocks = mk();
    for (const e of raw.events) {
      if (e.e === "visit") visits[e.t].push(e.i);
      else if (e.e === "top") top[e.t] = e.is.slice();
      else if (e.e === "burn") (e.slab === 2 ? burn2 : burn3)[e.t].push(e.i);
      else if (e.e === "act") acts[e.t].push(e.i);
      else if (e.e === "shock") shocks[e.t].push(e.i);
    }
    // "named" is not logged directly, and is not invented here either: a report that reached
    // the features register either climbed into the briefing (`top`) or burned at slab 2.
    const feat = mk();
    for (let t = 0; t < T; t++) {
      const seen = new Set<number>();
      for (const i of top[t]) seen.add(i);
      for (const i of burn2[t]) seen.add(i);
      feat[t] = [...seen].sort((a, b) => a - b);
    }

    const reach = new Float32Array(T * S);
    const heat = new Float32Array(T * S);
    const drain = new Int16Array(T * S);
    const livePop = new Int32Array(T), liveN = new Int32Array(T);
    const inTop = new Uint8Array(S), inFeat = new Uint8Array(S);
    let prevR = new Float32Array(S).fill(1), prevH = new Float32Array(S);
    const prevD = new Int16Array(S).fill(0);
    for (let t = 0; t < T; t++) {
      inTop.fill(0); inFeat.fill(0);
      for (const i of top[t]) inTop[i] = 1;
      for (const i of feat[t]) inFeat[i] = 1;
      let lp = 0;
      for (const i of top[t]) lp += pop[i];
      livePop[t] = lp; liveN[t] = top[t].length;
      const burns = new Float32Array(S);
      for (const i of burn2[t]) burns[i] += 1;
      for (const i of burn3[t]) burns[i] += 1;
      for (let i = 0; i < S; i++) {
        // the fleet visits every settlement on a fixed sweep, so level 1 (sensed) is the floor
        const level = inTop[i] ? 3 : inFeat[i] ? 2 : 1;
        // rises fast, falls slowly: a column's height is how recently this place got
        // through, not a one-tick flicker. Nothing that never rose is ever lifted by it.
        const r = prevR[i] + (level - prevR[i]) * (level > prevR[i] ? 0.60 : 0.10);
        reach[t * S + i] = r; prevR[i] = r;
        const h = prevH[i] * 0.78 + burns[i] * 0.55;
        heat[t * S + i] = h; prevH[i] = h;
        prevD[i] = inTop[i] ? 0 : prevD[i] + 1;
        drain[t * S + i] = prevD[i];
      }
    }
    prevR = prevH = new Float32Array(0);

    const scene = new THREE.Scene();
    return {
      raw, visits, top, feat, burn2, burn3, acts, shocks, reach, heat, drain,
      livePop, liveN, scene,
    } as Arm;
  }
  const arms: Arm[] = [prep(A), prep(B)];

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
  const pointMat = (pow: number, sizeMul: number, gain: number, white: number, ring = 0) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uPix: { value: 400 }, uSizeMul: { value: sizeMul }, uGain: { value: gain },
        uPow: { value: pow }, uWhite: { value: white }, uRing: { value: ring },
      },
      vertexShader: POINT_V, fragmentShader: POINT_F,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
  const allPointMats: THREE.ShaderMaterial[] = [];
  const mkPoint = (...a: [number, number, number, number, number?]) => {
    const m = pointMat(...a); allPointMats.push(m); return m;
  };

  /** the tapered profile a column of light is stroked with — soft flanks, hot core */
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

  /** the light a slab's surface is made of: graticule, district wash, vignette. */
  function surfaceBase(withBodies: boolean): Float32Array {
    const b = new Float32Array(RES * RES * 3);
    const dc: [number, number][] = [];
    for (let d = 0; d < 8; d++) {
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < S; i++) if (district[i] === d) { sx += ux[i]; sy += 1 - uz[i]; n++; }
      dc.push([sx / n * RES, sy / n * RES]);
    }
    const K = withBodies ? 1 : 0.45;
    for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
      const j = (y * RES + x) * 3;
      let v = 0.004;
      if (x % 26 === 0 || y % 26 === 0) v += 0.017;
      if (x % 104 === 0 || y % 104 === 0) v += 0.026;
      for (const [cx, cy] of dc) {
        const dx = (x - cx) / RES, dy = (y - cy) / RES;
        v += 0.017 * Math.exp(-(dx * dx + dy * dy) * 42);
      }
      if (withBodies) for (let i = 0; i < S; i++) {
        const dx = (x - ux[i] * RES) / RES, dy = (y - (1 - uz[i]) * RES) / RES;
        const s = 0.0009 + 0.0026 * (pop[i] / maxPop);
        v += 0.13 * (pop[i] / maxPop) * Math.exp(-(dx * dx + dy * dy) / s);
      }
      const ex = Math.abs(x / RES - 0.5) * 2, ey = Math.abs(y / RES - 0.5) * 2;
      v *= clamp(1.25 - Math.pow(Math.max(ex, ey), 5) * 1.25, 0, 1) * K;
      b[j] = v * 0.38; b[j + 1] = v * 0.84; b[j + 2] = v * 1.0;
    }
    return b;
  }
  const GROUND_BASE = surfaceBase(true);
  const UPPER_BASE = surfaceBase(false);

  /** the void behind the instrument — a wide, soft, cold bloom, never a visible disc */
  const HAZE = (() => {
    const N = 160, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.46;
      const r2 = dx * dx * 1.05 + dy * dy * 2.3;
      const v = Math.exp(-r2 * 9.5);
      const j = (y * N + x) * 4;
      d[j] = v * 8; d[j + 1] = v * 18; d[j + 2] = v * 25; d[j + 3] = 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.needsUpdate = true; t.minFilter = t.magFilter = THREE.LinearFilter;
    return t;
  })();

  // ------------------------------------------------------------------ build one side
  const SLAB_NAME = ["the ground", "sensed", "named", "the briefing"];
  function build(arm: Arm) {
    const sc = arm.scene;

    // ---- the slabs: real boxes, so the edge is exposed and the stack has thickness
    // Painter's order, no depth buffer: this is holographic light, and a depth test
    // chops every column into segments where a plate crosses in front of it.
    arm.slabMats = []; arm.faceMats = [];
    for (let L = 0; L < NSLAB; L++) {
      const side = new THREE.MeshBasicMaterial({
        color: 0x0c1820, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
      const cap = new THREE.MeshBasicMaterial({
        color: 0x010406, transparent: true, opacity: 0.94, depthTest: false, depthWrite: false });
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(SLAB_W, THICK, SLAB_D),
        [side, side, cap, cap, side, side],
      );
      box.position.y = L * GAP;
      box.renderOrder = L * 10;
      sc.add(box);
      arm.slabMats.push(side);

      // the lit surface of the slab, a hair above the cap
      const faceMat = new THREE.MeshBasicMaterial({          // map: the slab's own memory,
        color: 0xffffff, transparent: true,                   // attached just below
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W, SLAB_D), faceMat);
      face.rotation.x = -Math.PI / 2;
      face.position.y = L * GAP + THICK / 2 + 0.003;
      face.renderOrder = L * 10 + 1;
      sc.add(face);
      arm.faceMats.push(faceMat);

      // hairline rim — where the plate ends, the light stops
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(SLAB_W, THICK, SLAB_D)),
        new THREE.LineBasicMaterial({
          color: L === 0 ? 0x9fdcec : 0x63b9d2, transparent: true,
          opacity: L === 0 ? 0.40 : 0.26, blending: THREE.AdditiveBlending,
          depthWrite: false, depthTest: false,
        }),
      );
      rim.position.y = L * GAP; rim.renderOrder = L * 10 + 2; sc.add(rim);
    }

    // ---- the ground residue surface: what the run leaves behind, per side
    // THE WORLD REMEMBERS: every slab keeps its own record of what crossed it, and the
    // record is never wiped inside a pass. Mask the bodies out at t=10s and t=60s and the
    // two frames are still different plates.
    arm.surf = [];
    for (let L = 0; L < NSLAB; L++) {
      const data = new Uint8Array(RES * RES * 4);
      const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      const s: Surface = {
        ash: new Float32Array(RES * RES), cool: new Float32Array(RES * RES),
        data, tex, dirty: true, base: L === 0 ? GROUND_BASE : UPPER_BASE,
      };
      arm.surf.push(s);
      arm.faceMats[L].map = tex;
      arm.faceMats[L].needsUpdate = true;
    }
    arm.resTick = -1;

    // ---- bodies: 4 slabs × S settlements, three passes of light over one buffer
    const NB = NSLAB * S;
    arm.bodyPos = new Float32Array(NB * 3);
    arm.bodySize = new Float32Array(NB);
    arm.bodyAlpha = new Float32Array(NB);
    arm.bodyCol = new Float32Array(NB * 3);
    for (let L = 0; L < NSLAB; L++) for (let i = 0; i < S; i++) {
      const k = L * S + i;
      arm.bodyPos[k * 3] = wx[i];
      arm.bodyPos[k * 3 + 1] = L * GAP + THICK / 2 + 0.026;
      arm.bodyPos[k * 3 + 2] = wz[i];
    }
    arm.bodyGeo = new THREE.BufferGeometry();
    arm.bodyGeo.setAttribute("position", new THREE.BufferAttribute(arm.bodyPos, 3));
    arm.bodyGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.bodySize, 1));
    arm.bodyGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.bodyAlpha, 1));
    arm.bodyGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.bodyCol, 3));
    for (const [pw, sz, gn, wh] of [[1.7, 3.4, 0.32, 0], [3.2, 1.35, 0.85, 0.10],
      [9.0, 0.52, 1.00, 0.72]] as [number, number, number, number][]) {
      const p = new THREE.Points(arm.bodyGeo, mkPoint(pw, sz, gn, wh));
      p.renderOrder = 42; p.frustumCulled = false; sc.add(p);
    }

    // ---- columns: tapered additive quads (a 1px line reads as a comb, not as light).
    //      65 quads: one per settlement, plus the ghost shaft of the picked settlement.
    const NQ = S + 1;
    arm.colPos = new Float32Array(NQ * 4 * 3);
    arm.colCol = new Float32Array(NQ * 4 * 4);
    const cuv = new Float32Array(NQ * 4 * 2);
    const cidx = new Uint16Array(NQ * 6);
    for (let q = 0; q < NQ; q++) {
      cuv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      cidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    arm.colGeo = new THREE.BufferGeometry();
    arm.colGeo.setAttribute("position", new THREE.BufferAttribute(arm.colPos, 3));
    arm.colGeo.setAttribute("uv", new THREE.BufferAttribute(cuv, 2));
    arm.colGeo.setAttribute("color", new THREE.BufferAttribute(arm.colCol, 4));
    arm.colGeo.setIndex(new THREE.BufferAttribute(cidx, 1));
    const colMesh = new THREE.Mesh(arm.colGeo, new THREE.MeshBasicMaterial({
      map: TAPER, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    colMesh.renderOrder = 40; colMesh.frustumCulled = false; sc.add(colMesh);

    // ---- the weave: where a district fuses and rides up on one slot (mycelium side only)
    const NW = 64;
    arm.weavePos = new Float32Array(NW * 4 * 3);
    arm.weaveCol = new Float32Array(NW * 4 * 4);
    const wuv = new Float32Array(NW * 4 * 2), widx = new Uint16Array(NW * 6);
    for (let q = 0; q < NW; q++) {
      wuv.set([0, 0, 1, 0, 1, 1, 0, 1], q * 8);
      widx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    arm.weaveGeo = new THREE.BufferGeometry();
    arm.weaveGeo.setAttribute("position", new THREE.BufferAttribute(arm.weavePos, 3));
    arm.weaveGeo.setAttribute("uv", new THREE.BufferAttribute(wuv, 2));
    arm.weaveGeo.setAttribute("color", new THREE.BufferAttribute(arm.weaveCol, 4));
    arm.weaveGeo.setIndex(new THREE.BufferAttribute(widx, 1));
    const weaveMesh = new THREE.Mesh(arm.weaveGeo, new THREE.MeshBasicMaterial({
      map: TAPER, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    weaveMesh.renderOrder = 41; weaveMesh.frustumCulled = false; sc.add(weaveMesh);

    // ---- particles: sparks, embers, help
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
      p.renderOrder = 44; p.frustumCulled = false; sc.add(p);
    }

    // ---- rings: the look-up marks, on the ground and at the severed end
    arm.rPos = new Float32Array(8 * 3);
    arm.rSize = new Float32Array(8);
    arm.rAlpha = new Float32Array(8);
    arm.rCol = new Float32Array(8 * 3);
    arm.ringGeo = new THREE.BufferGeometry();
    arm.ringGeo.setAttribute("position", new THREE.BufferAttribute(arm.rPos, 3));
    arm.ringGeo.setAttribute("aSize", new THREE.BufferAttribute(arm.rSize, 1));
    arm.ringGeo.setAttribute("aAlpha", new THREE.BufferAttribute(arm.rAlpha, 1));
    arm.ringGeo.setAttribute("aColor", new THREE.BufferAttribute(arm.rCol, 3));
    const rings = new THREE.Points(arm.ringGeo, mkPoint(1, 1, 1, 0, 1));
    rings.renderOrder = 46; rings.frustumCulled = false; sc.add(rings);

    // ---- atmosphere: one very wide, very soft card far behind the stack, so the void
    //      around the instrument has depth instead of being flat paper black.
    const m = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), new THREE.MeshBasicMaterial({
      map: HAZE, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false,
    }));
    m.position.set(0, 1.5, -13); m.renderOrder = -10; sc.add(m);
  }
  arms.forEach(build);

  // ------------------------------------------------------------------ residue accumulation
  /** One deposit of light or ash into the ground surface. Stamped, not stroked. */
  function stamp(f: Float32Array, i: number, amt: number, rad: number) {
    const cx = ux[i] * RES, cy = (1 - uz[i]) * RES;
    const r = Math.ceil(rad), s2 = 2 * (rad * 0.55) * (rad * 0.55);
    const xa = Math.max(0, (cx - r) | 0), xb = Math.min(RES - 1, (cx + r) | 0);
    const ya = Math.max(0, (cy - r) | 0), yb = Math.min(RES - 1, (cy + r) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      f[y * RES + x] += amt * Math.exp(-d2 / s2);
    }
  }
  /** Everything the world remembers about tick t. Additive only — nothing here forgets. */
  function depositTick(arm: Arm, t: number) {
    const rr = (i: number) => 2.6 + 5.4 * Math.sqrt(pop[i] / maxPop);
    const [gnd, sen, nmd, brf] = arm.surf;
    // the ground carries the help that landed and the ash of the reports that died
    for (const i of arm.acts[t]) stamp(gnd.cool, i, 0.020, rr(i) * 1.1);
    for (const i of arm.burn2[t]) stamp(gnd.ash, i, 0.016, rr(i));
    for (const i of arm.burn3[t]) stamp(gnd.ash, i, 0.009, rr(i));
    for (let i = 0; i < S; i++) {
      const d = arm.drain[t * S + i];
      if (d > 8) stamp(gnd.ash, i, 0.0030 * clamp(d / 60), rr(i) * 1.9);
    }
    // the sensed plate records the fleet's own footprint. Both sides run the same visit
    // stream, so after a full pass these two plates are marked identically. That is the
    // control, written into the instrument rather than asserted in a caption.
    for (const i of arm.visits[t]) stamp(sen.cool, i, 0.055, rr(i) * 0.8);
    // what got named, and what burned at that boundary
    for (const i of arm.feat[t]) stamp(nmd.cool, i, 0.013, rr(i) * 0.85);
    for (const i of arm.burn2[t]) stamp(nmd.ash, i, 0.019, rr(i) * 1.0);
    // and the briefing itself: the record of who was ever in front of anybody
    for (const i of arm.top[t]) stamp(brf.cool, i, 0.017, rr(i) * 0.9);
    for (const i of arm.burn3[t]) stamp(brf.ash, i, 0.017, rr(i) * 1.05);
    for (const s of arm.surf) s.dirty = true;
  }
  function residueTo(arm: Arm, t: number) {
    if (t < arm.resTick) {
      for (const s of arm.surf) { s.ash.fill(0); s.cool.fill(0); }
      arm.resTick = -1;
    }
    for (let k = arm.resTick + 1; k <= t; k++) depositTick(arm, k);
    arm.resTick = t;
  }
  /** Reinhard on every channel — deposits keep arriving forever and the frame never blows out. */
  function paintSurface(s: Surface) {
    const d = s.data, ash = s.ash, co = s.cool, base = s.base;
    for (let p = 0, j = 0; p < RES * RES; p++, j += 4) {
      const a = ash[p] / (ash[p] + 0.85), c = co[p] / (co[p] + 0.85);
      const b = p * 3;
      d[j] = clamp(base[b] * 255 + a * 150 + c * 26, 0, 255);
      d[j + 1] = clamp(base[b + 1] * 255 + a * 47 + c * 92, 0, 255);
      d[j + 2] = clamp(base[b + 2] * 255 + a * 17 + c * 118, 0, 255);
      d[j + 3] = 255;
    }
    s.tex.needsUpdate = true;
    s.dirty = false;
  }

  // ------------------------------------------------------------------ three, two viewports
  const canvas = el("gl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;
  const cam = new THREE.PerspectiveCamera(33, 1.2, 0.1, 120);

  const LOOK_Y = 1.50;
  const VIEW = { elev: 20.5, azim: 24, dist: 9.5, gain: 1.0 };
  function placeCamera(tt: number) {
    // a slow breath, driven by the playback clock so a paused frame is always the same frame
    const br = Math.sin(tt * 0.0135) * 1.4;
    const e = (VIEW.elev + Math.sin(tt * 0.0091) * 0.45) * Math.PI / 180;
    const a = (VIEW.azim + br) * Math.PI / 180;
    const r = VIEW.dist;
    cam.position.set(r * Math.cos(e) * Math.sin(a), r * Math.sin(e) + LOOK_Y, r * Math.cos(e) * Math.cos(a));
    cam.lookAt(0, LOOK_Y, 0);
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
  const P = { tick: 0, playing: true, rate: 3.9 };   // 400 ticks / 3.9 = 102.6 s per pass
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

  // ------------------------------------------------------------------ the look-up
  const sxA = new Float32Array(S), syA = new Float32Array(S);
  let hover = -1, pinned = -1;
  // The piece opens already asking its question. The default pick is the biggest
  // settlement that the left-hand climb never once puts in front of anybody — read
  // straight out of the log's own `top` record, not chosen by hand.
  const everTop = [new Set<number>(), new Set<number>()];
  const finalTop = [new Set<number>(), new Set<number>()];
  for (let k = 0; k < 2; k++) for (let t = 0; t < T; t++) for (const i of arms[k].top[t]) {
    everTop[k].add(i);
    if (t >= Math.floor(T * 0.75)) finalTop[k].add(i);
  }
  let defaultPick = 0, defaultPop = -1;
  for (let i = 0; i < S; i++) {
    const gone = !everTop[0].has(i) ? 2 : !finalTop[0].has(i) ? 1 : 0;
    const score = gone * 1e6 + pop[i];
    if (gone > 0 && score > defaultPop) { defaultPop = score; defaultPick = i; }
  }
  pinned = defaultPick;

  canvas.addEventListener("pointermove", (e) => {
    const side = e.clientX < halfW ? 0 : 1;
    const ox = side ? halfW + GUT : 0;
    let best = -1, bd = 30 * 30;
    for (let i = 0; i < S; i++) {
      const dx = e.clientX - (ox + sxA[i]), dy = e.clientY - syA[i];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    hover = best;
    canvas.style.cursor = best >= 0 ? "crosshair" : "default";
  });
  canvas.addEventListener("pointerleave", () => { hover = -1; });
  canvas.addEventListener("pointerdown", (e) => {
    const side = e.clientX < halfW ? 0 : 1;
    const ox = side ? halfW + GUT : 0;
    let best = -1, bd = 30 * 30;
    for (let i = 0; i < S; i++) {
      const dx = e.clientX - (ox + sxA[i]), dy = e.clientY - syA[i];
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) pinned = pinned === best ? -1 : best;
  });
  const picked = () => (hover >= 0 ? hover : pinned);

  // ------------------------------------------------------------------ per-frame assembly
  const SIG: [number, number, number] = [0.49, 0.976, 1.0];      // the cold signal
  const EMB: [number, number, number] = [1.0, 0.482, 0.235];     // the burn
  let paintBudget = 2;
  const v3 = new THREE.Vector3();
  const eA = new THREE.Vector3(), eB = new THREE.Vector3();
  const camXZ = new THREE.Vector2();
  const inTopN = new Uint8Array(S), inFeatN = new Uint8Array(S), inVis = new Uint8Array(S);

  function updateArm(arm: Arm, tt: number) {
    const t = Math.min(T - 1, Math.floor(tt));
    const t1 = Math.min(T - 1, t + 1);
    const f = tt - Math.floor(tt);
    const sel = picked();

    // ---- bodies, slab by slab
    const bs = arm.bodySize, ba = arm.bodyAlpha, bc = arm.bodyCol;
    inTopN.fill(0); inFeatN.fill(0); inVis.fill(0);
    for (const i of arm.top[t]) inTopN[i] = 1;
    for (const i of arm.feat[t]) inFeatN[i] = 1;
    for (const i of arm.visits[t]) inVis[i] = 1;
    for (let L = 0; L < NSLAB; L++) for (let i = 0; i < S; i++) {
      const k = L * S + i;
      const heat = clamp(arm.heat[t * S + i] * 0.55);
      let a = 0, sz = bodyR[i];
      if (L === 0) { a = 0.66 + 0.40 * (pop[i] / maxPop); sz = bodyR[i] * 1.30; }
      else if (L === 1) { a = inVis[i] ? 1.05 : 0.11; sz = bodyR[i] * (inVis[i] ? 1.0 : 0.42); }
      else if (L === 2) { a = inFeatN[i] ? 0.90 : 0.035; sz = bodyR[i] * (inFeatN[i] ? 0.94 : 0.32); }
      else { a = inTopN[i] ? 1.40 : 0.022; sz = bodyR[i] * (inTopN[i] ? 1.28 : 0.26); }
      if (i === sel) { a = Math.min(1.6, a * 1.9 + 0.25); sz *= 1.22; }
      bs[k] = sz; ba[k] = a;
      const warm = L === 0 ? clamp(heat * 0.9) : clamp(heat * 1.5);
      bc[k * 3] = lerp(SIG[0], EMB[0], warm);
      bc[k * 3 + 1] = lerp(SIG[1], EMB[1], warm);
      bc[k * 3 + 2] = lerp(SIG[2], EMB[2], warm);
    }
    (arm.bodyGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.bodyGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- columns, billboarded around Y so they always present their full width
    const cp = arm.colPos, cc = arm.colCol;
    for (let i = 0; i < S; i++) {
      const reach = lerp(arm.reach[t * S + i], arm.reach[t1 * S + i], f) * GAP;
      const heat = clamp(arm.heat[t * S + i] * 0.5);
      const dx = camXZ.x - wx[i], dz = camXZ.y - wz[i];
      const inv = 1 / Math.max(1e-4, Math.hypot(dx, dz));
      const nx = -dz * inv, nz = dx * inv;
      const w0 = (0.022 + 0.028 * Math.sqrt(pop[i] / maxPop)) * (i === sel ? 1.5 : 1);
      const w1 = w0 * 0.52;
      const o = i * 12;
      cp[o] = wx[i] - nx * w0; cp[o + 1] = 0.05; cp[o + 2] = wz[i] - nz * w0;
      cp[o + 3] = wx[i] + nx * w0; cp[o + 4] = 0.05; cp[o + 5] = wz[i] + nz * w0;
      cp[o + 6] = wx[i] + nx * w1; cp[o + 7] = reach; cp[o + 8] = wz[i] + nz * w1;
      cp[o + 9] = wx[i] - nx * w1; cp[o + 10] = reach; cp[o + 11] = wz[i] - nz * w1;
      // A column that survives the whole climb carries cold light to the top plate. One that
      // is cut short rusts at its severed end — ember is earned only where a report burned.
      const high = clamp((reach - GAP) / (TOP_Y - GAP));
      const warm = clamp(heat * 1.15 + (1 - high) * 0.30);
      const tipR = lerp(SIG[0], EMB[0], warm);
      const tipG = lerp(SIG[1], EMB[1], warm);
      const tipB = lerp(SIG[2], EMB[2], warm);
      const boost = i === sel ? 1.7 : 1;
      const base = (0.13 + 0.22 * (pop[i] / maxPop)) * boost;
      const tipA = (0.07 + 0.40 * high) * boost;
      const botR = lerp(SIG[0], EMB[0], warm * 0.7);
      const botG = lerp(SIG[1], EMB[1], warm * 0.7);
      const botB = lerp(SIG[2], EMB[2], warm * 0.7);
      const q = i * 16;
      for (const [vi, r, g, b, al] of [
        [0, botR, botG, botB, base], [1, botR, botG, botB, base],
        [2, tipR, tipG, tipB, tipA], [3, tipR, tipG, tipB, tipA],
      ] as number[][]) {
        cc[q + vi * 4] = r; cc[q + vi * 4 + 1] = g; cc[q + vi * 4 + 2] = b; cc[q + vi * 4 + 3] = al;
      }
    }
    // the ghost shaft: where the picked settlement's report would have gone
    {
      const gq = S * 12, gc = S * 16;
      if (sel >= 0) {
        const reach = lerp(arm.reach[t * S + sel], arm.reach[t1 * S + sel], f) * GAP;
        const dx = camXZ.x - wx[sel], dz = camXZ.y - wz[sel];
        const inv = 1 / Math.max(1e-4, Math.hypot(dx, dz));
        const nx = -dz * inv, nz = dx * inv, w = 0.020;
        const top = TOP_Y + 0.30;
        cp[gq] = wx[sel] - nx * w; cp[gq + 1] = reach; cp[gq + 2] = wz[sel] - nz * w;
        cp[gq + 3] = wx[sel] + nx * w; cp[gq + 4] = reach; cp[gq + 5] = wz[sel] + nz * w;
        cp[gq + 6] = wx[sel] + nx * w; cp[gq + 7] = top; cp[gq + 8] = wz[sel] + nz * w;
        cp[gq + 9] = wx[sel] - nx * w; cp[gq + 10] = top; cp[gq + 11] = wz[sel] - nz * w;
        const gone = clamp((TOP_Y - reach) / TOP_Y);
        const c: [number, number, number] = gone > 0.08 ? EMB : SIG;
        for (let vi = 0; vi < 4; vi++) {
          cc[gc + vi * 4] = c[0]; cc[gc + vi * 4 + 1] = c[1]; cc[gc + vi * 4 + 2] = c[2];
          cc[gc + vi * 4 + 3] = (vi < 2 ? 0.16 : 0.01) * (0.25 + gone);
        }
      } else for (let vi = 0; vi < 4; vi++) cc[gc + vi * 4 + 3] = 0;
    }
    (arm.colGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.colGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- the weave: only the side whose log says its districts fuse
    const wp = arm.weavePos, wc = arm.weaveCol;
    let nw = 0;
    if (arm.raw.cfg.V === "mycelium") {
      const byD: number[][] = Array.from({ length: 8 }, () => []);
      for (const i of arm.top[t]) byD[district[i]].push(i);
      for (const list of byD) {
        for (let k = 0; k + 1 < list.length && nw < 64; k++) {
          const a = list[k], b = list[k + 1];
          const ax = wx[a], az = wz[a], bx = wx[b], bz = wz[b];
          const y = TOP_Y + THICK / 2 + 0.045 + 0.020 * Math.sin(tt * 0.7 + a);
          // ribbon width axis = edge × view, so the weave never turns edge-on
          eA.set(bx - ax, 0, bz - az);
          eB.set(cam.position.x - (ax + bx) / 2, cam.position.y - y, cam.position.z - (az + bz) / 2);
          eA.cross(eB).normalize().multiplyScalar(0.024);
          const nx = eA.x, ny = eA.y, nz = eA.z;
          const o = nw * 12;
          wp[o] = ax - nx; wp[o + 1] = y - ny; wp[o + 2] = az - nz;
          wp[o + 3] = ax + nx; wp[o + 4] = y + ny; wp[o + 5] = az + nz;
          wp[o + 6] = bx + nx; wp[o + 7] = y + ny; wp[o + 8] = bz + nz;
          wp[o + 9] = bx - nx; wp[o + 10] = y - ny; wp[o + 11] = bz - nz;
          const q = nw * 16;
          for (let vi = 0; vi < 4; vi++) {
            wc[q + vi * 4] = SIG[0]; wc[q + vi * 4 + 1] = SIG[1]; wc[q + vi * 4 + 2] = SIG[2];
            wc[q + vi * 4 + 3] = 0.62;
          }
          nw++;
        }
      }
    }
    for (let q = nw; q < 64; q++) for (let vi = 0; vi < 4; vi++) wc[q * 16 + vi * 4 + 3] = 0;
    (arm.weaveGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.weaveGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

    // ---- particles: evaluated straight off the event ticks, never integrated
    const pp = arm.pPos, ps = arm.pSize, pa = arm.pAlpha, pc = arm.pCol;
    let n = 0;
    const emit = (x: number, y: number, z: number, sz: number, al: number,
      c: readonly [number, number, number]) => {
      if (n >= PART_MAX) return;
      pp[n * 3] = x; pp[n * 3 + 1] = y; pp[n * 3 + 2] = z;
      ps[n] = sz; pa[n] = al; pc[n * 3] = c[0]; pc[n * 3 + 1] = c[1]; pc[n * 3 + 2] = c[2];
      n++;
    };
    const WHITE = [0.85, 0.98, 1.0] as const;
    for (let back = 0; back <= 2; back++) {
      const et = Math.floor(tt) - back;
      if (et < 0 || et >= T) continue;
      const age = tt - et;                              // in ticks, 0..3
      // 1 — the fleet senses. IDENTICAL on both sides, same settlement, same tick.
      //     Drawn as a rising streak: the one thing a viewer must see agreeing exactly.
      let p = age / 1.35;
      if (p < 1) {
        const al = Math.sin(Math.PI * clamp(p));
        for (const i of arm.visits[et]) for (let s = 0; s < 5; s++) {
          const q = clamp(p - s * 0.045);
          emit(wx[i], lerp(0.09, GAP, ease(q)), wz[i],
            0.088 - s * 0.012, al * (1 - s * 0.17) * 1.5, WHITE);
        }
      }
      // 2 — the report climbs, one boundary per stage
      p = (age - 0.30) / 1.35;
      if (p > 0 && p < 1) {
        const y = lerp(GAP, 2 * GAP, ease(p));
        const al = Math.sin(Math.PI * p) * 0.85;
        for (const i of arm.feat[et]) emit(wx[i], y, wz[i], 0.055, al, SIG);
      }
      p = (age - 0.60) / 1.35;
      if (p > 0 && p < 1) {
        const y = lerp(2 * GAP, 3 * GAP, ease(p));
        const al = Math.sin(Math.PI * p) * 0.95;
        for (const i of arm.top[et]) emit(wx[i], y, wz[i], 0.062, al, SIG);
      }
      // 3 — the reports that burn out at a boundary
      p = (age - 0.35) / 1.7;
      if (p > 0 && p < 1) {
        const al = Math.pow(1 - p, 1.5) * 1.25;
        const jig = 0.055;
        for (const i of arm.burn2[et]) {
          emit(wx[i] + Math.sin(i * 2.4 + p * 3) * jig, 2 * GAP + THICK + p * 0.52 * GAP,
            wz[i] + Math.cos(i * 1.7 + p * 3) * jig, 0.052 * (1 + p), al, EMB);
        }
        for (const i of arm.burn3[et]) {
          emit(wx[i] + Math.sin(i * 1.9 + p * 3) * jig, 3 * GAP + THICK + p * 0.46 * GAP,
            wz[i] + Math.cos(i * 2.2 + p * 3) * jig, 0.058 * (1 + p), al * 1.15, EMB);
        }
      }
      // 4 — the world moves whether or not anybody is looking. Shocks are part of the
      //     frozen world, not of either climb, so both grounds ring at the same instant.
      p = age / 2.4;
      if (p < 1) {
        const rad = 0.07 + 0.44 * ease(p), al = Math.pow(1 - p, 1.4) * 0.85;
        for (const i of arm.shocks[et]) for (let k = 0; k < 14; k++) {
          const th = (k / 14) * 6.283;
          emit(wx[i] + Math.cos(th) * rad, 0.075, wz[i] + Math.sin(th) * rad * 0.9,
            0.034, al, WHITE);
        }
      }
      // 5 — help falls back onto the ground it came from
      p = (age - 0.15) / 1.5;
      if (p > 0 && p < 1) {
        const y = lerp(3 * GAP, 0.08, ease(p));
        const al = (0.35 + 0.9 * p * p) * 1.0;
        for (const i of arm.acts[et]) emit(wx[i], y, wz[i], 0.05, al, WHITE);
      }
    }
    // the ghost trace: where the picked settlement's report would have arrived, dotted,
    // so a severed column reads as an absence rather than as a short column
    if (sel >= 0) {
      const reach = lerp(arm.reach[t * S + sel], arm.reach[t1 * S + sel], f) * GAP;
      const gone = clamp((TOP_Y - reach) / TOP_Y);
      const c = gone > 0.08 ? EMB : SIG;
      for (let k = 0; k < 18; k++) {
        const y = reach + 0.10 + (TOP_Y + 0.04 - reach - 0.10) * (k / 17);
        if (y > TOP_Y + 0.06) break;
        emit(wx[sel], y, wz[sel], 0.030,
          (0.10 + 0.26 * (0.5 + 0.5 * Math.sin(tt * 2.4 - k * 0.55))) * (0.25 + gone), c);
      }
    }
    arm.partGeo.setDrawRange(0, n);
    (arm.partGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.partGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    partCount = Math.max(partCount, n);

    // ---- the look-up marks
    const rp = arm.rPos, rs = arm.rSize, ra = arm.rAlpha, rc = arm.rCol;
    ra.fill(0);
    if (sel >= 0) {
      const reach = lerp(arm.reach[t * S + sel], arm.reach[t1 * S + sel], f) * GAP;
      const pulse = 0.55 + 0.45 * Math.sin(tt * 1.7);
      const alive = reach > TOP_Y - 0.22;
      const put = (k: number, x: number, y: number, z: number, sz: number, al: number,
        c: readonly [number, number, number]) => {
        rp[k * 3] = x; rp[k * 3 + 1] = y; rp[k * 3 + 2] = z;
        rs[k] = sz; ra[k] = al; rc[k * 3] = c[0]; rc[k * 3 + 1] = c[1]; rc[k * 3 + 2] = c[2];
      };
      put(0, wx[sel], 0.055, wz[sel], bodyR[sel] * 2.1, 0.55 + 0.25 * pulse, WHITE);
      put(1, wx[sel], reach, wz[sel], bodyR[sel] * 1.7, (alive ? 0.60 : 0.85) * (0.6 + 0.4 * pulse),
        alive ? SIG : EMB);
      if (!alive) put(2, wx[sel], TOP_Y + THICK / 2 + 0.03, wz[sel], bodyR[sel] * 1.5,
        0.28 * pulse, EMB);
    }
    (arm.ringGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
    (arm.ringGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;

    // ---- the upper slabs drain toward darkness on the side that erases people
    const share = arm.liveN[t] / S;
    for (let L = 1; L < NSLAB; L++) {
      const k = L === 3 ? share : L === 2 ? clamp(arm.feat[t].length / S) : 0.62;
      arm.faceMats[L].color.setScalar(0.30 + 1.05 * k);
      arm.slabMats[L].color.setRGB(0.055 + 0.055 * k, 0.115 + 0.10 * k, 0.155 + 0.12 * k);
    }

    // ---- residue is a fact about the past, so it only ever moves forward with the tick.
    //      Repainting all eight surfaces in the frame that crosses a tick is a 350k-pixel
    //      spike; two per frame keeps the p95 flat and still lands inside one tick.
    residueTo(arm, t);
    for (const s of arm.surf) if (s.dirty) { paintSurface(s); if (--paintBudget <= 0) break; }
  }

  // ------------------------------------------------------------------ chrome
  const mA = arms[0].raw.metrics, mB = arms[1].raw.metrics;
  el("meta").textContent = `seed ${log.seed} · ${T} ticks · ${commas(S)} settlements · `
    + `${commas(totPop)} people`;
  el("meta2").textContent = `${commas(nVisits)} visits · stream ${hA} = ${hB} · identical`;
  el("meta3").textContent = `each stack, bottom to top: ${SLAB_NAME.join(" → ")}`;
  el("finA").innerHTML = `final quarter · <b>${commas(mA.reprPop)}</b> of ${commas(totPop)} people `
    + `· <b>${mA.reprSettlements}</b> of ${S} settlements · `
    + `<b class="ember">${commas(mA.extinctPop)}</b> people invisible to the decision-makers`;
  el("finB").innerHTML = `final quarter · <b>${commas(mB.reprPop)}</b> of ${commas(totPop)} people `
    + `· <b>${mB.reprSettlements}</b> of ${S} settlements · `
    + `<b class="cold">${commas(mB.extinctPop)}</b> people invisible to the decision-makers`;

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

  let partCount = 0;
  let msAvg = 0, msMax = 0, msWin = 0, frame = 0, last = -1;
  const baseGain = allPointMats.map((m) => m.uniforms.uGain.value as number);

  function chrome(t: number) {
    const ti = Math.min(T - 1, Math.floor(t));
    el("tick").textContent = `${String(ti).padStart(3, "0")} / ${T}`;
    if (!scrubbing) scrub.value = String(ti);
    el("liveA").textContent = commas(arms[0].livePop[ti]);
    el("liveB").textContent = commas(arms[1].livePop[ti]);
    // The whole look-up, as one number per side: how much of the recent past this place
    // spent in front of the people deciding things. Counted off the log's `top` events.
    const sel = picked();
    const window40 = (k: number) => {
      let c = 0;
      for (let t = Math.max(0, ti - 39); t <= ti; t++) if (arms[k].top[t].includes(sel)) c++;
      return c;
    };
    const never = (k: number) => (everTop[k].has(sel) ? "" : ", never once in 400");
    el("pick").textContent = sel < 0
      ? "point at a settlement on either ground, then look straight up"
      : `looking up from settlement ${String(sel).padStart(2, "0")} · district ${district[sel]}`
        + ` · ${commas(pop[sel])} people · in the briefing for `
        + `${window40(0)} of the last 40 ticks on the left${never(0)} · `
        + `${window40(1)} of 40 on the right${never(1)}`;
    // the worst frame of the last two seconds, not just the average: the surface repaints
    // land on one frame in fifteen and an EMA would hide them
    el("meter").textContent = `${msAvg.toFixed(2)} ms/frame · worst ${msMax.toFixed(2)}`;
    el("meter2").textContent = `${partCount} sparks · dpr ${renderer.getPixelRatio().toFixed(0)}`
      + ` · ${(halfW - GUT) | 0}×${stageH | 0} ×2 · log `
      + `${arms[0].raw.logHash}/${arms[1].raw.logHash}`;
    partCount = 0;
  }

  // ------------------------------------------------------------------ the loop
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
      if (P.tick >= T) {           // a new pass starts on a clean plate
        P.tick -= T;
        for (const a of arms) { for (const s of a.surf) { s.ash.fill(0); s.cool.fill(0); } a.resTick = -1; }
      }
    }
    const tt = clamp(P.tick, 0, T - 0.001);

    placeCamera(tt);
    paintBudget = 1;
    camXZ.set(cam.position.x, cam.position.z);
    for (let i = 0; i < allPointMats.length; i++)
      allPointMats[i].uniforms.uGain.value = baseGain[i] * VIEW.gain;
    updateArm(arms[0], tt);
    updateArm(arms[1], tt);

    // where every ground body lands on screen, for the look-up
    for (let i = 0; i < S; i++) {
      v3.set(wx[i], 0.06, wz[i]).project(cam);
      sxA[i] = (v3.x * 0.5 + 0.5) * (halfW - GUT);
      syA[i] = bandTop + (1 - (v3.y * 0.5 + 0.5)) * stageH;
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

  // a tiny handle for verification: seek, pause, and read back what the frame claims
  (window as unknown as { __TS: unknown }).__TS = {
    seek(tick: number) {
      P.tick = clamp(tick, 0, T - 1); P.playing = false; paintBudget = 99;
      placeCamera(P.tick); camXZ.set(cam.position.x, cam.position.z);
      updateArm(arms[0], P.tick); updateArm(arms[1], P.tick); chrome(P.tick);
    },
    play() { P.playing = true; },
    pause() { P.playing = false; },
    pick(i: number) { pinned = i; hover = -1; },
    state: () => ({
      tick: P.tick, ms: +msAvg.toFixed(2), msMax: +msMax.toFixed(2), picked: picked(),
      liveA: arms[0].livePop[Math.floor(P.tick)], liveB: arms[1].livePop[Math.floor(P.tick)],
      metrics: [mA, mB], totPop, visitHash: [hA, hB], seed: log.seed, slabs: SLAB_NAME,
      // the sensed plate is stamped only by `visit` events, so this checksum is equal on
      // both sides iff the two stacks really did receive the same stream
      sensedCheck: arms.map((a) => {
        let h = 0; const c = a.surf[1].cool;
        for (let p = 0; p < c.length; p++) h = (h + Math.round(c[p] * 1e4) * (p + 1)) >>> 0;
        return h.toString(16);
      }),
    }),
  };
}

boot();
