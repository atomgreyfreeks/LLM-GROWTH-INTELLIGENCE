/**
 * THE STRATA — one territory, five times.
 *
 * The ground layer runs a real Jones-2010 Physarum field: agents with three sensors, trail
 * deposition, then diffusion and decay. That diffusion pass is what makes the field look like
 * living tissue instead of scratched lines, and it is the same craft the orrery uses.
 *
 * Every sheet above the ground is the SAME field after another stage of the machine has looked
 * at it and discarded most of it — sensed, then features, then the one-page briefing, then the
 * handful of points somebody acted on. Nothing is invented on the way up; only lost.
 *
 * The knob is how much detail survives each crossing. Turn it down and the upper sheets empty
 * while the ground stays full, which is the whole argument: the world does not get simpler,
 * the representation does.
 *
 * Deterministic — seeded PRNG only, no Math.random, no Date.now.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const GW = 320, GH = 200, NC = GW * GH;
const SEED = 0x5eed;

const mk = (s: number) => { let a = s >>> 0; return () => {
  a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const cl = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const wrap = (v: number, m: number) => (v < 0 ? v + m : v >= m ? v - m : v);

const R = mk(SEED);

// ------------------------------------------------------------------ the ground truth
const people = new Float32Array(NC);
const elev = new Float32Array(NC);
(() => {
  const lobes = 5, ax: number[] = [];
  for (let l = 0; l < lobes; l++) ax.push(0.8 + R() * 2.0, R() * 6.283, 0.8 + R() * 2.0, R() * 6.283);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let e = 0; const u = x / GW, v = y / GH;
    for (let l = 0; l < lobes; l++) { const o = l * 4;
      e += Math.sin(u * ax[o] * 6.283 + ax[o + 1]) * Math.cos(v * ax[o + 2] * 6.283 + ax[o + 3]); }
    elev[y * GW + x] = e / lobes;
  }
  for (let t = 0; t < 34; t++) {
    const cx = (R() * GW) | 0, cy = (R() * GH) | 0;
    const mass = 70 + R() * 320, rad = 3 + R() * 8, s2 = 2 * (rad / 2) * (rad / 2);
    for (let y = Math.max(0, cy - (rad | 0)); y < Math.min(GH, cy + (rad | 0) + 1); y++)
    for (let x = Math.max(0, cx - (rad | 0)); x < Math.min(GW, cx + (rad | 0) + 1); x++) {
      const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy; if (d2 > rad * rad) continue;
      people[y * GW + x] += mass * Math.exp(-d2 / s2) / (rad * rad);
    }
  }
})();
let SOULS = 0; for (let i = 0; i < NC; i++) SOULS += people[i];

// ------------------------------------------------------------------ layer 0 · Physarum
const NA = 14000;
const ax_ = new Float32Array(NA), ay_ = new Float32Array(NA), ah_ = new Float32Array(NA);
for (let i = 0; i < NA; i++) {
  ax_[i] = R() * GW; ay_[i] = R() * GH; ah_[i] = R() * 6.283;
}
let trail = new Float32Array(NC), tmp = new Float32Array(NC);
const SO = 6.0, SA = 0.44, RA = 0.5, SS = 1.0;
const sense = (x: number, y: number, a: number) => {
  const sx = wrap(x + Math.cos(a) * SO, GW) | 0, sy = wrap(y + Math.sin(a) * SO, GH) | 0;
  const i = sy * GW + sx;
  return trail[i] + people[i] * 0.9;      // agents are drawn toward where the somebodies are
};
function stepGround() {
  for (let k = 0; k < NA; k++) {
    const x = ax_[k], y = ay_[k], a = ah_[k];
    const c = sense(x, y, a), l = sense(x, y, a - SA), r = sense(x, y, a + SA);
    const na = c > l && c > r ? a : l > r ? a - RA : r > l ? a + RA : a + (R() - 0.5) * RA * 2;
    const nx = wrap(x + Math.cos(na) * SS, GW), ny = wrap(y + Math.sin(na) * SS, GH);
    ax_[k] = nx; ay_[k] = ny; ah_[k] = na;
    const ti = (ny | 0) * GW + (nx | 0);
    if (trail[ti] < 1) trail[ti] = Math.min(1, trail[ti] + 0.17);   // capped: see note above`paint`
  }
  // diffuse + decay — this pass is what turns scratches into tissue
  for (let y = 0; y < GH; y++) {
    const y0 = y * GW, ym = (y === 0 ? GH - 1 : y - 1) * GW, yp = (y === GH - 1 ? 0 : y + 1) * GW;
    for (let x = 0; x < GW; x++) {
      const xm = x === 0 ? GW - 1 : x - 1, xp = x === GW - 1 ? 0 : x + 1;
      tmp[y0 + x] = ((trail[y0 + x] + trail[y0 + xm] + trail[y0 + xp] +
        trail[ym + x] + trail[yp + x] + trail[ym + xm] + trail[ym + xp] +
        trail[yp + xm] + trail[yp + xp]) / 9) * 0.958;
    }
  }
  const s = trail; trail = tmp; tmp = s;
}

// ------------------------------------------------------------------ the five sheets
interface Sheet { name: string; note: string; col: [number, number, number]; f: Float32Array;
  cv: HTMLCanvasElement; cx: CanvasRenderingContext2D; im: ImageData; tex: THREE.CanvasTexture;
  mesh: THREE.Mesh; y: number; live: number; }

const DEF: Array<[string, string, [number, number, number]]> = [
  ["the ground", "everything that is actually there", [255, 214, 160]],
  ["sensed", "what the satellites happened to catch", [125, 232, 255]],
  ["features", "what the model was able to name", [140, 230, 46]],
  ["the briefing", "what fitted on one page", [255, 225, 77]],
  ["the decision", "what anybody acted on", [255, 92, 51]],
];
const GAP = 1.18;
const sheets: Sheet[] = DEF.map(([name, note, col], i) => {
  const cv = document.createElement("canvas"); cv.width = GW; cv.height = GH;
  const cx = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 4.0),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false,
      blending: i === 0 ? THREE.NormalBlending : THREE.AdditiveBlending,
      opacity: i === 0 ? 1 : 0.9 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = i * GAP;
  return { name, note, col, f: new Float32Array(NC), cv, cx, im: cx.createImageData(GW, GH),
    tex, mesh, y: i * GAP, live: 0 };
});

/** coverage: two satellite swaths that sweep, so "sensed" has real holes and they move */
const cover = new Float32Array(NC);
function updateCover(t: number) {
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const p1 = Math.abs(((x * 0.7 + y * 0.5 + t * 26) % 190) - 95) / 95;
    const p2 = Math.abs(((x * 0.4 - y * 0.9 + t * 17) % 240) - 120) / 120;
    cover[y * GW + x] = cl(1.35 - Math.min(p1, p2) * 1.9);
  }
}

