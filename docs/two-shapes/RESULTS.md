# TWO SHAPES — results and conclusion

Run 2026-08-03. Kernel `app/scripts/twoshapes.mts`, 8 seeds per arm, every arm run twice
with byte-identical log hashes. Raw numbers in `raw-results.json`. Pre-registration in
`EXPERIMENTS.md`; deviations from it are listed at the bottom, with reasons.

## The conclusion, up front

**The vertical shape — how data climbs from ground to decision — is the dangerous
choice, and it is the one nobody makes deliberately.** The horizontal pathology
(a fleet that stops looking) is real and has a cheap, boring, well-known cure: rotation.
The vertical pathology (a climb where the loudest get in) erases 44% of settlements
from the decision layer *even when the fleet's coverage is perfect*, and every
horizontal cure we threw at it failed. The fixes that work live on the vertical axis
itself. Being seen and being helped also turned out to be separable failures: a repaired
channel restored representation fully while help stayed concentrated on the old winners.

## E1 — same ground, different climbs. CONFIRMED, the headline result.

Identical fleet, identical visit sequence (asserted byte-identical across arms), three
climb rules:

| V-shape | unmet need | people erased from the top | settlements | Gini | worst staleness |
|---|---:|---:|---:|---:|---:|
| physarum ("loudest get in") | 3.59 | **7,454 of 18,071** | 36/64 | 0.50 | 400 (entire run) |
| vascular (fixed quotas) | 1.70 | 0 | 64/64 | 0.18 | 77 |
| mycelium (neighbors carry each other) | **1.32** | 0 | 64/64 | 0.07 | 11 |

Same ground, same visits — the climb alone decides who exists at the decision layer,
and swings total unmet need 2.7×. Help follows visibility, so a locked climb
misallocates the help too, with a fleet that sees everything.

## E2 / E2b — lock-in and its cheap cure. CONFIRMED, with two surprises.

At zero exploration the reinforcement fleet freezes onto 8 settlements forever: 85% of
shocks never discovered, unmet need 16.97 vs the 0.50 ceiling. Exploration rescues it
monotonically (0.5/1/2/4 explore visits per tick → 7.85/5.37/3.87/2.55).

**Surprise 1 — the predicted U-shape is refuted.** Plain rotation beat every
reinforcement arm at both budgets tested (K=8: 1.73; K=4: 2.86). In this regime,
freshness beats targeting, full stop. The clever H-shape never paid for itself.

**Surprise 2 — perfect eyes lose to fresh memory.** An oracle *sensor* feeding the
standing registers scored 3.58 — worse than a rotating fleet with no information
advantage at all — because actions kept flowing to stale ghost entries of
already-healed settlements. The true ceiling (oracle acting on ground truth) is 0.50.
The bottleneck is the institution's memory, and the fleet's eyes were never the
problem.

## E3 — do the two loops compound? REFUTED, as pre-committed.

2×2 at ε=0.25: climb feedback {on, off} × steering-by-the-top {on, off}.

The climb loop is the dragon: turning it on costs ~6,300 people of representation and
~1.1 unmet need regardless of the steering setting. Coupling adds almost nothing on
top, and the interaction term is negligible against the main effect
(Q[extinctPop] = −55 vs a main effect of ~6,300; Q[unmetNeed] = 0.29). The loops are
redundant rather than compounding: once the climb is locked, the top view and the
fleet's own memory show the same eight winners, so it stops mattering which one steers.
We pre-committed to saying so if Q ≈ 0, and Q ≈ 0.

## E4 — rescues at matched budget. The axis lesson.

Applied to the worst cell (climb feedback on, steering on, ε=0.25). Gap-to-ceiling
closed on unmet need, extinction in people:

| rescue | axis | gap closed | erased people |
|---|---|---:|---:|
| none | — | 0% | 6,855 |
| a) double exploration | H | 21% | 7,575 |
| c) re-visit the stale (report climbs normally) | H | **5%** | 7,598 |
| c′) re-visit at random | H | 18% | 6,803 |
| c2) root-down, answer read at the top | V | 22% | **0** |
| b) mycelium lateral fusion | V | 50% | 28 |
| d) b + c combined | both | **73%** | **0** |

Three findings:

1. **A horizontal fix cannot cure a vertical disease.** Re-visiting the erased
   settlements (c) was nearly useless: the boat went back, the report was filed, and it
   burned out at the same boundary every time, because the channel was dead. The
   knowledge arrived and the institution could not hear it.
