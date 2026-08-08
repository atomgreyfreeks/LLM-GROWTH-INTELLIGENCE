# THE MAP — pre-registration (written before the kernel ran)

**Billboard question:** *The map is twenty minutes old. Your crew is already walking.
Do you turn them around?*

**The claim under test.** Chasing the freshest picture has a cost nobody logs: the
kilometres your crews walk back over ground they already cleared. A dispatcher who
replans on every update converts information into churn; one who never replans
converts stability into staleness. The vascular rule — *reroute at the tips, never
the trunk* — should capture most of the freshness gain at a fraction of the churn.
If always-replanning dominates everywhere, churn is free and the claim dies; if
tip-rerouting never beats both endpoints, the hierarchy claim dies. Either death
gets published.

Atlas grounding: the chasing arm is family A (slime mould) — *reinforce toward the
newest gradient*; its documented risk is thrash. The committing arm is family E
(coral) — *early structure becomes permanent substrate*; its risk is exactly
staleness. The tested fix is family D (vascular tree): *a legible trunk with
capacity-matched tips* — trunks never regrow, capillaries reroute daily. Nobody
chooses their replan policy deliberately; it ships with the framework. That makes it
a hidden control surface, and this experiment measures it.

## The world (identical across arms, asserted by hash)

- Unit-square territory, 40 sites, heavy-tailed populations, Σpop ≈ 15,000.
- 6 crews, all arms, same speed (map crossing ≈ 30 ticks). T = 300 ticks.
- Shocks arrive on a schedule PRE-DRAWN from the world seed (identical across arms —
  hash-asserted): each shock hits a site with a need magnitude and a service window
  (deadline D ticks). People at a shocked site are served only if a crew arrives
  inside the window; a shock left past its window is logged as missed-people,
  permanently. Need also decays 0.5%/tick naturally.
- **The stale map, literal:** the dispatcher sees a snapshot of true state refreshed
  every M = 20 ticks. Crews walk continuously between refreshes. Volatility λ is the
  shock arrival rate.
- At every refresh the dispatcher computes a greedy assignment (deterministic:
  score = need·pop / distance, horizon 3 sites per crew) over what the MAP shows.
  The assignment procedure is identical in every arm; only the acceptance policy
  below differs.

## THE ONE KNOB — what a crew already walking does with a new plan

- **COMMIT (family E).** A crew finishes its entire current route before accepting
  any new assignment. New plans only fill empty hands.
- **CHASE (family A).** Full reassignment every refresh. Crews abandon their current
  leg immediately and walk to the new target from wherever they stand. Distance
  already walked toward an abandoned target is logged as **churn-km**.
- **TIPS (family D, the tested fix).** The site a crew is currently walking toward is
  locked (the trunk). Only the tail of each route (legs 2–3) and unassigned sites
  are re-optimized, and a tail swap fires only if the projected people-gain exceeds
  τ = 5%. Same assignment procedure, same information, same crews.
- **ORACLE (ceiling).** CHASE against TRUE state every tick (no staleness, replan
  free of information error — the churn it pays is real and reported).
- **STATIC (floor).** The t=0 assignment runs to completion; nothing ever replans.

## Regimes (identical for all arms)

λ ∈ {LOW: 0.05, MED: 0.15, HIGH: 0.35} shocks/tick. Sweep is a regime, never a knob.

## Measured (per arm × seed × regime)

- **People served in window** (the outcome) and **missed-people** (the cost).
- **Churn-km** — kilometres of abandoned progress, the number nobody else logs.
  Also reported as hours-of-walking-wasted at crew speed.
- **Plan survival** — fraction of assigned legs completed as assigned.
- Median time-to-serve; distance walked total (must be ~equal across arms — crews
  never idle; asserted within 5%).

## Predictions, with falsifiers (on the record before any run)

- **P1 (the crossover exists).** LOW λ: COMMIT serves ≥ CHASE (churn outweighs
  freshness). HIGH λ: CHASE serves ≥ COMMIT. *Falsifier:* CHASE ≥ COMMIT at all
  three λ → churn is free here, the Operator's central claim dies, published.
- **P2 (the vascular law).** In every regime where CHASE beats COMMIT, TIPS captures
  ≥ 70% of that gain at ≤ 30% of CHASE's churn-km. And TIPS is never the worst arm
  on people-served in any regime. *Falsifier:* TIPS below both endpoints anywhere,
  or its churn saving < 2×, → the reroute-at-the-tips law dies.
- **P3 (stability predicts outcome at low volatility).** At LOW λ the non-oracle arm
  with the highest plan survival also serves the most people; at HIGH λ it does not.
  *Falsifier:* survival and outcome rank together at every λ → plan stability is a
  proxy for nothing; published.
- **P4 (exploratory).** Report ORACLE's churn-km. If the ceiling itself churns hard
  at HIGH λ, the finding is that fresh information *justifies* churn and the cost was
  never the replanning itself — state it plainly either way.

## Discipline

8 seeds (worldSeed 1–8). Every config run twice; event-log hashes byte-identical or
void. No `Math.random`, no `Date.now`. Deviations logged in `RESULTS.md` with
reasons. If tail swaps fire on < 5% of refresh opportunities in MED λ, TIPS is inert
as configured and the claim narrows.

## Kernel interface (for the builder)

`app/scripts/mapworld.mts`, conventions of `app/scripts/twoshapes.mts` (`makeRng`,
`hashStr` from `../src/core/sim.ts`). Outputs:
- stdout: prediction scorecard + per-arm metrics (min/median/max across seeds).
- `docs/trust/the-map/raw-results.json` — every arm × seed × regime.
- `--bake` writes `app/public/mapworld-log.json`: seed 3, MED λ, arms CHASE and TIPS
  — tick-ordered events:
  `{e:"world",sites:[{i,x,y,pop}]}`, `{e:"shock",t,i,mag,window}`,
  `{e:"refresh",t}`, `{e:"assign",t,crew,route:[siteIds]}`,
  `{e:"abandon",t,crew,site,progressKm}`, `{e:"pos",t,crews:[[x,y],...]}`
  (every 2 ticks), `{e:"arrive",t,crew,i,served,pop,inWindow}`,
  `{e:"miss",t,i,pop}`, plus per-arm `metrics` and `logHash`.
  The hero renders FROM this log only.
