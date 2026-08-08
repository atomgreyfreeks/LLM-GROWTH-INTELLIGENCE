/* twin — the two-shapes replay, adapted from GUIDE.html __fig2.
   Two panels replay the real Two Shapes log from GUIDE_DATA on one shared
   clock: 64 settlements at their real positions, tick playback 0..398 over
   ~20 s. Left counter ends at 8,935 of 16,299; right at 16,299. */
(function () {
  "use strict";
  if (window.__fig_twin) return;
  var host = document.getElementById("fig-twin");
  if (!host) return;
  /* guide-data.js declares `const GUIDE_DATA`, which never lands on window */
  var data = typeof GUIDE_DATA !== "undefined" ? GUIDE_DATA : window.GUIDE_DATA;
  if (!data || !data.world || !data.arms) return;

  /* the page may provide the counter elements; otherwise the module injects
     the whole legend block inside its own slot */
  var pageA = document.getElementById("twin-count-a");
  var pageB = document.getElementById("twin-count-b");

  host.innerHTML =
    '<style>' +
    '#fig-twin .fig-twin-wrap { margin: 0; }' +
    '#fig-twin .fig-twin-canvas { display: block; width: 100%; aspect-ratio: 720 / 380; }' +
    '#fig-twin .fig-twin-legends { display: flex; gap: 5.55%; margin-top: 18px; }' +
    '#fig-twin .fig-twin-leg { flex: 1 1 0; min-width: 0; }' +
    '#fig-twin .fig-twin-lbl {' +
    ' margin: 0; font-size: 12px; line-height: 1.4; letter-spacing: 0.12em;' +
    ' text-transform: uppercase; color: var(--secondary, #8a8a8a); }' +
    '#fig-twin .fig-twin-num {' +
    ' margin: 6px 0 0; font-size: 40px; font-weight: 700; line-height: 1.05;' +
    ' letter-spacing: -0.02em; font-variant-numeric: tabular-nums;' +
    ' color: var(--ink, #f2f2f2); }' +
    '#fig-twin .fig-twin-sub {' +
    ' margin: 4px 0 0; font-size: 12px; line-height: 1.4;' +
    ' color: var(--secondary, #8a8a8a); }' +
    '@media (max-width: 560px) {' +
    ' #fig-twin .fig-twin-lbl { font-size: 9px; letter-spacing: 0.08em; min-height: 2.8em; }' +
    ' #fig-twin .fig-twin-num { font-size: 26px; }' +
    ' #fig-twin .fig-twin-sub { font-size: 10px; } }' +
    '</style>' +
    '<div class="fig-twin-wrap">' +
    '<canvas class="fig-twin-canvas" id="fig-twin-canvas" role="img" aria-label="Two identical disaster regions of sixty-four communities; on the left, communities dim to grey as the briefing stops carrying them, and on the right every community stays lit."></canvas>' +
    (pageA && pageB ? '' :
    '<div class="fig-twin-legends">' +
    '<div class="fig-twin-leg">' +
    '<p class="fig-twin-lbl">The loudest get in</p>' +
    '<p class="fig-twin-num" id="twin-count-a">8,935</p>' +
    '<p class="fig-twin-sub">of 16,299 people visible</p>' +
    '</div>' +
    '<div class="fig-twin-leg">' +
    '<p class="fig-twin-lbl">Neighbors carry each other</p>' +
    '<p class="fig-twin-num" id="twin-count-b">16,299</p>' +
    '<p class="fig-twin-sub">of 16,299 people visible</p>' +
    '</div>' +
    '</div>') +
    '</div>';

  var cv = document.getElementById("fig-twin-canvas");
  var numA = pageA || document.getElementById("twin-count-a");
  var numB = pageB || document.getElementById("twin-count-b");
  if (!cv || !numA || !numB) return;
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  var POS = data.world.pos;
  var POP = data.world.pop;
  var N = POS.length;

  /* ---- replay parameters ---- */
  var SAMPLES = 200;        /* ticks 0..398, sampled every 2 — exactly what the log holds */
  var MS = 100;             /* ms per sample */
  var PLAY = SAMPLES * MS;  /* 20 s of playback */
  var HOLD = 1000;          /* 1 s resting on the end state */
  var LOOP = PLAY + HOLD;
  var WIN = 120;            /* ticks. "the final stretch" — the window the published numbers use */
  var FADE = 300;           /* ms, member <-> non-member */
  var GLOW = 420;           /* ms, decay of the just-carried highlight */
  var A_OFF = 0.18, A_ON = 0.75;

  /* ---- build the replay tables from the real log. Pure data, computed once. ---- */
  function build(arm) {
    var top = arm.top, burn = arm.burn || [];
    var cur = [], seen = [], win = [], flip = [], lastBurn = [], burnMag = [];
    var popWin = new Float64Array(SAMPLES);
    var nWin = new Int16Array(SAMPLES);
    var lastSeen = new Int16Array(N); lastSeen.fill(-9999);
    var prevWin = new Uint8Array(N);
    var prevFlip = new Int16Array(N);
    var lastB = new Int16Array(N); lastB.fill(-9999);
    var magB = new Uint8Array(N);

    /* burns bucketed to the sample they land in, one ring per settlement per sample */
    var bmap = {};
    for (var q = 0; q < burn.length; q++) {
      var bt = burn[q][0], bi = burn[q][1];
      var bs = Math.floor(bt / 2);
      if (bs < 0 || bs >= SAMPLES) continue;
      var key = bs * 1000 + bi;
      bmap[key] = (bmap[key] || 0) + 1;
    }

    for (var s = 0; s < SAMPLES; s++) {
      var tick = s * 2;
      var members = top[tick] || top[String(tick)] || [];
      var c = new Uint8Array(N);
      for (var m = 0; m < members.length; m++) { c[members[m]] = 1; lastSeen[members[m]] = s; }
      var w = new Uint8Array(N);
      var f = new Int16Array(N);
      var ls = new Int16Array(N);
      var pw = 0, nw = 0;
      for (var i = 0; i < N; i++) {
        ls[i] = lastSeen[i] < 0 ? -1 : lastSeen[i];
        var inw = lastSeen[i] >= 0 && tick - lastSeen[i] * 2 <= WIN ? 1 : 0;
        w[i] = inw;
        if (s === 0) prevFlip[i] = 0;
        else if (inw !== prevWin[i]) prevFlip[i] = s;
        f[i] = prevFlip[i];
        prevWin[i] = inw;
        if (inw) { pw += POP[i]; nw++; }
        var bk = bmap[s * 1000 + i];
        if (bk) { lastB[i] = s; magB[i] = bk > 255 ? 255 : bk; }
        /* carried forward so a ring can still be fading on the next sample */
      }
      var lb = new Int16Array(N), mg = new Uint8Array(N);
      for (var j = 0; j < N; j++) { lb[j] = lastB[j] < 0 ? -1 : lastB[j]; mg[j] = magB[j]; }
      cur.push(c); win.push(w); flip.push(f); seen.push(ls);
      lastBurn.push(lb); burnMag.push(mg);
      popWin[s] = pw; nWin[s] = nw;
    }
    return { cur: cur, win: win, flip: flip, seen: seen, lastBurn: lastBurn, burnMag: burnMag, popWin: popWin, nWin: nWin };
  }

  var A = build(data.arms.erased);
  var B = build(data.arms.held);
  var TOTAL = 0, PMAX = 0;
  for (var t = 0; t < N; t++) { TOTAL += POP[t]; if (POP[t] > PMAX) PMAX = POP[t]; }

  /* fit the real coordinates to the panel square, aspect preserved — it is a map, not a chart */
  var NX = new Float64Array(N), NY = new Float64Array(N);
  (function () {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, i;
    for (i = 0; i < N; i++) {
      if (POS[i][0] < x0) x0 = POS[i][0];
      if (POS[i][0] > x1) x1 = POS[i][0];
      if (POS[i][1] < y0) y0 = POS[i][1];
      if (POS[i][1] > y1) y1 = POS[i][1];
    }
    var sp = Math.max(x1 - x0, y1 - y0) || 1;
    var dx = (sp - (x1 - x0)) / 2, dy = (sp - (y1 - y0)) / 2;
    for (i = 0; i < N; i++) {
      NX[i] = (POS[i][0] - x0 + dx) / sp;
      NY[i] = (POS[i][1] - y0 + dy) / sp;
    }
  })();
  var FINAL_A = A.popWin[SAMPLES - 1] | 0;
  var FINAL_B = B.popWin[SAMPLES - 1] | 0;

  function fmt(v) {
    var s = String(Math.round(v));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* ---- layout ---- */
  var W = 0, H = 0, panelW = 0, gut = 0, side = 0, oxA = 0, oxB = 0, oy = 0, rk = 1;
  var inset = 0, plot = 0;

  function layout() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h;
    gut = w * (40 / 720);
    panelW = (w - gut) / 2;
    var pad = Math.max(9, Math.min(panelW, H) * 0.085);
    side = Math.min(panelW, H) - 2 * pad;
    oy = (H - side) / 2;
    oxA = (panelW - side) / 2;
    oxB = panelW + gut + (panelW - side) / 2;
    rk = Math.max(0.62, side / 264);
    inset = 8 * rk;
    plot = side - 2 * inset;
    return true;
  }

  var R = new Float64Array(N);
  function radii() {
    for (var i = 0; i < N; i++) {
      var r = (2 + 4 * Math.sqrt(POP[i] / PMAX)) * rk;
      R[i] = r < 1.4 ? 1.4 : r;
    }
  }

  var INK = "242,242,242";
  function ease(u) { return 1 - Math.pow(1 - u, 3); }

  function panel(d, ox, playT, idx, breath) {
    /* the world's edge */
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(" + INK + ",0.10)";
    ctx.strokeRect(ox - 0.5, oy - 0.5, side, side);

    var win = d.win[idx], flip = d.flip[idx], seen = d.seen[idx];
    var lb = d.lastBurn[idx], mg = d.burnMag[idx];

    for (var i = 0; i < N; i++) {
      var x = ox + inset + NX[i] * plot;
      var y = oy + inset + NY[i] * plot;

      var on = win[i] === 1;
      var to = on ? A_ON : A_OFF, from = on ? A_OFF : A_ON;
      var p = (playT - flip[i] * MS) / FADE;
      if (p < 0) p = 0; else if (p > 1) p = 1;
      var base = from + (to - from) * ease(p);

      var g = 0;
      if (seen[i] >= 0) {
        var dt = playT - seen[i] * MS;
        if (dt >= 0) g = Math.exp(-dt / GLOW);
      }
      var a = (base + (1 - base) * g) * breath;
      /* a settlement the desk has lost recedes as well as dims */
      var rr = R[i] * (0.80 + 0.20 * ((base - A_OFF) / (A_ON - A_OFF)));

      ctx.fillStyle = "rgba(" + INK + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, 6.2831853);
      ctx.fill();

      /* burned report: one 1-px ring, 200 ms */
      if (lb[i] >= 0) {
        var age = playT - lb[i] * MS;
        if (age >= 0 && age < 200) {
          var f = age / 200;
          var ra = (1 - f) * (0.10 + 0.16 * Math.min(1, mg[i] / 12)) * breath;
          ctx.strokeStyle = "rgba(" + INK + "," + ra.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, R[i] + 2 + 5 * f, 0, 6.2831853);
          ctx.stroke();
        }
      }
    }
  }

  var shownA = "", shownB = "";

  function draw(T) {
    ctx.clearRect(0, 0, W, H);
    var playT = T < PLAY ? T : PLAY;
    var idx = Math.floor(playT / MS);
    if (idx > SAMPLES - 1) idx = SAMPLES - 1;

    /* one breath across the loop seam, so the restart reads as a beat and not a glitch */
    var breath = 1;
    if (T > LOOP - 260) breath = 1 - 0.72 * ((T - (LOOP - 260)) / 260);
    else if (T < 260) breath = 0.28 + 0.72 * (T / 260);

    panel(A, oxA, playT, idx, breath);
    panel(B, oxB, playT, idx, breath);

    /* the counters — people the desk can see, summed over the dots that are lit */
    var va, vb;
    if (T >= PLAY) { va = FINAL_A; vb = FINAL_B; }
    else {
      var fr = playT / MS - idx;
      var e = ease(fr < 0 ? 0 : fr > 1 ? 1 : fr);
      var pa = idx > 0 ? A.popWin[idx - 1] : A.popWin[0];
      var pb = idx > 0 ? B.popWin[idx - 1] : B.popWin[0];
      va = pa + (A.popWin[idx] - pa) * e;
      vb = pb + (B.popWin[idx] - pb) * e;
    }
    var sa = fmt(va), sb = fmt(vb);
    if (sa !== shownA) { numA.textContent = sa; shownA = sa; }
    if (sb !== shownB) { numB.textContent = sb; shownB = sb; }
  }

  /* ---- drive. One clock, both panels. ---- */
  var phase = 0, last = 0, raf = 0, running = false, visible = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function frame(ts) {
    if (!running) return;
    if (!last) last = ts;
    var dt = ts - last;
    if (dt > 64) dt = 64;
    last = ts;
    phase = (phase + dt) % LOOP;
    draw(phase);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running || reduce) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function relayout() { if (layout()) { radii(); draw(reduce ? PLAY : phase); } }

  if (window.ResizeObserver) new ResizeObserver(relayout).observe(cv);
  else window.addEventListener("resize", relayout);

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) { if (!W) { layout(); radii(); } if (reduce) draw(PLAY); else start(); }
      else stop();
    }, { rootMargin: "80px" }).observe(cv);
  } else { visible = true; }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (visible) start();
  });

  if (layout()) { radii(); if (reduce) draw(PLAY); else draw(0); }

  window.__fig_twin = { start: start, stop: stop };
})();
