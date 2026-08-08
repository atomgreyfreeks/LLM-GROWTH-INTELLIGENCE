# THE MAP — RESULTS

Run 2026-08-05. Kernel `app/scripts/mapworld.mts`, 5 arms × 3 regimes × 8 seeds,
every config run twice with byte-identical event-log hashes (240 runs). Shock
schedules hash-identical across arms. Non-STATIC arms walk exactly 600 km each
(distance spread 0.000% against a 5% gate). Conductor re-ran the full sweep
independently; numbers matched the builder's report exactly. Raw table in
`raw-results.json`. Pre-registration in `PREREG.md`; deviations listed at the
bottom, with reasons.

## The conclusion, up front — three predictions died, and the finding is better

**We pre-registered the folk wisdom and the world refuted it.** The crossover does
not exist: chasing the freshest map beats committing at every volatility tested
(LOW +152, MED +944, HIGH +2,406 people served). The vascular reroute-at-the-tips
rule fell below BOTH endpoints at medium and high volatility. And plan stability
predicted nothing: the desks with perfect plan survival (1.000) missed hundreds of
people; the desk that broke a quarter of its own promises served the most.

**The standing law after this run: churn is the price of currency, and plan
stability is a vanity metric.** The oracle — perfect information, the ceiling —
churns 3–4× MORE than the chaser (215–271 km vs ~67 km) while serving the most
people everywhere. Fresh information justifies turning your crews around. What
looks like waste on the ground is what being current costs, and the tidy desk pays
for its clean threads in missed windows.

## Headline numbers (median across 8 seeds)

| regime | arm | people served | missed | churn-km | plan survival |
|---|---|---:|---:|---:|---:|
| MED | COMMIT | 7,573 | 396 | 0.0 | 1.000 |
| MED | CHASE | **8,517** | **0** | 67.8 | 0.777 |
| MED | TIPS | 7,291 | 580 | 0.0 | 0.961 |
| MED | ORACLE | 8,856 | 0 | 251.7 | 0.361 |
| HIGH | COMMIT | 20,082 | 1,345 | 0.0 | 1.000 |
| HIGH | CHASE | **22,488** | **68** | 67.6 | 0.754 |
| HIGH | TIPS | 19,888 | 1,570 | 0.0 | 0.942 |
| HIGH | ORACLE | 23,611 | 0 | 214.9 | 0.364 |

CHASE's churn is ~11% of its 600 km walked; the freshness it buys returns more
than 11% in people. The seed-3 hero pair (MED): CHASE serves 8,209 people and 37
of 39 shocks while walking 82 wasted km; TIPS walks zero wasted km, holds 0.98
plan survival, and misses 10 service windows.

## Prediction scorecard

| pre-registered prediction | verdict |
|---|---|
| P1: a crossover exists (COMMIT wins at low volatility) | **REFUTED — falsifier fired.** CHASE ≥ COMMIT at all three λ (7/8, 8/8, 8/8 seeds). |
| P2: TIPS captures ≥70% of the gain at ≤30% of the churn | **REFUTED.** Capture 51% / −30% / −8%; below both endpoints at MED and HIGH. Not inert (20.3% swap rate) — a firing mechanism that loses. |
| P3: stability predicts outcome at low volatility | **REFUTED.** Max-survival arms top people-served at no λ. |
| P4 (exploratory): report the ceiling's churn | The ceiling churns hardest: 318% of CHASE at HIGH, serving the most. |

## Why TIPS lost (probe-verified mechanism, disclosed)

Two mechanisms, isolated with a τ→∞ probe: (1) the swap gate fires on zero-baseline
tails (patrol legs project zero people, so any swap passes the 5% test), and (2)
**tail lock-in** — booking a needy site into a distant crew's tail at refresh
removes it from the shared pool that COMMIT's just-in-time refills draw from,
delaying service. The gate is distance-blind by pre-registered design, and it
accepts those bad trades. The hierarchy did exactly what we specified, and what we
specified starves the pool. A distance-aware gate is a next-design candidate, and
it would be a new experiment, not a rescue of this claim.

## Scope, honestly

The refutation is a result about this world: service windows of 25–55 ticks,
full-budget crews that never idle, symmetric travel, no fatigue or restart cost on
turnaround. A world where abandoning a leg costs extra (rigging/derigging, crew
morale, fuel asymmetries) could still produce the crossover; this one, built
faithfully from the prereg, does not. The claim that died is the universal one we
actually registered: that the crossover exists somewhere on this volatility axis.

## Deviations from the pre-registration (all disclosed)

1. Service window D unspecified → uniform [25, 55] ticks, fixed before any arm ran.
2. Shock magnitude unspecified → uniform [0.2, 1.0); people-at-stake = mag × pop.
3. Shock arrivals via deterministic Bernoulli thinning at rate λ.
4. "Crews never idle" required mid-cycle refills (route exhausted → fresh greedy
   horizon-3 route from the current stale snapshot), identical in all non-STATIC
   arms; this yields the exact-600 km match.
5. Zero-need patrol fallback (ε score term) so crews always walk; all arms.
6. A dispatcher zeroes a site on its own map when its crew arrives; new shocks stay
   invisible until the next refresh; all arms.
7. Assignment is global-best-first greedy over (crew, site) pairs.
8. Plan survival = completed / (completed + abandoned); legs pending at T excluded.
9. Swap gate is people-projected and distance-blind, literal to the prereg; pure
   route extensions (5 at MED) counted separately from the 74 swaps.
10. Scale: 10 km world side, 6-minute ticks → crews at 3.33 km/h.
11. STATIC excluded from the distance-match assertion (it stops when done).

## What the hero must show (updated to the true result)

The seed-3 MED pair, CHASE vs TIPS. The ember has to migrate: in CHASE it lives on
the ground — walked-back scars behind turning crews — and every shock still gets
served; in TIPS the threads run clean and the ember lives on the PEOPLE — ten
sites going dark inside their closing windows. The viewer should feel the trade
reverse: the messy desk is the humane one. On-screen names stay CHASE THE MAP /
REROUTE AT THE TIPS, and the counts (people served, people missed, km walked back)
come from the log.
