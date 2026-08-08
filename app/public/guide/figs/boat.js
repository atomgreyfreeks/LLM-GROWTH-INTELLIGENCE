/* fig-boat — the same storm coast twice, one clock. The left desk flies to
   every disagreement before committing; the right commits from its two maps.
   Deterministic, seeded; both boats' whole voyages are precomputed. */
(function () {
  "use strict";
  if (window.__fig_boat) return;
  var host = document.getElementById("fig-boat");
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

  var ARIA = "Two copies of the same storm coast; the left boat detours to check every disagreement and reaches fewer people, while the right boat commits from its two maps and reaches more.";

  var style = document.createElement("style");
  style.textContent =
    '#fig-boat .gbo-root{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;}' +
    "#fig-boat .gbo-labels{display:flex;gap:5%;margin:0 0 10px;}" +
    "#fig-boat .gbo-lbl{flex:1 1 0;min-width:0;margin:0;font-size:12px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a8a;}" +
    "#fig-boat .gbo-canvas{display:block;width:100%;aspect-ratio:720/320;}" +
    "@media (max-width:560px){#fig-boat .gbo-lbl{font-size:9px;letter-spacing:0.08em;}}";
  host.appendChild(style);

  var root = document.createElement("div");
  root.className = "gbo-root";
  root.innerHTML =
    '<div class="gbo-labels"><p class="gbo-lbl">Go and look</p>' +
    '<p class="gbo-lbl">Two witnesses</p></div>' +
    '<canvas class="gbo-canvas" role="img" aria-label="' + ARIA + '"></canvas>';
  host.appendChild(root);
  var cv = root.querySelector("canvas");
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  /* ---- the world, in fixed virtual units so timing never depends on layout ---- */
  var VW = 340, VH = 320;
  var COAST = 118, LANE = 172;
  var LOOP = 18000;
  var STILL = 12600; /* reduced motion: deep in the poisoned season */
  var EXT = 45, HALF = 26; /* storm overshoot and half-width */
  var V = 0.085, VSLOW = 0.018;
  var WINDOW = 4300, DWELL = 330;
  var r = rng(0x0b0a7);

  /* settlements — 24, one row, shared by both panels */
  var SN = 24, sx = [], sy = [];
  for (var i = 0; i < SN; i++) {
    sx.push(16 + (i * (VW - 32)) / (SN - 1));
    sy.push(COAST + (r() * 4 - 2));
  }
  function stormX(T) { return -EXT + (T / LOOP) * (VW + 2 * EXT); }

  /* people in the water: a cluster spawns where the storm crosses a settlement */
  var clusters = [];
  for (i = 1; i <= 18; i++) {
    if (r() >= 0.55) continue;
    var ti = ((sx[i] + EXT) / (VW + 2 * EXT)) * LOOP;
    var n = 2 + Math.floor(r() * 3);
    var offs = [];
    for (var j = 0; j < n; j++) offs.push({ dx: (r() - 0.5) * 14, dy: r() * 9 });
    clusters.push({
      si: i, x: sx[i], y: COAST + 15 + r() * 9,
      n: n, offs: offs, spawn: ti, dead: ti + WINDOW,
      aL: -1, aR: -1, site: null
    });
  }

  /* rain streak offsets, fixed at init */
  var RAIN = [];
  for (i = 0; i < 10; i++) RAIN.push({ o: r() * 2 - 1, ph: r() });

  /* ---- itineraries. Same clusters, same speed; only the desk differs. ---- */
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

  function makeSchedule(left) {
    var segs = [];
    var t = 420, x = 8, y = LANE;
    function go(nx2, ny2, sp) {
      var d = dist(x, y, nx2, ny2);
      var dur = Math.max(1, d / sp);
      segs.push({ h: 0, t0: t, t1: t + dur, x0: x, y0: y, x1: nx2, y1: ny2 });
      t += dur; x = nx2; y = ny2;
    }
    for (var c = 0; c < clusters.length; c++) {
      var cl = clusters[c];
      var ready = cl.spawn + 120;
      if (t < ready) {
        var wx = cl.x - 20, wy = LANE;
        var dd = dist(x, y, wx, wy), maxd = (ready - t) * VSLOW;
        if (dd > maxd && dd > 0) { var f = maxd / dd; wx = x + (wx - x) * f; wy = y + (wy - y) * f; }
        segs.push({ h: 0, t0: t, t1: ready, x0: x, y0: y, x1: wx, y1: wy });
        t = ready; x = wx; y = wy;
      }
      var verify = left && (cl.spawn > 7600 ? true : r() < 0.35);
      if (verify) {
        var sgn = r() < 0.5 ? -1 : 1;
        var vx = Math.min(VW - 14, Math.max(14, cl.x + sgn * (26 + r() * 30)));
        var vy = COAST + 12;
        go(vx, vy, V);
        /* hover: the boat circles the disagreement before it will commit */
        var hr = 7, a0 = 0, turns = 1.6;
        var hcx = x - hr, hcy = y;
        segs.push({ h: 1, t0: t, t1: t + 800, cx: hcx, cy: hcy, r: hr, a0: a0, tu: turns });
        cl.site = { x: vx, y: vy, t0: cl.spawn + 200, t1: t + 800 };
        t += 800;
        var ang = a0 + turns * 6.2832;
        x = hcx + hr * Math.cos(ang); y = hcy + hr * Math.sin(ang);
      } else if (left) {
        r(); r(); /* keep the seeded stream aligned across branches */
      }
      go(cl.x, cl.y + 8, V);
      if (left) cl.aL = t; else cl.aR = t;
      t += DWELL;
    }
    var ex = VW - 10, ey = LANE;
    segs.push({ h: 0, t0: t, t1: t + dist(x, y, ex, ey) / VSLOW, x0: x, y0: y, x1: ex, y1: ey });
    return segs;
  }
  /* the right desk never draws from the stream, so order is safe */
  var schedR = makeSchedule(false);
  var schedL = makeSchedule(true);

  function posAt(segs, T) {
    if (!segs.length) return { x: 8, y: LANE };
    if (T <= segs[0].t0) return { x: segs[0].h ? segs[0].cx + segs[0].r : segs[0].x0, y: segs[0].h ? segs[0].cy : segs[0].y0 };
    for (var k = 0; k < segs.length; k++) {
      var s = segs[k];
      if (T > s.t1) continue;
      if (T >= s.t0) {
        var u = (T - s.t0) / (s.t1 - s.t0);
        if (s.h) {
          var ang = s.a0 + u * s.tu * 6.2832;
          return { x: s.cx + s.r * Math.cos(ang), y: s.cy + s.r * Math.sin(ang) };
        }
        return { x: s.x0 + (s.x1 - s.x0) * u, y: s.y0 + (s.y1 - s.y0) * u };
      }
      /* between segments: hold at the previous end */
      var pr = segs[k - 1];
      if (!pr) return { x: s.x0, y: s.y0 };
      if (pr.h) {
        var an = pr.a0 + pr.tu * 6.2832;
        return { x: pr.cx + pr.r * Math.cos(an), y: pr.cy + pr.r * Math.sin(an) };
      }
      return { x: pr.x1, y: pr.y1 };
    }
    var lastSeg = segs[segs.length - 1];
    if (lastSeg.h) {
      var a2 = lastSeg.a0 + lastSeg.tu * 6.2832;
      return { x: lastSeg.cx + lastSeg.r * Math.cos(a2), y: lastSeg.cy + lastSeg.r * Math.sin(a2) };
    }
    return { x: lastSeg.x1, y: lastSeg.y1 };
  }

  /* ---- layout ---- */
  var W = 0, H = 0, pw = 0, gut = 0, oxs = [0, 0], kx = 1, ky = 1, sc = 1;
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
    kx = pw / VW; ky = H / VH;
    sc = Math.max(0.72, Math.min(1.15, w / 720));
    return true;
  }
  function px(side, vx) { return oxs[side] + vx * kx; }
  function py(vy) { return vy * ky; }

  var INK = "242,242,242";

  function drawPanel(side, T, edge) {
    var segs = side === 0 ? schedL : schedR;
    var c, k, cl, a;

    /* coast line and settlements — the skeleton that survives the loop reset */
    ctx.strokeStyle = "rgba(" + INK + ",0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px(side, 6), py(COAST) + 0.5);
    ctx.lineTo(px(side, VW - 6), py(COAST) + 0.5);
    ctx.stroke();
    for (k = 0; k < SN; k++) {
      var lit = 0.35;
      for (c = 0; c < clusters.length; c++) {
        cl = clusters[c];
        a = side === 0 ? cl.aL : cl.aR;
        if (cl.si === k && a > 0 && a <= cl.dead && T >= a) lit = 0.9;
      }
      ctx.fillStyle = "rgba(" + INK + "," + (lit === 0.35 ? lit : lit * edge + 0.35 * (1 - edge)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(px(side, sx[k]), py(sy[k]), 1.6 * sc, 0, 6.2832);
      ctx.fill();
    }

    ctx.globalAlpha = edge;

    /* the storm band, drifting on the shared clock */
    var xs = stormX(T);
    var gx = px(side, xs);
    var rpx = (HALF + 14) * kx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(oxs[side], 0, pw, H);
    ctx.clip();
    ctx.translate(gx, py(178));
    ctx.scale(1, (py(304) - py(58)) / (2 * rpx));
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rpx);
    grad.addColorStop(0, "rgba(" + INK + ",0.09)");
    grad.addColorStop(0.7, "rgba(" + INK + ",0.045)");
    grad.addColorStop(1, "rgba(" + INK + ",0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rpx, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    for (k = 0; k < RAIN.length; k++) {
      var rx = xs + RAIN[k].o * HALF * 1.5;
      if (rx < 4 || rx > VW - 4) continue;
      var vv = (RAIN[k].ph + T * 0.00055) % 1;
      var ry = 66 + vv * (VH - 104);
      ctx.strokeStyle = "rgba(" + INK + "," + (0.05 * (1 - Math.abs(RAIN[k].o) * 0.5)).toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(px(side, rx), py(ry));
      ctx.lineTo(px(side, rx - 2), py(ry + 7));
      ctx.stroke();
    }

    /* disagreement sites (left only): a faint ring until the boat has looked */
    if (side === 0) {
      for (c = 0; c < clusters.length; c++) {
        cl = clusters[c];
        if (!cl.site) continue;
        var s0 = cl.site.t0, s1 = cl.site.t1;
        if (T < s0 || T > s1 + 300) continue;
        var sa = T > s1 ? 0.15 * (1 - (T - s1) / 300) : 0.15;
        ctx.strokeStyle = "rgba(" + INK + "," + sa.toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px(side, cl.site.x), py(cl.site.y), 5 * sc, 0, 6.2832);
        ctx.stroke();
      }
    }

    /* the boat's wake — sampled path, fading with age; hovers read as knots */
    ctx.lineWidth = 1;
    var prev = null;
    for (var ts = Math.max(0, T - 6000); ts <= T; ts += 90) {
      var pp = posAt(segs, ts);
      if (prev) {
        var age = T - ts;
        ctx.strokeStyle = "rgba(" + INK + "," + (0.28 * (1 - age / 6000)).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(px(side, prev.x), py(prev.y));
        ctx.lineTo(px(side, pp.x), py(pp.y));
        ctx.stroke();
      }
      prev = pp;
    }
    var bp = posAt(segs, T);

    /* people in the water */
    for (c = 0; c < clusters.length; c++) {
      cl = clusters[c];
      if (T < cl.spawn) continue;
      a = side === 0 ? cl.aL : cl.aR;
      var saved = a > 0 && a <= cl.dead;
      for (var jj = 0; jj < cl.n; jj++) {
        var ox2 = cl.x + cl.offs[jj].dx, oy2 = cl.y + cl.offs[jj].dy;
        var bob = Math.sin(T * 0.004 + jj * 2.1 + cl.si) * 1.2;
        if (saved && T >= a) {
          var u2 = Math.min(1, (T - a) / 650);
          var e2 = u2 < 0.5 ? 4 * u2 * u2 * u2 : 1 - Math.pow(-2 * u2 + 2, 3) / 2;
          var tx2 = cl.x + (jj - (cl.n - 1) / 2) * 4, ty2 = COAST - 5;
          ctx.fillStyle = "rgba(" + INK + ",0.95)";
          ctx.beginPath();
          ctx.arc(px(side, ox2 + (tx2 - ox2) * e2), py(oy2 + (ty2 - oy2) * e2), 1.7 * sc, 0, 6.2832);
          ctx.fill();
        } else if (!saved && T >= cl.dead) {
          var f2 = (T - cl.dead) / 300;
          if (f2 < 1) {
            ctx.strokeStyle = "rgba(" + INK + "," + (0.7 * (1 - f2)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px(side, ox2), py(oy2 + bob), (2 + 7 * f2) * sc, 0, 6.2832);
            ctx.stroke();
          }
        } else {
          var ra = Math.min(1, (T - cl.spawn) / 250) * 0.7;
          ctx.fillStyle = "rgba(" + INK + "," + ra.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(px(side, ox2), py(oy2 + bob), 1.4 * sc, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    /* the boat */
    ctx.fillStyle = "rgba(" + INK + ",0.95)";
    ctx.beginPath();
    ctx.arc(px(side, bp.x), py(bp.y), 3 * sc, 0, 6.2832);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function draw(T) {
    ctx.clearRect(0, 0, W, H);
    var edge = T > LOOP - 500 ? Math.max(0, (LOOP - T) / 500) : 1;
    drawPanel(0, T, edge);
    drawPanel(1, T, edge);
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

  window.__fig_boat = { start: start, stop: stop };
  boot();
})();
