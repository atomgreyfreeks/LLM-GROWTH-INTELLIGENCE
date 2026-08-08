# LLM PILOT — does the survival rule decide visibility with REAL summarizers?

Pre-registered 2026-08-03, before any agent ran. The kernel experiments used simulated
summarization (slot competition). This pilot uses real Claude agents doing real text
summarization, to test whether the core effect survives.

## Design

A disaster scenario as text. 12 communities in 3 districts, each with a short field
report. Reports are constructed so that **loudness and severity are decoupled**: three
"canaries" have severe facts in dry administrative language; several low-severity
reports use dramatic language. One report (Kestrel March) is both loud AND severe — the
control that every arm should catch.

Pipeline, per run: 3 regional-officer agents each summarize their district's 4 reports
into **at most 90 words** (the capacity limit) → 1 operations chief reads only the 3
summaries and (a) picks exactly 4 communities for aid, ranked, and (b) lists every
community name visible to them.

**One variable.** The summarization rule given to regional officers:
- **Arm A (triage rule):** "Space is tight: prioritize the most urgent and actionable
  items; cut what doesn't make the cut."
- **Arm B (merge rule):** "Space is tight: every community must appear at least once;
  merge neighboring communities into grouped lines where needed."

Same reports, same 90-word budget, same chief prompt. 2 repetitions per arm (LLM
sampling varies; small-N pilot). Model: Sonnet for all agents.

## Ground truth (answer key)

True severity (0–10): Kestrel March 9.8 (loud+severe), Eelgrass Bend 9.6 (canary),
Alder Flats 9.2 (canary), Ivorygate 9.0 (canary), Garnet Slope 5.5, Dray Junction 4.5,
Hollowbrook 4.2, Corvid Hollow 4.0, Loomfield 3.0, Bracken Pier 2.1, Fenwick Shoal 1.8,
Juniper Cross 1.5. True top-4 = Kestrel March, Eelgrass Bend, Alder Flats, Ivorygate.

## Pre-registered predictions

1. Arm A drops communities: across its runs, at least 2 of 12 communities are absent
   from the chief's visible-list; Arm B keeps ≥11 of 12 visible in every run.
2. Arm A's aid list averages ≤2 of the 3 canaries; Arm B averages more canaries in the
   top-4 than Arm A.
3. Both arms select Kestrel March (loud+severe control) in every run — if either
   misses it, the pipeline itself is broken and the run is void, arm unjudged.

**Falsifier:** if Arm A keeps all canaries visible and selects them as often as Arm B,
the effect does not survive real summarizers at this scale, and we publish that.

## Scoring

Mechanical, by string-match against the community names (all names are distinctive).
Visibility = named in the chief's visible-list. Canary capture = canaries in the
ranked top-4. Scored by script, not by judgment.

## Honest limitations

Small N (2 reps/arm), one scenario, one model, single-shot (no multi-cycle
reinforcement — Arm A is the triage default, an adjacent cousin of the kernel's
recency rule, and is labeled as such). This is a pilot: a pass earns the full version
on the GPU cluster; a fail kills the "survives real summarizers" claim early and
cheaply.
