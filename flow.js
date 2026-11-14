/* 天枢流动动画（参照 Simon林 视频）：节点间画发光连线，小光点沿线流动——
   日报：Agent → CEO（青色，向上）；汇总：CEO → 发起人（橙色，向上）；
   拍板：发起人 → CEO（有待拍板时，向下）；派活：CEO → Agent（该 Agent 有在办工单/执行中的建议时，向下）。
   纯 SVG + SMIL，无依赖；按卡片实际位置绘制，窗口变化时重画；系统开启“减少动态效果”时只画静态线。 */
(() => {
  const D = window.DASHBOARD;
  const org = document.querySelector(".org");
  if (!D || !org) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  org.classList.add("flow-on");
  const svg = el("svg", { class: "flow-layer", "aria-hidden": "true" });
  org.prepend(svg);
  const tags = document.createElement("div");
  tags.className = "flow-tags";
  org.append(tags);

  // 哪些 Agent 正在被派活（有在办工单或执行中的建议）
  const busy = new Set([...(D.tickets || []).map((t) => t.agent),
    ...(D.proposals || []).filter((p) => p.status === "dispatched").map((p) => (p.agentId || ""))]);
  const pending = (D.founder && D.founder.pending) || 0;

  const box = (n) => {
    const r = n.getBoundingClientRect(), o = org.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2 };
  };
  const curve = (x1, y1, x2, y2) => {
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };

  function line(id, d, cls, dots, dur, reverse) {
    svg.append(el("path", { id, d, class: `flow-path ${cls}` }));
    if (reverse === null) return;
    const n = reduce ? 0 : dots;
    for (let i = 0; i < n; i++) {
      const c = el("circle", { r: cls === "up-founder" ? 3.2 : 2.6, class: `flow-dot ${cls}` });
      const m = el("animateMotion", { dur: `${dur}s`, repeatCount: "indefinite", begin: `${(-dur * i) / n}s`,
        keyPoints: reverse ? "1;0" : "0;1", keyTimes: "0;1", calcMode: "linear" });
      m.append(el("mpath", { href: `#${id}` }));
      c.append(m);
      svg.append(c);
    }
  }

  function tag(text, x, y, cls) {
    const t = document.createElement("span");
    t.className = `flow-tag ${cls || ""}`;
    t.textContent = text;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    tags.append(t);
  }

  function draw() {
    svg.innerHTML = "";
    tags.innerHTML = "";
    const o = org.getBoundingClientRect();
    svg.setAttribute("width", o.width);
    svg.setAttribute("height", o.height);
    svg.setAttribute("viewBox", `0 0 ${o.width} ${o.height}`);
    const defs = el("defs");
    const f = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" });
    f.append(el("feGaussianBlur", { stdDeviation: "2.2", result: "b" }));
    const mg = el("feMerge");
    mg.append(el("feMergeNode", { in: "b" }), el("feMergeNode", { in: "SourceGraphic" }));
    f.append(mg);
    defs.append(f);
    svg.append(defs);

    const F = box(document.getElementById("founder")), C = box(document.getElementById("ceo"));
    // CEO ⇄ 发起人
    line("p-up-f", curve(C.cx - 14, C.y, F.cx - 14, F.y + F.h), "up-founder", 3, 2.4, false);
    tag("汇总报发起人", F.cx - 120, (F.y + F.h + C.y) / 2 - 10, "orange");
    if (pending) {
      line("p-down-f", curve(F.cx + 14, F.y + F.h, C.cx + 14, C.y), "down", 2, 2.4, false);
      tag(`待拍板 ${pending}`, F.cx + 24, (F.y + F.h + C.y) / 2 - 10, "red");
    } else {
      line("p-down-f", curve(F.cx + 14, F.y + F.h, C.cx + 14, C.y), "idle", 0, 0, null);
    }
    // Agent ⇄ CEO
    const cards = [...document.querySelectorAll("#agents .card")];
    const boxes = cards.map(box);
    const top0 = Math.min(...boxes.map((b) => b.y));
    const rowGap = boxes.length > 1 ? 12 : 0;
    // 非第一排的卡片：先从卡片左上走到排间缝隙，再沿列间缝隙上到第一排上沿，不穿过上排卡片
    const route = (A, toX, toY, up) => {
      if (A.y - top0 < 4) return up ? curve(A.cx, A.y, toX, toY) : curve(toX, toY, A.cx, A.y);
      const gx = A.x - rowGap / 2 < 4 ? A.x + A.w + rowGap / 2 : A.x - rowGap / 2;
      const gy = A.y - rowGap / 2;
      const pts = `M${A.cx},${A.y} L${A.cx},${gy} L${gx},${gy} L${gx},${top0 - 8}`;
      const tail = curve(gx, top0 - 8, toX, toY).replace(/^M[^C]+/, " ");
      if (up) return pts + tail;
      // 向下：把向上的点序反过来
      const rev = `M${toX},${toY} ${curve(toX, toY, gx, top0 - 8).replace(/^M[^C]+/, "")} L${gx},${gy} L${A.cx},${gy} L${A.cx},${A.y}`;
      return rev;
    };
    cards.forEach((card, i) => {
      const A = boxes[i];
      const id = (card.dataset.go || "").replace("agent:", "");
      const a = (D.agents || []).find((x) => x.id === id) || {};
      const ex = C.x + C.w * (0.15 + (0.7 * (i + 0.5)) / cards.length);
      const st = a.paused ? "idle" : a.status === "error" ? "err" : a.status === "warn" ? "warn" : "up";  // 封存：虚线、不流动
      line(`p-up-${i}`, route(A, ex - 5, C.y + C.h, true), st, a.paused ? 0 : a.stale ? 1 : 2, 3 + (i % 3) * 0.4, false);
      if (busy.has(id) && !a.paused) {
        line(`p-dn-${i}`, route(A, ex + 5, C.y + C.h, false), "down", 2, 2.8, false);
      }
      card.style.setProperty("--flow-delay", `${i * 60}ms`);
    });
    if (cards.length) {
      const A0 = box(cards[0]);
      tag("日报 · 建议先交天枢", C.x - 150, (C.y + C.h + A0.y) / 2 - 12, "cyan");
      if (busy.size) tag("派活", C.x + C.w + 12, (C.y + C.h + A0.y) / 2 - 12, "violet");
    }
  }

  // 数字滚动：卡片主数值与 CEO 统计
  if (!reduce) {
    document.querySelectorAll(".card .big, .ceo .stats b").forEach((n) => {
      const m = n.textContent.match(/^([^\d]*)(\d[\d,]*)(.*)$/);
      if (!m) return;
      const target = Number(m[2].replace(/,/g, ""));
      if (!isFinite(target) || target === 0 || target > 1e7) return;
      const t0 = performance.now(), dur = 900;
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - k, 3)));
        n.textContent = m[1] + (m[2].includes(",") ? v.toLocaleString() : v) + m[3];
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // 悬停卡片：高亮它自己的连线
  document.querySelectorAll("#agents .card").forEach((card, i) => {
    card.addEventListener("mouseenter", () => svg.querySelectorAll(`#p-up-${i}, #p-dn-${i}`).forEach((p) => p.classList.add("hot")));
    card.addEventListener("mouseleave", () => svg.querySelectorAll(".hot").forEach((p) => p.classList.remove("hot")));
  });

  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  window.addEventListener("resize", redraw);
  // 切回总览页时重画（隐藏状态下取不到尺寸）
  new MutationObserver(() => { if (!document.getElementById("view-overview").hidden) redraw(); })
    .observe(document.getElementById("view-overview"), { attributes: true, attributeFilter: ["hidden"] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  redraw();
})();
