/**
 * AURAWORLD — shared R3F primitives + axis store.
 * Every scene composes from these so the six read as one instrument, not six demos.
 */
import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame, useThree, createPortal } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";
import { C, TYPE, ease, damp, clamp, BUDGET } from "./system";
import { DEFAULT_AXES, type Axes, seedHex } from "../core/sim";

// ---------------------------------------------------------------- axis store

interface AxisState extends Axes {
  seed: number;
  playing: boolean;
  /** current playback tick, advanced by the scene's clock */
  tick: number;
  set: (p: Partial<AxisState>) => void;
  reseed: (s: number) => void;
}

export const useAxes = create<AxisState>((set) => ({
  ...DEFAULT_AXES,
  seed: 0x5eed,
  playing: true,
  tick: 0,
  set: (p) => set(p),
  reseed: (s) => set({ seed: s >>> 0, tick: 0 }),
}));

/**
 * Read axes inside useFrame WITHOUT subscribing the component to re-renders.
 * `const ax = useAxisRef(); ... ax.current.tempo` — this is the only correct way
 * to touch axes in the render loop.
 */
export function useAxisRef() {
  const ref = useRef(useAxes.getState());
  useLayoutEffect(() => useAxes.subscribe((s) => (ref.current = s)), []);
  return ref;
}

// ---------------------------------------------------------------- chrome

/**
 * Chrome — the HTML overlay. Helvetica, white, uppercase, tracked.
 * This is the ONLY place instrument furniture is legal. It sits at the frame edge
 * and is never the subject. Absolutely positioned over the canvas.
 */
