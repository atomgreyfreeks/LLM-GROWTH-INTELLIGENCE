/**
 * LLM GROWTH INTELLIGENCE — scene shell.  /?scene=<code>
 *
 * The world is the page. Full bleed, no furniture, no sliders, no vocabulary from the method.
 * A viewer sees a place and reads sentences about it.
 *
 * The lab bench still exists and is still enforced — seeds, the five axes, the determinism probe
 * and the frame meter all live one keypress away behind L. That separation is the whole point:
 * the earlier build put the apparatus in the picture and the picture disappeared behind it.
 */
import { useState, useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useAxes, PerfGovernor, type PerfSample } from "../design/holo";
import { C, TYPE, BUDGET } from "../design/system";
import { AXIS_RANGE, type Axes, type SimResult, seedHex, DEFAULT_CONFIG } from "../core/sim";
import { byCode, SCENES } from "../scenes/registry";

const AXES: Array<keyof Axes> = ["tempo", "divergence", "memory", "wildness", "intervention"];

const lbl: React.CSSProperties = {
  fontFamily: TYPE.family,
  fontSize: TYPE.micro,
  fontWeight: TYPE.weightLabel,
  letterSpacing: TYPE.tracking,
  textTransform: "uppercase",
  color: C.bone,
  opacity: 0.7,
};

