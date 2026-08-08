# TWO SHAPES — pre-registered experiment series

Written 2026-08-03, BEFORE the kernel ran. Predictions are on the record so the results
can be judged against them. A prediction that dies is a finding and gets written up as one.

## The thesis under test

Every fleet has two shapes. An **H-shape** governs how it moves across the land. A
**V-shape** governs how its data climbs the slabs (ground, sensed, features, briefing,
decision — each floor holds less than the one below). Both shapes are growth logics from
the atlas, both are chosen independently, and they couple through the decision layer:
the H-shape decides what gets sensed, the V-shape decides what survives the climb, the
decision layer sees only survivors and steers the fleet.

Four claims, one experiment each:

1. **E1** — the V-shape is a real control surface: identical ground activity, different
   worlds at the top.
2. **E2** — the H-shape locks in without an exploration floor, and the floor has a
   measurable sweet spot.
3. **E3** — the two loops compound: harm from both closed loops exceeds the sum of each
   alone. The interaction term is our operationalization of the organizers' emergence
   quantity Q.
4. **E4** — complementary shape pairings rescue the failure at matched budget, and
   *directed* rescue beats random rescue.

## The world (shared by all arms)

- `S = 64` settlements, seeded positions in clusters, seeded populations (heavy-tailed).
- Latent need per settlement evolves by a **frozen regime generator**: a shock schedule
  drawn from the world seed before any policy exists. Shocks persist until helped
  (plus 0.5%/tick natural resolution). Need accumulates whether or not anyone looks.
- Fleet: `K = 8` visits per tick, `T = 400` ticks.
- Slab capacities per tick: sensed 8 (the visits), features 16, briefing 8, decision 4.
  Decision slots become help actions next tick.
- 8 seeds per arm. Every arm runs twice; the two event-log hashes must match
  (determinism probe). All arms in a comparison share the world seed, the shock
  schedule, K, capacities, and action slots. The knob is the only difference.

**H-shapes.** `physarum` (weights reinforce toward believed need, decay δ, top-K visits
with an ε·K uniform exploration reserve) · `uniform` (rotating coverage, the null) ·
`oracle` (visits by true need — the ceiling, proving the optimum is reachable).

**V-shapes.** `physarum` (per-settlement channel strength; reports compete for slots by
salience × strength; channels whose items get used reinforce, unused decay — the
"loudest get in" rule) · `vascular` (fixed district quotas, no feedback — the
bureaucracy) · `mycelium` (neighbors' reports fuse into cluster items; a selected
cluster gives every member top-slab presence; help spread across members is diluted).

**Coupling.** ON: the fleet's believed-need map is what survived the climb. OFF: the
fleet remembers its own raw observations. Plain reading: does the organization steer by
its own briefings.

## E1 — frozen ground, sweep the climb

H = uniform, coupling OFF, so the visit sequence is identical across arms by
construction (asserted byte-identical). Sweep V ∈ {physarum, vascular, mycelium}.

Measure at the decision layer: settlements represented in a trailing window, population
represented, worst-case staleness, concentration (Gini of decision-slot occupancy).

**Predictions.** Same visits, materially different top worlds. V-physarum concentrates
hardest (Gini highest, ≤ half of settlements ever represented); vascular spreads widest
with the dullest signal; mycelium lands between with the widest population coverage.
**Falsifier:** representation distributions statistically indistinguishable across
V-arms → the V-shape is decoration and the two-shapes thesis loses its second axis.

## E2 — lock-in and the exploration floor

V transparent (capacities = S, no V confound), coupling ON. H = physarum with
ε ∈ {0, 0.05, 0.1, 0.2, 0.4}, plus uniform null and oracle ceiling.

Measure: unmet need (people-ticks), shock discovery latency, coverage entropy over time.

**Predictions.** ε = 0 never discovers late shocks in unreinforced settlements
(latency → ∞ for some shocks); unmet need vs ε is U-shaped with the sweet spot near
0.1–0.2; uniform beats ε = 0 in discovery and loses to mid-ε overall.
**Falsifier:** ε = 0 matches ε > 0 → lock-in is not real under honest dynamics here,
and THE ROADS claim dies in its H form.

## E3 — the compounding loop (the Q claim)

H = physarum throughout (its nature). 2×2: V-feedback {on, off} × coupling {on, off}.
Outcome `f` = population of extinct settlements (no top-slab presence in the final
quarter) and unmet need.

**Q = f(on,on) − f(on,off) − f(off,on) + f(off,off)** — the standard interaction term.

**Predictions.** Q > 0 on both outcomes: the rich-get-richer climb and steering-by-the-
top compound each other; a settlement that loses its channel loses visits, which starves
the channel further. The worst cell is (on, on) by a margin exceeding additivity.
**Falsifier:** Q ≈ 0 → the loops are separable, "emergence" is the wrong word for this
system, and we say so.

## E4 — rescues at matched budget

Take E3's worst cell. Add one rescue at a time, total budget unchanged:

- **a)** H exploration floor ε = 0.15 (from E2's expected sweet spot);
- **b)** V mycelium fusion (lateral rescue);
- **c)** root-down ρ = 0.15: the decision layer reserves ρ·K visits for the most-stale
  settlements at the top view — staleness-directed re-checking (roots grow down);
- **c′)** same ρ spent on uniform-random re-checks (the directedness control);
- **d)** b + c combined (complementary pairing across both axes).

Measure: fraction of the gap to oracle closed, on unmet need and on represented
population.

**Predictions.** c beats c′ (direction matters); c is the most efficient single rescue
(it attacks the coupling loop directly); d closes the most gap overall (≥ 60% of the
representation gap).
**Falsifier:** c′ matches c → directed re-checking buys nothing over random, and the
root-down mechanism loses its claim.

## Inert-component rule

Any mechanism firing on under 5% of its opportunities (fusion events, exploration
visits, root-down queries) is declared inert and the claim narrows to what fired.

## Deferred

E5 (provenance walkability under damage — THE BRIDGE's V-axis experiment) is specced in
`docs/ten/SELECTED-THREE.md` and deferred: it needs the provenance DAG machinery and the
series above settles the two-shapes thesis without it.