export function Chrome(props: {
  accession: string;
  seed: number;
  telemetry?: Array<[string, string]>;
  preset?: string;
}) {
  const { accession, seed, telemetry = [], preset } = props;
  const label: React.CSSProperties = {
    fontFamily: TYPE.family,
    fontSize: TYPE.micro,
    fontWeight: TYPE.weightLabel,
    letterSpacing: TYPE.tracking,
    textTransform: "uppercase",
    color: C.bone,
    opacity: 0.78,
    margin: 0,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
  };
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        userSelect: "none",
      }}
    >
      {/* inset frame */}
      <div
        style={{
          position: "absolute",
          inset: 10,
          border: `1px solid ${C.hair}`,
          pointerEvents: "none",
        }}
      />
      {[
        { top: 6, left: 6, bt: 1, bl: 1 },
        { top: 6, right: 6, bt: 1, br: 1 },
        { bottom: 6, left: 6, bb: 1, bl: 1 },
        { bottom: 6, right: 6, bb: 1, br: 1 },
      ].map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 9,
            height: 9,
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            borderTop: p.bt ? `1px solid ${C.signal}` : undefined,
            borderBottom: p.bb ? `1px solid ${C.signal}` : undefined,
            borderLeft: p.bl ? `1px solid ${C.signal}` : undefined,
            borderRight: p.br ? `1px solid ${C.signal}` : undefined,
            opacity: 0.85,
          }}
        />
      ))}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <p style={label}>{accession}</p>
        <p style={{ ...label, color: C.signal, opacity: 1 }}>SEED {seedHex(seed)}</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          {telemetry.map(([k, v]) => (
            <p key={k} style={{ ...label, opacity: 0.62 }}>
              {k} <span style={{ opacity: 0.95 }}>{v}</span>
            </p>
          ))}
        </div>
        {preset && <p style={{ ...label, opacity: 0.5 }}>{preset}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the knob

/**
 * HoloDial — the intervention seal. It has a body on screen from the first second,
 * VISIBLE BEFORE IT TURNS. The turn is one continuous eased movement, 0.6–1.5s, never linear.
 * It holds the single `signal` mark while at rest.
 *
 * Drive it with `value` 0..1 from the axis store; it eases internally.
 */
export function HoloDial(props: {
  value: number;
  position?: [number, number, number];
  radius?: number;
  /** ticks per second of arc rotation while idle — keeps it alive without stealing attention */
  idleSpin?: number;
}) {
  const { value, position = [0, 0, 0], radius = 1, idleSpin = 0.06 } = props;
  const grp = useRef<THREE.Group>(null!);
  const arc = useRef<THREE.Mesh>(null!);
  const eased = useRef(0);

  const ringGeo = useMemo(() => new THREE.RingGeometry(radius * 0.92, radius, 96), [radius]);
  const tickGeo = useMemo(() => {
    // 36 radial ticks as one buffer — no per-tick meshes
    const pos: number[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r0 = radius * (i % 9 === 0 ? 1.06 : 1.03);
      const r1 = radius * 1.14;
      pos.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [radius]);

  useFrame((_, dt) => {
    eased.current = damp(eased.current, clamp(value), 6, dt);
    const e = ease.inOutQuint(eased.current);
    if (grp.current) grp.current.rotation.z += idleSpin * dt * (1 - e * 0.85);
    if (arc.current) {
      arc.current.scale.setScalar(1 + e * 0.14);
      (arc.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + e * 0.65;
    }
  });

  return (
    <group ref={grp} position={position}>
      <lineSegments geometry={tickGeo}>
        <lineBasicMaterial color={C.dim} transparent opacity={0.5} />
      </lineSegments>
      <mesh ref={arc} geometry={ringGeo}>
        <meshBasicMaterial
          color={C.signal}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- particles

const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3  aColor;
  uniform float uTime;
  uniform float uScale;
  varying vec3  vColor;
  varying float vSeed;
  void main() {
    vColor = aColor;
    vSeed  = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3  vColor;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // soft core + tight bloom, no radial gradient texture needed
    float core = smoothstep(0.5, 0.0, d);
    float glow = pow(core, 3.0);
    float shimmer = 0.85 + 0.15 * sin(uTime * 2.0 + vSeed * 43.0);
    gl_FragColor = vec4(vColor * (glow * 1.6 + core * 0.35) * shimmer, uOpacity * core);
  }
`;

/**
 * Particles — additive GPU point field. This is the house particle primitive.
 *
 * To animate it, pass `onFrame`. You receive the raw buffers and must set the matching
 * `needsUpdate` flag for anything you touched. Do NOT rebuild the geometry per frame, and do
 * NOT allocate inside `onFrame`.
 *
 *   <Particles count={4000} init={...} onFrame={(b, dt, t) => {
 *     for (let i = 0; i < b.pos.length; i += 3) b.pos[i + 1] += dt;
 *     b.needsUpdate.position = true;
 *   }} />
 *
 * You may also grab the underlying THREE.Points via `pointsRef` for transform-level work.
 * (Ref forwarding added 2026-07-31 after Fleet C found the component exposed no handle at all,
 * which made it usable only for static fields.)
 */
export interface ParticleBuffers {
  pos: Float32Array;
  size: Float32Array;
  color: Float32Array;
  seed: Float32Array;
  needsUpdate: { position: boolean; aSize: boolean; aColor: boolean; aSeed: boolean };
}

export function Particles(props: {
  count: number;
  /** called once to fill initial buffers */
  init: (pos: Float32Array, size: Float32Array, color: Float32Array, seed: Float32Array) => void;
  /** called every frame with the live buffers. Set needsUpdate flags for what you wrote. */
  onFrame?: (b: ParticleBuffers, dt: number, elapsed: number) => void;
  /** direct handle to the THREE.Points, for rotation/position work */
  pointsRef?: React.MutableRefObject<THREE.Points | null>;
  opacity?: number;
  scale?: number;
}) {
  const { count, init, onFrame, pointsRef, opacity = 1, scale = 340 } = props;
  const pts = useRef<THREE.Points>(null!);
  const mat = useRef<THREE.ShaderMaterial>(null!);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    init(pos, size, color, seed);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, [count]);

  // stable buffer view — allocated once, never inside the loop
  const buffers = useMemo<ParticleBuffers>(
    () => ({
      pos: geo.attributes.position.array as Float32Array,
      size: geo.attributes.aSize.array as Float32Array,
      color: geo.attributes.aColor.array as Float32Array,
      seed: geo.attributes.aSeed.array as Float32Array,
      needsUpdate: { position: false, aSize: false, aColor: false, aSeed: false },
    }),
    [geo],
  );

  useLayoutEffect(() => {
    if (pointsRef) pointsRef.current = pts.current;
  }, [pointsRef]);

  useFrame((s, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value = s.clock.elapsedTime;
    if (!onFrame) return;
    onFrame(buffers, dt, s.clock.elapsedTime);
    const n = buffers.needsUpdate;
    if (n.position) {
      geo.attributes.position.needsUpdate = true;
      n.position = false;
    }
    if (n.aSize) {
      geo.attributes.aSize.needsUpdate = true;
      n.aSize = false;
    }
    if (n.aColor) {
      geo.attributes.aColor.needsUpdate = true;
      n.aColor = false;
    }
    if (n.aSeed) {
      geo.attributes.aSeed.needsUpdate = true;
      n.aSeed = false;
    }
  });

  return (
    <points ref={pts} geometry={geo}>
      <shaderMaterial
        ref={mat}
        vertexShader={PARTICLE_VERT}
        fragmentShader={PARTICLE_FRAG}
        uniforms={useMemo(
          () => ({
            uTime: { value: 0 },
            uScale: { value: scale },
            uOpacity: { value: opacity },
          }),
          [],
        )}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------- residue

/**
 * useResidue — a persistent offscreen buffer that is dimmed but NEVER cleared.
 * This is what makes the world remember: every event leaves the field changed, and a
 * frame at t=60s is distinguishable from t=10s by residue alone, with bodies masked out.
 *
 * Returns { target, draw } — render your residue-emitting objects into `target` via
 * the returned `draw(scene, camera)`; the fade is applied automatically, scaled by MEMORY.
 */
export function useResidue(size = 1024) {
  const { gl } = useThree();
  const target = useMemo(
    () =>
      new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
      }),
    [size],
  );

  const fadeScene = useMemo(() => {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.02 }),
    );
    s.add(m);
    return s;
  }, []);
  const fadeCam = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const ax = useAxisRef();

  const cleared = useRef(false);
  const lastT = useRef(0);
  useFrame((_, dt) => {
    lastT.current = dt;
  });

  const draw = (scene: THREE.Scene, camera: THREE.Camera) => {
    const prev = gl.getRenderTarget();
    const prevAutoClear = gl.autoClear;
    gl.setRenderTarget(target);

    // One-time clear so the buffer never starts with undefined contents.
    if (!cleared.current) {
      gl.autoClear = true;
      gl.clear(true, true, true);
      cleared.current = true;
    }

    // CRITICAL: autoClear must be false BEFORE the fade pass. If it is still true here,
    // the fade render wipes the accumulation target every frame and residue never
    // accumulates — the buffer stops being persistent and gate 7 becomes unpassable.
    // (Caught by Fleet B during self-verification, 2026-07-31.)
    gl.autoClear = false;

    // Fade — memory 0 forgets fast, memory 1 is effectively permanent.
    //
    // Scaled by dt against a 60fps reference, because the fade is applied ONCE PER FRAME: an
    // unscaled opacity makes residue length frame-rate dependent, so trails at 700fps (vsync
    // disabled for perf measurement) came out ~6x shorter than the same scene at 120fps.
    // (Caught by Fleet A, 2026-07-31.) dt is clamped so a stall cannot wipe the buffer.
    const mem = ax.current.memory;
    const perFrame = 0.001 + (1 - mem) * 0.09;
    const dtScale = Math.min(3, Math.max(0.05, lastT.current * 60));
    const m = fadeScene.children[0] as THREE.Mesh;
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, perFrame * dtScale);
    gl.render(fadeScene, fadeCam);

    gl.render(scene, camera);

    gl.autoClear = prevAutoClear;
    gl.setRenderTarget(prev);
  };

  return { target, draw };
}

// ---------------------------------------------------------------- perf

export interface PerfSample {
  /** mean wall-clock ms between frames over the window */
  ms: number;
  /** fastest frame in the window — approximates the display refresh period when vsync-bound */
  minMs: number;
  /**
   * True when mean ≈ min, i.e. the scene finishes every frame inside the refresh interval and
   * the compositor — not our render — is setting the pace. THIS is the pass condition.
   *
   * Wall-clock dt cannot go below the refresh period, so on a 120Hz display the floor is
   * 8.33ms and a literal "≤6ms" gate is unreachable no matter how cheap the scene is.
   * (Caught by Fleet B, 2026-07-31.) To read true render cost instead, launch Chrome with
   * --disable-gpu-vsync --disable-frame-rate-limit and read `ms`.
   */
  vsyncBound: boolean;
  /** estimated display refresh in Hz */
  hz: number;
}

const PERF_WINDOW = 90;

/** Cap dpr and report frame timing honestly. Mount once per scene. */
export function PerfGovernor({ onSample }: { onSample?: (s: PerfSample) => void }) {
  const { gl } = useThree();
  // Fixed-size ring, allocated once — never grows, never allocates in the loop.
  const buf = useRef<Float32Array>(new Float32Array(PERF_WINDOW));
  const sorted = useRef<Float32Array>(new Float32Array(PERF_WINDOW));
  const i = useRef(0);

  useLayoutEffect(() => {
    gl.setPixelRatio(Math.min(BUDGET.dprCap, window.devicePixelRatio));
  }, [gl]);

  useFrame((_, dt) => {
    buf.current[i.current++] = dt * 1000;
    if (i.current < PERF_WINDOW) return;
    i.current = 0;

    sorted.current.set(buf.current);
    sorted.current.sort();

    let sum = 0;
    for (let k = 0; k < PERF_WINDOW; k++) sum += buf.current[k];
    const mean = sum / PERF_WINDOW;

    // p10 rather than the absolute minimum: a single anomalously fast frame (a dropped or
    // coalesced present) would otherwise set the "fast frame" reference far too low and flip a
    // perfectly healthy scene to STALLING on jitter alone. (Caught by Fleet A, 2026-07-31.)
    const fast = sorted.current[Math.floor(PERF_WINDOW * 0.1)] || mean;
    const median = sorted.current[Math.floor(PERF_WINDOW * 0.5)] || mean;

    onSample?.({
      ms: mean,
      minMs: fast,
      // median close to the fast reference => frames are being presented on a steady cadence
      vsyncBound: median <= fast * 1.25,
      hz: Math.round(1000 / fast),
    });
  });
  return null;
}

export { createPortal };