export function Harness({ code }: { code: string }) {
  const scene = byCode(code);
  const ax = useAxes();
  const [lab, setLab] = useState(false);

  // Replay: ?run=/runs/<code>/<arm>-<seed>.json renders a committed log instead of calling the
  // kernel. This is how a model-backed run is viewed — inference happens once, offline, and the
  // render consumes the log. See docs/3090-READINESS.md.
  const runPath = new URLSearchParams(window.location.search).get("run");
  const [loaded, setLoaded] = useState<SimResult | null>(null);
  const [loadErr, setLoadErr] = useState("");
  useEffect(() => {
    if (!runPath) { setLoaded(null); return; }
    let alive = true;
    fetch(runPath)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (alive) { setLoaded(j as SimResult); setLoadErr(""); } })
      .catch((e) => { if (alive) setLoadErr(String(e.message ?? e)); });
    return () => { alive = false; };
  }, [runPath]);

  const [perf, setPerf] = useState<PerfSample>({ ms: 0, minMs: 0, vsyncBound: false, hz: 0 });
  const [det, setDet] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "l" || e.key === "L") {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
        setLab((v) => !v);
      }
      if (e.key === "Escape") setLab(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = useMemo(() => {
    if (!scene) return null;
    return scene.kernel({
      ...DEFAULT_CONFIG,
      seed: ax.seed,
      n: scene.defaultN,
      axes: {
        tempo: ax.tempo,
        divergence: ax.divergence,
        memory: ax.memory,
        wildness: ax.wildness,
        intervention: ax.intervention,
      },
    });
  }, [scene, ax.seed, ax.divergence, ax.wildness, ax.intervention]);

  const result = loaded ?? live;

  const checkDeterminism = () => {
    if (!scene) return;
    const cfg = { ...DEFAULT_CONFIG, seed: ax.seed, n: scene.defaultN, axes: ax as Axes };
    const a = JSON.stringify(scene.kernel(cfg));
    const b = JSON.stringify(scene.kernel(cfg));
    setDet(a === b ? `DETERMINISTIC ✓  ${a.length} bytes` : "NON-DETERMINISTIC ✗ — logs differ");
  };

  useEffect(() => {
    document.title = scene ? scene.title : "no scene";
  }, [scene]);

  if (!scene) {
    return (
      <div style={{ padding: 40, background: C.ink, minHeight: "100vh", color: C.bone }}>
        <p style={{ ...lbl, fontSize: TYPE.read }}>NO SCENE "{code}". REGISTERED:</p>
        {SCENES.map((s) => (
          <p key={s.code} style={{ ...lbl, opacity: 1 }}>
            <a href={`/?scene=${s.code}`} style={{ color: C.signal }}>{s.code}</a>
          </p>
        ))}
        {SCENES.length === 0 && <p style={lbl}>— registry empty —</p>}
      </div>
    );
  }

  // Two different questions, two different gates. Vsync normally floors wall-clock dt at the
  // refresh period, so perf.ms cannot go below ~8.33ms on a 120Hz panel however cheap the scene
  // is; there the only meaningful question is whether it sustains a smooth rate. Launch Chrome
  // with --disable-gpu-vsync --disable-frame-rate-limit and perf.ms becomes true render cost,
  // which is when the 6ms budget is checkable.
  const unlocked = perf.hz > 200;
  const pass = unlocked ? perf.ms <= BUDGET.harnessMs : perf.ms <= 16.7;

  const cam = scene.camera ?? { position: [0, 0, 10] as [number, number, number], fov: 45 };
  const Overlay = scene.Overlay;

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", background: C.ink, overflow: "hidden" }}>
      <Canvas
        gl={{ antialias: true, alpha: false }}
        orthographic={cam.ortho}
        camera={{ position: cam.position, fov: cam.fov, zoom: cam.zoom }}
        style={{ background: C.ink, position: "absolute", inset: 0 }}
      >
        <PerfGovernor onSample={setPerf} />
        {result && <scene.World result={result} />}
      </Canvas>

      {result && Overlay && <Overlay result={result} />}

      {/* the only furniture in the frame */}
      <button
        onClick={() => setLab((v) => !v)}
        title="lab bench (L)"
        style={{
          position: "absolute", right: 14, bottom: 12, background: "transparent",
          border: "none", color: C.bone, opacity: lab ? 0.5 : 0.22, cursor: "pointer",
          fontFamily: TYPE.family, fontSize: 9, letterSpacing: TYPE.tracking, padding: 6,
        }}
      >
        L
      </button>

      {lab && (
        <div
          style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 268,
            background: "rgba(0,0,0,0.92)", borderLeft: `1px solid ${C.hair}`,
            padding: 18, display: "flex", flexDirection: "column", gap: 13,
            overflowY: "auto", backdropFilter: "blur(6px)",
          }}
        >
          <div>
            <p style={{ ...lbl, color: C.signal, opacity: 1 }}>LAB BENCH — {scene.code}</p>
            <p style={{ ...lbl, opacity: 0.35, marginTop: 4 }}>NOT PART OF THE PICTURE. PRESS L.</p>
          </div>

          <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 11 }}>
            <p style={{ ...lbl, color: pass ? C.signal : C.burn, opacity: 1 }}>
              {perf.ms.toFixed(2)} MS/FRAME {pass ? "✓" : "✗"}
            </p>
            <p style={{ ...lbl, opacity: 0.5 }}>
              {(1000 / Math.max(perf.ms, 0.01)).toFixed(0)} FPS · {perf.hz} HZ PANEL
            </p>
            <p style={{ ...lbl, opacity: 0.5, color: pass ? C.dim : C.burn }}>
              {unlocked
                ? `UNLOCKED — TRUE COST, BUDGET ${BUDGET.harnessMs}`
                : pass
                  ? "VSYNC-BOUND — SUSTAINING"
                  : "STALLING — BELOW 60FPS"}
            </p>
          </div>

          {AXES.map((k) => {
            const [lo, hi] = AXIS_RANGE[k];
            return (
              <label key={k} style={{ display: "block" }}>
                <span style={lbl}>{k} {(ax[k] as number).toFixed(2)}</span>
                <input
                  type="range" min={lo} max={hi} step={0.01} value={ax[k] as number}
                  onChange={(e) => ax.set({ [k]: parseFloat(e.target.value) } as never)}
                  style={{ width: "100%", accentColor: C.signal }}
                />
              </label>
            );
          })}

          <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 11 }}>
            <p style={lbl}>SEED {seedHex(ax.seed)}</p>
            <button onClick={() => ax.reseed((ax.seed * 1664525 + 1013904223) >>> 0)} style={btn}>
              RESEED
            </button>
            <button onClick={checkDeterminism} style={btn}>CHECK DETERMINISM</button>
            {det && (
              <p style={{ ...lbl, color: det.includes("✓") ? C.signal : C.burn, opacity: 1 }}>{det}</p>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 11 }}>
            <p style={{ ...lbl, opacity: 0.4 }}>WORLDS {result?.worlds.length ?? 0}</p>
            <p style={{ ...lbl, opacity: 0.4 }}>EVENTS {result?.events.length ?? 0}</p>
            <p style={{ ...lbl, opacity: 0.4 }}>TICKS {result?.ticks ?? 0}</p>
            <p style={{ ...lbl, marginTop: 8, color: loaded ? C.signal : C.dim, opacity: 1 }}>
              {loaded ? "REPLAY — COMMITTED LOG" : "LIVE KERNEL"}
            </p>
            {runPath && <p style={{ ...lbl, opacity: 0.35 }}>{runPath}</p>}
            {loadErr && <p style={{ ...lbl, color: C.burn, opacity: 1 }}>LOAD FAILED {loadErr}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  ...lbl,
  display: "block", width: "100%", background: "transparent",
  border: `1px solid ${C.hair}`, color: C.bone, padding: "7px 8px",
  marginTop: 6, cursor: "pointer",
};
