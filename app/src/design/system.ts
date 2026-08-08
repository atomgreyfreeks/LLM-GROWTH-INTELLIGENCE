/**
 * AURAWORLD — design system. Every scene imports from here. Nothing invents its own.
 *
 * Direction (set by Randy, 2026-07-30): black ground, white Helvetica, CLEAN and simple.
 * High-contrast 3D. Advanced particles. Holographic controls. Smooth eased motion at 60–120fps.
 */

// ---------------------------------------------------------------- palette

export const C = {
  /** the ground of every world. true black — the scenes are lit objects in a void. */
  ink: "#000000",
  /** bodies, primary type, the crisp mark. */
  bone: "#ffffff",
  /** subordinate labels, secondary bodies. */
  dim: "#7a7a7a",
  /** the quietest legible mark. below this, use opacity on dim. */
  faint: "#3a3a3a",
  /** hairlines, frame insets, graticule. */
  hair: "rgba(255,255,255,0.14)",
  /** SIGNAL — holographic cyan. The single operative element. See law below. */
  signal: "#7df9ff",
  /** BURN — the only warm value. Earned only by irreversible consumption. See law below. */
  burn: "#ff9d5c",
} as const;

/**
 * SIGNAL LAW — exactly one operative thing per frame carries `signal`.
 * At rest that is the knob. During the intervention it travels with the front.
 * After the front lands it sits on the one thing now changed.
 * Two signal subjects in one frame is a bug you can see without reading anything.
 *
 * BURN LAW — `burn` is earned only by a process that irreversibly consumes a stock it
 * cannot recover. A cascade eating a reserve burns. Motion does not burn. Growth does not burn.
 *
 * No other hue may appear in a scene. White, grey, signal, burn. That is the whole register.
 */

/** Five-stop ramp: ground -> shadow -> mid -> signal -> bone. Resolve every scalar field through this. */
export const RAMP: readonly [string, string, string, string, string] = [
  "#000000",
  "#0e1416",
  "#2d4247",
  "#7df9ff",
  "#ffffff",
];

/** Sample RAMP at u in 0..1. Returns [r,g,b] in 0..1 for direct use in shaders / THREE.Color. */
export function ramp(u: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, u)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(t));
  const f = t - i;
  const a = hexRgb(RAMP[i]);
  const b = hexRgb(RAMP[i + 1]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

// ---------------------------------------------------------------- type

export const TYPE = {
  family: `"Helvetica Neue", Helvetica, Arial, sans-serif`,
  /** chrome/label sizes in px. Nothing larger than `read` inside a canvas. */
  micro: 9,
  label: 10,
  read: 13,
  /** uppercase + this tracking is the house label voice */
  tracking: "0.18em",
  weightLabel: 700,
  weightBody: 400,
} as const;

// ---------------------------------------------------------------- easing

/** Never animate linearly. Pick one of these. */
export const ease = {
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t: number) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
  /** overshoot — for a knob landing on its stop */
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} as const;

/** Frame-rate independent exponential approach. Use this instead of lerp(a,b,0.1) in useFrame. */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  target + (current - target) * Math.exp(-lambda * dt);

/** Clamp + remap. */
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const remap = (x: number, a: number, b: number, c: number, d: number) =>
  c + ((clamp((x - a) / (b - a)) * (d - c)));

// ---------------------------------------------------------------- budget

/**
 * PERFORMANCE BUDGET — falsifiable, read it off the harness meter.
 *   full scene at 1280x720, dpr capped 2:  <= 8.0 ms/frame  (>=120fps headroom target 60fps min)
 *   harness solo:                          <= 6.0 ms/frame
 * Rules that keep you inside it:
 *   - no `new` of Vector3/Color/Matrix4/Array inside useFrame — hoist to module or useRef
 *   - no setState from useFrame, ever
 *   - instanced meshes for anything over ~200 bodies
 *   - always use `delta` for animation, never frame count
 */
export const BUDGET = { sceneMs: 8.0, harnessMs: 6.0, dprCap: 2 } as const;

/** Scratch objects — import and reuse instead of allocating in the loop. */
export const SCRATCH = {
  v: [0, 0, 0] as [number, number, number],
};
