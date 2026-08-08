/* fig-bridge — two evidence pyramids, same budget, same damage; only the one
   that kept records of its cuts can relight its paths. Deterministic, seeded. */
(function () {
  "use strict";
  if (window.__fig_bridge) return;
  var host = document.getElementById("fig-bridge");
  if (!host) return;

  /* mulberry32 — the only randomness source allowed */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var ARIA = "Two pyramids of evidence built from the same budget; after the same damage, the right pyramid relights its cut links from saved records while the left pyramid's breaks stay dark.";

  var style = document.createElement("style");
  style.textContent =
    '#fig-bridge .gbr-root{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;}' +
    "#fig-bridge .gbr-labels{display:flex;gap:5%;margin:0 0 10px;}" +
    "#fig-bridge .gbr-lbl{flex:1 1 0;min-width:0;margin:0;font-size:12px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a8a;}" +
    "#fig-bridge .gbr-canvas{display:block;width:100%;aspect-ratio:720/340;}" +
    "@media (max-width:560px){#fig-bridge .gbr-lbl{font-size:9px;letter-spacing:0.08em;}}";
  host.appendChild(style);

  var root = document.createElement("div");
  root.className = "gbr-root";
  root.innerHTML =
    '<div class="gbr-labels"><p class="gbr-lbl">The strongest support wins</p>' +
    '<p class="gbr-lbl">Neighbors carry the proof</p></div>' +
    '<canvas class="gbr-canvas" role="img" aria-label="' + ARIA + '"></canvas>';
  host.appendChild(root);
  var cv = root.querySelector("canvas");
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  /* ---- the shape. level 0 = ground (16), level 4 = the one claim on top ---- */
  var COUNTS = [16, 8, 4, 2, 1];
  var YF = [0.90, 0.71, 0.52, 0.33, 0.15];
  var SPANF = [0.92, 0.78, 0.55, 0.30, 0];
  var LOOP = 16000;
  var STILL = 10300; /* reduced motion: mid-repair, both fates visible */
  var r = rng(0x1b7ac3);

  /* ---- wiring, both pyramids from one seed. Left: one thick thread to the
     best source. Right: two spread threads plus ghost records of the cuts. ---- */
  var leftLinks = [], rightLinks = [];
  var bestOf = {};
  var slot = 0;
  for (var lvl = 1; lvl <= 4; lvl++) {
    for (var p = 0; p < COUNTS[lvl]; p++) {
      var bt = 420 + slot * 236;
      var c0 = 2 * p, c1 = 2 * p + 1;
      var best = r() < 0.5 ? c0 : c1;
      bestOf[lvl + ":" + p] = best;
      leftLinks.push({ lvl: lvl, p: p, c: best, buildT: bt, brT: -1, ghost: false, relT: -1 });
      rightLinks.push({ lvl: lvl, p: p, c: c0, ghost: false, buildT: bt, brT: -1, relT: -1 });
      rightLinks.push({ lvl: lvl, p: p, c: c1, ghost: false, buildT: bt + 140, brT: -1, relT: -1 });
      var gmax = COUNTS[lvl - 1] - 1, gc = [], kept = [], gi;
      if (2 * p - 1 >= 0) gc.push(2 * p - 1);
      if (2 * p + 2 <= gmax) gc.push(2 * p + 2);
      for (gi = 0; gi < gc.length; gi++) if (r() < 0.85) kept.push(gc[gi]);
      if (!kept.length && gc.length) kept.push(gc[0]);
      for (gi = 0; gi < kept.length; gi++)
        rightLinks.push({ lvl: lvl, p: p, c: kept[gi], ghost: true, buildT: bt + 240 + gi * 90, brT: -1, relT: -1 });
      slot++;
    }
  }

  /* ---- the same workers die in both pyramids ---- */
  var kills = [];
  var kp = [1, 4, 6];
  for (var ki = 0; ki < 3; ki++) kills.push({ lvl: 0, i: bestOf["1:" + kp[ki]] });
  kills.push({ lvl: 1, i: 2 });
  kills.push({ lvl: 1, i: 5 });
  kills.sort(function (a, b) { return a.lvl - b.lvl || a.i - b.i; });
  for (ki = 0; ki < kills.length; ki++) kills[ki].deathT = 6300 + ki * 170;
  function deathOf(l, i) {
    for (var k = 0; k < kills.length; k++) if (kills[k].lvl === l && kills[k].i === i) return kills[k].deathT;
    return -1;
  }
  function markBreaks(list) {
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      var t = Math.max(deathOf(L.lvl - 1, L.c), deathOf(L.lvl, L.p));
      if (t > 0) L.brT = t;
    }
  }
  markBreaks(leftLinks);
  markBreaks(rightLinks);

  /* ---- repair: for every cut white thread whose parent survives, one saved
     ghost record relights toward a living source. The left recorded nothing. ---- */
  var relSeq = 0;
  for (var iw = 0; iw < rightLinks.length; iw++) {
    var Lw = rightLinks[iw];
    if (Lw.ghost || Lw.brT < 0) continue;
    if (deathOf(Lw.lvl, Lw.p) > 0) continue;
    for (var jg = 0; jg < rightLinks.length; jg++) {
      var G = rightLinks[jg];
      if (!G.ghost || G.lvl !== Lw.lvl || G.p !== Lw.p) continue;
      if (G.brT > 0 || G.relT >= 0) continue;
      G.relT = 8500 + relSeq * 430;
      relSeq++;
      break;
    }
  }

  /* first moment each node is held by a built thread, per side */
  var liveL = {}, liveR = {};
  function feed(map, l, i, t) {
    var k = l + ":" + i;
    if (!(k in map) || t < map[k]) map[k] = t;
  }
  for (var a1 = 0; a1 < leftLinks.length; a1++) {
    var A = leftLinks[a1];
    feed(liveL, A.lvl, A.p, A.buildT + 400);
    feed(liveL, A.lvl - 1, A.c, A.buildT + 400);
  }
  for (var a2 = 0; a2 < rightLinks.length; a2++) {
    var B = rightLinks[a2];
    if (B.ghost) continue;
    feed(liveR, B.lvl, B.p, B.buildT + 400);
    feed(liveR, B.lvl - 1, B.c, B.buildT + 400);
  }

  /* ---- layout ---- */
  var W = 0, H = 0, pw = 0, gut = 0, oxs = [0, 0], sc = 1;
  function layout() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h;
    gut = Math.round(w * 0.05);
    pw = (w - gut) / 2;
    oxs = [0, pw + gut];
    sc = Math.max(0.72, Math.min(1.15, w / 720));
    return true;
  }
  function nx(side, l, i) {
    var cx = oxs[side] + pw / 2, c = COUNTS[l];
    if (c === 1) return cx;
    var span = SPANF[l] * pw;
    return cx - span / 2 + (span * i) / (c - 1);
  }
  function ny(l) { return H * YF[l]; }
  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

  var INK = "242,242,242";

  function drawLink(side, L, T) {
    if (T < L.buildT) return;
    var x1 = nx(side, L.lvl - 1, L.c), y1 = ny(L.lvl - 1); /* child below */
    var x2 = nx(side, L.lvl, L.p), y2 = ny(L.lvl);         /* parent above */
    if (L.lvl === 4) {
      /* stop at the claim square's edge instead of entering it */
      var dl = Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2)) || 1;
      x2 += ((x1 - x2) / dl) * 7 * sc;
      y2 += ((y1 - y2) / dl) * 7 * sc;
    }
    var dur = L.ghost ? 300 : 400;
    var u = Math.min(1, (T - L.buildT) / dur);
    var e = ease(u);
    var hx = x1 + (x2 - x1) * e, hy = y1 + (y2 - y1) * e;

    /* relight in progress: bright stroke chases down the saved record */
    if (L.relT >= 0 && T > L.relT) {
      var v = Math.min(1, (T - L.relT) / 760);
      var ev = ease(v);
      var mx = x2 + (x1 - x2) * ev, my = y2 + (y1 - y2) * ev;
      if (v < 1) {
        ctx.strokeStyle = "rgba(" + INK + ",0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(" + INK + ",0.95)";
      ctx.lineWidth = (v < 1 ? 2.2 : 1.9) * sc;
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(mx, my); ctx.stroke();
      if (v < 1) {
        ctx.fillStyle = "rgba(" + INK + ",0.95)";
        ctx.beginPath(); ctx.arc(mx, my, 2.6 * sc, 0, 6.2832); ctx.fill();
      } else {
        var w2 = (T - L.relT - 760) / 260;
        if (w2 < 1) {
          ctx.strokeStyle = "rgba(" + INK + "," + (0.5 * (1 - w2)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x1, y1, (2 + 7 * w2) * sc, 0, 6.2832); ctx.stroke();
        }
      }
      return;
    }

    var alpha, wdt;
    if (side === 0) { alpha = 0.85; wdt = 2.4 * sc; }
    else if (!L.ghost) { alpha = 0.8; wdt = 1.2; }
    else {
      var g = Math.min(1, Math.max(0, (T - L.buildT - dur) / 600));
      alpha = 0.5 - 0.32 * g; /* the discarded thread dims to its record */
      wdt = 1;
    }
    if (L.brT > 0 && T > L.brT) {
      var k = Math.min(1, (T - L.brT) / 400);
      alpha = alpha + (0.16 - alpha) * k;
      wdt = wdt + (1 - wdt) * k;
    }
    ctx.strokeStyle = "rgba(" + INK + "," + alpha.toFixed(3) + ")";
    ctx.lineWidth = wdt;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
    if (u < 1 && !L.ghost) {
      ctx.fillStyle = "rgba(" + INK + ",0.9)";
      ctx.beginPath(); ctx.arc(hx, hy, 1.7 * sc, 0, 6.2832); ctx.fill();
    }
  }

  function draw(T) {
    ctx.clearRect(0, 0, W, H);
    var edge = T > LOOP - 500 ? Math.max(0, (LOOP - T) / 500) : 1;

    for (var side = 0; side < 2; side++) {
      /* skeleton slots — always present, so the loop reset is a cross-fade */
      var l, i;
      for (l = 0; l < 5; l++) {
        ctx.fillStyle = "rgba(" + INK + "," + (l === 0 ? 0.20 : 0.13) + ")";
        for (i = 0; i < COUNTS[l]; i++) {
          ctx.beginPath();
          ctx.arc(nx(side, l, i), ny(l), (l === 0 ? 1.6 : 1.3) * sc, 0, 6.2832);
          ctx.fill();
        }
      }

      ctx.globalAlpha = edge;
      var list = side === 0 ? leftLinks : rightLinks;
      for (i = 0; i < list.length; i++) drawLink(side, list[i], T);

      /* nodes: lit when held, flaring when killed, hollow after */
      var mapLive = side === 0 ? liveL : liveR;
      for (l = 0; l < 4; l++) {
        for (i = 0; i < COUNTS[l]; i++) {
          var lt = mapLive[l + ":" + i];
          if (lt === undefined || T < lt) continue;
          var x = nx(side, l, i), y = ny(l);
          var dT = deathOf(l, i);
          if (dT > 0 && T >= dT) {
            var f = Math.min(1, (T - dT) / 300);
            if (f < 1) {
              ctx.strokeStyle = "rgba(" + INK + "," + (0.8 * (1 - f)).toFixed(3) + ")";
              ctx.lineWidth = 1;
              ctx.beginPath(); ctx.arc(x, y, (2 + 10 * f) * sc, 0, 6.2832); ctx.stroke();
            }
            ctx.strokeStyle = "rgba(" + INK + ",0.25)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, 2.3 * sc, 0, 6.2832); ctx.stroke();
          } else {
            var na = Math.min(1, (T - lt) / 250) * 0.65;
            ctx.fillStyle = "rgba(" + INK + "," + na.toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(x, y, 2.0 * sc, 0, 6.2832); ctx.fill();
          }
        }
      }

      /* the claim on top: a small square, dimmed forever on the left after the
         damage, restored on the right once the records have been replayed */
      var tx = nx(side, 4, 0), ty = ny(4), sd = 10 * sc;
      var lt4 = mapLive["4:0"];
      var built4 = lt4 !== undefined && T >= lt4;
      var sAl = built4 ? 0.75 : 0.35;
      if (built4 && T > 7600) {
        if (side === 0) sAl = 0.42;
        else if (T < 11800) sAl = 0.55;
      }
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(" + INK + "," + sAl.toFixed(3) + ")";
      ctx.strokeRect(tx - sd / 2, ty - sd / 2, sd, sd);
      if (built4 && sAl > 0.5) {
        ctx.fillStyle = "rgba(" + INK + ",0.14)";
        ctx.fillRect(tx - sd / 2, ty - sd / 2, sd, sd);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---- drive ---- */
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
  function start() {
    if (running || reduce) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function boot() {
    if (!layout()) return;
    if (reduce) { draw(STILL); return; }
    if (visible) start();
    else draw(phase);
  }

  if (window.ResizeObserver) new ResizeObserver(function () { if (layout()) draw(reduce ? STILL : phase); }).observe(cv);
  else window.addEventListener("resize", function () { if (layout()) draw(reduce ? STILL : phase); });

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) { if (!W) layout(); if (reduce) draw(STILL); else start(); }
      else stop();
    }, { rootMargin: "80px" }).observe(cv);
  } else { visible = true; }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (visible) start();
  });

  window.__fig_bridge = { start: start, stop: stop };
  boot();
})();
