/* fig-map — the same rescue region twice, one clock. The left desk's crews
   walk clean straight lines and ten deadline rings run out; the right desk
   turns its crews around and meets every one. Deterministic, seeded. */
(function () {
  "use strict";
  if (window.__fig_map) return;
  var host = document.getElementById("fig-map");
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

  var ARIA = "Two copies of the same rescue region; the left desk's straight routes let ten deadline rings run out, while the right desk's crews double back and meet every deadline.";

  var style = document.createElement("style");
  style.textContent =
    '#fig-map .gmp-root{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;}' +
    "#fig-map .gmp-labels{display:flex;gap:5%;margin:0 0 10px;}" +
    "#fig-map .gmp-lbl{flex:1 1 0;min-width:0;margin:0;font-size:12px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#8a8a8a;}" +
    "#fig-map .gmp-canvas{display:block;width:100%;aspect-ratio:720/320;}" +
    "@media (max-width:560px){#fig-map .gmp-lbl{font-size:9px;letter-spacing:0.08em;}}";
  host.appendChild(style);

  var root = document.createElement("div");
  root.className = "gmp-root";
  root.innerHTML =
    '<div class="gmp-labels"><p class="gmp-lbl">The tidy desk</p>' +
    '<p class="gmp-lbl">Turn them around</p></div>' +
    '<canvas class="gmp-canvas" role="img" aria-label="' + ARIA + '"></canvas>';
  host.appendChild(root);
  var cv = root.querySelector("canvas");
  var ctx = cv.getContext("2d");
  if (!ctx) return;

  /* ---- the world, in fixed virtual units so timing never depends on layout ---- */
  var VW = 340, VH = 320;
  var LOOP = 16000;
  var STILL = 12400; /* reduced motion: hollow towns left, doubled trails right */
  var V2 = 0.075, DWELL = 260;
  var r = rng(0x3a9d1);

  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

  /* the tidy desk's crews: three straight sweeps, never a turn */
  var LINES = [
    { x0: 24, y0: 66, x1: 322, y1: 150 },
    { x0: 30, y0: 278, x1: 325, y1: 52 },
    { x0: 14, y0: 180, x1: 330, y1: 262 }
  ];
  function linePos(k, T) {
    var L = LINES[k], u = T / LOOP;
    return { x: L.x0 + (L.x1 - L.x0) * u, y: L.y0 + (L.y1 - L.y0) * u };
  }
  function segDist(px2, py2, L) {
    var dx = L.x1 - L.x0, dy = L.y1 - L.y0;
    var t = ((px2 - L.x0) * dx + (py2 - L.y0) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return dist(px2, py2, L.x0 + dx * t, L.y0 + dy * t);
  }

  /* ---- twenty towns. Four sit on the sweep lines and get served on the left;
     sixteen sit clear of every line, and ten of those hold the emergencies the
     tidy desk will lose. ---- */
  var towns = [], ems = [];
  var ONLINE = [
    { k: 0, f: 0.24 }, { k: 1, f: 0.38 }, { k: 2, f: 0.55 }, { k: 1, f: 0.74 }
  ];
  var oi, ti2;
  for (oi = 0; oi < ONLINE.length; oi++) {
    var pass = ONLINE[oi].f * LOOP;
    var pp = linePos(ONLINE[oi].k, pass);
    var txn = pp.x + (r() * 6 - 3), tyn = pp.y + (r() * 6 - 3);
    towns.push({ x: txn, y: tyn });
    ems.push({ town: towns.length - 1, x: txn, y: tyn, start: pass - 1500, window: 3500, sL: pass - 250, sR: -1 });
  }
  for (ti2 = 0; ti2 < 16; ti2++) {
    var bx = 0, by = 0, ok = false;
    for (var at = 0; at < 60 && !ok; at++) {
      bx = 18 + r() * (VW - 36);
      by = 24 + r() * (VH - 48);
      ok = true;
      for (var lk = 0; lk < 3; lk++) if (segDist(bx, by, LINES[lk]) < 16) ok = false;
      for (var tk = 0; tk < towns.length; tk++) if (dist(bx, by, towns[tk].x, towns[tk].y) < 26) ok = false;
    }
    towns.push({ x: bx, y: by });
  }
  for (ti2 = 0; ti2 < 10; ti2++) {
    var tw = towns[4 + ti2];
    ems.push({ town: 4 + ti2, x: tw.x, y: tw.y, start: 900 + ti2 * 980 + r() * 260, window: 3400, sL: -1, sR: -1 });
  }
  ems.sort(function (a, b) { return a.start - b.start; });

  /* ---- the right desk: three crews from hubs, assigned greedily, always
     willing to turn around and re-walk their own ground ---- */
  var HUBS = [{ x: 80, y: 70 }, { x: 255, y: 95 }, { x: 165, y: 255 }];
  var crews = [];
  for (var ci = 0; ci < 3; ci++) {
    crews.push({ x: HUBS[ci].x, y: HUBS[ci].y, hx: HUBS[ci].x, hy: HUBS[ci].y, free: 500, segs: [] });
  }
  function retreatPos(c, td) {
    var d = dist(c.x, c.y, c.hx, c.hy);
    var step = V2 * 0.8 * (td - c.free);
    if (step >= d || d < 0.5) return { x: c.hx, y: c.hy };
    var f = step / d;
    return { x: c.x + (c.hx - c.x) * f, y: c.y + (c.hy - c.y) * f };
  }
  for (var ei = 0; ei < ems.length; ei++) {
    var em = ems[ei];
    var best = null;
    for (ci = 0; ci < 3; ci++) {
      var c2 = crews[ci];
      var td = Math.max(c2.free, em.start + 120);
      var p2 = retreatPos(c2, td);
      var arr = td + dist(p2.x, p2.y, em.x, em.y) / V2;
      if (!best || arr < best.arr) best = { c: c2, td: td, p: p2, arr: arr };
    }
    if (best.arr > em.start + em.window - 300) em.window = best.arr - em.start + 300;
    var cc = best.c;
    if (best.td > cc.free) {
      var dh = dist(cc.x, cc.y, cc.hx, cc.hy);
      var tHub = cc.free + dh / (V2 * 0.8);
      if (tHub <= best.td) {
        if (dh > 0.5) cc.segs.push({ t0: cc.free, t1: tHub, x0: cc.x, y0: cc.y, x1: cc.hx, y1: cc.hy });
        cc.x = cc.hx; cc.y = cc.hy;
      } else {
        cc.segs.push({ t0: cc.free, t1: best.td, x0: cc.x, y0: cc.y, x1: best.p.x, y1: best.p.y });
        cc.x = best.p.x; cc.y = best.p.y;
      }
    }
    cc.segs.push({ t0: best.td, t1: best.arr, x0: cc.x, y0: cc.y, x1: em.x, y1: em.y });
    em.sR = best.arr;
    cc.x = em.x; cc.y = em.y; cc.free = best.arr + DWELL;
  }
  for (ci = 0; ci < 3; ci++) {
    var c3 = crews[ci];
    var dh2 = dist(c3.x, c3.y, c3.hx, c3.hy);
    if (dh2 > 0.5) c3.segs.push({ t0: c3.free, t1: c3.free + dh2 / (V2 * 0.8), x0: c3.x, y0: c3.y, x1: c3.hx, y1: c3.hy });
  }
  function segsPos(segs, T) {
    if (!segs.length) return { x: 0, y: 0 };
    if (T <= segs[0].t0) return { x: segs[0].x0, y: segs[0].y0 };
    for (var k = 0; k < segs.length; k++) {
      var s = segs[k];
      if (T > s.t1) continue;
      if (T >= s.t0) {
        var u = (T - s.t0) / (s.t1 - s.t0);
        return { x: s.x0 + (s.x1 - s.x0) * u, y: s.y0 + (s.y1 - s.y0) * u };
      }
      var pr = segs[k - 1];
      return pr ? { x: pr.x1, y: pr.y1 } : { x: s.x0, y: s.y0 };
    }
    var lastSeg = segs[segs.length - 1];
    return { x: lastSeg.x1, y: lastSeg.y1 };
  }

  /* trails: sampled once at init, drawn with age fade every frame */
  var SAMP = 90;
  var NSAMP = Math.floor(LOOP / SAMP) + 1;
  var trailL = [], trailR = [];
  for (ci = 0; ci < 3; ci++) {
    var tl = [], tr = [];
    for (var si = 0; si < NSAMP; si++) {
      tl.push(linePos(ci, si * SAMP));
      tr.push(segsPos(crews[ci].segs, si * SAMP));
    }
    trailL.push(tl);
    trailR.push(tr);
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
    var k, i2, em;

    /* towns — the skeleton that survives the loop reset */
    ctx.fillStyle = "rgba(" + INK + ",0.3)";
    for (k = 0; k < towns.length; k++) {
      ctx.beginPath();
      ctx.arc(px(side, towns[k].x), py(towns[k].y), 1.7 * sc, 0, 6.2832);
      ctx.fill();
    }

    ctx.globalAlpha = edge;

    /* crew trails, age-faded; re-walked ground accumulates and reads brighter */
    var trails = side === 0 ? trailL : trailR;
    ctx.lineWidth = 1.1;
    var iMax = Math.min(NSAMP - 1, Math.floor(T / SAMP));
    var iMin = Math.max(1, Math.floor((T - 6500) / SAMP));
    for (k = 0; k < 3; k++) {
      var tr2 = trails[k];
      for (i2 = iMin; i2 <= iMax; i2++) {
        var age = T - i2 * SAMP;
        ctx.strokeStyle = "rgba(" + INK + "," + (0.12 * (1 - age / 6500)).toFixed(3) + ")";
        ctx.beginPath();
        ctx.moveTo(px(side, tr2[i2 - 1].x), py(tr2[i2 - 1].y));
        ctx.lineTo(px(side, tr2[i2].x), py(tr2[i2].y));
        ctx.stroke();
      }
    }

    /* emergencies: shrinking deadline rings, serve pulses, expiry flares */
    for (i2 = 0; i2 < ems.length; i2++) {
      em = ems[i2];
      if (T < em.start) continue;
      var ex = px(side, em.x), ey = py(em.y);
      var sT = side === 0 ? em.sL : em.sR;
      var served = sT > 0;
      var expire = em.start + em.window;
      var endT = served ? sT : expire;

      if (T < endT) {
        var frac = (T - em.start) / em.window;
        var rad = (4 + 12 * (1 - frac)) * sc;
        ctx.strokeStyle = "rgba(" + INK + "," + (0.4 + 0.25 * frac).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ex, ey, rad, 0, 6.2832); ctx.stroke();
      } else if (served) {
        var w2 = (T - sT) / 220;
        if (w2 < 1) {
          ctx.strokeStyle = "rgba(" + INK + "," + (0.6 * (1 - w2)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(ex, ey, (2 + 4 * (1 - w2)) * sc, 0, 6.2832); ctx.stroke();
        }
        ctx.fillStyle = "rgba(" + INK + ",0.9)";
        ctx.beginPath(); ctx.arc(ex, ey, 2.2 * sc, 0, 6.2832); ctx.fill();
      } else {
        var f2 = (T - expire) / 300;
        if (f2 < 1) {
          ctx.strokeStyle = "rgba(" + INK + "," + (0.7 * (1 - f2)).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(ex, ey, (3 + 10 * f2) * sc, 0, 6.2832); ctx.stroke();
        }
        ctx.strokeStyle = "rgba(" + INK + ",0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(ex, ey, 3 * sc, 0, 6.2832); ctx.stroke();
      }
    }

    /* the crews */
    ctx.fillStyle = "rgba(" + INK + ",0.9)";
    for (k = 0; k < 3; k++) {
      var cp = side === 0 ? linePos(k, T) : segsPos(crews[k].segs, T);
      ctx.beginPath();
      ctx.arc(px(side, cp.x), py(cp.y), 2.2 * sc, 0, 6.2832);
      ctx.fill();
    }

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

  window.__fig_map = { start: start, stop: stop };
  boot();
})();