/** Each sheet is the one below it, with information removed. Nothing is ever added. */
function derive(keep: number) {
  sheets[0].f.set(trail);
  const s1 = sheets[1].f;
  for (let i = 0; i < NC; i++) s1[i] = trail[i] * (0.18 + 0.82 * cover[i]);
  // features: 4x pooling, then a threshold — texture dies here, only named things survive
  pool(s1, sheets[2].f, 4, 0.36 - 0.26 * keep);
  // briefing: 12x pooling and only the strongest cells clear the bar
  pool(sheets[2].f, sheets[3].f, 12, 0.50 - 0.34 * keep);
  // decision: 24x, and only the very top
  pool(sheets[3].f, sheets[4].f, 24, 0.62 - 0.40 * keep);
}
function pool(src: Float32Array, dst: Float32Array, n: number, thr: number) {
  dst.fill(0);
  for (let by = 0; by < GH; by += n) for (let bx = 0; bx < GW; bx += n) {
    let m = 0, cnt = 0;
    for (let y = by; y < Math.min(GH, by + n); y++) for (let x = bx; x < Math.min(GW, bx + n); x++) {
      m += src[y * GW + x]; cnt++;
    }
    m /= Math.max(1, cnt);
    if (m < thr) continue;
    for (let y = by; y < Math.min(GH, by + n); y++) for (let x = bx; x < Math.min(GW, bx + n); x++)
      dst[y * GW + x] = m;
  }
}

