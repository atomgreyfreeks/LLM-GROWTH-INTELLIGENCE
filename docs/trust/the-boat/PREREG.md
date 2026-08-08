# THE BOAT — pre-registration (written before the kernel ran)

**Billboard question:** *A stranger phoned it in. The satellite says otherwise. Where
do you send the boat?*

**The claim under test.** Fusing two evidence sources early — one shared belief map,
updated by whatever arrives — destroys the disagreement that would have warned you.
The danger is worst exactly where it matters most, because the same storm that puts
people in the water also blinds the satellite and cuts the phones: the two channels
fail together, and a fused map fails confidently. Keeping the witnesses separate
until the decision, and spending real capacity to go look when they disagree, should
place the boat better at the same budget. If it does not, the correlated-error claim
is dead and we publish that.

Atlas grounding: Family F (lichen/symbiosis) — its documented risk IS the
hypothesis: *"shared context causes correlated errors."* Two specialists with
complementary failure modes, exchange explicit. Support family C (root foraging):
*actively acquire the disambiguating observation* — the probe. The correlation is
generated honestly, by shared physical cause (the storm), never by construction.

## The world (identical across arms, asserted by hash)

- 48 settlements on a seeded coastline, heavy-tailed populations, Σpop ≈ 18,000.
- T = 240 ticks. Three storm cells drift on seeded deterministic paths. Storm
  intensity at settlement i, tick t: `storm(i,t)` ∈ [0,1].
- True need: `need(i,t)` rises with `storm(i,t)` (flooding), drifts up slowly
  everywhere, resolves 0.5%/tick naturally, and drops when rescue lands.
- **The correlated blindness, mechanical:** occlusion probability = k_occ·storm
  (satellite sees nothing new; last reading carried, aging), phone access =
  1 − k_cut·storm (calls stop coming from where the water is). Both channels degrade
  where and when need spikes, from the same cause.
- SAT channel: per tick, unoccluded settlements get `need + noise(σ_sat)`; occluded
  carry stale value with age counter.
- CALL channel: settlement calls with prob `p0·access`; a seeded 20% of settlements
  exaggerate ×1.5 ("the stranger may be lying"); calls carry noise and 1-tick delay.
- All storm paths, noise draws, occlusion draws, call draws, and exaggerator
  identities are PRE-DRAWN from the world seed, independent of policy, and the kernel
  asserts the pre-drawn observation stream hash is identical across arms. Arms
  diverge only through rescues changing `need`.
- One boat. Committing is irreversible: travel takes real ticks (dist × speed), no
  retargeting mid-transit; on arrival, rescue for 2 ticks, then free. Same boat, same
  speed, same rescue capacity in every arm — asserted.

## THE ONE KNOB — the layer where the witnesses merge

- **EARLY (one map).** Both channels write into a single shared belief map on
  arrival (equal weights, age-discounted). The boat targets
  `argmax(belief·pop)`. Channel identity does not survive the write. This is the
  default architecture of every fusion pipeline.
- **LATE (two witnesses).** Each channel keeps its own map. At decision time the
  score is the mean of available channel estimates, and the disagreement
  `d(i) = |sat(i) − call(i)|` is visible. Boat targets `argmax(score·pop)` but a
  candidate whose d(i) exceeds θ has its score computed conservatively (the mean of
  the two hypotheses weighted by their ages) — the disagreement is information, never
  averaged away silently.
- **PROBE (LATE + family C).** As LATE, plus: if the chosen target's d(i) > θ, the
  boat flies by first — travels there, spends 1 tick observing truth (no rescue that
  tick), writes truth into both maps, then recommits from current position. The probe
  costs real time from the same single boat. Budget-matched by construction.
- **ORACLE (ceiling).** Boat targets `argmax(true need·pop)`.
- **RANDOM (floor).** Seeded uniform target choice.

θ is fixed at 0.35 before any run, shared by LATE and PROBE.

## Regimes (identical sweeps for all arms — failure tests, never knobs)

1. **CALM:** storm gain low.
2. **STORMY:** storm gain high — the correlated regime, the one that matters.
3. **POISONED:** exaggerator fraction 60%, factor ×2 (the human channel goes bad).
4. **BLACKOUT:** k_occ doubled (the satellite goes bad over exactly the wet places).

## Measured (per arm × seed × regime)

- **People-rescued** (Σ rescue amounts × pop-weight) and unmet need in people-ticks.
- **Empty-water commits:** arrivals where true need < 0.1 × believed need — a boat
  sent by confidence into nothing. The headline waste number.
- **Storm-zone unmet share:** how much of all unmet need sat inside storm cells —
  where the correlated blind spot lives.
- Probe count, probes that changed the target (inert rule applies), rescue latency.

## Predictions, with falsifiers (on the record before any run)

- **P1.** STORMY: EARLY's empty-water commits ≥ 1.5× LATE's. *Falsifier:* LATE within
  10% of EARLY → seeing disagreement bought nothing; the lichen claim dies here and
  we publish that.
- **P2.** STORMY: people-rescued PROBE ≥ LATE ≥ EARLY. CALM: PROBE ≤ LATE (the probe
  tax must be visible when there is nothing to disambiguate — an honest cost, not a
  free lunch). *Falsifier:* PROBE never beats LATE anywhere → the root-foraging
  support claim dies.
- **P3.** POISONED: EARLY loses more people-rescued (vs its own STORMY number) than
  LATE loses. A fused map has no channel left to doubt. *Falsifier:* equal
  degradation → channel identity is worthless under poison.
- **P4.** STORMY: storm-zone unmet share EARLY > LATE — the fused arm's failures
  concentrate exactly where the storm sits. *Falsifier:* shares equal → the
  correlated-failure geography claim dies.
- **P5 (exploratory).** BLACKOUT: report where PROBE's advantage peaks; expect probes
  to matter most when one channel is near-blind and the other near-deaf.

## Discipline

8 seeds (worldSeed 1–8). Every config run twice; event-log hashes byte-identical or
void. No `Math.random`, no `Date.now`. Deviations logged in `RESULTS.md` with
reasons. Mechanisms firing < 5% of opportunities are inert; if probes fire < 5% of
commits in STORMY, θ was mis-set and the PROBE claim narrows to what fired.

## Kernel interface (for the builder)

`app/scripts/boat.mts`, conventions of `app/scripts/twoshapes.mts` (`makeRng`,
`hashStr` from `../src/core/sim.ts`). Outputs:
- stdout: prediction scorecard + per-arm metrics (min/median/max across seeds).
- `docs/trust/the-boat/raw-results.json` — every arm × seed × regime.
- `--bake` writes `app/public/boat-log.json`: seed 3, STORMY, arms EARLY and PROBE —
  tick-ordered events:
  `{e:"world",settlements:[{i,x,y,pop}],coast:[...]}`,
  `{e:"storm",t,cells:[{x,y,r,k}]}` (every 2 ticks),
  `{e:"need",t,vals:[...]}` (every 4 ticks, for residue),
  `{e:"sat",t,i,v,stale?}`, `{e:"call",t,i,v}` (sampled: log 1 in 4),
  `{e:"commit",t,i,expected,disagreement}`, `{e:"probe",t,i,found}`,
  `{e:"arrive",t,i,found,rescued,empty?}`, plus per-arm `metrics` and `logHash`.
  The hero renders FROM this log only.
