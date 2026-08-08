# THE BRIDGE — pre-registration (written before the kernel ran)

**Billboard question:** *Someone says the bridge is safe. Can you walk to the reason?*

**The claim under test.** Machine conclusions are summaries of summaries. When the
links between layers are built by "keep the strongest support" (the slime-mould rule
every ranking pipeline uses by default), the surviving conclusion looks identical to
one built with lateral cross-links (the mycelial rule) — right up until something
breaks. Then the two differ in the only way that matters: whether a person can still
walk from the claim down to a raw observation. A claim with no walkable path to
evidence is not a claim; acting on it governs real people with an unauditable
sentence.

Atlas grounding: Family B (mycelial fusion) — its stated non-goal is our hypothesis:
*"do not erase provenance when knowledge, paths, or agents fuse."* Support family E
(coral/accretive) supplies the *recoverable tombstone* rule. The counter-arm is
family A (slime mould): *reinforce the strongest, prune the rest* — its documented
risk is *"erases rare but important fallbacks."*

## The world (identical across arms, asserted by hash)

- An evidence pyramid over terrain: L0 = 256 grains (raw observations, immortal — the
  world itself), L1 = 64 readings, L2 = 16 findings, L3 = 8 claims, L4 = 1 conclusion
  (immortal — the decision desk holds it).
- Geometry fixed from the world seed: each L1 reading has 8 candidate supporting
  grains (spatially nearest); each L2 finding 8 candidate readings; each L3 claim 4
  candidate findings; the conclusion's candidates are all 8 claims. The candidate DAG
  is IDENTICAL across arms (hash-asserted).
- Each claim governs a district with a seeded heavy-tailed population; Σpop ≈ 21,000
  people across the 8 claims.
- 32 workers host the L1–L3 nodes (seeded round-robin). A node dies when its host
  worker dies. Grains and the conclusion never die.
- Build phase (T=120 ticks): a fleet wires provenance edges downward from each node to
  its candidates, under the arm's allocation rule, until the edge budget is spent.

## The budget (matched, asserted)

Minimum wiring = every L1–L4 node keeps 1 down-edge = 64+16+8+1 = 89 edge-units.
Default budget **B = 156 units (1.75× minimum)**. An edge may carry multiple copies
(thickness); each copy costs 1 unit. **The kernel asserts every arm spends exactly B
units.** Regime sweep over B ∈ {111 (1.25×), 134 (1.5×), 156 (1.75×), 178 (2.0×)}
applied identically to all arms.

## THE ONE KNOB — the allocation rule

- **CHAIN (family A, "the strongest support wins").** Each node keeps exactly one
  down-edge to its highest-salience candidate; all remaining budget thickens the
  edges along the highest-flow spine (reinforce). Non-selected candidates are pruned
  hard — nothing recorded. An edge survives edge-attrition while ≥1 copy survives.
- **MESH (families B+E, "neighbors carry the proof").** Budget spreads across
  DISTINCT candidates: every node takes a second distinct down-edge before any node
  takes a third (fusion = cross-linking); every prune records a recoverable tombstone
  (origin pair), replayable by a heal pass if both endpoints are alive.
- **RANDOM (control).** Same budget scattered uniformly (seeded) over candidate
  edges. Separates *structured* redundancy from *any* redundancy.
- **ORACLE (ceiling).** Every candidate edge exists. Proves walkability 1.0 is
  reachable pre-damage at unlimited budget.

One rule bundle per arm, nothing else differs. Salience scores, worker assignment,
geometry, budget: identical.

## Damage phase (frozen sweeps, identical draws across arms)

1. **Worker-kill, random:** fraction f ∈ {0.1 … 0.6 step 0.1} of workers die
   (seeded draw shared across arms).
2. **Worker-kill, targeted:** same f, killing workers hosting the highest-degree
   nodes first (degree measured per-arm — the attack sees the structure it attacks).
3. **Layer-kill:** every worker hosting an L1 reading dies.
4. **Edge-attrition:** 40% of edge COPIES destroyed (seeded), no node death — the
   honest case FOR thickening.
5. **Heal test:** after random f=0.3, each arm may fire its heal rule with budget
   H = 16 units. CHAIN recorded nothing; MESH replays tombstones (both endpoints must
   be alive). The asymmetry IS the finding being tested; it is the E-family claim.

## Measured (per arm × seed × regime)

- **Walkability:** fraction of surviving claims with a living path claim→grain.
- **Floater-people:** Σpop over claims still lit at the desk with NO walkable path —
  people governed by a sentence nobody can audit. The headline human number.
- Mean surviving walk length (audit cost), edges destroyed/survived, heal recoveries.
- Inert counters: cross-link edges actually used by successful walks; tombstone heals
  fired / possible.

## Predictions, with falsifiers (on the record before any run)

- **P1.** Random worker-kill f=0.4, budget 1.75×: MESH walkability ≥ 2× CHAIN.
  *Falsifier:* CHAIN within 10% of MESH → redundancy buys nothing here; published.
- **P2 (the honest symmetric case).** Pure edge-attrition: CHAIN ≥ MESH. Thickness is
  the right insurance when copies die and nodes survive. *Falsifier:* MESH wins here
  too → thickening is strictly dominated and the slime rule's premium bought nothing.
- **P3.** Targeted kill hurts MESH more than random kill hurts MESH (hub exposure),
  yet MESH under targeted f=0.3 still beats CHAIN under random f=0.3. *Falsifier:*
  targeted attack drops MESH below CHAIN → the mesh advantage is a hub artifact.
- **P4.** Floater-people at random f=0.4: CHAIN ≥ 3× MESH. *Falsifier:* ratio < 1.5 →
  the human-cost claim dies even if walkability differs.
- **P5.** Heal with H=16 at f=0.3 restores ≥ 60% of MESH's lost walkability; CHAIN
  restores ≤ 10%. *Falsifier:* tombstones recover < 30% → the recoverable-tombstone
  rule is decoration here, and we say so.
- **P6 (exploratory, no falsifier).** Marginal walkability per edge-unit at f=0.3
  declines with budget; we report where the knee sits.
- **P7.** RANDOM lands between CHAIN and MESH on P1's measure. *Falsifier:* RANDOM ≥
  MESH → structure adds nothing over scatter; the fusion story narrows to "buy any
  redundancy."

## Discipline

8 seeds (worldSeed 1–8). Every config run twice; event-log hashes must be
byte-identical or the run is void. No `Math.random`, no `Date.now`. Deviations from
this document are logged in `RESULTS.md` with reasons. Mechanisms firing < 5% of
opportunities are declared inert.

## Kernel interface (for the builder)

`app/scripts/bridge.mts`, conventions of `app/scripts/twoshapes.mts` (import
`makeRng`, `hashStr` from `../src/core/sim.ts`). Outputs:
- stdout: prediction scorecard table + per-arm metrics (min/median/max across seeds).
- `docs/trust/the-bridge/raw-results.json` — every arm × seed × regime.
- `--bake` writes `app/public/bridge-log.json`: seed 3, arms CHAIN and MESH at budget
  1.75×, random f=0.4 — full event log, tick-ordered:
  `{e:"node",id,layer,x,y,worker,pop?}` (build roster), `{e:"link",t,parent,child,copies}`,
  `{e:"salience",id,v}`, `{e:"kill",t,worker,nodes:[...]}`,
  `{e:"walk",t,claim,ok,path:[nodeIds]}` (one walk per claim, post-damage),
  `{e:"heal",t,parent,child}`, `{e:"floater",claim,pop}`, plus a `metrics` object per
  arm and `logHash`. The hero renders FROM this log only.
