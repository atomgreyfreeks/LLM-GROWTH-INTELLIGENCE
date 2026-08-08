# THE BOAT — RESULTS

Run 2026-08-05. Kernel `app/scripts/boat.mts`, 5 arms × 4 regimes × 8 seeds, every
config run twice with byte-identical event-log hashes (160 configs). All world
randomness pre-drawn; observation-stream hash identical across all five arms for
every regime × seed. Budget matching asserted in code. Conductor re-ran the full
sweep independently; numbers matched the builder's report exactly. Raw table in
`raw-results.json`. Pre-registration in `PREREG.md`; amendments at the bottom.

## The conclusion, up front — the danger was not where we registered it

**We hunted the early-fusion pathology and found a different animal.** The
headline claim died: boats into empty water — the confident fused map committing
into nothing — happened zero times, in any arm, in any regime, across all 32
world-seeds. In a world where need persists until helped, a wrong belief is almost
always an underestimate (staleness hides the storm's arrival), and underestimates
misroute attention without ever producing the cinematic empty-water commit. The
fused map's measurable sin is small and specific: under a poisoned human channel
it degrades 3.2% while the two-witness desk actually improves 1.1% — channel
identity is cheap insurance against corruption, and that is the only place it paid.

**The real finding: disagreement-triggered verification is a thrash amplifier.**
The go-and-look probe — family C's rescue, our own registered fix — was harmful
everywhere and catastrophic exactly where disagreement was highest: under POISONED
it fired on 69% of commits and halved rescue throughput (10,824 vs LATE's 23,856
people). Verification demand scales with disagreement, and disagreement peaks
precisely when verification is least affordable. A fleet that verifies whenever
its sources disagree hands its actuator to its doubt. The deployable rule: cap
verification budget independently of disagreement level, or corruption converts
your caution into paralysis.

## Headline numbers (STORMY, median [min..max] across 8 seeds)

| arm | people rescued | empty-water commits | probe rate |
|---|---:|---:|---:|
| EARLY (one map) | **24,420** [20,073..42,534] | 0 [0..0] | — |
| LATE (two witnesses) | 23,586 [16,410..38,780] | 0 [0..0] | — |
| PROBE (go and look) | 20,948 [12,941..37,232] | 0 [0..0] | 30.4% |
| ORACLE (ceiling) | 24,982 | 0 | — |
| RANDOM (floor) | 9,403 | 0 | — |

POISONED is the pivot: EARLY 24,420 → 23,630 (−3.2%), LATE 23,586 → 23,856
(+1.1%), PROBE 23,586-equivalent → 10,824 (verification thrash, 177 probes on 255
commits, 126 of them changing target mid-mission).

## Prediction scorecard

| pre-registered prediction | verdict |
|---|---|
| P1: EARLY's empty-water ≥ 1.5× LATE's (STORMY) | **REFUTED — falsifier fired.** 0 vs 0; the metric never fires at the registered 0.1× threshold (nor at an exploratory 0.5×). The lichen headline claim dies as written. |
| P2: PROBE ≥ LATE ≥ EARLY in STORMY; probe tax visible in CALM | **REFUTED.** PROBE never beats LATE anywhere; the probe is not inert (30.4% fire rate) — it is actively harmful. The tax is visible everywhere, the benefit nowhere. |
| P3: poisoned channel hurts EARLY more than LATE | **PASS.** −3.2% vs +1.1% — the one measured payoff of channel identity. |
| P4: EARLY's unmet need concentrates in storm zones more than LATE's | **PASS, thin.** 0.461 vs 0.458 — three thousandths; stated as fragile. |
| P5 (exploratory): probe advantage peaks in BLACKOUT | **Opposite.** Least bad in CALM, worst in POISONED — the thrash law above. |

## Why empty water never happens (world-structure finding, not a bug)

Empty water requires believing strongly in need where there is none: a stale HIGH
belief over a resolved emergency, or an exaggeration the desk cannot discount. In
this world need decays 0.5%/tick naturally and persists until rescued, so stale
beliefs underestimate (the storm arrived after the last good reading), and a ×1.5
exaggeration over real need still leaves real people at the dock. The
early-fusion pathology as registered assumes a world where emergencies vanish
quickly on their own; disaster response is the opposite kind of world. That
narrows the original claim honestly: early fusion's cost in persistent-need
domains is latency and poison-fragility, never phantom targets.

## Amendments to the pre-registration (all disclosed)

1. LATE's age-weighted disagreement scoring implemented as freshness weights
   (0.98^age) — weighting staleness upward would reward it.
2. The boat's own ground-truth observation on rescue completion merges through
   each arm's rule (that is the knob operating on one more observation).
3. RANDOM's empty-water is 0 by definition (no belief to falsify) — footnoted in
   the table.
4. Empty-water counted on rescue arrivals only; probe fly-bys logged separately.
5. One world recalibration between run 1 and the frozen run: storm-cell radius
   0.10–0.18 → 0.05–0.09, triggered by a policy-independent conformance check
   (v1's "storm zone" covered 78% of settlement-ticks — the zone was the whole
   world, contradicting the prereg's localized-cells description). Verdicts were
   qualitatively identical before and after; no verdict changed.
6. `half*` (arrivals finding < 0.5× belief) added as a labeled exploratory
   diagnostic; feeds no prediction.

## What the hero must show (updated to the true result)

Seed 3, STORMY, arms EARLY ("ONE MAP") and PROBE ("GO AND LOOK"). The piece is no
longer about boats into empty water — it is about **the doubt tax**. Left panel:
one fused confident map, the boat committing in long clean arcs, 25,253 people
rescued. Right panel: two witness layers shimmering with disagreement, and the
boat repeatedly breaking off mid-arc to fly verification passes — wakes doubling
back, arrival latency visible — 22,018 rescued. Same storm, same witnesses, same
boat. The ember lives in the broken arcs: every probe detour is rescue time
burned. Counts from the log (`peopleRescued`, `probes`, `probesChanged`), never
retyped. On-screen names: **ONE MAP** / **GO AND LOOK**.
