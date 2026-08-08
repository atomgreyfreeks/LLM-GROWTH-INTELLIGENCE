# A stranger phoned it in. The satellite says otherwise. Where do you send the boat?

## What we built

A coast: 48 settlements, 18,000 simulated people, storms that drift along the
shore. A storm does three things at once in the same place — it puts people in
the water, it hides the ground from the satellite, and it cuts the phone lines.
So the two ways of knowing both go quiet exactly where the trouble is. That
correlation comes from the physics of the world, never from us wiring it in.

One rescue boat. Committing it is irreversible — it sails in real time and cannot
turn around mid-passage. We ran the same storms three times, changing only where
the two witnesses meet:

1. **One map** — satellite and phone reports blend into a single belief the
   moment they arrive. This is what almost every data pipeline does by default.
2. **Two witnesses** — each source keeps its own map, and the desk can see where
   they disagree.
3. **Go and look** — two witnesses, plus: when they disagree about the top
   target, the boat flies over to check before committing.

We predicted the one-map desk would confidently send its boat into empty water,
and that going to look would save the most people.

## What we found

Both headline predictions died, and what killed them is more useful.

**The boat never once sailed into empty water.** Zero times, any desk, all 32
storm-seasons. In a world where trouble stays until someone helps, a wrong belief
is almost always an underestimate — the stale map hides the new flood. The
disaster it imagines is smaller than the real one. The cinematic failure we
registered belongs to worlds where problems evaporate on their own.

**Going to look was harmful everywhere, and worst when a witness went bad.** When
we poisoned the phone channel with exaggerations, the checking desk spent 69% of
its missions verifying and rescued half as many people — 10,824 against 23,856.
The mechanism is general: disagreement is what triggers checking, corruption is
what creates disagreement, so the checking bill arrives exactly when checking is
least affordable. The boat's doubt consumed the boat.

**Keeping the witnesses separate was cheap insurance.** It cost about 3% in
ordinary storms. When the phone channel filled with lies, the one-map desk got
worse and the two-witness desk actually got better — the only desk that did.
A fused map has no channel left to doubt.

## The rule this gives anyone running teams — human or AI

Cap your verification budget separately from your disagreement level. A system
that checks whenever its sources conflict will check the most at exactly the
moment it can least afford to. And keep your sources' identities alive all the
way to the decision: merging them early is free until one of them goes bad, and
then it is the difference between degrading and improving.

Every number above comes from logged runs that replay byte-for-byte, the
predictions were written down before the first run, and the ones that failed are
published next to the ones that held.
