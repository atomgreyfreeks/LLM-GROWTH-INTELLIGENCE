# THE BRIDGE — RESULTS

Run 2026-08-05. Kernel `app/scripts/bridge.mts`, 4 arms × 4 budgets × 8 seeds ×
15 damage scenarios, every config run twice with byte-identical event-log hashes
(128 configs). Budget spend asserted equal in code (156 units exact, every
budgeted arm); candidate-DAG hash identical across arms. Conductor re-ran the
full sweep independently; scorecard matched the builder's report exactly. Raw
table in `raw-results.json`. Pre-registration in `PREREG.md`; amendments at the
bottom.

## The conclusion, up front — five predictions died and left a sharper law

**Redundancy won everywhere — including the one case we registered FOR the
strongest-support rule.** Under pure edge-attrition, thickening's home ground,
the mesh still held 0.813 walkability against the thick chain's 0.500 (P2's
falsifier fired: the slime rule's insurance premium bought nothing anywhere in
this kernel). But the margins are honest and modest — 1.36× at the headline, half
the effect we predicted — and the mesh has a real Achilles heel: an attacker who
targets hubs collapses it BELOW a randomly-damaged chain (0.134 vs 0.571, P3's
falsifier fired). Scatter redundancy is worse than either structure (P7 refuted
on the low side): structure matters more than we predicted.

**The clean pass is the law worth deploying: what you record when you prune
decides what you can repair.** After 30% of workers died, sixteen units of heal
budget restored 100% of the mesh's lost walkability — because the mesh's prune
rule keeps recoverable tombstones, and healing is replaying them. The chain,
whose prune records nothing, restored 0.0%, forever. Same heal budget, same
damage, same world. The difference between a repairable institution and a
permanent hole is the record kept at the moment of discarding.

## Headline numbers (B=156, random worker-kill f=0.4, med [min..max], 8 seeds)

| arm | walkability | floater-people (governed by unauditable claims) |
|---|---:|---:|
| CHAIN (strongest support wins) | 0.600 [0.000..0.800] | 9,648 [1,128..17,215] |
| MESH (neighbors carry the proof) | **0.817** [0.333..1.000] | **4,309** [0..16,430] |
| RANDOM (scatter) | 0.183 [0.000..0.833] | 11,778 [2,613..17,700] |
| ORACLE (every candidate edge) | 1.000 [0.833..1.000] | 0 [0..1,521] |

Heal test (f=0.3, H=16): MESH restored 100.0% of lost walkability; CHAIN 0.0%.

## Prediction scorecard

| pre-registered prediction | verdict |
|---|---|
| P1: MESH ≥ 2× CHAIN walkability at f=0.4 | **REFUTED.** Ratio 1.36 — mesh wins, at half the predicted size. |
| P2: CHAIN wins pure edge-attrition (its home case) | **REFUTED — falsifier fired.** MESH 0.813 vs CHAIN 0.500. Thickening strictly dominated. |
| P3: MESH survives targeted attack above CHAIN-random | **REFUTED — falsifier fired.** Targeted f=0.3 drops MESH to 0.134, below CHAIN-random 0.571. Hub exposure is real. |
| P4: floater-people CHAIN ≥ 3× MESH | **REFUTED.** Ratio 2.24 (above the 1.5 kill-line — the human-cost claim survives at reduced size). |
| P5: tombstone heal ≥60% (MESH), ≤10% (CHAIN) | **PASS.** 100.0% vs 0.0%. The one clean confirmation. |
| P6 (exploratory): the budget knee | Marginal walkability per edge-unit hits zero past B=134 (1.5× minimum): modest redundancy buys all the safety there is to buy at f=0.3. |
| P7: RANDOM lands between CHAIN and MESH | **REFUTED.** RANDOM fell BELOW CHAIN (0.183). Structure matters more than predicted; scatter leaves claims unwired before damage even arrives (pre-damage walkability 0.500). |

## Inert-rule accounting (disclosed, both denominators)

Cross-links: used in 40.4% of successful mesh walks — active. Tombstone heals:
14 fired / 2,678 replayable tombstones (0.5% — inert by the literal prereg
wording) and 14 fired / 14 actual disconnections (100% — the mechanism fired at
every break it exists to repair, restoring 100% of lost walkability). Both
numbers stand; the prereg's denominator was the wrong one and we say so rather
than quietly switching it.

## Amendments to the pre-registration (all disclosed)

1. **Bake amended:** prereg pinned seed 3 / f=0.4; seed 3 is a near-worst outlier
   for both arms (CHAIN 0.17 / MESH 0.33 — a weak, unrepresentative contrast).
   The baked hero log now carries seed 5 (which sits on the medians: CHAIN 0.60 /
   MESH 0.80 at f=0.4) at the P5 heal condition (f=0.3 + H=16) so the hero can
   show the one clean PASS: CHAIN stuck at 0.4286 with 14,420 floater-people and
   nothing to replay; MESH healing 2 breaks with 2 tombstones back to 1.000 and
   zero floaters. Amended in code with a comment, and here, on the record.
2. Layer-kill is structurally total in this geometry (64 readings round-robin
   over 32 workers means every worker hosts a reading) — reported as a floor,
   identical across arms; it distinguishes nothing and we say so.
3. Implementation decisions where the prereg was silent (spine definition, mesh
   edge order, floater definition, audit-cost measure, heal order, kill
   rounding) are printed by the kernel and listed in its header — none silent.

## What the hero must show (updated to the true result)

Seed 5, B=156, f=0.3 + heal. The arc is: build (two textures — one thick spine,
one lateral mesh), the same ten workers dying in both stacks, the walks (three of
seven claims still walkable in CHAIN, six of seven in MESH), and then THE HEAL —
the mesh's tombstones replaying as re-ignited threads until every claim walks
again (1.000, zero floaters), while the chain's desk holds four permanent breaks
and 14,420 people governed by sentences nobody can audit, forever. The counts
come from the log (`walkabilityPreHeal`, `walkability`, `floaterPop`,
`healsFired`, `tombstones`). On-screen names: **THE STRONGEST SUPPORT WINS** /
**NEIGHBORS CARRY THE PROOF**.
