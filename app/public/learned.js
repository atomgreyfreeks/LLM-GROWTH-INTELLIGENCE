/**
 * WHAT WE LEARNED — per-page findings overlay. Injected via
 * <script src="/learned.js" defer></script> on experiment pages.
 * Content is the plain-English reading of each experiment's RESULTS.md.
 * House copy law: every referenced noun carries its complete context in the
 * sentence it appears in — no shorthand. Pure DOM, no dependencies, no randomness.
 */
(() => {
  const CONTENT = {
    "/bridge.html": {
      title: "The Bridge — what we learned",
      learned: [
        "We built the same tower of evidence twice: raw ground readings at the bottom, summaries of those readings above, summaries of summaries above that, and one final conclusion at the top. Both versions got the same wiring budget. The only difference was the rule for which supporting connections get kept.",
        "The version that spread its connections across several supporting sources survived damage better than the version that put everything into one strongest chain of support. That held under every kind of damage we tested, including the one kind we specifically designed the strongest-chain rule to win.",
        "The deciding factor was note-keeping. The spreading version wrote a small note every time it discarded a connection. After we destroyed a third of the machines holding the tower, a small repair budget used those notes to rebuild every broken path from conclusion to evidence — fully repaired. The strongest-chain version kept no notes, repaired nothing, and left 14,420 simulated people governed by conclusions that can no longer be checked against any evidence.",
      ],
      questions: [
        "The spreading version has hub points that many connections pass through, and an attacker who studies the structure and destroys those hubs first collapses it below even the strongest-chain version. Can we cap how many connections any one point carries without losing the benefit of spreading?",
        "Do real AI summaries keep usable notes? When a language model condenses many documents into one summary, can that summary carry receipts that let a person rebuild the trail back to the original documents?",
        "How much repair budget is needed when damage keeps arriving over time, instead of striking once and stopping?",
      ],
      agents: [
        "Any AI system that summarizes summaries — field reports into briefings, agent outputs into one final answer — is this tower of evidence. Keep the connections from every conclusion down to its original sources.",
        "When old context or memory gets deleted to save space, save a tiny note recording what was deleted and where it came from. A few bytes per deletion is the entire difference between a system that can repair its records after a failure and a system with permanent holes.",
        "Never let a keep-only-the-best-source rule delete the alternative sources without leaving a record of them.",
      ],
    },
    "/boat.html": {
      title: "The Boat — what we learned",
      learned: [
        "The rescue desk that blended its satellite pictures and its phone calls into one map never once sent the boat somewhere empty. In this simulated world, trouble stays until someone helps, so a wrong belief almost always understates a real problem — it never invents a fake one.",
        "The desk that kept the satellite pictures and the phone calls as two separate maps gave up about 3% of its rescues in ordinary storms. But when we made the phone calls unreliable — exaggerated reports — that separate-maps desk actually improved, while the blended-map desk got worse. A blended map leaves you nothing to distrust when one of your sources goes bad.",
        "The desk that flew its one boat out to double-check every disagreement between the satellite and the phones did the worst everywhere we tested. When the phone calls went bad, disagreements appeared everywhere, so that desk spent 69% of its boat missions on checking instead of rescuing, and saved half as many people.",
      ],
      questions: [
        "Would a strict limit on double-checking — say, at most one verification flight for every ten boat missions — keep the protection without letting the checking eat the rescue schedule?",
        "Does this result reverse in a world where emergencies often resolve on their own and false alarms are common? There, a boat sent by a wrong belief really would find empty water.",
        "What if the boat could check on towns it already passes on its way to a rescue — verification for free, instead of special trips?",
      ],
      agents: [
        "When an AI agent draws on several information sources — search results, tool outputs, a person's instructions — keep track of which claim came from which source all the way to the final decision. Blending everything into one belief early costs nothing until one source goes bad, and then it costs everything.",
        "Give any self-checking or re-verification behavior its own hard budget, separate from how much conflict the agent currently sees. A system that re-checks whenever its sources disagree will spend its whole budget on checking at the exact moment one source becomes unreliable.",
        "Many agents writing into one shared memory will follow a wrong entry together, the way a herd follows a wrong leader. Keeping disagreement between sources visible, instead of averaging it away, is a safety feature.",
      ],
    },
    "/mapworld.html": {
      title: "The Map — what we learned",
      learned: [
        "The dispatch desk that reassigned its rescue crews from scratch every time a newer map of the emergencies arrived wasted 82 of the 600 kilometres its crews walked — and reached 37 of the 39 emergencies before their deadlines.",
        "The desks that protected their plans — one let crews finish their planned routes before taking new orders, the other locked each crew's current destination and adjusted only later stops — wasted zero kilometres, kept beautiful-looking stable plans, and let ten emergencies pass their deadlines.",
        "We also ran a referee desk with a perfect, always-current map as the best possible case. That referee turned its crews around three to four times MORE than any other desk, and saved the most people. Turning crews around was never the waste; it is simply what acting on new information looks like.",
      ],
      questions: [
        "In this world, turning a crew around cost nothing beyond the extra walking. Would real turnaround costs — packing up equipment, crew exhaustion, fuel — bring back situations where sticking to the plan wins?",
        "The lock-current-destination desk failed by booking urgent towns into far-away crews' future stops, where those towns waited past their deadlines. Would making that rule consider distance fix the failure?",
        "What happens when the newer map is itself sometimes wrong, so reacting quickly sometimes means chasing errors?",
      ],
      agents: [
        "When new information arrives, re-plan your AI agents' task lists from scratch. Abandoning half-done work feels wasteful, and in our tests it cost less than continuing to act on stale priorities.",
        "Judge a fleet of agents by results delivered on time, never by how stable its task assignments look. Our steadiest-looking desks scored perfect stability while emergencies expired unserved.",
        "Watch out for half-committed schemes that lock some work and shuffle the rest: they can book an urgent task deep into a busy agent's future queue while a completely free agent sits available.",
      ],
    },
    "/twoshapes.html": {
      title: "The Two Shapes — what we learned",
      learned: [
        "Software survey agents visited all 64 communities equally, and their reports passed through four summary stages, each stage with limited room. With the visits held provably identical, the rule for which reports keep their place at each stage decided — by itself — which communities the top decision-makers could see at all. Under the default rule, 26 of the 64 communities, home to 7,364 simulated people, vanished from the decision-makers' view while still being visited.",
        "Sending extra surveyors to the vanished communities made the region worse off. The new reports died at the same summary stage as the old ones, and the extra trips slowed down coverage for everyone else. A selection problem cannot be fixed by collecting more.",
        "Changing the survival rule — letting reports from neighboring communities merge and share one place in the summary — brought every community back into view and recovered 75% of the lost performance, using the same agents, the same visits, and the same budget.",
      ],
      questions: [
        "Does this erasure happen with real AI summarizers when each summary is strictly limited in how many communities it may mention, across many rounds? A first test with 16 real Claude agents said a capable summarizer with room to work protects the quiet communities on its own — the danger lives in the pipeline's capacity rules, and a follow-up test is specified.",
        "How tight does an agent team's reading budget have to get before pay-more-attention-where-you-found-trouble-before flips from helpful to harmful? Two live runs with real agents bracket the line; the full sweep is unfinished.",
        "The rule that lets field agents flag trouble outside their own assigned area is still under-tested — in both live runs, luck placed the emergencies where the flags were barely needed.",
      ],
      agents: [
        "Every AI orchestrator that compresses its agents' outputs — summarizing them, ranking them, trimming context to fit a window — contains a survival rule like the ones on this page, usually chosen by nobody. That rule silently decides which agent's work reaches the final answer.",
        "Rules that reward recent winners — whatever was used last keeps its place — are the erasing kind. Rules that merge related items so they travel together are the protecting kind.",
        "Before adopting an attention rule that concentrates effort where results were found before, check the budget: with generous reading budgets that rule helps, and with tight budgets it stops reading half the world.",
      ],
    },
  };

  const page = CONTENT[location.pathname];
  if (!page) return;

  const S = document.createElement("style");
  S.textContent = `
    #learned-btn{height:40px;padding:0 14px;background:rgba(10,10,10,.88);
      border:1px solid #2a2a2a;color:#f2f2f2;
      font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:.19em;
      text-transform:uppercase;cursor:pointer;border-radius:2px;transition:border-color .25s ease;
      white-space:nowrap}
    #learned-btn.floating{position:fixed;top:8px;right:60px;z-index:2147483646}
    #learned-btn:hover{border-color:#666}
    #learned-veil{display:none;position:fixed;inset:0;z-index:2147483645;
      background:rgba(0,0,0,.72)}
    #learned-veil.open{display:block}
    #learned-card{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:min(780px,calc(100vw - 48px));max-height:calc(100vh - 96px);overflow:auto;
      background:#0a0a0a;border:1px solid #2a2a2a;padding:30px 34px 26px;border-radius:2px;
      font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#f2f2f2}
    #learned-card h2{font-size:15px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;margin:0 0 4px}
    #learned-card .sec{font-size:10px;letter-spacing:.16em;color:#8a8a8a;text-transform:uppercase;
      font-weight:700;margin:22px 0 8px}
    #learned-card p{font-size:13px;line-height:1.6;margin:0 0 10px;color:#d8d8d8}
    #learned-card .close{position:absolute;top:14px;right:16px;background:none;border:none;
      color:#8a8a8a;font-size:16px;cursor:pointer}
    #learned-card .src{font-size:10px;letter-spacing:.08em;color:#666;margin-top:18px}
  `;
  document.head.appendChild(S);

  const btn = document.createElement("button");
  btn.id = "learned-btn";
  btn.textContent = "What we learned";
  const veil = document.createElement("div");
  veil.id = "learned-veil";
  const card = document.createElement("div");
  card.id = "learned-card";
  const sec = (t, items) =>
    `<div class="sec">${t}</div>` + items.map(x => `<p>${x}</p>`).join("");
  card.innerHTML =
    `<button class="close" aria-label="close">✕</button>` +
    `<h2>${page.title}</h2>` +
    sec("What this taught us, practically", page.learned) +
    sec("Questions it opened", page.questions) +
    sec("For anyone orchestrating agent fleets", page.agents) +
    `<div class="src">every number comes from logged, replayable runs · predictions were registered before the runs · full record in docs/trust and docs/two-shapes</div>`;
  veil.appendChild(card);

  const mount = () => {
    const holder = document.getElementById("site-controls");
    if (holder) holder.insertBefore(btn, holder.firstChild);
    else { btn.classList.add("floating"); document.body.appendChild(btn); }
    document.body.appendChild(veil);
  };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  const openC = () => veil.classList.add("open");
  const closeC = () => veil.classList.remove("open");
  btn.addEventListener("click", (e) => { e.stopPropagation(); openC(); });
  veil.addEventListener("click", (e) => { if (e.target === veil) closeC(); });
  card.querySelector(".close").addEventListener("click", closeC);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeC(); });
})();
