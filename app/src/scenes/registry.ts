/**
 * AURAWORLD — scene registry. One entry per hero sim.
 * Builders add their scene here and nowhere else. Order here is gallery order.
 */
import type { ComponentType } from "react";
import type { Kernel } from "../core/sim";

export interface SceneDef {
  /** stable code, used in URLs and filenames. lowercase-kebab, ASCII only. */
  code: string;
  /** display title, exactly as it appears in report #5 */
  title: string;
  /** the irresistible question, one sentence, as the viewer reads it */
  question: string;
  /** the single hidden control surface this scene manipulates */
  surface: string;
  /** what a viewer must understand in five seconds with no narration */
  heroImage: string;
  /** the pure deterministic kernel */
  kernel: Kernel;
  /** the R3F scene. Renders FROM the kernel's event log. Mounted inside a shared <Canvas>. */
  World: ComponentType<{ result: import("../core/sim").SimResult }>;
  /**
   * Plain-DOM overlay, rendered as a sibling ON TOP of the canvas — never inside it.
   *
   * This exists because legibility died when every word lived in WebGL: drei <Html> and canvas
   * text pushed scenes toward 9px uppercase telemetry, so the only writing in the frame was
   * accession codes. Real DOM means real type at a real size, crisp at any dpr, selectable,
   * and free. Anything a viewer must *read* belongs here.
   */
  Overlay?: ComponentType<{ result: import("../core/sim").SimResult }>;
  /**
   * Camera for this scene, in its own words. The harness used to own one camera for all six
   * and four scenes never overrode it, so every world was seen through the same 45° lens from
   * the same distance. A scene that does not set this is choosing the default, not inheriting it.
   */
  camera?: { position: [number, number, number]; fov?: number; zoom?: number; ortho?: boolean };
  /** how many worlds this scene runs by default (NEVER hardcoded inside the scene) */
  defaultN: number;
}

export const SCENES: SceneDef[] = [];

/**
 * Register a scene. Idempotent by `code`.
 *
 * Re-registering REPLACES rather than throwing, because Vite HMR re-executes a scene module on
 * every edit and a throwing register() turns each save into a red overlay plus a failed reload
 * (`duplicate scene code: ...`). Throwing here made the harness unusable while a builder was
 * actively editing — the exact moment it needs to work.
 */
export function register(def: SceneDef) {
  const i = SCENES.findIndex((s) => s.code === def.code);
  if (i >= 0) SCENES[i] = def;
  else SCENES.push(def);
}

export const byCode = (code: string) => SCENES.find((s) => s.code === code);

/** The six flagship concepts from report #5, in priority order. */
export const ROSTER = [
  { code: "seven-earths", title: "Seven Earths", surface: "ontology" },
  { code: "compression-sovereignty", title: "Compression Sovereignty", surface: "compression" },
  { code: "open-data-closed-power", title: "Open Data, Closed Power", surface: "compute" },
  { code: "prediction-becomes-world", title: "Prediction Becomes the World", surface: "reflexivity" },
  { code: "model-monoculture", title: "Model Monoculture", surface: "model diversity" },
  { code: "invisible-constitution", title: "Invisible Constitution", surface: "standards" },
] as const;