2. **The root-down mechanism works only if the answer is read at the top** (c2 vs c).
   Implemented as designed — the decision layer's query returns directly to the
   decision layer — extinction goes to zero and staleness collapses 384 → 40.
3. **Representation and help are separable.** c2 restored everyone to the decision
   layer's view while help stayed concentrated (Gini 0.61): seen again, still
   underserved. Fusion (b) redistributes both. The combination (d) closes 73% of the
   gap and holds representation at 64/64.

## Prediction scorecard

| pre-registered prediction | verdict |
|---|---|
| E1: climb shape changes the top world at identical visits | **confirmed, strongly** |
| E2: ε=0 locks in; exploration rescues | **confirmed** |
| E2: U-shape with mid-ε sweet spot beating uniform | **refuted** — uniform won at every tested budget |
| E3: loops compound, Q > 0 | **refuted** — Q ≈ 0, loops redundant |
| E4: directed re-checking beats random | **refuted as implemented; confirmed as designed** (c′ ≥ c; c2 ≫ both) |
| E4: combined rescue closes ≥60% of representation gap | **confirmed** (100% of representation, 73% of unmet need) |

## Amendments to the pre-registration (all disclosed)

1. `floor(ε·K)` silently zeroed ε < 1/K; replaced with deterministic probabilistic
   rounding. The first E2 "sweep" had actually tested 0/0/0/1/3 explore visits.
2. First E3 ran at ε=0: the H-lock was so total that the registers never competed
   (burn fires = 0 — the inert-component rule caught it) and all four cells were
   byte-identical. Re-run at ε=0.25 so the climb loop has something to fight over.
3. The pre-registered "oracle" was an oracle sensor feeding stale registers and failed
   its job as a ceiling; a true ceiling (acts on ground truth) was added beside it. The
   gap between the two is itself a finding (Surprise 2).
4. E4 c2/d2 added after c's failure revealed the implementation had built the visit
   half of root-down and dropped the answer half. The initial index tie-break also
   locked every ε=0 run onto settlements 0–7; initial weights now carry seeded jitter.

## What the hero example must show

E1, exactly. One ground, one fleet, one identical stream of visits, two climbs side by
side: under "the loudest get in," 28 settlements' columns go dark and 7,454 people stop
existing to the decision layer while the ground under them stays lit; under "neighbors
carry each other," every column holds. The claim is airtight because the visit streams
are byte-identical by construction, and the whole scene replays from the event log.

## E5 — rescues re-run on the E1 world itself (added 2026-08-03, after the film flagged mixed provenance)

E4's rescues were measured on a different configuration (adaptive fleet, steering on).
For the explainer, every number must come from the world on camera, so the rescues were
re-run on the E1 world (uniform surveying, coupling off, seed 3 on camera; 8-seed
aggregates in parentheses):

| arm | unmet need | erased people | visible | gap closed |
|---|---:|---:|---:|---:|
| none (= E1 erased arm) | 3.43 | 7,364 | 38/64 | 0% |
| c) re-visit the erased, reports climb normally | 5.12 | 9,020 | 30/64 | **−57%** (−46%) |
| c2) root-down, answer read at the top | 3.76 | **0** | 64/64 | −11% (−18%) |
| b) mycelium merge | **1.20** | **0** | 64/64 | **75%** (74%) |
| d2) b + c2 pairing | 1.19 | 0 | 64/64 | 75% (75%) |
| ceiling (oracle acts on truth) | 0.45 | 0 | 64/64 | 100% |

Three sharpened findings:

1. **Re-visiting made it worse.** With a rotating fleet already covering everyone,
   diverting budget to re-check the erased communities damaged overall outcomes — the
   re-check reports died at the same stage as before, and the diverted visits slowed
   coverage for everyone else. The earlier "5%" understated the case: extra collection
   is at best useless against a selection failure, and can be harmful.
2. **Visibility and help fully separate.** The answered root-down restored all 64
   communities to the decision layer's view and did nothing for total unmet need
   (help stayed concentrated, Gini 0.62). Being seen is one repair; being helped is
   another.
3. **In this world, the fungal merge alone is the fix** — everyone visible, 75% of
   lost performance recovered, zero extra budget. The lichen pairing's larger role
   (50% → 73%) belongs to the harder E4 world, where the fleet's own habits are also
   broken; in the film it stays as the design principle, with numbers from the world
   on camera only.
