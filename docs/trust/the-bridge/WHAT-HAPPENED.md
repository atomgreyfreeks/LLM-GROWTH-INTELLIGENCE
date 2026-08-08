# Someone says the bridge is safe. Can you walk to the reason?

## What we built

A pyramid of evidence, the way machine conclusions are actually made: 256 raw
observations on the ground, summarized into 64 readings, then 16 findings, then 8
claims, then one sentence at the top — "the bridge is safe." Each claim governs a
district of people; 21,000 people in all live under the 8 claims. A conclusion you
can trace all the way down to a real observation is auditable. A conclusion still
glowing at the top with nothing alive beneath it governs its people on faith.

We built the pyramid's wiring twice, spending exactly the same link budget:

1. **The strongest support wins** — every summary keeps one link to its best
   source and spends the rest of the budget thickening that spine. This is the
   default rule inside most ranking and retrieval pipelines.
2. **Neighbors carry the proof** — links spread across several sources, and every
   link that gets discarded leaves a tombstone: a small record of what was cut.

Then we killed workers — randomly, and by targeting the busiest — and asked every
surviving claim one question: can you still walk to your reason?

## What we found

Five of our seven written-down predictions died. What survived is sharper.

**Spreading beat thickening everywhere, including thickening's home ground.** We
registered one case where the thick spine should win — damage that destroys link
copies while sparing workers. It lost there too, 0.81 to 0.50. At the headline
damage level the spread pyramid kept 82% of its claims walkable against 60%, and
held 4,309 people on unauditable claims against 9,648.

**The mesh has a glass jaw.** An attacker who studies the structure and kills its
hubs first collapses the spread pyramid to 13% — below what random damage does to
the spine. Redundancy protects against accident. It concentrates its own risk
against aim.

**The tombstones were the real treasure.** After a third of the workers died, we
gave both pyramids the same small repair budget. The spread pyramid replayed its
tombstones — the records of what it had once discarded — and restored 100% of
what the damage took. Every claim walked again. The spine pyramid had recorded
nothing when it pruned, so it repaired nothing, and its four breaks are permanent:
14,420 people governed forever by sentences nobody can check.

## The rule this gives anyone building summarizing systems — human or AI

When your system discards a source, make it write down what it discarded. The
cost is a few bytes per cut. After the failure you did nothing to prevent, that
record is the entire difference between an institution that heals and an
institution with permanent holes in its memory. And budget modestly: past 1.5×
the minimum wiring, extra redundancy bought nothing here — the knee comes early.

Every number above comes from logged runs that replay byte-for-byte, the
predictions were written down before the first run, and the five that failed are
published next to the two that held.
