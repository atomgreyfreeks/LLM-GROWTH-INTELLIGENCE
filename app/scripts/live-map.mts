/**
 * THE MAP, LIVE — world generator. Deterministic, seeded.
 * Writes per-round stale briefings (round n describes round n-1) and the answer
 * key to docs/trust/the-map/live/. Five emergencies on a fixed schedule, each
 * expiring three rounds after it appears. Three of the five strike towns that
 * no crew's initial queue contains, per the pre-registration.
 */
import { makeRng } from "../src/core/sim.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "docs", "trust", "the-map", "live");
const WORLD = join(OUT, "world");
mkdirSync(WORLD, { recursive: true });

const SEED = 47;
const r = makeRng(SEED * 2654435761);

const NAMES = [
  "Aldergate", "Briarmoor", "Cotholt", "Dampier Cross",
  "Elmreach", "Foxfell", "Grangemount", "Hollowmere",
  "Ivorby", "Juniper Flats", "Kestrel Down", "Longfen",
  "Marrowfield", "Nettlestone", "Otterbeck", "Pyewell",
];
const N = NAMES.length;
const ROUNDS = 6;

// Initial queues: staggered lengths 1, 2, 3, 3 over seeded distinct towns.
const order = NAMES.map((_, i) => ({ i, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.i);
const QUEUES = [
  [order[0]],
  [order[1], order[2]],
  [order[3], order[4], order[5]],
  [order[6], order[7], order[8]],
];
const queued = new Set(QUEUES.flat());

// Five emergencies: rounds 2,2,3,3,4; deadline = appearance + 3.
// Three of five strike unqueued towns (per pre-registration); the pool is seeded.
const unqueuedPool = order.filter((i) => !queued.has(i));
const queuedPool = order.filter((i) => queued.has(i)).reverse();
const EMERGENCIES = [
  { town: unqueuedPool[0], appears: 2 },
  { town: queuedPool[0], appears: 2 },
  { town: unqueuedPool[1], appears: 3 },
  { town: queuedPool[1], appears: 3 },
  { town: unqueuedPool[2], appears: 4 },
].map((e, i) => ({
  id: `E${i + 1}`,
  town: e.town,
  townName: NAMES[e.town],
  appears: e.appears,
  deadline: e.appears + 3,
  people: 120 + Math.floor(r() * 280),
}));

// Routine need per town per round: value 1-9, drifting.
const routine: number[][] = [];
let cur = NAMES.map(() => 1 + Math.floor(r() * 9));
for (let round = 1; round <= ROUNDS; round++) {
  cur = cur.map((v) => Math.max(1, Math.min(9, v + Math.floor(r() * 3) - 1)));
  routine.push([...cur]);
}

const ROUTINE_LINE = (name: string, v: number) =>
  v >= 7 ? `${name}: shelter supplies running low; road passable; about ${v * 14} households affected.`
  : v >= 4 ? `${name}: water distribution behind schedule; ${v * 9} households on the list.`
  : `${name}: conditions stable; routine welfare checks requested.`;

for (let round = 1; round <= ROUNDS; round++) {
  const asOf = round - 1; // staleness: the briefing describes the previous round
  const lines = [
    `# Regional briefing — round ${round}`,
    ``,
    `This briefing compiles field radio traffic up to the end of round ${asOf}.`,
    `Conditions may have changed since. Emergencies carry hard deadlines: people`,
    `unreached by the deadline round go unhelped, permanently.`,
    ``,
  ];
  const visible = EMERGENCIES.filter((e) => e.appears <= asOf && asOf <= e.deadline);
  if (visible.length) {
    lines.push(`## Emergencies on record`);
    lines.push(``);
    for (const e of visible) {
      lines.push(`- ${e.townName}: flash flooding since round ${e.appears}; about ${e.people} people cut off; they must be reached by the end of round ${e.deadline}.`);
    }
    lines.push(``);
  }
  lines.push(`## Town reports`);
  lines.push(``);
  const state = routine[Math.max(0, asOf - 1)];
  for (let i = 0; i < N; i++) lines.push(`- ${ROUTINE_LINE(NAMES[i], state[i])}`);
  writeFileSync(join(WORLD, `round${round}-briefing.md`), lines.join("\n") + "\n");
}

const key = {
  seed: SEED,
  names: NAMES,
  rounds: ROUNDS,
  crews: QUEUES.map((q) => q.map((i) => NAMES[i])),
  emergencies: EMERGENCIES.map(({ id, townName, appears, deadline, people }) => ({ id, town: townName, appears, deadline, people })),
  routine,
};
writeFileSync(join(OUT, "answer-key.json"), JSON.stringify(key, null, 2));
console.log("map live world written; emergencies:",
  EMERGENCIES.map((e) => `${e.id}@${e.townName} r${e.appears}->r${e.deadline}`).join("  "));