function paint(s: Sheet, idx: number) {
  const d = s.im.data, [cr, cg, cb] = s.col;
  let live = 0;
  for (let i = 0, j = 0; i < NC; i++, j += 4) {
    const raw = s.f[i] * 2.6; const v = raw / (raw + 0.55);   // Reinhard — rolls off instead of clipping
    // ground carries its terrain and its people; the sheets above carry only what survived
    let base = 0;
    if (idx === 0) {
      base = cl(elev[i] * 0.16 + 0.10) * 0.30 + cl(people[i] * 1.4) * 0.55;
      if (s.f[i] > 0.05) live += people[i] > 0.05 ? 1 : 0;
    } else if (s.f[i] > 0.02 && people[i] > 0.05) live++;
    const a = cl(v * 1.35 + base * 0.85);
    const hot = v * v * v;                       // the hot core reads as material, not as a line
    d[j] = cl(cr * a + 255 * hot * 0.55, 0, 255);
    d[j + 1] = cl(cg * a + 255 * hot * 0.55, 0, 255);
    d[j + 2] = cl(cb * a + 255 * hot * 0.55, 0, 255);
    d[j + 3] = cl(a * 1.05, 0, 1) * 255;
  }
  s.live = live;
  s.cx.putImageData(s.im, 0, 0);
  s.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ three
const canvas = document.getElementById("gl") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
cam.position.set(5.0, 4.6, 6.2);
const ctrl = new OrbitControls(cam, canvas);
ctrl.enableDamping = true; ctrl.dampingFactor = 0.06;
ctrl.target.set(0, GAP * 2.0, 0);
/* Loads STATIC on the framing below and stays there. Randy: "it's centred perfectly so it
   should load just as it is, I just want camera control after that." Drag to orbit, wheel to
   zoom, right-drag to pan. The turntable slider in the L panel starts it spinning if wanted. */
ctrl.autoRotate = false; ctrl.autoRotateSpeed = 0;
ctrl.minDistance = 4; ctrl.maxDistance = 22;

for (const s of sheets) scene.add(s.mesh);

// a hairline cage per sheet, so the stack reads as five distinct planes in space
const edges: THREE.LineSegments[] = [];
for (const s of sheets) {
  const g = new THREE.EdgesGeometry(new THREE.PlaneGeometry(6.4, 4.0));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color: new THREE.Color(s.col[0] / 255, s.col[1] / 255, s.col[2] / 255),
    transparent: true, opacity: 0.30 }));
  l.rotation.x = -Math.PI / 2; l.position.y = s.y; scene.add(l); edges.push(l);
}

/** the threads: where a settlement survived the climb, light connects the sheets */
const THREADS = 220;
const thGeo = new THREE.BufferGeometry();
const thPos = new Float32Array(THREADS * 2 * 3);
const thCol = new Float32Array(THREADS * 2 * 3);
thGeo.setAttribute("position", new THREE.BufferAttribute(thPos, 3));
thGeo.setAttribute("color", new THREE.BufferAttribute(thCol, 3));
scene.add(new THREE.LineSegments(thGeo, new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })));

const spots: number[] = [];
for (let i = 0; i < NC; i++) if (people[i] > 0.22) spots.push(i);

