/**
 * Scene manifest — AUTO-REGISTERING.
 * Every `src/scenes/<code>/index.tsx` that calls register() is picked up here with no edit.
 * Builders touch ONLY their own directory. There is no shared manifest to conflict on.
 */
import.meta.glob("./*/index.tsx", { eager: true });
export {};
