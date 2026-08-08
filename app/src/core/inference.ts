/**
 * AURAWORLD — the inference adapter. THE SWAP POINT.
 *
 * v0 kernels are inference-free: stub agents with deterministic local policies. This file is
 * what turns any of them into a real model-backed run without touching a single scene.
 *
 * The contract a scene kernel sees is `Agent.decide(...)`. In v0 that is a pure function of the
 * seeded rng. On the 3090 it is a batched call to a local model server. The scene never knows.
 *
 * Three tiers, ONE interface:
 *   MacBook M2 Max 32GB  -> ~24GB usable GPU  -> Metal: Ollama / MLX     -> N = 1
 *   RTX 3090 24GB GA102  -> full CUDA         -> vLLM, AWQ/GPTQ         -> N = 1..2
 *   Cluster 7 x 24GB     -> 168GB aggregate   -> vLLM per worker        -> N = 7
 *
 * All three tiers share a 24GB-per-worker ceiling, so a model that fits on the laptop fits on a
 * cluster node. If "RTX5000 x 7 = 168GB" means RTX A5000 (24GB, GA102, sm_86) then the 3090 is a
 * near-exact node replica — same generation, same kernels, more bandwidth. UNCONFIRMED; an
 * open question for the organizers.
 */

import type { Rng } from "./sim";

// ---------------------------------------------------------------- the interface

/** What a scene kernel asks of an agent. Backend-agnostic by construction. */
export interface Decision {
  /** index into the options the caller offered */
  choice: number;
  /** 0–1, the agent's own stated confidence */
  confidence: number;
  /** free text, logged into SimEvent.d.reason — empty in stub mode */
  reason: string;
}

export interface DecisionRequest {
  /** who is deciding */
  role: string;
  /** what it can perceive — ALREADY filtered by the world's ontology/compression. */
  observation: Record<string, number | string>;
  /** the options available */
  options: string[];
  /** the agent's own objective, stated locally. NEVER the desired causal chain. */
  objective: string;
}

export interface Backend {
  readonly id: string;
  readonly deterministic: boolean;
  /** batched — one call per tick per world, not one per agent. */
  decide(reqs: DecisionRequest[], rng: Rng): Decision[] | Promise<Decision[]>;
}

// ---------------------------------------------------------------- v0: stub backend

/**
 * StubBackend — deterministic, synchronous, free. The v0 default AND the required
 * scripted null-model baseline the hackathon guidance asks for ("Null model — scripted,
 * random, or non-agent").
 *
 * The policy is deliberately simple and locally rational: score each option against the
 * observation the agent can actually see, add wildness-scaled noise, take the argmax.
 * It is NOT told the desired outcome. Divergence between worlds must emerge from the fact
 * that different worlds let the agent SEE different things — never from different policies.
 */
export function makeStubBackend(wildness: number): Backend {
  return {
    id: "stub-v0",
    deterministic: true,
    decide(reqs, rng) {
      return reqs.map((req) => {
        let best = 0;
        let bestScore = -Infinity;
        let total = 0;
        for (let i = 0; i < req.options.length; i++) {
          // salience of an option = how strongly the visible observation supports it
          const key = req.options[i];
          const seen = req.observation[key];
          const base = typeof seen === "number" ? seen : 0;
          const noise = (rng() - 0.5) * 2 * wildness;
          const score = base + noise;
          total += Math.exp(score);
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        }
        return {
          choice: best,
          confidence: total > 0 ? Math.exp(bestScore) / total : 1 / req.options.length,
          reason: "",
        };
      });
    },
  };
}

// ---------------------------------------------------------------- tier 2/3: local model

export interface LocalModelOptions {
  /** OpenAI-compatible endpoint. Ollama: http://localhost:11434/v1 — vLLM: http://localhost:8000/v1 */
  baseUrl: string;
  model: string;
  /** vLLM honours this and is reproducible per-backend; MLX/llama.cpp will NOT match it. */
  seed?: number;
  maxTokens?: number;
  temperature?: number;
}

