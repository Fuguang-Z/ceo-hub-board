/* 天枢流动动画（参照 Simon林 视频）：节点间画发光连线，小光点沿线流动——
   日报：Agent → CEO（青色，向上）；汇总：CEO → 发起人（橙色，向上）；
   拍板：发起人 → CEO（有待拍板时，向下）；派活：CEO → Agent（该 Agent 有在办工单/执行中的建议时，向下）。
   桌面端（>640px）保留多列树形贝塞尔拓扑；手机端（<=640px）切换专属左侧垂直总线拓扑，零越界、零重叠。
   纯 SVG + SMIL，无依赖；响应窗口变化、系统“减少动态效果”与顶栏“动效停”。 */
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  // 纯几何计算：手机端（<=640px）左侧垂直总线拓扑，所有坐标严格落在 [0, orgWidth] 内
  function computeMobileTopology({ orgWidth, founder, ceo, cards, pending = 0, busyIds = new Set(), motionPaused = false }) {
    const W = Math.max(0, orgWidth);
    const paths = [];
    const nodes = [];
    const tags = [];
    if (!founder || !ceo || W <= 0) return { paths, nodes, tags };

    const cx = round1(clamp(founder.cx, 24, Math.max(24, W - 24)));
    const xUp = round1(cx - 10);
    const xDn = round1(cx + 10);
    const stemTop = round1(founder.y + founder.h);
    const stemBot = round1(ceo.y);
    const stemMid = round1((stemTop + stemBot) / 2);

    // 1. 天枢 ⇄ 发起人（紧凑垂直双轨）
    paths.push({
      id: "p-up-f",
      d: `M${xUp},${stemBot} L${xUp},${stemTop}`,
      cls: "up-founder",
      dots: motionPaused ? 0 : 2,
      dur: 2.2,
      reverse: false,
    });
    tags.push({
      text: "汇总报发起人",
      x: round1(clamp(xUp - 10, 88, Math.max(88, W - 8))),
      y: stemMid,
      cls: "orange m-left",
    });

    if (pending > 0) {
      paths.push({
        id: "p-down-f",
        d: `M${xDn},${stemTop} L${xDn},${stemBot}`,
        cls: "down",
        dots: motionPaused ? 0 : 2,
        dur: 2.2,
        reverse: false,
      });
      tags.push({
        text: `待拍板 ${pending}`,
        x: round1(clamp(xDn + 10, 8, Math.max(8, W - 72))),
        y: stemMid,
        cls: "red m-right",
      });
    } else {
      paths.push({
        id: "p-down-f",
        d: `M${xDn},${stemTop} L${xDn},${stemBot}`,
        cls: "idle",
        dots: 0,
        dur: 0,
        reverse: null,
      });
    }

    if (!cards || !cards.length) return { paths, nodes, tags };

    // 2. 分支 ⇄ 天枢（左侧单一主干总线 + 圆角弯头汇聚 + 每卡短支线与汇流节点）
    const cardLeft = Math.min(...cards.map((c) => c.x));
    const spineX = round1(clamp(cardLeft > 14 ? cardLeft * 0.42 : 9, 7, Math.max(7, cardLeft - 8)));
    const ceoBot = round1(ceo.y + ceo.h);
    const cardsTop = round1(Math.min(...cards.map((c) => c.y)));
    const gap = Math.max(24, cardsTop - ceoBot);
    const r = round1(clamp(gap * 0.24, 6, 11));
    const elbowY = round1(ceoBot + gap * 0.58);
    const ceoX = round1(clamp(ceo.cx, spineX + r * 2 + 6, Math.max(spineX + r * 2 + 6, W - 24)));

    const anchors = cards.map((c) => round1(c.anchorY != null ? c.anchorY : c.y + Math.min(20, c.h / 2)));
    const activeIndices = [];
    const busyIndices = [];
    cards.forEach((c, i) => {
      if (!c.paused) activeIndices.push(i);
      if (busyIds.has(c.id) && !c.paused) busyIndices.push(i);
    });

    const lastIdx = cards.length - 1;
    const lastActiveIdx = activeIndices.length ? activeIndices[activeIndices.length - 1] : -1;
    const trunkStartY = lastActiveIdx >= 0 ? anchors[lastActiveIdx] : anchors[lastIdx];

    // 主干总线：从最末活跃卡的接入点垂直上行，平滑圆角拐向天枢底部居中
    const trunkD = [
      `M${spineX},${trunkStartY}`,
      `L${spineX},${round1(elbowY + r)}`,
      `Q${spineX},${elbowY} ${round1(spineX + r)},${elbowY}`,
      `L${round1(ceoX - r)},${elbowY}`,
      `Q${ceoX},${elbowY} ${ceoX},${round1(elbowY - r)}`,
      `L${ceoX},${ceoBot}`,
    ].join(" ");
    const trunkLen = Math.abs(trunkStartY - elbowY) + Math.abs(ceoX - spineX) + Math.abs(elbowY - ceoBot);
    const trunkDur = round1(clamp(trunkLen / 240, 3.4, 8.2));
    const trunkDots = motionPaused || lastActiveIdx < 0 ? 0 : Math.min(4, Math.max(2, Math.round(trunkLen / 380)));

    paths.push({
      id: "p-m-trunk",
      d: trunkD,
      cls: lastActiveIdx >= 0 ? "up flow-trunk" : "idle",
      dots: trunkDots,
      dur: trunkDur,
      reverse: lastActiveIdx >= 0 ? false : null,
    });

    // 若下方还有封存卡片，用静默虚线延续总线尾部（不发光点）
    if (lastActiveIdx >= 0 && lastActiveIdx < lastIdx) {
      paths.push({
        id: "p-m-tail",
        d: `M${spineX},${anchors[lastIdx]} L${spineX},${anchors[lastActiveIdx]}`,
        cls: "idle",
        dots: 0,
        dur: 0,
        reverse: null,
      });
    }

    // 有派活任务时，沿主干内侧偏移 +4px 绘制淡紫下行派活轨
    if (busyIndices.length) {
      const lastBusyY = anchors[busyIndices[busyIndices.length - 1]];
      const dSpineX = round1(Math.min(spineX + 4, cardLeft - 4));
      const dCeoX = round1(Math.min(ceoX + 5, W - 12));
      const dElbowY = round1(Math.min(elbowY + 4, cardsTop - 6));
      const dr = round1(Math.max(4, r - 2));
      const downD = [
        `M${dCeoX},${ceoBot}`,
        `L${dCeoX},${round1(dElbowY - dr)}`,
        `Q${dCeoX},${dElbowY} ${round1(dCeoX - dr)},${dElbowY}`,
        `L${round1(dSpineX + dr)},${dElbowY}`,
        `Q${dSpineX},${dElbowY} ${dSpineX},${round1(dElbowY + dr)}`,
        `L${dSpineX},${lastBusyY}`,
      ].join(" ");
      const downLen = Math.abs(lastBusyY - dElbowY) + Math.abs(dCeoX - dSpineX) + Math.abs(dElbowY - ceoBot);
      paths.push({
        id: "p-m-down",
        d: downD,
        cls: "down",
        dots: motionPaused ? 0 : Math.min(3, Math.max(1, Math.round(downLen / 460))),
        dur: round1(clamp(downLen / 220, 3.0, 7.6)),
        reverse: false,
      });
    }

    // 每张卡片的水平圆角短支线 + 总线交汇节点
    cards.forEach((c, i) => {
      const ay = anchors[i];
      const st = c.paused ? "idle" : c.status === "error" ? "err" : c.status === "warn" ? "warn" : "up";
      const spurSpan = Math.max(4, c.x - spineX);
      const sr = round1(clamp(spurSpan * 0.42, 3, 6));
      const spurD = `M${round1(c.x)},${ay} L${round1(spineX + sr)},${ay} Q${spineX},${ay} ${spineX},${round1(ay - sr)}`;
      paths.push({
        id: `p-up-${i}`,
        d: spurD,
        cls: st,
        dots: 0,
        dur: 0,
        reverse: null,
      });
      nodes.push({
        id: `p-node-${i}`,
        cx: spineX,
        cy: ay,
        r: c.paused ? 2.1 : 2.8,
        cls: st,
      });
      if (busyIds.has(c.id) && !c.paused) {
        const dSpineX = round1(Math.min(spineX + 4, c.x - 4));
        const dSr = round1(clamp((c.x - dSpineX) * 0.4, 2, 4));
        paths.push({
          id: `p-dn-${i}`,
          d: `M${dSpineX},${round1(ay - dSr)} Q${dSpineX},${round1(ay + 3)} ${round1(dSpineX + dSr)},${round1(ay + 3)} L${round1(c.x)},${round1(ay + 3)}`,
          cls: "down",
          dots: 0,
          dur: 0,
          reverse: null,
        });
      }
    });

    // 天枢 ⇄ 分支语义标签：锚定在 .branch 汇聚区，绝不沉底
    const reportTagX = round1(clamp(ceoX + 12, 8, Math.max(8, W - 122)));
    tags.push({
      text: "日报 · 建议先交天枢",
      x: reportTagX,
      y: round1(ceoBot + gap * 0.5),
      cls: "cyan m-right",
    });
    if (busyIndices.length) {
      tags.push({
        text: "派活",
        x: round1(clamp(ceoX - 12, 48, Math.max(48, W - 12))),
        y: round1(ceoBot + Math.min(13, gap * 0.28)),
        cls: "violet m-left",
      });
    }

    return { paths, nodes, tags };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeMobileTopology };
  }
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const D = window.DASHBOARD;
  const org = document.querySelector(".org");
  if (!D || !org) return;

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileQuery = window.matchMedia("(max-width: 640px)");
  const isMotionPaused = () => reduceQuery.matches || document.body.classList.contains("ts-motion-paused");

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  org.classList.add("flow-on");
  const svg = el("svg", { class: "flow-layer", "aria-hidden": "true" });
  org.prepend(svg);
  const tagsEl = document.createElement("div");
  tagsEl.className = "flow-tags";
  org.append(tagsEl);

  // 哪些 Agent 正在被派活（有在办工单或执行中的建议）
  const busy = new Set([
    ...(D.tickets || []).map((t) => t.agent),
    ...(D.proposals || []).filter((p) => p.status === "dispatched").map((p) => (p.agentId || "")),
  ]);
  const pending = (D.founder && D.founder.pending) || 0;

  const box = (n) => {
    const r = n.getBoundingClientRect(), o = org.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, cx: r.left - o.left + r.width / 2 };
  };
  const curve = (x1, y1, x2, y2) => {
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };

  function line(id, d, cls, dots, dur, reverse, paused) {
    svg.append(el("path", { id, d, class: `flow-path ${cls}` }));
    if (reverse === null || paused) return;
    for (let i = 0; i < dots; i++) {
      const c = el("circle", { r: cls === "up-founder" ? 3.2 : 2.6, class: `flow-dot ${cls}` });
      const m = el("animateMotion", {
        dur: `${dur}s`,
        repeatCount: "indefinite",
        begin: `${(-dur * i) / dots}s`,
        keyPoints: reverse ? "1;0" : "0;1",
        keyTimes: "0;1",
        calcMode: "linear",
      });
      m.append(el("mpath", { href: `#${id}` }));
      c.append(m);
      svg.append(c);
    }
  }

  function tag(text, x, y, cls) {
    const t = document.createElement("span");
    t.className = `flow-tag ${cls || ""}`.trim();
    t.textContent = text;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    tagsEl.append(t);
  }

  function draw() {
    svg.innerHTML = "";
    tagsEl.innerHTML = "";
    const o = org.getBoundingClientRect();
    if (o.width <= 0 || o.height <= 0) return;

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

    const founderEl = document.getElementById("founder");
    const ceoEl = document.getElementById("ceo");
    if (!founderEl || !ceoEl) return;
    const F = box(founderEl), C = box(ceoEl);
    const cards = [...document.querySelectorAll("#agents .card")];
    const boxes = cards.map(box);
    const paused = isMotionPaused();

    // 手机端（<=640px）：专属左侧垂直总线拓扑，零越界、零重叠
    if (mobileQuery.matches) {
      org.classList.add("flow-mobile");
      const cardMeta = cards.map((card, i) => {
        const A = boxes[i];
        const id = (card.dataset.go || "").replace("agent:", "");
        const a = (D.agents || []).find((x) => x.id === id) || {};
        const hd = card.querySelector(".hd");
        const hdRect = hd ? hd.getBoundingClientRect() : null;
        const anchorY = hdRect ? hdRect.top - o.top + hdRect.height / 2 : A.y + Math.min(20, A.h / 2);
        card.style.setProperty("--flow-delay", `${i * 40}ms`);
        return { id, x: A.x, y: A.y, w: A.w, h: A.h, anchorY, paused: !!a.paused, status: a.status || "ok" };
      });
      const plan = computeMobileTopology({
        orgWidth: o.width,
        founder: F,
        ceo: C,
        cards: cardMeta,
        pending,
        busyIds: busy,
        motionPaused: paused,
      });
      for (const p of plan.paths) {
        line(p.id, p.d, p.cls, p.dots, p.dur, p.reverse, paused);
      }
      for (const n of plan.nodes) {
        svg.append(el("circle", { id: n.id, cx: n.cx, cy: n.cy, r: n.r, class: `flow-node ${n.cls}` }));
      }
      for (const t of plan.tags) {
        tag(t.text, t.x, t.y, t.cls);
      }
      if (paused && typeof svg.pauseAnimations === "function") svg.pauseAnimations();
      return;
    }

    // 桌面端（>640px）：严格保持原有拓扑连线、光点与标签定位不变
    org.classList.remove("flow-mobile");
    line("p-up-f", curve(C.cx - 14, C.y, F.cx - 14, F.y + F.h), "up-founder", 3, 2.4, false, paused);
    tag("汇总报发起人", F.cx - 120, (F.y + F.h + C.y) / 2 - 10, "orange");
    if (pending) {
      line("p-down-f", curve(F.cx + 14, F.y + F.h, C.cx + 14, C.y), "down", 2, 2.4, false, paused);
      tag(`待拍板 ${pending}`, F.cx + 24, (F.y + F.h + C.y) / 2 - 10, "red");
    } else {
      line("p-down-f", curve(F.cx + 14, F.y + F.h, C.cx + 14, C.y), "idle", 0, 0, null, paused);
    }

    const top0 = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
    const rowGap = boxes.length > 1 ? 12 : 0;
    // 非第一排的卡片：先从卡片左上走到排间缝隙，再沿列间缝隙上到第一排上沿，不穿过上排卡片
    const route = (A, toX, toY, up) => {
      if (A.y - top0 < 4) return up ? curve(A.cx, A.y, toX, toY) : curve(toX, toY, A.cx, A.y);
      const gx = A.x - rowGap / 2 < 4 ? A.x + A.w + rowGap / 2 : A.x - rowGap / 2;
      const gy = A.y - rowGap / 2;
      const pts = `M${A.cx},${A.y} L${A.cx},${gy} L${gx},${gy} L${gx},${top0 - 8}`;
      const tail = curve(gx, top0 - 8, toX, toY).replace(/^M[^C]+/, " ");
      if (up) return pts + tail;
      const rev = `M${toX},${toY} ${curve(toX, toY, gx, top0 - 8).replace(/^M[^C]+/, "")} L${gx},${gy} L${A.cx},${gy} L${A.cx},${A.y}`;
      return rev;
    };
    cards.forEach((card, i) => {
      const A = boxes[i];
      const id = (card.dataset.go || "").replace("agent:", "");
      const a = (D.agents || []).find((x) => x.id === id) || {};
      const ex = C.x + C.w * (0.15 + (0.7 * (i + 0.5)) / cards.length);
      const st = a.paused ? "idle" : a.status === "error" ? "err" : a.status === "warn" ? "warn" : "up";
      line(`p-up-${i}`, route(A, ex - 5, C.y + C.h, true), st, a.paused ? 0 : a.stale ? 1 : 2, 3 + (i % 3) * 0.4, false, paused);
      if (busy.has(id) && !a.paused) {
        line(`p-dn-${i}`, route(A, ex + 5, C.y + C.h, false), "down", 2, 2.8, false, paused);
      }
      card.style.setProperty("--flow-delay", `${i * 60}ms`);
    });
    if (cards.length) {
      const A0 = box(cards[0]);
      tag("日报 · 建议先交天枢", C.x - 150, (C.y + C.h + A0.y) / 2 - 12, "cyan");
      if (busy.size) tag("派活", C.x + C.w + 12, (C.y + C.h + A0.y) / 2 - 12, "violet");
    }
    if (paused && typeof svg.pauseAnimations === "function") svg.pauseAnimations();
  }

  // 数字滚动：卡片主数值与 CEO 统计
  if (!isMotionPaused()) {
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

  // 悬停或聚焦卡片：高亮它自己的连线与节点
  document.querySelectorAll("#agents .card").forEach((card, i) => {
    const on = () => svg.querySelectorAll(`#p-up-${i}, #p-dn-${i}, #p-node-${i}`).forEach((p) => p.classList.add("hot"));
    const off = () => svg.querySelectorAll(".hot").forEach((p) => p.classList.remove("hot"));
    card.addEventListener("mouseenter", on);
    card.addEventListener("mouseleave", off);
    card.addEventListener("focus", on);
    card.addEventListener("blur", off);
  });

  let raf = 0;
  const redraw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  };
  window.addEventListener("resize", redraw);
  if (typeof mobileQuery.addEventListener === "function") mobileQuery.addEventListener("change", redraw);
  if (typeof reduceQuery.addEventListener === "function") reduceQuery.addEventListener("change", redraw);

  // 切回总览页时重画（隐藏状态下取不到尺寸）
  const overviewEl = document.getElementById("view-overview");
  if (overviewEl) {
    new MutationObserver(() => {
      if (!overviewEl.hidden) redraw();
    }).observe(overviewEl, { attributes: true, attributeFilter: ["hidden"] });
  }
  // 响应顶栏「动效开 / 动效停」切换
  let lastPaused = isMotionPaused();
  new MutationObserver(() => {
    const nowPaused = isMotionPaused();
    if (nowPaused !== lastPaused) {
      lastPaused = nowPaused;
      redraw();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  if (typeof ResizeObserver === "function") {
    let lastSize = "";
    new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (key !== lastSize) {
        lastSize = key;
        redraw();
      }
    }).observe(org);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  redraw();
})();