function updateThreads() {
  let t = 0;
  for (let q = 0; q < spots.length && t < THREADS; q++) {
    const i = spots[q];
    // how far up the stack this community is still represented
    let top = 0;
    for (let L = 1; L < sheets.length; L++) { if (sheets[L].f[i] > 0.02) top = L; else break; }
    if (top === 0) continue;
    const gx = (i % GW) / GW - 0.5, gz = ((i / GW) | 0) / GH - 0.5;
    const o = t * 6;
    thPos[o] = gx * 6.4; thPos[o + 1] = 0.02; thPos[o + 2] = gz * 4.0;
    thPos[o + 3] = gx * 6.4; thPos[o + 4] = top * GAP; thPos[o + 5] = gz * 4.0;
    const c = sheets[top].col;
    thCol[o] = 1; thCol[o + 1] = 0.85; thCol[o + 2] = 0.62;
    thCol[o + 3] = c[0] / 255; thCol[o + 4] = c[1] / 255; thCol[o + 5] = c[2] / 255;
    t++;
  }
  for (let q = t; q < THREADS; q++) { const o = q * 6; for (let k = 0; k < 6; k++) thPos[o + k] = 0; }
  (thGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  (thGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
}

// ------------------------------------------------------------------ chrome
const labels = sheets.map((s) => {
  const d = document.createElement("div"); d.className = "lay";
  d.innerHTML = `<div class="n" style="color:rgb(${s.col.join(",")})">${s.name}</div>`
    + `<div class="d">${s.note}</div><div class="c">—</div>`;
  document.body.appendChild(d); return d;
});
const elLost = document.getElementById("lost")!, elStat = document.getElementById("stat")!;
const elExp = document.getElementById("exp")!;
/* Live tunables, driven by the L panel. Held in one object so the render loop and the paint
   pass read the same values and nothing drifts out of sync. */
const TUNE = { keep: 0.32, spin: 0, gain: 1.02, gap: GAP };
// NOTE: `npx tsc --noEmit` does NOT type-check this file — it is outside the app tsconfig.
// Verify it in the browser and read the console; a clean tsc here means nothing.
let KEEP = TUNE.keep;
(document.getElementById("loss") as HTMLInputElement).addEventListener("input", (e) => {
  KEEP = parseFloat((e.target as HTMLInputElement).value);
  TUNE.keep = KEEP;
  const pk = document.getElementById("pKeep") as HTMLInputElement | null;
  if (pk) { pk.value = String(KEEP); setV("vKeep", KEEP); }
});

// ---- the L panel
const setV = (id: string, n: number) => {
  const el = document.getElementById(id); if (el) el.textContent = n.toFixed(el.id === "vSpin" ? 3 : 2);
};
const panel = document.getElementById("panel")!;
addEventListener("keydown", (e) => {
  if (e.key === "l" || e.key === "L") {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return;
    panel.classList.toggle("on");
  }
  if (e.key === "Escape") panel.classList.remove("on");
});
const bind = (id: string, vid: string, set: (n: number) => void) => {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  el.addEventListener("input", () => { const n = parseFloat(el.value); set(n); setV(vid, n); });
};
bind("pKeep", "vKeep", (n) => {
  KEEP = n; TUNE.keep = n;
  const l = document.getElementById("loss") as HTMLInputElement | null; if (l) l.value = String(n);
});
bind("pSpin", "vSpin", (n) => { TUNE.spin = n; ctrl.autoRotateSpeed = n * 2.6; ctrl.autoRotate = n > 0; });
bind("pGain", "vGain", (n) => { TUNE.gain = n; });
bind("pGap", "vGap", (n) => {
  TUNE.gap = n;
  for (let i = 0; i < sheets.length; i++) {
    sheets[i].y = i * n;
    sheets[i].mesh.position.y = i * n;
    if (edges[i]) edges[i].position.y = i * n;
  }
  ctrl.target.set(0, n * 2, 0);
  ctrl.update();
});
document.getElementById("pReset")!.addEventListener("click", () => {
  const g = TUNE.gap;
  cam.position.set(5.0, 4.6 + (g - GAP) * 2, 6.2);
  ctrl.target.set(0, g * 2, 0);
  ctrl.update();
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

const v3 = new THREE.Vector3();
let frame = 0, t0 = 0;
function loop(t: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - t0) / 1000); t0 = t;
  stepGround();
  updateCover(t / 1000);
  derive(KEEP);
  for (let i = 0; i < sheets.length; i++) paint(sheets[i], i);
  if ((frame & 7) === 0) updateThreads();
  ctrl.update();
  renderer.render(scene, cam);

  if ((frame & 7) === 0) {
    for (let i = 0; i < sheets.length; i++) {
      v3.set(3.4, sheets[i].y, -2.1).project(cam);
      const el = labels[i];
      el.style.left = `${(v3.x * 0.5 + 0.5) * innerWidth + 14}px`;
      el.style.top = `${(-v3.y * 0.5 + 0.5) * innerHeight}px`;
      el.style.opacity = v3.z < 1 ? "1" : "0";
      (el.lastChild as HTMLElement).textContent = `${sheets[i].live} places represented`;
    }
    const onGround = sheets[0].live, inBrief = sheets[3].live;
    const lost = Math.round(SOULS * (1 - inBrief / Math.max(1, onGround)));
    elLost.textContent = lost.toLocaleString();
    elStat.textContent = `${Math.round(SOULS).toLocaleString()} people · ${onGround} places on the`
      + ` ground · ${inBrief} of them in the briefing · drag to fly through`;
    elExp.textContent = KEEP < 0.4
      ? "Almost nothing survives. The ground is as full as it ever was; the briefing is nearly empty."
      : "More survives the climb, and the upper sheets start to look like the place they describe.";
  }
  frame++;
}
requestAnimationFrame(loop);