/**
 * LocalModelBackend — one batched request per tick per world.
 *
 * DETERMINISM WARNING, and it is the reason the whole app replays from the event log:
 * sampling is NOT reproducible across backends. The same seed on MLX and on vLLM produces
 * different text. So a model-backed run is reproducible only by REPLAYING ITS LOG, never by
 * re-running inference. The scenes already work this way — they consume `SimResult.events` and
 * never call a kernel in `useFrame` — so swapping this backend in changes nothing about replay.
 *
 * Procedure for a real run:
 *   1. run the kernel ONCE with this backend, offline, writing SimResult to JSON
 *   2. commit that JSON as the run artifact (this is the raw log the submission requires)
 *   3. the scene loads the JSON instead of calling the kernel — pixel-identical every time
 */
export function makeLocalModelBackend(opts: LocalModelOptions): Backend {
  const { baseUrl, model, seed, maxTokens = 96, temperature = 0.7 } = opts;
  return {
    id: `local:${model}`,
    deterministic: false,
    async decide(reqs) {
      const results = await Promise.all(
        reqs.map(async (req) => {
          const body = {
            model,
            seed,
            max_tokens: maxTokens,
            temperature,
            messages: [
              {
                role: "system",
                content:
                  `You are ${req.role}. Your objective: ${req.objective}. ` +
                  `Decide using ONLY the observation given. Reply as JSON: ` +
                  `{"choice": <index>, "confidence": <0-1>, "reason": "<12 words max>"}.`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  observation: req.observation,
                  options: req.options.map((o, i) => ({ i, o })),
                }),
              },
            ],
          };
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          const text: string = json?.choices?.[0]?.message?.content ?? "";
          try {
            const m = text.match(/\{[\s\S]*\}/);
            const parsed = m ? JSON.parse(m[0]) : null;
            return {
              choice: Math.max(0, Math.min(req.options.length - 1, parsed?.choice ?? 0)),
              confidence: Math.max(0, Math.min(1, parsed?.confidence ?? 0.5)),
              reason: String(parsed?.reason ?? "").slice(0, 120),
            } satisfies Decision;
          } catch {
            return { choice: 0, confidence: 0, reason: "PARSE_FAIL" } satisfies Decision;
          }
        }),
      );
      return results;
    },
  };
}

// ---------------------------------------------------------------- tier config

export interface TierSpec {
  name: string;
  /** worlds runnable concurrently on this tier */
  n: number;
  vramPerWorkerGb: number;
  backend: "stub" | "metal" | "cuda";
  notes: string;
}

/** The three tiers, as a table the run scripts read. Never hardcode N; read it from here. */
export const TIERS: Record<string, TierSpec> = {
  laptop: {
    name: "MacBook Pro M2 Max 32GB",
    n: 1,
    vramPerWorkerGb: 24,
    backend: "metal",
    notes:
      "No CUDA. Ollama/MLX only, GGUF or MLX quants. ~24GB usable (raise with " +
      "`sudo sysctl iogpu.wired_limit_mb=28000`). Sequential worlds only — cannot hold 7 models. " +
      "Fine for correctness, useless for timing estimates.",
  },
  rig: {
    name: "RTX 3090 24GB GA102",
    n: 2,
    vramPerWorkerGb: 24,
    backend: "cuda",
    notes:
      "The fidelity rig. vLLM + continuous batching, AWQ/GPTQ, flash-attn. Anything claimed to " +
      "run on the cluster is proven here first. Also the no-GPU-grant insurance policy: the " +
      "flagship at N=2 still produces a real four-arm result.",
  },
  cluster: {
    name: "7 x 24GB (RTX A5000, unconfirmed)",
    n: 7,
    vramPerWorkerGb: 24,
    backend: "cuda",
    notes:
      "Scale only. Nothing architectural should be discovered here. Assume independent workers, " +
      "no pooled VRAM, no fast interconnect, until topology is confirmed.",
  },
};

/** Model shortlist that fits the shared 24GB-per-worker ceiling, with real headroom for KV cache. */
export const MODEL_SHORTLIST = [
  { id: "qwen3:8b", quant: "q4_K_M", approxGb: 5.2, use: "loop-closing tests, laptop default" },
  { id: "qwen3:14b", quant: "q4_K_M", approxGb: 9.0, use: "laptop ceiling with comfortable KV" },
  { id: "qwen3:32b", quant: "AWQ-4bit", approxGb: 19.5, use: "3090/cluster worker, tight but fits" },
  { id: "gemma3:12b", quant: "q4_K_M", approxGb: 7.6, use: "second model family — diversity arm" },
  { id: "mistral-small:24b", quant: "AWQ-4bit", approxGb: 14.2, use: "third family — diversity arm" },
] as const;
