/**
 * copy-lint — mechanical checks from docs/COPY-CONTRACT.md, run against the
 * visible strings of the experiment pages and the findings overlay.
 * Checks rules 5 (banned internal vocabulary), 7 (contrast constructions),
 * and 8 (sentence length cap). Exit 1 on any violation.
 * Usage: node scripts/copy-lint.mjs   (from app/)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");

const PAGES = ["twoshapes.html", "bridge.html", "boat.html", "mapworld.html"];
const BANNED = [
  "arms", "kernel", "prereg", "ablation", "physarum", "mycelium",
  "v-shape", "h-shape", "provenance", "canonical", "substrate",
  "telemetry", "divergence",
];
const MAX_WORDS = 45;

const problems = [];

function checkText(source, text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  // rule 5 — banned internal vocabulary (word-boundary, case-insensitive)
  for (const w of BANNED) {
    const re = new RegExp(`\\b${w.replace("-", "[-\\s]?")}\\b`, "i");
    if (re.test(clean)) problems.push(`${source}: banned word "${w}" in: "${clean.slice(0, 90)}..."`);
  }
  // rule 7 — contrast constructions
  if (/\bnot\b[^.!?]{0,50},\s*but\b/i.test(clean))
    problems.push(`${source}: contrast construction ("not X, but Y") in: "${clean.slice(0, 90)}..."`);
  // rule 8 — sentence length cap
  for (const s of clean.split(/(?<=[.!?])\s+/)) {
    const words = s.split(/\s+/).filter(Boolean).length;
    if (words > MAX_WORDS)
      problems.push(`${source}: ${words}-word sentence (cap ${MAX_WORDS}): "${s.slice(0, 90)}..."`);
  }
}

// visible strings in the page HTML: .sub, .gloss, .lesson, .name blocks
for (const p of PAGES) {
  const html = readFileSync(join(APP, p), "utf8");
  for (const m of html.matchAll(/<div class="(sub|gloss|lesson|name[^"]*)"[^>]*>([\s\S]*?)<\/div>/g)) {
    const text = m[2].replace(/<[^>]+>/g, " ");
    checkText(`${p} [.${m[1]}]`, text);
  }
}

// the guide pages: every heading, paragraph, and caption (scripts and styles removed)
for (const page of ["growth.html", "live.html", "overview.html"]) {
  const html = readFileSync(join(APP, "public", "guide", page), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  for (const m of html.matchAll(/<(h1|h2|p|figcaption)[^>]*>([\s\S]*?)<\/\1>/g)) {
    checkText(`${page} [${m[1]}]`, m[2].replace(/<[^>]+>/g, " "));
  }
}

// the visual report: every heading, paragraph, caption, and number label
const report = readFileSync(join(APP, "public", "report.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ");
for (const m of report.matchAll(/<(h1|h2|p|li|div class="lbl")[^>]*>([\s\S]*?)<\/(?:h1|h2|p|li|div)>/g)) {
  checkText("report.html", m[2].replace(/<[^>]+>/g, " "));
}

// findings overlay content: every quoted string in the CONTENT object
const learned = readFileSync(join(APP, "public", "learned.js"), "utf8");
const contentBlock = learned.slice(learned.indexOf("const CONTENT"), learned.indexOf("const page ="));
for (const m of contentBlock.matchAll(/"([^"\\]{40,})"/g)) {
  checkText("learned.js [card]", m[1]);
}

if (problems.length) {
  console.error(`COPY LINT: ${problems.length} violation(s)\n`);
  for (const p of problems) console.error("  FAIL " + p);
  process.exit(1);
} else {
  console.log("COPY LINT: clean — pages and overlay pass rules 5, 7, 8");
}
