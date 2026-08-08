/* organisms — eight small living simulations, one per growth rule.
   Ported from the fleetgrowth reference algorithms, monochrome and seeded. */
(function () {
  "use strict";
  if (window.__fig_organisms) return;
  var host = document.getElementById("fig-organisms");
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

  var S = 160;                       /* internal units per cell, square */
  var TAU = Math.PI * 2;
  var STEP = 1 / 60;
  var FADE = 0.6;                    /* soft reset cross-fade, seconds */
  var INK = "#f2f2f2";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function W(m, a, b) { return a + m.r() * (b - a); }           /* seeded uniform */
  function white(a) { return "rgba(242,242,242," + a.toFixed(3) + ")"; }
  function wrap1(v) { return v - Math.floor(v); }

  var KINDS = {};

  /* ---- 1 SLIME MOULD — tubes that carry flow thicken, the rest fade away ---- */
  KINDS.physarum = {
    life: 13,
    init: function (m) {
      var cols = 5, rows = 3, i, j;
      m.nodes = [];
      for (i = 0; i < rows; i++) for (j = 0; j < cols; j++) m.nodes.push({
        x: 20 + j * ((S - 40) / (cols - 1)) + (j > 0 && j < cols - 1 ? W(m, -7, 7) : 0),
        y: 26 + i * ((S - 52) / (rows - 1)) + W(m, -5, 5),
        hub: (j === 0 || j === cols - 1) && i === 1
      });
      m.edges = [];
      function add(a, b) {
        m.edges.push({ a: a, b: b, len: dist(m.nodes[a], m.nodes[b]), c: W(m, 0.24, 0.72), flow: 0 });
      }
      for (i = 0; i < rows; i++) for (j = 0; j < cols - 1; j++) add(i * cols + j, i * cols + j + 1);
      for (j = 0; j < cols; j++) {
        add(j, cols + j); add(cols + j, cols * 2 + j);
        if (j < cols - 1) { add(j, cols + j + 1); add(cols * 2 + j, cols + j + 1); }
      }
    },
    step: function (m, dt) {
      var max = 0, i, e, a, b, dir, mid, n;
      for (i = 0; i < m.edges.length; i++) {
        e = m.edges[i]; a = m.nodes[e.a]; b = m.nodes[e.b];
        dir = Math.abs(b.x - a.x) / Math.max(e.len, 1);
        mid = 1 - Math.abs((a.y + b.y) / 2 - S / 2) / (S / 2);
        e.flow = e.c * (0.25 + dir * 0.7) * (0.4 + mid * 0.75);
        if (e.flow > max) max = e.flow;
      }
      for (i = 0; i < m.edges.length; i++) {
        e = m.edges[i];
        n = e.flow / Math.max(max, 0.001);
        e.c = clamp(e.c + dt * (n * n * 0.48 - e.c * 0.22), 0.035, 1.3);
      }
    },
    draw: function (m, ctx) {
      var i, e, a, b, s, p, n;
      for (i = 0; i < m.edges.length; i++) {
        e = m.edges[i]; a = m.nodes[e.a]; b = m.nodes[e.b];
        s = clamp(e.c / 1.1, 0, 1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = white(0.05 + Math.pow(s, 1.4) * 0.85);
        ctx.lineWidth = 0.3 + Math.pow(s, 1.2) * 3.2;
        ctx.stroke();
        if (s > 0.32) {
          p = wrap1(m.t * (0.25 + e.flow) + e.a * 0.11);
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, 1.5, 0, TAU);
          ctx.fillStyle = INK; ctx.fill();
        }
      }
      for (i = 0; i < m.nodes.length; i++) {
        n = m.nodes[i];
        ctx.beginPath(); ctx.arc(n.x, n.y, n.hub ? 4 : 2, 0, TAU);
        ctx.fillStyle = n.hub ? INK : white(0.7); ctx.fill();
        if (n.hub) {
          ctx.beginPath(); ctx.arc(n.x, n.y, 7.5 + Math.sin(m.t * 3) * 1.3, 0, TAU);
          ctx.strokeStyle = white(0.3); ctx.lineWidth = 1; ctx.stroke();
        }
      }
    }
  };

  /* ---- 2 FUNGAL NETWORK — tips branch, meet, and fuse into one mesh ---- */
  var GC = 32, GS = S / GC;                       /* meeting grid, 5 units a cell */
  KINDS.mycelium = {
    life: 18, warm: 150, trail: true,
    init: function (m) {
      var i;
      m.food = []; m.tips = []; m.clock = 0; m.fclock = 0; m.n = 0; m.tick = 1;
      m.gx = new Float32Array(GC * GC);
      m.gy = new Float32Array(GC * GC);
      m.gs = new Int32Array(GC * GC);
      for (i = 0; i < 6; i++) m.food.push({
        x: S / 2 + Math.cos(i * 1.047 + 0.4) * W(m, 38, 58),
        y: S / 2 + Math.sin(i * 1.047 + 0.4) * W(m, 38, 58)
      });
      for (i = 0; i < 3; i++) m.tips.push({
        x: S / 2 + Math.cos(i * 2.094) * 5,
        y: S / 2 + Math.sin(i * 2.094) * 5, a: i * 2.094
      });
    },
    step: function (m, dt) {
      m.clock += dt;
      if (m.clock < 0.07) return;
      m.clock = 0; m.fclock += 0.07; m.tick++;
      var born = [], i, j, dx, dy, cx, cy, gi, tip, target, want, nx, ny, d, best, one, two;
      for (i = 0; i < m.tips.length; i++) {
        tip = m.tips[i];
        target = m.food[0];
        for (j = 1; j < m.food.length; j++) if (dist(tip, m.food[j]) < dist(tip, target)) target = m.food[j];
        want = Math.atan2(target.y - tip.y, target.x - tip.x);
        tip.a += Math.atan2(Math.sin(want - tip.a), Math.cos(want - tip.a)) * 0.075 + W(m, -0.09, 0.09);
        nx = tip.x + Math.cos(tip.a) * 1.7; ny = tip.y + Math.sin(tip.a) * 1.7;
        if (nx < 5 || nx > S - 5) { tip.a = Math.PI - tip.a; nx = tip.x + Math.cos(tip.a) * 1.7; }
        if (ny < 5 || ny > S - 5) { tip.a = -tip.a; ny = tip.y + Math.sin(tip.a) * 1.7; }
        m.pend.push({ x1: tip.x, y1: tip.y, x2: nx, y2: ny, fuse: 0 });
        m.n++;
        tip.x = clamp(nx, 5, S - 5); tip.y = clamp(ny, 5, S - 5);
        if (m.r() < 0.045 && m.tips.length + born.length < 10)
          born.push({ x: tip.x, y: tip.y, a: tip.a + W(m, -1.2, 1.2) });
        cx = clamp((tip.x / GS) | 0, 0, GC - 1); cy = clamp((tip.y / GS) | 0, 0, GC - 1);
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {   /* anastomosis */
          if (cx + dx < 0 || cx + dx >= GC || cy + dy < 0 || cy + dy >= GC) continue;
          gi = (cy + dy) * GC + (cx + dx);
          if (m.gs[gi] === 0 || m.tick - m.gs[gi] < 26) continue;
          d = Math.hypot(m.gx[gi] - tip.x, m.gy[gi] - tip.y);
          if (d < 6 && d > 0.5 && m.r() < 0.3) {
            m.pend.push({ x1: tip.x, y1: tip.y, x2: m.gx[gi], y2: m.gy[gi], fuse: 1 });
            m.n++; tip.a += W(m, -0.7, 0.7); m.gs[gi] = 0;
          }
        }
        gi = cy * GC + cx;
        m.gx[gi] = tip.x; m.gy[gi] = tip.y; m.gs[gi] = m.tick;
        if (dist(tip, target) < 7) { target.x = W(m, 16, S - 16); target.y = W(m, 16, S - 16); }
      }
      for (i = 0; i < born.length; i++) m.tips.push(born[i]);
      if (m.fclock > 0.9 && m.tips.length > 3) {                      /* long-range fusion */
        m.fclock = 0; best = 1e9; two = null;
        one = m.tips[(m.r() * m.tips.length) | 0];
        for (i = 0; i < m.tips.length; i++) {
          d = dist(one, m.tips[i]);
          if (m.tips[i] !== one && d > 6 && d < best) { best = d; two = m.tips[i]; }
        }
        if (two) { m.pend.push({ x1: one.x, y1: one.y, x2: two.x, y2: two.y, fuse: 1 }); m.n++; }
      }
    },
    done: function (m) { return m.n > 1500; },
    paint: function (m, ctx) {
      var i, s;
      ctx.beginPath();
      for (i = 0; i < m.pend.length; i++) { s = m.pend[i]; if (!s.fuse) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } }
      ctx.strokeStyle = white(0.3); ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      for (i = 0; i < m.pend.length; i++) { s = m.pend[i]; if (s.fuse) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); } }
      ctx.strokeStyle = white(0.9); ctx.lineWidth = 1.2; ctx.stroke();
    },
    draw: function (m, ctx) {
      var i, f;
      for (i = 0; i < m.food.length; i++) {
        f = m.food[i];
        ctx.beginPath(); ctx.arc(f.x, f.y, 4 + Math.sin(m.t * 2 + f.x) * 1, 0, TAU);
        ctx.strokeStyle = white(0.4); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = INK;
      for (i = 0; i < m.tips.length; i++) {
        ctx.beginPath(); ctx.arc(m.tips[i].x, m.tips[i].y, 1.6, 0, TAU); ctx.fill();
      }
    }
  };

  /* ---- 3 ROOT TIP — tips descend a nutrient gradient, throwing off probes ---- */
  KINDS.root = {
    life: 12, warm: 90, trail: true,
    init: function (m) {
      var i;
      m.food = []; m.n = 0; m.clock = 0; m.bclock = 0; m.live = 1;
      for (i = 0; i < 9; i++) m.food.push({
        x: W(m, 14, S - 14), y: W(m, S * 0.28, S - 10), v: W(m, 0.55, 1), eaten: 0
      });
      m.tips = [{ x: S / 2 + W(m, -5, 5), y: 6, a: Math.PI / 2, d: 0, on: 1, side: 0 }];
    },
    step: function (m, dt) {
      m.clock += dt;
      if (m.clock < 0.05) return;
      m.clock = 0; m.bclock += 0.05;
      var born = [], i, j, f, tip, tx, ty, best, score, want, bias, nx, ny, p, sd;
      m.live = 0;
      for (i = 0; i < m.tips.length; i++) {
        tip = m.tips[i];
        if (!tip.on) continue;
        m.live++;
        tx = tip.x + tip.side * 110; ty = tip.y + (tip.d ? 22 : 60);  /* default heading */
        best = Infinity;
        for (j = 0; j < m.food.length; j++) {
          f = m.food[j];
          if (f.eaten || f.y < tip.y + 6) continue;                   /* only chase what lies below */
          if (tip.side && (f.x - tip.x) * tip.side < -6) continue;    /* probes keep to their side */
          score = dist(tip, f) / f.v;
          if (score < best) { best = score; tx = f.x; ty = f.y; }
        }
        want = Math.atan2(ty - tip.y, tx - tip.x);
        tip.a += Math.atan2(Math.sin(want - tip.a), Math.cos(want - tip.a)) * (tip.d ? 0.04 : 0.1)
          + W(m, -0.12, 0.12);
        bias = tip.d === 0 ? 0.17 : 0.025;                            /* the taproot obeys gravity */
        tip.a = tip.a * (1 - bias) + (Math.PI / 2) * bias;
        nx = tip.x + Math.cos(tip.a) * 1.15;
        ny = tip.y + Math.sin(tip.a) * 1.15;
        m.pend.push({ x1: tip.x, y1: tip.y, x2: nx, y2: ny, d: tip.d });
        m.n++;
        tip.x = nx; tip.y = ny;
        if (nx < 5 || nx > S - 5 || ny > S - 5) tip.on = 0;           /* spent at the edge */
        if (m.r() < 0.055 && m.tips.length + born.length < 11 && tip.y > 22 && tip.d < 2) {
          sd = m.r() < 0.5 ? -1 : 1;                                  /* probes go sideways */
          born.push({ x: tip.x, y: tip.y, d: tip.d + 1, on: 1, side: sd,
            a: Math.PI / 2 + sd * W(m, 0.85, 1.35) });
        }
        for (j = 0; j < m.food.length; j++) {
          f = m.food[j];
          if (!f.eaten && dist(tip, f) < 6) { f.eaten = 1; }
        }
      }
      for (i = 0; i < born.length; i++) m.tips.push(born[i]);
      if (m.bclock > 1.1 && m.live > 0 && m.tips.length < 11) {       /* one more probe */
        m.bclock = 0;
        for (i = 0; i < m.tips.length; i++) if (m.tips[i].on) p = m.tips[i];
        sd = m.r() < 0.5 ? -1 : 1;
        m.tips.push({ x: p.x, y: p.y, a: Math.PI / 2 + sd * W(m, 0.85, 1.35), d: p.d + 1, on: 1, side: sd });
      }
    },
    done: function (m) { return m.live === 0 || m.n > 1600; },
    paint: function (m, ctx) {
      var i, s, b;
      for (b = 0; b < 4; b++) {
        ctx.beginPath();
        for (i = 0; i < m.pend.length; i++) {
          s = m.pend[i];
          if (Math.min(s.d, 3) === b) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
        }
        ctx.strokeStyle = white(0.62 - b * 0.1);
        ctx.lineWidth = Math.max(0.5, 1.5 - b * 0.32);
        ctx.stroke();
      }
    },
    draw: function (m, ctx) {
      var i, f;
      if (!m.grad) {
        m.grad = ctx.createLinearGradient(0, 0, 0, S);
        m.grad.addColorStop(0, white(0.015)); m.grad.addColorStop(1, white(0.075));
      }
      ctx.fillStyle = m.grad; ctx.fillRect(0, 0, S, S);
      for (i = 0; i < m.food.length; i++) {
        f = m.food[i];
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.6 + f.v * 1.8, 0, TAU);
        if (f.eaten) { ctx.strokeStyle = white(0.18); ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = white(0.42 + f.v * 0.3); ctx.fill(); }
      }
      ctx.fillStyle = INK;
      for (i = 0; i < m.tips.length; i++) {
        if (!m.tips[i].on) continue;
        ctx.beginPath(); ctx.arc(m.tips[i].x, m.tips[i].y, 1.5, 0, TAU); ctx.fill();
      }
    }
  };

  /* ---- 4 LICHEN — two unlike bodies pair up and trade pulses both ways ---- */
  KINDS.symbiotic = {
    life: 16,
    init: function (m) {
      var i;
      m.bodies = [];
      for (i = 0; i < 10; i++) m.bodies.push({
        x: S * (i % 2 ? 0.63 : 0.37) + W(m, -20, 20),
        y: S / 2 + W(m, -S * 0.34, S * 0.34),
        vx: W(m, -0.18, 0.18), vy: W(m, -0.18, 0.18),
        sp: i % 2, e: W(m, 0.6, 1)
      });
    },
    step: function (m, dt) {
      var i, j, a, o, d, near, nd, pull;
      for (i = 0; i < m.bodies.length; i++) {
        a = m.bodies[i]; near = null; nd = Infinity;
        for (j = 0; j < m.bodies.length; j++) {
          if (j === i) continue;
          o = m.bodies[j]; d = dist(a, o);
          if (o.sp !== a.sp && d < nd) { nd = d; near = o; }
          if (o.sp === a.sp && d < 30 && d > 0) {                     /* pairs stand apart */
            a.vx += (a.x - o.x) / d * 0.022; a.vy += (a.y - o.y) / d * 0.022;
          }
        }
        if (near) {
          d = Math.max(nd, 1);
          pull = d > 30 ? 0.02 : d < 22 ? -0.016 : 0.003;
          a.vx += (near.x - a.x) / d * pull; a.vy += (near.y - a.y) / d * pull;
          a.e = clamp(a.e + (d < 33 ? dt * 0.12 : -dt * 0.025), 0.2, 1);
        }
        a.vx += (S / 2 - a.x) * 0.0005; a.vy += (S / 2 - a.y) * 0.0005;
        a.vx = clamp(a.vx + W(m, -0.008, 0.008), -0.6, 0.6);
        a.vy = clamp(a.vy + W(m, -0.008, 0.008), -0.6, 0.6);
        a.x += a.vx; a.y += a.vy;
        if (a.x < 8 || a.x > S - 8) a.vx *= -1;
        if (a.y < 8 || a.y > S - 8) a.vy *= -1;
        a.x = clamp(a.x, 8, S - 8); a.y = clamp(a.y, 8, S - 8);
      }
    },
    draw: function (m, ctx) {
      var i, j, a, o, d, near, best, p, bond;
      for (i = 0; i < m.bodies.length; i++) {
        a = m.bodies[i]; near = null; best = 52;
        for (j = 0; j < m.bodies.length; j++) {
          o = m.bodies[j];
          if (o.sp === a.sp) continue;
          d = dist(a, o);
          if (d < best) { best = d; near = o; }
        }
        if (!near) continue;
        bond = best < 33 ? 1 : 0;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(near.x, near.y);
        ctx.strokeStyle = white(clamp(0.72 - best / 90, 0.1, 0.55));
        ctx.lineWidth = bond ? 1 : 0.7; ctx.stroke();
        ctx.fillStyle = INK;
        p = wrap1(m.t * 0.5 + a.x * 0.01);                            /* the exchange: */
        ctx.beginPath();
        ctx.arc(a.x + (near.x - a.x) * p, a.y + (near.y - a.y) * p, 1.4, 0, TAU); ctx.fill();
        if (bond) {                                                   /* and back again */
          p = wrap1(m.t * 0.5 + a.x * 0.01 + 0.5);
          ctx.beginPath();
          ctx.arc(near.x + (a.x - near.x) * p, near.y + (a.y - near.y) * p, 1.4, 0, TAU); ctx.fill();
        }
      }
      for (i = 0; i < m.bodies.length; i++) {
        a = m.bodies[i];
        ctx.beginPath(); ctx.arc(a.x, a.y, 2.2 + a.e * 1.9, 0, TAU);
        if (a.sp) { ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
        else { ctx.fillStyle = white(0.92); ctx.fill(); }
        ctx.beginPath(); ctx.arc(a.x, a.y, 5.5 + a.e * 1.8, 0, TAU);
        ctx.strokeStyle = white(0.16); ctx.lineWidth = 1; ctx.stroke();
      }
    }
  };

  /* ---- 5 VASCULAR — one trunk thickens, side branches stay ranked under it ---- */
  KINDS.vascular = {
    life: 14,
    init: function (m) {
      var depth, levels = 4, frontier = [0], next, i, b, parent, count, spread, ang, len;
      m.tree = [{ x: S / 2, y: S - 6, p: -1, d: 0, cap: 1, born: 0 }];
      for (depth = 1; depth <= levels; depth++) {
        next = [];
        for (i = 0; i < frontier.length; i++) {
          parent = m.tree[frontier[i]];
          count = depth < 3 ? 2 : (m.r() < 0.72 ? 2 : 1);
          for (b = 0; b < count; b++) {
            spread = (count === 1 ? 0 : b === 0 ? -1 : 1) * (0.42 + depth * 0.07);
            ang = -Math.PI / 2 + spread + W(m, -0.1, 0.1) + (parent.x - S / 2) / S * 0.5;
            len = (S / (levels + 1)) * W(m, 0.8, 1.08);
            m.tree.push({
              x: clamp(parent.x + Math.cos(ang) * len, 7, S - 7),
              y: Math.max(7, parent.y + Math.sin(ang) * len),
              p: frontier[i], d: depth,
              cap: Math.pow(Math.max(0.1, 1 - depth / (levels + 1)), 1.5),
              born: (depth - 1) * 1.2 + W(m, 0, 0.3)
            });
            next.push(m.tree.length - 1);
          }
        }
        frontier = next;
      }
    },
    draw: function (m, ctx) {
      var i, node, parent, g, p;
      for (i = 1; i < m.tree.length; i++) {
        node = m.tree[i]; parent = m.tree[node.p];
        g = clamp((m.t - node.born) / 0.9, 0, 1);
        if (g <= 0) continue;
        ctx.beginPath(); ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(parent.x + (node.x - parent.x) * g, parent.y + (node.y - parent.y) * g);
        ctx.strokeStyle = white(0.26 + node.cap * 0.66);
        ctx.lineWidth = 0.5 + node.cap * 6.5;
        ctx.stroke();
        if (g === 1) {
          p = wrap1(m.t * 0.42 - node.d * 0.1);
          ctx.beginPath();
          ctx.arc(parent.x + (node.x - parent.x) * p, parent.y + (node.y - parent.y) * p,
            0.9 + node.cap * 1.2, 0, TAU);
          ctx.fillStyle = INK; ctx.fill();
        }
      }
    }
  };

  /* ---- 6 CORAL — walkers stick to the reef, layer on layer, nothing erased ---- */
  var ADIR = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]];
  var NX = [1, -1, 0, 0, 1, -1, 1, -1], NY = [0, 0, 1, -1, 1, 1, -1, -1];
  KINDS.accretive = {
    life: 17, warm: 150, trail: true,
    init: function (m) {
      var x, i;
      m.cw = 3.2; m.gw = 50; m.gh = 50;
      m.occ = new Uint8Array(m.gw * m.gh);
      m.att = 0;
      for (x = 0; x < m.gw; x++) {                                    /* the sea floor */
        m.occ[(m.gh - 1) * m.gw + x] = 1;
        m.pend.push({ x: x, y: m.gh - 1 });
      }
      for (i = 0; i < 5; i++) {                                       /* first buds */
        x = 4 + ((m.r() * (m.gw - 8)) | 0);
        m.occ[(m.gh - 2) * m.gw + x] = 1;
        m.pend.push({ x: x, y: m.gh - 2 });
      }
      m.walk = [];
      for (i = 0; i < 16; i++) m.walk.push({ x: 1 + ((m.r() * (m.gw - 2)) | 0), y: 1 + ((m.r() * 8) | 0) });
    },
    step: function (m) {
      var it, k, j, w, d, hit;
      for (it = 0; it < 1; it++) {
        for (k = 0; k < m.walk.length; k++) {
          w = m.walk[k];
          d = ADIR[(m.r() * 6) | 0];
          w.x = clamp(w.x + d[0], 1, m.gw - 2);
          w.y = clamp(w.y + d[1] + (m.r() < 0.55 ? 1 : 0), 1, m.gh - 2);
          hit = 0;
          for (j = 0; j < 8; j++) if (m.occ[(w.y + NY[j]) * m.gw + (w.x + NX[j])]) { hit = 1; break; }
          if (hit) {
            m.occ[w.y * m.gw + w.x] = 1;
            m.pend.push({ x: w.x, y: w.y });
            m.att++;
            w.x = 1 + ((m.r() * (m.gw - 2)) | 0); w.y = 1;
          } else if (w.y >= m.gh - 2) {
            w.x = 1 + ((m.r() * (m.gw - 2)) | 0); w.y = 1;
          }
        }
      }
    },
    done: function (m) { return m.att > 300; },
    paint: function (m, ctx) {
      var i, c;
      for (i = 0; i < m.pend.length; i++) {
        c = m.pend[i];
        ctx.fillStyle = white(0.34 + (c.y / m.gh) * 0.56);
        ctx.fillRect(c.x * m.cw, c.y * m.cw, m.cw + 0.4, m.cw + 0.4);
      }
    },
    draw: function (m, ctx) {
      var i, w;
      ctx.fillStyle = white(0.45);
      for (i = 0; i < m.walk.length; i++) {
        w = m.walk[i];
        ctx.fillRect(w.x * m.cw, w.y * m.cw, 1.1, 1.1);
      }
    }
  };

  /* ---- 7 BACTERIAL SWARM — many walkers herd up the strongest signal ---- */
  KINDS.chemotaxis = {
    life: 15,
    init: function (m) {
      var i;
      m.food = [
        { cx: S * 0.34, cy: S * 0.36, rx: 12, ry: 9, ph: 0.4, s: 1, x: 0, y: 0 },
        { cx: S * 0.68, cy: S * 0.64, rx: 10, ry: 12, ph: 2.6, s: 0.85, x: 0, y: 0 }
      ];
      m.bugs = [];
      for (i = 0; i < 90; i++) m.bugs.push({
        x: W(m, 4, S - 4), y: W(m, 4, S - 4), a: W(m, 0, TAU), mem: 0
      });
      this.drift(m);
    },
    drift: function (m) {
      var i, f;
      for (i = 0; i < m.food.length; i++) {
        f = m.food[i];
        f.x = f.cx + Math.cos(m.t * 0.33 + f.ph) * f.rx;
        f.y = f.cy + Math.sin(m.t * 0.27 + f.ph) * f.ry;
      }
    },
    field: function (m, x, y) {
      var i, f, sum = 0;
      for (i = 0; i < m.food.length; i++) {
        f = m.food[i];
        sum += f.s * Math.exp(-Math.hypot(x - f.x, y - f.y) / 30);
      }
      return sum;
    },
    step: function (m) {
      var i, b, cur, ahead, sp;
      this.drift(m);
      for (i = 0; i < m.bugs.length; i++) {
        b = m.bugs[i];
        cur = this.field(m, b.x, b.y);
        ahead = this.field(m, b.x + Math.cos(b.a) * 5, b.y + Math.sin(b.a) * 5);
        if (cur > 0.82) { b.a += W(m, -2.2, 2.2); sp = 0.8; }          /* fed, scatter again */
        else {
          if (ahead < cur || m.r() < 0.02) b.a = W(m, 0, TAU);         /* tumble */
          else b.a += W(m, -0.16, 0.16);                               /* run */
          sp = 0.8 + clamp(ahead - cur, -0.1, 0.25) * 6;
        }
        b.mem = b.mem * 0.94 + cur * 0.06;
        b.x = (b.x + Math.cos(b.a) * sp + S) % S;
        b.y = (b.y + Math.sin(b.a) * sp + S) % S;
      }
    },
    draw: function (m, ctx) {
      var i, r, f, b;
      for (i = 0; i < m.food.length; i++) {
        f = m.food[i];
        for (r = 3; r >= 1; r--) {
          ctx.beginPath();
          ctx.arc(f.x, f.y, r * 11 + Math.sin(m.t * 2) * 1.4, 0, TAU);
          ctx.strokeStyle = white(0.04 + (4 - r) * 0.03); ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(f.x, f.y, 2.6, 0, TAU);
        ctx.fillStyle = INK; ctx.fill();
      }
      ctx.lineWidth = 1.1;
      for (i = 0; i < m.bugs.length; i++) {
        b = m.bugs[i];
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - Math.cos(b.a) * 2.6, b.y - Math.sin(b.a) * 2.6);
        ctx.strokeStyle = white(0.4 + clamp(b.mem, 0, 1) * 0.5);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, 1, 0, TAU);
        ctx.fillStyle = b.mem > 0.4 ? INK : white(0.72); ctx.fill();
      }
    }
  };

  /* ---- 8 TENDRIL — the vine sweeps until it finds support, then wraps it ---- */
  KINDS.tendril = {
    life: 19, warm: 60, trail: true,
    init: function (m) {
      var i;
      m.sup = [];
      for (i = 0; i < 6; i++) m.sup.push({
        x: 26 + i * ((S - 52) / 5) + W(m, -9, 9),
        y: S - 24 - i * ((S - 52) / 5) + W(m, -9, 9),
        on: 0
      });
      m.tip = { x: 12, y: S - 10 }; m.a = -0.9;
      m.target = null; m.att = 0; m.clock = 0; m.n = 0;
    },
    step: function (m, dt) {
      m.clock += dt;
      if (m.clock < 0.03) return;
      m.clock = 0;
      var i, best = 1e9, cand = null, want, sweep, d, nx, ny, turn, ang, rad, px, py;
      if (!m.target || m.target.on) {
        for (i = 0; i < m.sup.length; i++) {
          if (m.sup[i].on) continue;
          d = dist(m.tip, m.sup[i]);
          if (d < best) { best = d; cand = m.sup[i]; }
        }
        m.target = cand;
      }
      if (!m.target) return;
      d = dist(m.tip, m.target);
      want = Math.atan2(m.target.y - m.tip.y, m.target.x - m.tip.x);
      sweep = d > 22 ? 0.1 : 0.02;                                     /* searching arc */
      m.a += Math.atan2(Math.sin(want - m.a), Math.cos(want - m.a)) * 0.075
        + Math.sin(m.t * 4.5) * sweep;
      nx = m.tip.x + Math.cos(m.a) * 1.7; ny = m.tip.y + Math.sin(m.a) * 1.7;
      m.pend.push({ x1: m.tip.x, y1: m.tip.y, x2: nx, y2: ny });
      m.tip = { x: nx, y: ny }; m.n++;
      if (dist(m.tip, m.target) < 6) {                                 /* wrap the support */
        m.target.on = 1; m.att++;
        px = m.tip.x; py = m.tip.y;
        for (turn = 1; turn <= 14; turn++) {
          ang = turn * 0.68; rad = 6.5 - turn * 0.33;
          nx = m.target.x + Math.cos(ang) * rad; ny = m.target.y + Math.sin(ang) * rad;
          m.pend.push({ x1: px, y1: py, x2: nx, y2: ny });
          px = nx; py = ny;
        }
        m.tip = { x: px, y: py };
        m.a += 1.2;
        m.target = null;
      }
    },
    done: function (m) { return m.att >= m.sup.length || m.n > 900; },
    paint: function (m, ctx) {
      var i, s;
      ctx.beginPath();
      for (i = 0; i < m.pend.length; i++) { s = m.pend[i]; ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
      ctx.strokeStyle = white(0.82); ctx.lineWidth = 1.6; ctx.stroke();
    },
    draw: function (m, ctx) {
      var i, s;
      for (i = 0; i < m.sup.length; i++) {
        s = m.sup[i];
        ctx.beginPath();
        ctx.moveTo(s.x - 5, s.y); ctx.lineTo(s.x + 5, s.y);
        ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x, s.y + 5);
        ctx.strokeStyle = white(0.14); ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(s.x, s.y, s.on ? 4.5 : 3, 0, TAU);
        ctx.strokeStyle = s.on ? INK : white(0.42);
        ctx.lineWidth = s.on ? 1.4 : 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(m.tip.x, m.tip.y, 2.2, 0, TAU);
      ctx.fillStyle = INK; ctx.fill();
    }
  };

  /* ---- the eight cells, in the order the catalog names them ---- */
  var ORDER = ["physarum", "mycelium", "root", "symbiotic", "vascular", "accretive", "chemotaxis", "tendril"];
  var NAMES = ["Slime mould", "Fungal network", "Root tip", "Lichen", "Vascular", "Coral", "Bacterial swarm", "Tendril"];
  var SEEDS = [0x9a11, 0x2f7c, 0x5b03, 0x71e5, 0x3d48, 0x60ba, 0x1c97, 0x84f2];

  var style = document.createElement("style");
  style.textContent =
    '#fig-organisms{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}' +
    "#fig-organisms .og-grid{display:grid;grid-template-columns:repeat(4,1fr);column-gap:16px;row-gap:26px}" +
    "#fig-organisms .og-grid.og-narrow{grid-template-columns:repeat(2,1fr);column-gap:18px;row-gap:30px}" +
    "#fig-organisms .og-cell{margin:0}" +
    "#fig-organisms canvas{display:block;width:100%;aspect-ratio:1/1;border:1px solid #2a2a2a}" +
    "#fig-organisms .og-name{margin:10px 0 0;font-size:11px;font-weight:700;letter-spacing:0.12em;" +
    "text-transform:uppercase;color:#8a8a8a;line-height:1.3}";
  host.appendChild(style);

  var grid = document.createElement("div");
  grid.className = "og-grid";
  host.appendChild(grid);
  host.setAttribute("role", "img");
  host.setAttribute("aria-label",
    "Eight small living simulations, one per growth rule, each drawing its network in white on black.");

  var models = [];
  ORDER.forEach(function (key, i) {
    var cell = document.createElement("div");
    cell.className = "og-cell";
    var cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    var name = document.createElement("p");
    name.className = "og-name";
    name.textContent = NAMES[i];
    cell.appendChild(cv);
    cell.appendChild(name);
    grid.appendChild(cell);
    var m = {
      cv: cv, ctx: cv.getContext("2d"), kind: KINDS[key], seed: SEEDS[i],
      pre: i * 54,                     /* stagger the cells so they never all reset at once */
      t: 0, cycle: 0, fade: -1, w: 0, dpr: 0, px: 0, s: 1, pend: null, grad: null
    };
    if (m.kind.trail) { m.tc = document.createElement("canvas"); m.tctx = m.tc.getContext("2d"); }
    models.push(m);
  });

  function layout() {
    grid.className = host.clientWidth && host.clientWidth < 560 ? "og-grid og-narrow" : "og-grid";
  }
  layout();

  function reset(m) {
    m.t = 0; m.fade = -1; m.grad = null;
    m.r = rng(m.seed + m.cycle * 7919);
    if (m.tctx) {
      m.tctx.setTransform(1, 0, 0, 1, 0, 0);
      m.tctx.clearRect(0, 0, m.px, m.px);
      m.tctx.setTransform(m.s, 0, 0, m.s, 0, 0);
      m.tctx.lineCap = "round";
      m.pend = [];
    }
    m.kind.init(m);
    for (var k = 0; k < (m.kind.warm || 0); k++) m.kind.step(m, STEP);  /* start part-grown */
    if (m.pend && m.pend.length) { m.kind.paint(m, m.tctx); m.pend.length = 0; }
  }

  function fit(m, roll) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), cw = m.cv.clientWidth, k;
    if (!cw) return false;
    if (cw !== m.w || dpr !== m.dpr) {
      m.w = cw; m.dpr = dpr;
      m.px = Math.round(cw * dpr);
      m.cv.width = m.px; m.cv.height = m.px;
      m.s = m.px / S;
      if (m.tc) { m.tc.width = m.px; m.tc.height = m.px; }
      reset(m);
      if (roll) for (k = 0; k < m.pre; k++) advance(m, STEP);
    }
    return true;
  }

  function advance(m, dt) {
    m.t += dt;
    if (m.fade < 0) {
      if (m.kind.step) m.kind.step(m, dt);
      if (m.pend && m.pend.length) { m.kind.paint(m, m.tctx); m.pend.length = 0; }
      if ((m.kind.done && m.kind.done(m)) || m.t > m.kind.life) m.fade = 0;
    } else {
      m.fade += dt;
      if (m.fade >= FADE) { m.cycle++; reset(m); }
    }
  }

  function render(m) {
    var ctx = m.ctx, a;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, m.px, m.px);
    a = m.fade >= 0 ? 1 - Math.min(1, m.fade / FADE) : Math.min(1, m.t / 0.5);
    if (a <= 0) return;
    ctx.globalAlpha = a * a;
    if (m.tc) ctx.drawImage(m.tc, 0, 0);
    ctx.setTransform(m.s, 0, 0, m.s, 0, 0);
    ctx.lineCap = "round";
    m.kind.draw(m, ctx);
    ctx.globalAlpha = 1;
  }

  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var running = false, visible = false, raf = 0, last = 0, carry = 0;

  function frame(ts) {
    raf = 0;
    if (!running || !visible) return;
    var dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
    last = ts;
    carry = Math.min(carry + dt, STEP * 3);
    var n = 0, i, j;
    while (carry >= STEP && n < 3) { carry -= STEP; n++; }
    for (i = 0; i < models.length; i++) {
      if (!fit(models[i], 1)) continue;
      for (j = 0; j < n; j++) advance(models[i], STEP);
      render(models[i]);
    }
    raf = requestAnimationFrame(frame);
  }

  function once() {
    for (var i = 0; i < models.length; i++) {
      if (!fit(models[i])) continue;
      models[i].cycle = 0; reset(models[i]);
      for (var j = 0; j < 420; j++) advance(models[i], STEP);
      render(models[i]);
    }
  }

  function start() {
    running = true;
    if (still) { layout(); once(); return; }
    if (visible && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  window.addEventListener("resize", function () {
    layout();
    if (still) once();
  });

  if (still) {
    running = true;
    once();
  } else if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      visible = !!(e[0] && e[0].isIntersecting);
      if (visible && running && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    }, { rootMargin: "80px" }).observe(host);
    start();
  } else {
    visible = true;
    start();
  }

  window.__fig_organisms = { start: start, stop: stop };
})();
