/**
 * Shared site navigation — hamburger, top right, above everything.
 * Injected into every page via <script src="/nav.js" defer></script>.
 * On pages with a `#head .row` band the button mounts INSIDE the row (pushing
 * the chrome text aside — never overlapping it); elsewhere it floats fixed in
 * the corner. Pure DOM, no dependencies, no randomness. /guide is a served
 * copy of docs/two-shapes/guide; the canonical files stay in docs/.
 */
(() => {
  const PAGES = [
    ["Start here", null],
    ["The Overview — what we found, and why we are entering", "/guide/overview.html"],
    ["The Complete Guide — growing smarter AI fleets", "/guide/growth.html"],
    ["The Live Runs — real fleets, three disasters", "/guide/live.html"],
    ["THE TRUST SERIES", null],
    ["The Bridge — can you walk to the reason?", "/bridge.html"],
    ["The Boat — where do you send the boat?", "/boat.html"],
    ["The Map — do you turn them around?", "/mapworld.html"],
    ["Who falls out of the picture", null],
    ["The live instrument — a flooded region, summarized four times", "/twoshapes.html"],
    ["The Strata — the same territory as five layers, drag to orbit", "/?scene=the-strata"],
    ["The Strata, in plain words — same scene, plain text", "/?scene=the-strata-plain"],
    ["The Strata — warm variant", "/strata.html"],
    ["The plain guide — what we found, in plain language", "/guide/GUIDE.html"],
    ["Supplemental experiments", null],
    ["The Same Ground — eight growth models on one territory", "/mvp.html"],
  ];

  const S = document.createElement("style");
  S.textContent = `
    #site-controls{display:flex;gap:8px;flex:0 0 auto;align-items:flex-start;order:99}
    #site-controls.floating{position:fixed;top:8px;right:10px;z-index:2147483646}
    #site-nav-btn{width:40px;height:40px;background:rgba(10,10,10,.88);border:1px solid #2a2a2a;
      color:#f2f2f2;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;
      justify-content:center;border-radius:2px;transition:border-color .25s ease;
      font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
    #site-nav-btn:hover{border-color:#666}
    #site-nav-panel{display:none;position:fixed;top:58px;right:14px;min-width:340px;
      max-height:calc(100vh - 80px);overflow:auto;background:rgba(10,10,10,.97);
      border:1px solid #2a2a2a;padding:6px 0 10px;border-radius:2px;z-index:2147483647;
      font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
    #site-nav-panel.open{display:block}
    #site-nav-panel .hdr{font-size:10px;letter-spacing:.16em;color:#8a8a8a;padding:12px 16px 5px;font-weight:700;text-transform:uppercase}
    #site-nav-panel a{display:block;padding:7px 16px;font-size:13px;color:#f2f2f2;text-decoration:none;line-height:1.35}
    #site-nav-panel a:hover{background:#1a1a1a}
    #site-nav-panel a.here{color:#8a8a8a;pointer-events:none}
    #site-nav-panel a.here::after{content:"  — you are here";font-size:10px;letter-spacing:.08em;color:#555}
  `;
  document.head.appendChild(S);

  const holder = document.createElement("div");
  holder.id = "site-controls";
  const btn = document.createElement("button");
  btn.id = "site-nav-btn";
  btn.setAttribute("aria-label", "site menu");
  btn.textContent = "☰";
  holder.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "site-nav-panel";
  const herePath = (location.pathname.replace(/\/$/, "") || "/") + location.search;
  for (const [label, href] of PAGES) {
    if (href === null) {
      const h = document.createElement("div");
      h.className = "hdr";
      h.textContent = label;
      panel.appendChild(h);
    } else {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      const u = new URL(href, location.origin);
      const target = (u.pathname.replace(/\/$/, "") || "/") + u.search;
      if (target === herePath) a.className = "here";
      panel.appendChild(a);
    }
  }

  const mount = () => {
    const row = document.querySelector("#head .row");
    if (row) row.appendChild(holder);
    else { holder.classList.add("floating"); document.body.appendChild(holder); }
    document.body.appendChild(panel);
  };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  btn.addEventListener("click", (e) => { e.stopPropagation(); panel.classList.toggle("open"); });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && !holder.contains(e.target)) panel.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.classList.remove("open"); });
})();
