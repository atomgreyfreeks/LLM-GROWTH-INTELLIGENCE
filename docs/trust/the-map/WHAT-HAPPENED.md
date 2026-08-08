# The map is twenty minutes old. Your crew is already walking. Do you turn them around?

## What we built

A rescue region: 40 towns, 15,000 simulated people, 6 crews on foot. Emergencies
strike on their own schedule, and each one has a deadline — reach those people in
time or they go unserved, permanently. The dispatcher's map of the region refreshes
only every 20 minutes, so the desk is always navigating by a slightly old
photograph.

We ran the same emergencies three times. The only thing that changed was what a
crew already walking does when a new map arrives:

1. **Commit** — finish the route you started, then take new orders.
2. **Chase** — drop everything, walk to the newest priority from wherever you are.
   Ground you already covered gets walked back over. We logged every wasted
   kilometre.
3. **Tips** — keep your current destination locked, adjust only the later stops.
   The tidy middle path.

We wrote our predictions down before running anything. We predicted commitment
would win when the world changed slowly, and that the tidy middle would capture
the best of both.

## What we found

Three of our predictions died, and the finding is better than the predictions.

**Chasing won everywhere.** At every pace of change we tested, the desk that turned
its crews around served the most people — 8,517 against commit's 7,573 in the
middle setting — while wasting only 11% of its walking. Its plans looked terrible
on paper: it broke a quarter of its own promises. Every emergency still got served.

**The tidy desk lost people.** The tips policy walked zero wasted kilometres, kept
98% of its promises, and let ten emergencies expire inside their deadlines. Its
clean plans came from booking urgent towns into far-away crews' future stops,
where they quietly waited too long.

**The all-knowing referee churned hardest of all.** We ran a desk with a perfect
live map as the ceiling. It turned crews around three to four times more than the
chaser did, and it served the most people of any desk. Fresh information makes
turning around worth it. The waste was never in the turning around.

## The rule this gives anyone running teams — human or AI

Judge a dispatch system by people served inside their windows. Plan stability is a
vanity metric: our tidiest desks scored a perfect 1.000 on it while people waited
past their deadlines. When better information arrives, the cost of changing course
is usually smaller than it feels, and a system that refuses to look flighty pays
for its dignity in missed windows.

Every number above comes from logged runs that replay byte-for-byte, the
predictions were written down before the first run, and the ones that failed are
published next to the ones that held.
