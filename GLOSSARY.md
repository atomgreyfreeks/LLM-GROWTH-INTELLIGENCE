# Glossary

Coined terms that recur across documents in this repository, each with a plain
definition and a concrete example.

**tombstone** — A small saved record, a few bytes, that a summarizing system
writes at the moment it discards a connection between a conclusion and one of
its sources. Example: in the bridge experiment (`docs/trust/the-bridge/`), the
version that wrote tombstones replayed them after damage and restored 100
percent of its broken evidence trails; the version that recorded nothing
restored nothing.

**coverage ratio** — The share of a territory that a fleet of agents can
actually read in one cycle, given its reading budget. Example: in the fleet
experiments (`docs/two-shapes/fleet-shapes/`), reinforcement-style attention
allocation helped at a 75 percent coverage ratio and collapsed to 12 of 24
towns at a 50 percent coverage ratio.

**walkable** — Describes a conclusion that can be traced, link by surviving
link, down to at least one raw observation. A claim that is still displayed
but has no surviving path to evidence is unwalkable, and the people governed
by it are counted as living under an unauditable claim. Example: in the bridge
experiment, 82 percent of claims stayed walkable in the spread-out wiring
after headline damage, against 60 percent in the strongest-support wiring.

**GUIDE.html** — The plain-language guide page to the first experiment, at
`app/public/guide/GUIDE.html`, served at `/guide/GUIDE.html`.

**GUIDE_DATA** — The JavaScript constant defined by
`app/public/guide/guide-data.js`. It holds settlement positions, populations,
and per-tick run data extracted from the logged experiment runs. Example: the
twin-worlds figure reads `GUIDE_DATA.world.pos` to place its 64 settlement
dots.

**WHAT-HAPPENED.md** — The plain-language explanation file inside an
experiment folder, written for a reader with no project context. Example:
`docs/trust/the-boat/WHAT-HAPPENED.md` explains the storm-rescue experiment in
ordinary words.

**RESULTS.md** — The per-experiment results file recording every
pre-registered prediction with an honest verdict. Example:
`docs/trust/the-map/live/RESULTS.md` records a three-way tie and the flaw
disclosure that accompanies it.

**PREREG.md** — The pre-registration file: the experiment's design and
falsifiable predictions, written before the experiment ran. Example:
`docs/trust/the-boat/live/PREREG.md` predicts the mandatory-checking failure
that the live run then confirmed.
