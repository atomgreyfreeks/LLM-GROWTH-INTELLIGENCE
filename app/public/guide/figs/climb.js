/* climb — the five-level climb, adapted from GUIDE.html __fig1.
   Reports spawn on the ground row and rise stage to stage; most are admitted,
   some flare out at each boundary, ~2 admitted : 1 dropped. Deterministic. */
(function () {
  "use strict";
  if (window.__fig_climb) return;
  var host = document.getElementById("fig-climb");
  if (!host) return;

  host.innerHTML =
    '<style>' +
    '#fig-climb .fig-climb-wrap { position: relative; margin: 0; }' +
    '#fig-climb .fig-climb-canvas { display: block; width: 100%; aspect-ratio: 720 / 300; }' +
    '#fig-climb .fig-climb-lbl {' +
    ' position: absolute; left: 0; margin: 0; transform: translateY(-50%);' +
    ' font-size: 12px; line-height: 1; letter-spacing: 0.12em;' +
    ' text-transform: uppercase; color: var(--secondary, #8a8a8a);' +
    ' white-space: nowrap; pointer-events: none; }' +
    '@media (max-width: 560px) {' +
    ' #fig-climb .fig-climb-lbl { font-size: 9px; letter-spacing: 0.08em; } }' +
    '</style>' +
    '<div class="fig-climb-wrap">' +
    '<canvas class="fig-climb-canvas" id="fig-climb-canvas" role="img" aria-label="Reports rise from the ground through three summary levels to a single decision desk, and at every boundary some reports flare and die."></canvas>' +
    '<p class="fig-climb-lbl" style="top:10%">The decision desk</p>' +
    '<p class="fig-climb-lbl" style="top:30%">The briefing</p>' +
    '<p class="fig-climb-lbl" style="top:50%">Named</p>' +
    '<p class="fig-climb-lbl" style="top:70%">Surveyed</p>' +
    '<p class="fig-climb-lbl" style="top:90%">The ground</p>' +
    '</div>';

  var cv = document.getElementById("fig-climb-canvas");
  if (!cv) return;
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  /* mulberry32 — the only randomness source allowed */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- the ladder. level 0 = the decision desk, level 4 = the ground ---- */
  var COUNTS = [1, 4, 8, 12, 24];
  var SPAN = [0, 0.46, 0.66, 0.86, 1.0];
  var YF = [0.10, 0.30, 0.50, 0.70, 0.90];

  var LOOP = 8000;   /* ms, one full breath of the figure */
  var HOP = 900;     /* ms per level */
  var DWELL = 180;   /* ms resting on a level */
  var STEP = HOP + DWELL;
  var N = 58;        /* reports per loop */
  var ADMIT = 0.66;  /* sustained ~2 admitted : 1 burned at every boundary */
  var BURN_U = 0.58; /* burners stop between the rows */
  var FLARE = 300;   /* ms burst-and-fade */

  /* ---- the schedule. Seeded once; the render is a pure function of phase. ---- */
  var r = rng(0x5eed17);
  var parts = [];
  for (var n = 0; n < N; n++) {
    var spawn = (n / N) * LOOP + (r() - 0.5) * (LOOP / N) * 0.9;
    var slots = [Math.floor(r() * COUNTS[4])];
    var fate = 4; /* 4 = reaches the desk; 0..3 = burns at that boundary */
    for (var b = 0; b < 4; b++) {
      var from = COUNTS[4 - b];
      var to = COUNTS[3 - b];
      var s = Math.floor((slots[b] * to) / from);
      if (r() < 0.35) s += r() < 0.5 ? -1 : 1;
      slots.push(s < 0 ? 0 : s > to - 1 ? to - 1 : s);
      if (r() > ADMIT) { fate = b; break; }
    }
    var hops = fate === 4 ? 4 : fate + 1;
    var life = fate === 4 ? 4 * STEP + 420 : fate * STEP + HOP * BURN_U + FLARE;
    parts.push({ spawn: spawn, slots: slots, fate: fate, hops: hops, life: life });
  }

  /* ---- layout ---- */
  var W = 0, H = 0, x0 = 0, x1 = 0, rowW = 0, cx = 0, sc = 1;

  function layout() {
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h;
    x0 = w * 0.235 + 6;
    x1 = w - 8;
    rowW = x1 - x0;
    cx = (x0 + x1) / 2;
    sc = Math.max(0.72, Math.min(1.15, w / 720));
    return true;
  }

  function levelY(k) { return H * YF[k]; }
  function slotX(k, s) {
    var c = COUNTS[k];
    if (c === 1) return cx;
    var span = SPAN[k] * rowW;
    return cx - span / 2 + (span * s) / (c - 1);
  }
  function ease(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }

  var INK = "242,242,242";

  function draw(T) {
    ctx.clearRect(0, 0, W, H);

    /* the levels, faint */
    ctx.lineWidth = 1;
    for (var k = 0; k < 5; k++) {
      var y = levelY(k);
      var span = (SPAN[k] || 0.09) * rowW;
      ctx.strokeStyle = "rgba(" + INK + ",0.09)";
      ctx.beginPath();
      ctx.moveTo(cx - span / 2, y + 0.5);
      ctx.lineTo(cx + span / 2, y + 0.5);
      ctx.stroke();
      if (k > 0) {
        ctx.fillStyle = "rgba(" + INK + ",0.13)";
        for (var s = 0; s < COUNTS[k]; s++) {
          ctx.beginPath();
          ctx.arc(slotX(k, s), y, 1.3 * sc, 0, 6.2831853);
          ctx.fill();
        }
      }
    }
    /* the ground slots read a shade stronger — everything starts as somebody */
    ctx.fillStyle = "rgba(" + INK + ",0.22)";
    for (var g = 0; g < COUNTS[4]; g++) {
      ctx.beginPath();
      ctx.arc(slotX(4, g), levelY(4), 1.6 * sc, 0, 6.2831853);
      ctx.fill();
    }

    var desk = 0;
    var dotR = 2.7 * sc;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var tl = (T - p.spawn) % LOOP;
      if (tl < 0) tl += LOOP;
      if (tl > p.life) continue;

      var h = Math.floor(tl / STEP);
      if (h > p.hops - 1) h = p.hops - 1;
      var u = (tl - h * STEP) / HOP;
      if (u < 0) u = 0;
      var burning = p.fate !== 4 && h === p.fate;
      if (burning && u > BURN_U) u = BURN_U;
      else if (u > 1) u = 1;

      var lv0 = 4 - h, lv1 = 3 - h;
      var ax = slotX(lv0, p.slots[h]), ay = levelY(lv0);
      var bx = slotX(lv1, p.slots[h + 1]), by = levelY(lv1);
      var e = ease(u);
      var px = ax + (bx - ax) * e;
      var py = ay + (by - ay) * e;

      var alpha = 0.92;
      if (burning) {
        var age = tl - (p.fate * STEP + HOP * BURN_U);
        if (age > 0) {
          var f = age / FLARE;
          if (f > 1) f = 1;
          var fade = Math.pow(1 - f, 1.6);
          ctx.strokeStyle = "rgba(" + INK + "," + (0.75 * fade).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, (2.2 + 10 * f) * sc, 0, 6.2831853);
          ctx.stroke();
          alpha = 0.92 * fade;
        }
      } else if (p.fate === 4 && h === 3 && u >= 1) {
        var over = tl - 4 * STEP;
        if (over > 0) {
          var q = Math.exp(-over / 280);
          if (q > desk) desk = q;
          alpha = 0.92 * q;
        }
      }

      if (alpha <= 0.01) continue;

      /* a short trail, so the climb reads as motion and not as a scatter */
      if (u > 0.02 && u < 0.999) {
        var e2 = ease(Math.max(0, u - 0.10));
        ctx.strokeStyle = "rgba(" + INK + "," + (0.30 * alpha).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax + (bx - ax) * e2, ay + (by - ay) * e2);
        ctx.lineTo(px, py);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(" + INK + "," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, 6.2831853);
      ctx.fill();
    }

    /* the desk */
    var side = Math.max(12, Math.min(24, H * 0.085)) * (sc > 1 ? 1 : sc / 0.9);
    var dy = levelY(0);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "rgba(" + INK + "," + (0.30 + 0.62 * desk).toFixed(3) + ")";
    ctx.strokeRect(cx - side / 2, dy - side / 2, side, side);
    if (desk > 0.02) {
      ctx.fillStyle = "rgba(" + INK + "," + (0.16 * desk).toFixed(3) + ")";
      ctx.fillRect(cx - side / 2, dy - side / 2, side, side);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(" + INK + "," + (0.26 * desk).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(cx, dy, side * (0.7 + 0.55 * (1 - desk)), 0, 6.2831853);
      ctx.stroke();
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
    if (reduce) { draw(3260); return; }
    if (visible) start();
    else draw(phase);
  }

  if (window.ResizeObserver) new ResizeObserver(function () { if (layout()) draw(reduce ? 3260 : phase); }).observe(cv);
  else window.addEventListener("resize", function () { if (layout()) draw(reduce ? 3260 : phase); });

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) { if (!W) layout(); if (reduce) draw(3260); else start(); }
      else stop();
    }, { rootMargin: "80px" }).observe(cv);
  } else { visible = true; }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (visible) start();
  });

  window.__fig_climb = { start: start, stop: stop };
  boot();
})();
