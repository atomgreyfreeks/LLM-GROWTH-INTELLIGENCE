# 3090 readiness — what "ready for a real run" means, precisely

**The claim this document has to earn:** every v0 scene in this repo could be pointed at a real
local model on the RTX 3090 by changing *one function*, with no edit to any scene, and produce a
four-arm result suitable for the hackathon submission.

## The swap point

Every scene kernel has the signature `(SimConfig) => SimResult`. Inside it, agents decide through
one interface, in `app/src/core/inference.ts`:

```ts
interface Backend {
  decide(reqs: DecisionRequest[], rng: Rng): Decision[] | Promise<Decision[]>
}
```

v0 uses `makeStubBackend(wildness)` — pure, synchronous, seeded, free. A real run uses
`makeLocalModelBackend({ baseUrl, model, seed })` against an OpenAI-compatible endpoint. The
scene imports neither: it consumes `SimResult.events` and renders. **Nothing in `src/scenes/`
changes.**

That is not an accident of design, it is the reason the architecture looks the way it does.

## Why replay reads the log (the constraint that shaped everything)

LLM sampling is not reproducible across backends. The same seed on MLX and on vLLM produces
different text. The submission requires deterministic replay. Those two facts are only compatible
if the visualization is a **log consumer**, never a live inference caller.

So the real-run procedure is:

1. Run the kernel **once**, offline, with the model backend. Write `SimResult` to JSON.
2. Commit that JSON as the run artifact — it *is* the raw log the submission asks for.
3. The scene loads the JSON instead of calling the kernel. Pixel-identical, forever.

Built in from the first commit and it cost nothing. Retrofitted in the final week it would have
been a rewrite.

## The four-arm protocol

A result is not reported from fewer than four arms, each across ≥3 seeds:

| arm | what it is | backend |
|---|---|---|
| baseline | `interventionTick: -1`, divergence at the run's setting | model |
| intervention | knob turns at the configured tick | model |
| null check | `makeStubBackend` — the scripted non-agent world | stub |
| ablation | the one control surface removed (`divergence: 0`) | model |

The null arm is free and already built: it is v0. The hackathon guidance asks for exactly
this kind of scripted, non-agent baseline, so the inference-free v0 is a submission artifact
rather than scaffolding thrown away.

## VRAM math — all three tiers share a 24GB-per-worker ceiling

| tier | hardware | usable per worker | N | backend |
|---|---|---|---|---|
| laptop | M2 Max 32GB unified | ~24GB (28 with `sudo sysctl iogpu.wired_limit_mb=28000`) | 1 | Metal — Ollama / MLX |
| rig | RTX 3090 24GB GA102 sm_86 | 24GB | 1–2 | CUDA — vLLM |
| cluster | 7 × 24GB, aggregate 168GB | 24GB | 7 | CUDA — vLLM per worker |

168 ÷ 7 = 24, and the only "RTX 5000" at 24GB is the **A5000** — GA102, sm_86, the same silicon
generation as the 3090. If that holds, the 3090 is a near-exact node replica rather than a
downgrade proxy, and it has *more* memory bandwidth (936 vs 768 GB/s). **Unconfirmed — this is an
open question for the organizers, and it is load-bearing.**

Model shortlist that fits with real KV-cache headroom is in `core/inference.ts`
(`MODEL_SHORTLIST`): Qwen3 8B/14B for the laptop, Qwen3 32B AWQ at the 3090/cluster ceiling, with
Gemma 3 12B and Mistral Small 24B as the second and third *families* — needed because
`model-monoculture` requires genuinely different model lineages, not the same model prompted
differently.

## Running it on the 3090

```bash
# on the rig
vllm serve Qwen/Qwen3-32B-AWQ --port 8000 --max-model-len 8192 --gpu-memory-utilization 0.92

# from this repo — one arm, three seeds
AURA_BACKEND=cuda AURA_BASE_URL=http://localhost:8000/v1 AURA_MODEL=Qwen/Qwen3-32B-AWQ \
  node scripts/run-arm.mjs --scene seven-earths --arm intervention --seeds 3 --n 2
```

`scripts/run-arm.mjs` is **not yet written** — see gaps below.

## What is honestly NOT ready

Stating these plainly is the point of the document.

1. ~~The offline run script does not exist.~~ **DONE** — `app/scripts/run.mts`. Executes kernels
   headlessly in Node, runs all four arms across N seeds, probes determinism by running each
   config twice and comparing logs byte-for-byte, reports cross-world spread, and writes raw
   `SimResult` JSON with `--write`. Verified: all six scenes, 24 arms, deterministic; `--n 3`
   yields exactly 3 worlds on every scene, so no scene hardcodes its world count.

   It immediately earned its cost by catching that **four of six interventions were render-only** —
   `base.events === intervention.events` byte-for-byte. No browser check could have
   found this, because the knob *does* visibly change the picture; it just never entered the
   simulation. This is the single most important reason to run arms offline before a real run:
   a render-only knob would have produced baseline == intervention on the 3090 no matter which
   model was loaded, and the failure would have looked like a null result rather than a bug.

2. **Kernels are synchronous.** The `Backend` interface returns `Decision[] | Promise<Decision[]>`,
   but v0 kernels call it synchronously. Each kernel needs an async variant for a real run. The
   shape is already right; the plumbing is not done. `run.mts` is already structured to await it.
3. ~~Scenes do not yet load a JSON log.~~ **DONE** — `/?scene=<code>&run=/runs/<code>/<arm>-<seed>.json`
   loads a committed `SimResult` instead of calling the kernel, and the panel shows
   `REPLAY — COMMITTED LOG` rather than `LIVE KERNEL`. `run.mts --write` emits into `public/runs/`
   so vite serves them directly. Verified end to end: kernel → JSON (473KB) → HTTP 200 → replay.
   This is the whole reproducibility story working today, on stub data, exactly as it will work
   on model data.
4. **No token-cost or wall-clock estimate.** Agents-per-tick × ticks × worlds × seeds × arms is
   the number that decides whether a real run fits the 16-day window, and it has not been
   computed for any scene.
5. **Model diversity is asserted, not tested.** `model-monoculture` needs three genuinely
   different families producing measurably decorrelated errors. Nobody has verified that Qwen /
   Gemma / Mistral actually decorrelate on these tasks — that is itself an experiment.

None of these block tonight's goal, which is v0 candidates. All of them block a real run, and
they are roughly two days of work, not two weeks.
