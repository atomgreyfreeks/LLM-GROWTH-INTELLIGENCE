/* fleet — the five-round fleet replay, adapted from GUIDE.html __fig4.
   Three panels replay the real five-round run from GUIDE_DATA: 24 communities
   per panel, rounds stepping every 2 s on one shared clock. Read = white,
   unread = 18% grey, aided = ring, planted emergencies pulse from round 3. */
(function () {
  "use strict";
  if (window.__fig_fleet) return;
  var host = document.getElementById("fig-fleet");
  if (!host) return;
  /* guide-data.js declares `const GUIDE_DATA`, which never lands on window */
  var data = typeof GUIDE_DATA !== "undefined" ? GUIDE_DATA : window.GUIDE_DATA;
  var fleet = data && data.fleet;
  if (!fleet) return;

  host.innerHTML =
    '<style>' +
    '#fig-fleet { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }' +
    '#fig-fleet .fig-fleet-grid { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 4.16%; }' +
    '#fig-fleet .fig-fleet-panel { margin: 0; }' +
    '#fig-fleet .fig-fleet-head { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; margin: 0 0 10px; }' +
    '#fig-fleet .fig-fleet-name { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #8a8a8a; white-space: nowrap; }' +
    '#fig-fleet .fig-fleet-chip { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #f2f2f2; border: 1px solid #2a2a2a; padding: 2px 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }' +
    '#fig-fleet canvas { display: block; width: 100%; aspect-ratio: 220 / 176; border: 1px solid #2a2a2a; }' +
    '#fig-fleet .fig-fleet-verdict { margin: 12px 0 0; font-size: 13px; line-height: 1.45; color: #8a8a8a; }' +
    '#fig-fleet .fig-fleet-legend { max-width: 600px; margin: 26px auto 0; font-size: 11px; line-height: 1.5; letter-spacing: 0.1em; text-transform: uppercase; color: #8a8a8a; text-align: center; text-wrap: balance; }' +
    /* narrow layout keys on the slot's own width, so it works when only the
       container narrows (the harness) as well as on phone viewports */
    '#fig-fleet { container-type: inline-size; }' +
    '@container (max-width: 559px) {' +
    ' #fig-fleet .fig-fleet-grid { grid-template-columns: 1fr; row-gap: 34px; }' +
    ' #fig-fleet canvas { aspect-ratio: 300 / 176; }' +
    ' #fig-fleet .fig-fleet-legend { margin-top: 22px; } }' +
    '</style>' +
    '<div class="fig-fleet-grid">' +
    '<div class="fig-fleet-panel">' +
    '<div class="fig-fleet-head"><span class="fig-fleet-name">The org chart</span><span class="fig-fleet-chip" data-fig-fleet-chip>Round 1/5</span></div>' +
    '<canvas data-fig-fleet-arm="vascular" role="img" aria-label="Twenty-four communities as a grid of dots. Every round the org-chart team reads a different half of the region, so no community stays dark for long."></canvas>' +
    '<p class="fig-fleet-verdict">Reliable. Never blind, never fast.</p>' +
    '</div>' +
    '<div class="fig-fleet-panel">' +
    '<div class="fig-fleet-head"><span class="fig-fleet-name">Follow the action</span><span class="fig-fleet-chip" data-fig-fleet-chip>Round 1/5</span></div>' +
    '<canvas data-fig-fleet-arm="physarum" role="img" aria-label="The same twenty-four communities. From round two this team reads the same half every round, so ten communities — including one of the two planted emergencies — stay dark to the end."></canvas>' +
    '<p class="fig-fleet-verdict">Went blind at tight budgets. Missed an emergency.</p>' +
    '</div>' +
    '<div class="fig-fleet-panel">' +
    '<div class="fig-fleet-head"><span class="fig-fleet-name">Coverage plus tips</span><span class="fig-fleet-chip" data-fig-fleet-chip>Round 1/5</span></div>' +
    '<canvas data-fig-fleet-arm="mycelium" role="img" aria-label="The same twenty-four communities. Systematic coverage plus sideways tips keeps every community lit, and both planted emergencies receive aid."></canvas>' +
    '<p class="fig-fleet-verdict">Kept full coverage. Caught both emergencies early.</p>' +
    '</div>' +
    '</div>' +
    '<p class="fig-fleet-legend">Bright dot read this round · dim dot not read · ring aid sent · dashed pulse planted emergency</p>';

  /* the page may also provide a single round chip outside the slot */
  var pageChip = document.getElementById("fleet-round");

  /* mulberry32 — the only randomness source allowed */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var NAMES = fleet.names, N = NAMES.length;
  var ROUNDS = 5, T_ROUND = 2, CYCLE = ROUNDS * T_ROUND;
  var COLS = 6, ROWS = 4, W = 220, H = 176, TAU = Math.PI * 2;
  var DIM = 0.18, DECAY = 0.62, EMERG_FROM = 2;  /* round index 2 === round 3 */

  var index = {}, i;
  for (i = 0; i < N; i++) index[NAMES[i]] = i;
  var isEmergency = new Array(N);
  fleet.emergencies.forEach(function (n) { isEmergency[index[n]] = true; });

  /* seeded per-community pulse offsets — state comes only from the seeded rng */
  var rand = rng(0x51ce4a), offset = [];
  for (i = 0; i < N; i++) offset.push(rand());

  /* per arm: brightness of every community at every round (read now = 1,
     read earlier = halved each round, never read = 18% grey) + aid sets */
  function model(key) {
    var rounds = fleet.arms[key], bright = [], aid = [], prev = null, r, k;
    for (r = 0; r < ROUNDS; r++) {
      var read = {}, row = [], sent = {};
      (rounds[r].read || []).forEach(function (n) { read[index[n]] = 1; });
      (rounds[r].aid || []).forEach(function (n) { sent[index[n]] = 1; });
      for (k = 0; k < N; k++) row.push(read[k] ? 1 : Math.max(DIM, (prev ? prev[k] : DIM) * DECAY));
      bright.push(row); aid.push(sent); prev = row;
    }
    return { bright: bright, aid: aid };
  }

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var easeIO = function (v) { return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
  var easeOut = function (v) { return 1 - Math.pow(1 - v, 3); };

  var panels = [];
  Array.prototype.forEach.call(host.querySelectorAll("canvas[data-fig-fleet-arm]"), function (cv) {
    panels.push({
      cv: cv,
      ctx: cv.getContext("2d"),
      m: model(cv.getAttribute("data-fig-fleet-arm")),
      chip: cv.parentNode.querySelector("[data-fig-fleet-chip]"),
      lastRound: -1,
      w: 0
    });
  });

  function fit(p) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = p.cv.clientWidth, ch = p.cv.clientHeight;
    if (!cw || !ch) return false;
    if (cw !== p.w || ch !== p.h || dpr !== p.dpr) {
      p.w = cw; p.h = ch; p.dpr = dpr;
      p.cv.width = Math.round(cw * dpr);
      p.cv.height = Math.round(ch * dpr);
      p.sx = (cw * dpr) / W; p.sy = (ch * dpr) / H;
    }
    return true;
  }

  function draw(p, phase) {
    if (!fit(p)) return;
    var ctx = p.ctx;
    ctx.setTransform(p.sx, 0, 0, p.sy, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var tc = phase % CYCLE;
    var ri = Math.floor(tc / T_ROUND);
    var f = (tc - ri * T_ROUND) / T_ROUND;
    var pr = (ri + ROUNDS - 1) % ROUNDS;
    var blend = easeIO(clamp01(f / 0.25));

    if (p.chip && ri !== p.lastRound) {
      p.lastRound = ri;
      p.chip.textContent = "Round " + (ri + 1) + "/" + ROUNDS;
      if (pageChip) pageChip.textContent = "Round " + (ri + 1) + "/" + ROUNDS;
    }

    var padX = 26, padY = 22;
    var cw = (W - padX * 2) / COLS, chh = (H - padY * 2) / ROWS;
    var appearAid = clamp01((f - 0.22) / 0.3) * (1 - clamp01((f - 0.88) / 0.12));
    var appearEm = ri > EMERG_FROM ? 1 : ri === EMERG_FROM ? clamp01(f / 0.5) : 0;

    for (var k = 0; k < N; k++) {
      var col = Math.floor(k / ROWS), row = k % ROWS;
      var x = padX + cw * (col + 0.5), y = padY + chh * (row + 0.5);
      var b = p.m.bright[pr][k] + (p.m.bright[ri][k] - p.m.bright[pr][k]) * blend;
      var lit = (b - DIM) / (1 - DIM);

      if (lit > 0.02) {                                   /* halo of a live report */
        ctx.globalAlpha = 0.09 * lit;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(x, y, 5 + 6 * lit, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = b;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(x, y, 2.5 + 2.7 * lit, 0, TAU); ctx.fill();

      if (p.m.aid[ri][k] && appearAid > 0.01) {           /* aid sent this round */
        var grow = easeOut(clamp01((f - 0.22) / 0.35));
        ctx.globalAlpha = 0.92 * appearAid;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(x, y, 6.5 + 3.4 * grow + 0.35 * Math.sin(phase * 1.8 + offset[k] * TAU), 0, TAU);
        ctx.stroke();
      }

      if (isEmergency[k] && appearEm > 0.01) {            /* planted emergency */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.setLineDash([2.2, 3]);                        /* dashed: never an aid ring */
        for (var q = 0; q < 2; q++) {
          var pp = (phase * 0.62 + offset[k] + q * 0.5) % 1;
          ctx.globalAlpha = 0.7 * (1 - pp) * appearEm;
          ctx.lineDashOffset = -phase * 3;
          ctx.beginPath(); ctx.arc(x, y, 6.5 + 10 * pp, 0, TAU); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---- drive. One clock, three panels. ---- */
  var phase = 0, last = 0, raf = 0, running = false, visible = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function renderAll() { for (var j = 0; j < panels.length; j++) draw(panels[j], phase); }

  function frame(ts) {
    if (!running) return;
    var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    phase += dt;
    renderAll();
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running || reduce) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  if (reduce) {
    phase = T_ROUND * EMERG_FROM + 1.0;                   /* mid round 3 */
    renderAll();
    window.addEventListener("resize", renderAll);
  } else {
    window.addEventListener("resize", function () { if (!running) renderAll(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0] && entries[0].isIntersecting;
        if (visible) start(); else stop();
      }, { rootMargin: "80px" }).observe(host);
    } else {
      visible = true;
      start();
    }
  }

  window.__fig_fleet = { start: start, stop: stop };
})();
