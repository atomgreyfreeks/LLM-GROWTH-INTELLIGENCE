/**
 * FLEET SHAPES — deterministic world generator for the real-agent experiment.
 * 24 communities, 6 districts, 3 rounds of status-log files, need evolving on a
 * fixed schedule. Two planted emergencies erupt in round 3 in communities that are
 * quiet in rounds 1–2; their neighbors' round-3 files carry cues. Ground truth is
 * written to answer-key.json. Same covenant rules: seeded rng only.
 *
 * Run: cd app && npx tsx scripts/fleetworld.mts
 */
import { makeRng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "two-shapes", "fleet-shapes");
const SEED = 7;

const NAMES = [
  "Ashfield", "Barrow Cross", "Cinder Row", "Dunmore",        // D1
  "Eastholt", "Fernway", "Gorse Hill", "Harrow Bend",         // D2
  "Ivy Hollow", "Junction Vale", "Kiln Flats", "Larkmoor",    // D3
  "Millstead", "Northgate", "Oxbow", "Pinemarch",             // D4
  "Quarry Edge", "Rushwater", "Saltern", "Thistledown",       // D5
  "Umberfield", "Vetch Green", "Wrenfall", "Yarrow Point",    // D6
];
const DISTRICT = (i: number) => Math.floor(i / 4) + 1;

const r = makeRng(SEED * 2654435761);

// need profiles: a spread of high/mid/low, deterministic
const baseNeed = NAMES.map(() => Math.round((0.5 + r() * 8.5) * 10) / 10);
// force a clean spread: sort indices, reassign to a fixed ladder with jitter
const ladder = [8.8, 8.1, 7.4, 6.6, 5.9, 5.3, 4.8, 4.4, 4.0, 3.6, 3.3, 3.0, 2.7, 2.4, 2.2, 2.0, 1.8, 1.6, 1.4, 1.2, 1.1, 1.0, 0.9, 0.8];
const order = baseNeed.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
const need1 = new Array(24).fill(0);
order.forEach((idx, rank) => { need1[idx] = ladder[rank] + Math.round((r() - 0.5) * 4) / 10; });

// emergencies: two quiet communities (rank 17+) in different districts
const quiet = order.slice(16).sort((a, b) => a - b);
const em1 = quiet[0];
const em2 = quiet.find((i) => DISTRICT(i) !== DISTRICT(em1))!;

// rounds 2 and 3: drift + schedule
const drift = () => Math.round((r() - 0.35) * 12) / 10;
const need2 = need1.map((n) => Math.max(0.3, Math.min(9.5, n + drift())));
const need3 = need2.map((n, i) => (i === em1 || i === em2 ? 9.3 + Math.round(r() * 5) / 10 : Math.max(0.3, Math.min(9.5, n + drift()))));

const pop = NAMES.map(() => 120 + Math.floor(r() * 2600));
const loud = NAMES.map(() => r() < 0.3); // dramatic tone, decoupled from need

const water = (n: number) => n > 7 ? "wells testing unsafe; treatment offline" : n > 5 ? "boil advisory in effect" : n > 3 ? "pressure reduced, supply holding" : "normal";
const power = (n: number) => n > 7 ? "grid down; generators failing" : n > 5 ? "rolling outages" : n > 3 ? "partial restoration" : "stable";
const medical = (n: number) => n > 7 ? "clinic over capacity; supplies critical" : n > 5 ? "clinic strained; resupply requested" : n > 3 ? "routine load" : "no unusual activity";
const access = (n: number) => n > 7 ? "primary road impassable" : n > 5 ? "one lane open with delays" : "open";

function fileText(i: number, round: number, needNow: number[], cue: string | null): string {
  const n = needNow[i];
  const tone = loud[i]
    ? "Local coverage is intense and residents are demanding visible action."
    : "Filed through the routine channel.";
  const incident = n > 8.5 ? "Multiple households report acute shortages; volunteers overwhelmed."
    : n > 7 ? "Sustained deterioration since last report."
    : n > 5 ? "Conditions difficult but managed."
    : n > 3 ? "Scattered issues, no acute cases."
    : "No significant incidents.";
  return [
    `${NAMES[i].toUpperCase()} — STATUS LOG, ROUND ${round}`,
    `District ${DISTRICT(i)}. Population ${pop[i].toLocaleString("en-US")}.`,
    `Water: ${water(n)}. Power: ${power(n)}. Medical: ${medical(n)}. Road access: ${access(n)}.`,
    `Incidents: ${incident}`,
    cue ? `Note from the field: ${cue}` : "",
    tone,
  ].filter(Boolean).join("\n");
}

// neighbor cues in round 3: same-district neighbors of each emergency mention signs
function cueFor(i: number): string | null {
  for (const em of [em1, em2]) {
    if (i !== em && DISTRICT(i) === DISTRICT(em))
      return `families arriving on foot from ${NAMES[em]}; they describe conditions there as far worse than anything logged here.`;
  }
  return null;
}

const rounds = [need1, need2, need3];
const key = {
  seed: SEED,
  communities: NAMES.map((name, i) => ({ name, district: DISTRICT(i), pop: pop[i], need: rounds.map((rr) => Math.round(rr[i] * 10) / 10), loud: loud[i] })),
  emergencies: [em1, em2].map((i) => ({ name: NAMES[i], district: DISTRICT(i), eruptsRound: 3 })),
  trueTop4: rounds.map((rr) =>
    rr.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, i]) => NAMES[i])
  ),
};

const world: Record<string, Record<string, string>> = {};
for (let round = 1; round <= 3; round++) {
  const dir = join(OUT, "world", `round${round}`);
  mkdirSync(dir, { recursive: true });
  world[`round${round}`] = {};
  for (let i = 0; i < 24; i++) {
    const txt = fileText(i, round, rounds[round - 1], round === 3 ? cueFor(i) : null);
    const slug = NAMES[i].toLowerCase().replace(/[^a-z]+/g, "-");
    writeFileSync(join(dir, `${slug}.md`), txt + "\n");
    world[`round${round}`][NAMES[i]] = txt;
  }
}
writeFileSync(join(OUT, "answer-key.json"), JSON.stringify(key, null, 2));
writeFileSync(join(OUT, "world-data.js"), "const WORLD = " + JSON.stringify({ names: NAMES, district: NAMES.map((_, i) => DISTRICT(i)), files: world }) + ";\n");
console.log("emergencies:", key.emergencies.map((e) => `${e.name} (D${e.district})`).join(", "));
console.log("true top4 by round:", key.trueTop4.map((t) => t.join(" / ")).join("  ||  "));
console.log(`written -> ${OUT}`);
