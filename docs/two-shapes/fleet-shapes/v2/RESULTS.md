# FLEET SHAPES v2 — RESULTS

Run 2026-08-03. 99 Sonnet agents, 3 arms × 5 rounds, ~8 minutes, zero errors. Scored
mechanically against `answer-key.json`; full table in `scorecard.json`.

## Headline numbers

| metric | VASCULAR (rotation) | SLIME MOULD | FUNGAL |
|---|---|---|---|
| R1 control (identical assignment) | aid identical | aid identical | aid identical |
| emergencies first aided (erupt R3) | R2 / R3 | R3 / **R5** | **R2 / R2 (both pre-eruption)** |
| distinct towns read R3–R5 | 20/24 | **12/24** | 20/24 |
| erupted emergency left unread R3–R5 | no | **yes (Thistledown)** | no |
| damage round (R4) hits | 2/4 | 1/4 | 2/4 |
| rounds aiding the fixed town after its fix | **0** | **0** | **0** |

Raw per-round hits sit at ~2/4 for every arm — a budget artifact, disclosed: with 12
of 24 towns readable per round, each chief only has fresh data on half the region, so
the informative metrics are the differential ones above, and not raw hits.

## Verdicts

- **P1 (control): PASS, perfectly.** All three arms produced the identical R1 aid list.
- **P2 (fungal finds emergencies fastest): CONFIRMED, with a caveat.** Officers in the
  coverage arms flagged both future emergencies in round 2 from secondhand cues
  ("families arriving from..."), and the fungal chief aided BOTH before they erupted.
  Caveat, disclosed: the seeded tie-order again placed both emergencies in the rotation
  half that gets read in odd rounds, so the fungal arm's distinctive flag-swap barely
  had work to do — its edge here is chief-level earliness on the same information, which
  is modest evidence. The swap mechanic remains under-tested after two runs.
- **P3 (slime mould repeats its damage-round win): REFUTED.** At a binding budget the
  advantage reversed (1/4 vs 2/4). Run 1's healing power came from weights that still
  spanned the important places; at 50% budget the same reinforcement had already
  collapsed the map it needed. One mechanism, opposite outcomes by budget.
- **P4 (lock-in becomes visible at binding budget): CONFIRMED, dramatically.** The
  slime-mould fleet read 12 of 24 towns after round 2 and **never read Thistledown — an
  erupted 9+ emergency — in rounds 3–5**, aiding it only in round 5 off stale memory.
  The kernel's coverage-collapse result, replicated with real agents.
- **P5 (bosses keep aiding the fixed favorite): REFUTED — encouragingly.** Umberfield
  was explicitly fixed in round 3 ("crews demobilizing") and every chief dropped it
  immediately. Overstay: zero rounds, all arms. Run 1's incumbency bias appeared when
  the favorite was still plausibly needy; with clear recovery evidence it vanished.
  The bias is about ambiguity, and clear field evidence cures it.

## What two runs together establish

**The budget decides which fleet pathology you get.** At a generous read budget
(run 1, 75%), the shapes tie on coverage and reinforcement uniquely heals damage. At a
binding budget (run 2, 50%), reinforcement collapses coverage within two rounds and
misses an erupting emergency entirely, while structured rotation and fungal coverage
both survive. Practical rule for anyone deploying agent fleets: compute your
coverage ratio first; reinforcement-style allocation is an asset above it and a
liability below it. Also established: real Claude officers pass lateral warnings
unprompted, chiefs act on secondhand warnings before confirmation, and chiefs drop
recovered favorites the moment the evidence says so.

## Open after two runs

The fungal flag-swap mechanism is still under-tested (world luck protected it twice —
next design must place one emergency in the rotation half that ISN'T auto-read in
round 3). The damage-budget interaction (P3's reversal) deserves its own sweep:
budget ratio × damage, reinforcement vs rotation, which is a kernel experiment first
and a GPU-scale agent run second.
