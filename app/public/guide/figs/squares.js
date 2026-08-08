(function () {
  "use strict";
  if (window.__fig_squares) return;
  var host = document.getElementById("fig-squares");
  if (!host) return;

  var style = document.createElement("style");
  style.textContent = [
    "#fig-squares .sq { margin: 0; }",
    "#fig-squares .sq-row + .sq-row { margin-top: 34px; }",
    "#fig-squares .sq-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 10px; }",
    "#fig-squares .sq-lbl { margin: 0; font-size: 12px; line-height: 1.4; letter-spacing: 0.12em; text-transform: uppercase; color: var(--secondary, #8a8a8a); }",
    "#fig-squares .sq-val { margin: 0; font-size: 16px; font-weight: 700; line-height: 1.4; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; color: var(--ink, #f2f2f2); white-space: nowrap; }",
    "#fig-squares .sq-canvas { display: block; width: 100%; aspect-ratio: 636 / 8; }",
    "@media (max-width: 560px) {",
    "  #fig-squares .sq-row + .sq-row { margin-top: 26px; }",
    "  #fig-squares .sq-lbl { font-size: 9px; letter-spacing: 0.08em; }",
    "  #fig-squares .sq-val { font-size: 13px; }",
    "}"
  ].join("\n");
  host.appendChild(style);

  var rows = [
    { lbl: "The common rule", val: "38 of 64", fill: 38,
      aria: "Sixty-four communities: thirty-eight still visible to the decision desk, twenty-six gone." },
    { lbl: "Send agents back", val: "30 of 64", fill: 30,
      aria: "Sixty-four communities: thirty still visible to the decision desk, thirty-four gone." },
    { lbl: "The merging rule", val: "64 of 64", fill: 64,
      aria: "Sixty-four communities: all sixty-four still visible to the decision desk." }
  ];

  var wrap = document.createElement("div");
  wrap.className = "sq";
  var cvs = [];
  for (var r = 0; r < rows.length; r++) {
    var row = document.createElement("div");
    row.className = "sq-row";
    var head = document.createElement("div");
    head.className = "sq-head";
    var lbl = document.createElement("p");
    lbl.className = "sq-lbl";
    lbl.textContent = rows[r].lbl;
    var val = document.createElement("p");
    val.className = "sq-val";
    val.textContent = rows[r].val;
    head.appendChild(lbl);
    head.appendChild(val);
    var cv = document.createElement("canvas");
    cv.className = "sq-canvas";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", rows[r].aria);
    cv.__fill = rows[r].fill;
    row.appendChild(head);
    row.appendChild(cv);
    wrap.appendChild(row);
    cvs.push(cv);
  }
  host.appendChild(wrap);

  var N = 64;
  var GAP_RATIO = 4 / 6; /* original geometry: 6 px squares, 4 px gaps */
  var INK = "242,242,242";

  function drawOne(cv) {
    var ctx = cv.getContext("2d");
    if (!ctx) return;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var size = w / (N + (N - 1) * GAP_RATIO);
    var gap = size * GAP_RATIO;
    var y = (h - size) / 2;
    var filled = cv.__fill;

    for (var i = 0; i < N; i++) {
      var x = i * (size + gap);
      if (i < filled) {
        ctx.fillStyle = "rgba(" + INK + ",1)";
        ctx.fillRect(x, y, size, size);
      } else {
        var lw = Math.min(1, size / 3.4);
        ctx.strokeStyle = "rgba(" + INK + ",0.34)";
        ctx.lineWidth = lw;
        ctx.strokeRect(x + lw / 2, y + lw / 2, size - lw, size - lw);
      }
    }
  }

  function drawAll() { for (var i = 0; i < cvs.length; i++) drawOne(cvs[i]); }

  if (window.ResizeObserver) {
    var ro = new ResizeObserver(drawAll);
    for (var i = 0; i < cvs.length; i++) ro.observe(cvs[i]);
  } else {
    window.addEventListener("resize", drawAll);
  }

  drawAll();
  window.__fig_squares = { start: drawAll, stop: function () {}, draw: drawAll };
})();
