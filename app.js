/* 天枢看板：读取 window.DASHBOARD（由 hub/build_site.py 生成），无框架、无外部依赖。 */
(() => {
  const D = window.DASHBOARD;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (!D) { document.querySelector("main").innerHTML = '<p class="empty">没有看板数据，请先运行 <code>python hub/build_site.py</code>。</p>'; return; }

  const ASHARE = "https://fuguang-z.github.io/ashare-market-state/";  // 观澜 · A股 详情页嵌入的原站（D53）；内嵌带 ?embed=tianshu 用天枢深色，新窗口打开为原站白底（10-28）
  const PALETTE = ["#4f8cff", "#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f472b6", "#94a3b8", "#fb7185"];
  const pendingDecisions = D.decisions.filter((d) => d.status === "pending");
  const hhmm = (iso) => (iso || "").slice(11, 16);

  // ── 顶栏 ──
  const active = D.agents.filter((a) => !a.paused);  // D53：封存的不算在岗
  const online = active.filter((a) => a.status !== "idle" && !a.stale).length;
  $("#online").innerHTML = `<span class="dot">●</span> ${online}/${active.length} Agent 在岗`;
  $("#updated").textContent = `更新 ${D.generatedAt.slice(5, 16).replace("T", " ")}${D.public ? " · 公开版" : ""}`;

  const tabs = [{ id: "overview", label: "总览" }, { id: "outputs", label: "成果" },
    { id: "changes", label: "变更", badge: (D.changes?.open || []).length },
    { id: "queue", label: "待办", badge: pendingDecisions.length + D.tickets.length },
    { id: "cmd", label: "指令" }, { id: "annual", label: "轻体" },
    ...(D.public ? [] : [{ id: "freedom", label: "扶摇", fullLabel: "扶摇 · 自由" }]),  // 扶摇 · 自由（10-29）：个人财务，公开看板不出现
    ...D.agents.map((a) => ({ id: "agent:" + a.id, label: a.name.replace(/ ?Agent/, "").split("·")[0].trim(), fullLabel: a.name, paused: a.paused }))];
  // 顶部导航只显示古名；完整职能名称保留在悬停提示和无障碍名称中。
  $("#tabs").innerHTML = tabs.map((t) => {
    const fullLabel = t.fullLabel || t.label;
    return `<button role="tab" data-tab="${t.id}" aria-label="${esc(fullLabel)}" title="${esc(fullLabel + (t.paused ? "（已封存，暂停推进）" : ""))}"${t.paused ? ' class="paused"' : ""}>${esc(t.label)}${t.badge ? `<span class="badge">${t.badge}</span>` : ""}</button>`;
  }).join("");
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(b.dataset.tab); });

  function go(tab) {
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    document.body.classList.toggle("full-embed", tab === "agent:invest");  // 观澜整屏：收起页脚和底部留白
    window.TianShuScenes?.show(tab, !!D.agents.find((a) => `agent:${a.id}` === tab)?.paused);
    if (tab.startsWith("agent:")) { renderAgent(tab.slice(6)); $("#view-agent").hidden = false; }
    else $("#view-" + tab).hidden = false;
    try { localStorage.setItem("ceo-hub-tab", tab); } catch (_) {}
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
  }

  // ── 总览：组织拓扑 ──
  const p = D.founder.pending;
  $("#founder").innerHTML = `<div class="avatar">我</div>
    <div class="who"><b>${esc(D.founder.name)}</b><small>只看汇报 · 做决策 · 开拓新板块</small></div>
    <span class="pending ${p ? "" : "zero"}" data-go="queue" style="cursor:pointer">${p ? `待你拍板 ${p} 件` : "无需拍板"}</span>`;
  $("#ceo").innerHTML = `<div class="row"><div class="ring"></div>
      <div><b>${esc(D.ceo.name === "CEO Agent" ? "天枢" : D.ceo.name)}</b><small style="display:block">${esc(D.ceo.role)}</small></div></div>
    <div class="stats"><span>日报 <b>${D.ceo.reportsIn}/${D.ceo.agentsTotal}</b></span>
      <span>自动修复 <b>${D.ceo.autoFixed}</b></span><span>在办工单 <b>${D.ceo.ticketsOpen}</b></span>
      <span>汇总 <b>${esc(D.ceo.schedule)}</b></span></div>`;

  // 扶摇 · 自由（10-29 发起人：排在各分支第一个、论文之前）：个人财务只在本页签内现取，卡片不带任何金额；公开看板不出现
  const freedomCard = D.public ? "" : `<div class="card fy-card" data-go="freedom" tabindex="0">
      <div class="hd"><span class="status ok"></span>扶摇 · 自由</div>
      <div class="big">收入 · 交易</div>
      <div class="sub">工资与收入 · 股票</div>
      <ul><li><span>工资与收入</span><b>工资表 · 收入分析</b></li><li><span>股票</span><b>交易 · 资金 · 交割单 · 历史</b></li></ul>
      <div class="sched"><span>来自 收入明细原表 · NAS 私有</span></div>
    </div>`;
  $("#agents").innerHTML = freedomCard + D.agents.map((a) => {
    const n = { P0: 0, P1: 0, P2: 0 };
    a.issues.forEach((i) => n[i.level]++);
    const main = a.kpis[0];
    const items = a.items.slice(0, 3).map((it) =>
      `<li><span>${esc(it.label)}</span><b>${esc(it.value)}</b></li>`).join("");
    return `<div class="card${a.paused ? " paused" : ""}" data-go="agent:${a.id}" tabindex="0">
      <div class="hd"><span class="status ${a.paused ? "idle" : a.status}"></span>${esc(a.name)}${a.paused ? ' <span class="stale">封存</span>' : a.stale ? ' <span class="stale">旧日报</span>' : ""}</div>
      ${a.paused ? "" : `<div class="big">${esc(main ? main.value : "—")}</div>`}
      <div class="sub" title="${esc(a.headline)}">${esc(main && !a.paused ? main.label + " · " : "")}${esc(a.domain)}</div>
      <ul>${items}</ul>
      <div class="sched"><span>${a.source ? `来自 ${esc(a.source)}` : `日报 ${esc(a.schedule)}`} · ${esc(a.owner)}</span>
        <span class="chips">${a.paused ? "" : ["P0", "P1", "P2"].filter((l) => n[l]).map((l) => `<span class="chip ${l}">${l} ${n[l]}</span>`).join("")}</span></div>
    </div>`;
  }).join("");

  document.addEventListener("click", (e) => { const t = e.target.closest("[data-go]"); if (t) go(t.dataset.go); });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset?.go) go(e.target.dataset.go); });

  // ── 总览：队列 / 日志 / 工作量 / 简报 ──
  // 文件引用 → 可读位置 + 打开/定位按钮（按钮在天枢（本机）里才可用，见 workbench.js）
  const prettyRef = (r) => {
    const [k, ...rest] = String(r).split(":"); const v = rest.join(":");
    const [head, ...tail] = v.split("/");
    const name = { out: "成果同步区", proj: "项目", hub: "天枢", abs: "本机" }[k] || k;
    return k === "abs" ? v : `${name} › ${head}${tail.length ? " › " + tail.join("/") : ""}`;
  };
  window.filesHtml = (files) => (files && files.length) ? `<div class="files">${files.map((r) =>
    `<span class="fref" data-ref="${esc(r)}"><code title="${esc(r)}">${esc(prettyRef(r))}</code>
      <button class="fbtn" data-act="open" data-ref="${esc(r)}">打开</button><button class="fbtn" data-act="reveal" data-ref="${esc(r)}">定位</button></span>`).join("")}</div>` : "";
  const decisionRow = (d) => `<div class="q"><span class="id">${esc(d.id)}</span>
    <div class="t">${esc(d.title)}<small>${esc(d.from)} · ${esc(d.reason)}${d.status !== "pending" ? ` · 已${d.status === "decided" ? "拍板" : "驳回"}：${esc(d.decision)}` : ""}</small>
    ${d.detail && d.status === "pending" ? `<small class="detail">${esc(d.detail)}</small>` : ""}${filesHtml(d.files)}</div></div>`;
  const ticketRow = (t) => `<div class="q"><span class="chip ${t.level}">${t.level}</span>
    <div class="t">${esc(t.title)}<small>派给 ${esc(t.owner)} · 第 ${t.days} 天${t.days >= 2 ? "（明天起可能上报你）" : ""}</small>
    ${t.detail ? `<small class="detail">${esc(t.detail)}</small>` : ""}${filesHtml(t.files)}</div></div>`;
  $("#ov-queue").innerHTML = (pendingDecisions.map(decisionRow).join("") + D.tickets.map(ticketRow).join(""))
    || '<p class="empty">今天没有需要处理的事项。</p>';

  $("#ov-log").innerHTML = D.log.slice(0, 40).map((r) => `<li class="${r.level}"><time>${hhmm(r.t)}</time>
    <span class="actor" title="${esc(r.machine || "")}">${esc(r.actor)}</span><span class="ev">${esc(r.event)}${r.detail ? `<small>${esc(r.detail)}</small>` : ""}</span></li>`).join("")
    || '<li class="empty">暂无日志</li>';

  const W = D.workload, colors = {};
  W.actors.forEach((a, i) => (colors[a] = PALETTE[i % PALETTE.length]));
  const max = Math.max(1, ...W.days.map((d) => Object.values(W.matrix[d] || {}).reduce((s, v) => s + v, 0)));
  $("#ov-work").innerHTML = `<div class="bars">${W.days.map((d) => {
      const m = W.matrix[d] || {};
      const tot = Object.values(m).reduce((s, v) => s + v, 0);
      return `<div class="bar" title="${d}：${tot} 条">${W.actors.filter((a) => m[a]).map((a) =>
        `<i style="height:${(m[a] / max) * 140}px;background:${colors[a]}" title="${esc(a)} ${m[a]}"></i>`).join("")}</div>`;
    }).join("")}</div>
    <div class="axis"><span>${W.days[0].slice(5)}</span><span>${W.days.at(-1).slice(5)}</span></div>
    <div class="legend">${W.actors.map((a) => `<span style="--c:${colors[a]}">${esc(a)}</span>`).join("")}</div>`;

  if (D.ceo.brief) {
    $("#brief").innerHTML = esc(D.ceo.brief.replace(/\n{2,}/g, "\n")).replace(/^#+ (.*)$/gm, "<b>$1</b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  } else $("#brief-panel").hidden = true;

  // ── 待办页 ──
  const todoRows = [
    ...pendingDecisions.map((d) => ({ tag: d.kind === "suggestion" ? "建议" : "拍板", cls: d.kind === "suggestion" ? "P1" : "P0",
      title: `${d.id} ${d.title}`, where: d.reason, detail: d.detail, files: d.files })),
    ...(D.todos || []).map((t) => ({ tag: "待处理", cls: "P1", title: t.title, where: `${t.from} · ${t.where || ""}`, files: t.files })),
    ...D.tickets.filter((t) => !pendingDecisions.some((d) => d.key && d.key === t.key)).map((t) => ({ tag: t.level, cls: t.level, title: t.title, where: `派给 ${t.owner} · 第 ${t.days} 天`, detail: t.detail, files: t.files })),
  ];
  $("#q-todos").innerHTML = todoRows.map((r) => `<div class="q"><span class="chip ${r.cls}">${esc(r.tag)}</span>
    <div class="t">${esc(r.title)}<small>${esc(r.where || "")}</small>${r.detail ? `<small class="detail">${esc(r.detail)}</small>` : ""}${filesHtml(r.files)}</div></div>`).join("")
    || '<p class="empty">暂无需要你处理的问题。</p>';
  $("#q-decisions").innerHTML = D.decisions.map(decisionRow).join("") || '<p class="empty">暂无待拍板事项。P1 连续 3 天未解决或出现 P0 时会出现在这里（天枢提示，不接飞书）。</p>';
  $("#q-tickets").innerHTML = D.tickets.map(ticketRow).join("") || '<p class="empty">暂无在办工单。</p>';
  const PSTAGE = { proposed: ["待拍板", "P1"], dispatched: ["执行中", "P2"], reviewing: ["待验收", "P1"],
    accepted: ["已验收", "P2"], failed: ["验收不通过·重派", "P0"], rejected: ["已驳回", "P2"], approved: ["已同意", "P2"] };
  $("#q-proposals").innerHTML = (D.proposals || []).map((p) => {
    const [label, cls] = PSTAGE[p.status] || [p.status, "P2"];
    const eff = p.effect ? ` · 效果：${esc(p.metric)} ${p.effect.delta >= 0 ? "+" : ""}${esc(p.effect.delta)}` : "";
    return `<div class="q"><span class="chip ${cls}">${label}</span><div class="t">${esc(p.id)} ${esc(p.title)}
      <small>${esc(p.from)} 提出 · 负责 ${esc(p.owner)} · ${esc(p.created)}${eff}</small></div></div>`;
  }).join("") || '<p class="empty">暂无建议。情报 Agent 研究视频后提炼的建议会出现在这里。</p>';

  // ── 变更页：项目版本 / 开工收工 / 改动批次 / 中枢提交 ──
  const C = D.changes || { projects: [], open: [], batches: [], tasks: [] };
  const mmdd = (iso) => (iso || "—").slice(5, 16).replace("T", " ");
  const nText = (n) => n ? `+${n.added} ~${n.modified} -${n.deleted}` : "";
  $("#c-versions").innerHTML = (C.open.length ? C.open.map((t) =>
      `<div class="q"><span class="chip P1">在办</span><div class="t">${esc(t.machine)} · ${esc(t.agent)} 正在改 ${esc(t.project)}<small>${mmdd(t.t)} 开工</small></div></div>`).join("") : "")
    + (C.projects.length ? `<table><tr><th>项目</th><th>电脑</th><th>版本</th><th>文件数</th><th>最近改动</th><th>状态</th></tr>${C.projects.map((p) =>
      p.machines.map((m, i) => `<tr>${i ? "" : `<td rowspan="${p.machines.length}">${esc(p.name)}<small class="n"> ${esc(p.sync)}${p.scoped ? " · 只同步部分目录" : ""}</small></td>`}
        <td>${esc(m.label)}</td><td><code>${esc(m.fingerprint)}</code></td><td>${m.files}</td>
        <td class="n">${m.lastAt ? `${mmdd(m.lastAt)} · ${esc(m.lastBy)}` : `扫描 ${mmdd(m.scannedAt)}`}</td>
        <td>${p.gaps.filter((g) => g.who === m.label).map((g) => `<span class="chip P1">落后${esc(g.than)} ${g.n}</span>`).join("") || (p.machines.length > 1 ? '<span class="chip ok">已同步</span>' : "")}</td></tr>`).join("")).join("")}</table>`
      : '<p class="empty">还没有项目清单。运行 <code>python hub/changes.py scan</code> 建立基线。</p>');
  $("#c-tasks").innerHTML = C.tasks.map((t) => `<div class="q"><span class="chip ${t.event === "begin" ? "P2" : "ok"}">${t.event === "begin" ? "开工" : "收工"}</span>
    <div class="t">${esc(t.agent)} @ ${esc(t.machine)} · ${esc(t.project)}${t.forced ? ' <span class="chip P1">放行</span>' : ""}
    <small>${mmdd(t.t)}${t.n ? " · " + nText(t.n) : ""}${t.text ? " · " + esc(t.text) : ""}</small></div></div>`).join("") || '<p class="empty">近 14 天没有开工记录。</p>';
  $("#c-batches").innerHTML = C.batches.map((b) => {
    const list = ["added", "modified", "deleted"].flatMap((k) => (b[k] || []).map((p) => `${{ added: "+", modified: "~", deleted: "-" }[k]} ${p}`));
    return `<div class="q"><span class="chip ${b.by === "未登记" ? "P1" : "P2"}">${esc(b.by)}</span>
      <div class="t">${esc(b.project)} · ${esc(b.machine)} <code>${esc(b.fingerprint || "")}</code><small>${mmdd(b.t)} · ${nText(b.n)}</small>
      ${list.length ? `<details><summary>${list.length}${b.truncated ? "+" : ""} 个路径</summary><pre>${esc(list.join("\n"))}</pre></details>` : ""}</div></div>`;
  }).join("") || '<p class="empty">近 14 天没有文件改动。</p>';
  $("#c-commits").innerHTML = (D.commits || []).length ? `<table><tr><th>时间</th><th>提交</th><th>作者</th>${D.public ? "" : "<th>说明</th>"}</tr>${D.commits.map((c) =>
    `<tr><td>${mmdd(c.t)}</td><td><code>${esc(c.hash)}</code></td><td>${esc(c.author)}</td>${D.public ? "" : `<td class="n">${esc(c.subject)}</td>`}</tr>`).join("")}</table>` : '<p class="empty">无提交记录</p>';

  // ── Agent 详情页 ──
  // D53：观澜详情页只放 A股站，高度铺满标题以下一屏；10-28 起宽度与其他页面一致（main 1400px 内），不再撑到窗口两边
  function fitAshare() {
    const box = document.querySelector(".ashare-full");
    if (!box || !box.offsetParent) return;
    const r = box.getBoundingClientRect();
    box.querySelector("iframe").style.height = `${Math.max(420, innerHeight - (r.top + scrollY) - 16)}px`;
  }
  window.addEventListener("resize", fitAshare);

  // 明细：有 group 的分成多个大板块（如简牍的「技术标」「竣工资料」），没有的仍是一个「明细」
  function itemPanels(items) {
    const table = (rows) => `<table class="items"><thead><tr><th>项目</th><th>值</th><th>说明</th><th>路径</th></tr></thead><tbody>${rows.map((it) =>
      `<tr><td data-k="项目">${esc(it.label)}</td><td data-k="值">${esc(it.value)}</td><td class="n" data-k="说明">${esc(it.note || "") || "—"}</td>
       <td class="path" data-k="路径">${(it.files || []).length ? filesHtml(it.files) : '<span class="n">—</span>'}</td></tr>`).join("")}</tbody></table>`;
    if (!items.length) return '<article class="panel"><h3>明细</h3><p class="empty">暂无明细</p></article>';
    const groups = [...new Set(items.map((it) => it.group || ""))];
    return groups.map((g) => `<article class="panel"><h3>${g ? esc(g) : "明细"}</h3>${table(items.filter((it) => (it.group || "") === g))}</article>`).join("");
  }

  function listHtml(L) {
    if (!L) return "";
    if (L.cards) return `<article class="panel"><h3>${esc(L.title)}</h3><div class="list-scroll">${L.cards.map((c) =>
      `<div class="sum-card"><b>${esc(c.title)}</b><small>${esc(c.meta)}</small>
        ${c.points.length ? `<ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${c.landing ? `<p class="landing"><span>落地</span>${esc(c.landing)}</p>` : ""}${filesHtml(c.files)}</div>`).join("") || '<p class="empty">暂无</p>'}</div></article>`;
    return `<article class="panel"><h3>${esc(L.title)}</h3><div class="list-scroll"><table class="compact"><thead><tr>${L.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${L.rows.map((r) => `<tr>${r.map((v, i) => `<td${i === r.length - 1 ? ' class="n"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></article>`;
  }

  function renderAgent(id) {
    const a = D.agents.find((x) => x.id === id);
    const tk = D.tickets.filter((t) => t.agent === id);
    if (id === "invest") {
      $("#view-agent").innerHTML = `
      <div class="detail-hd"><span class="status ${a.status}"></span><h2>${esc(a.name)}</h2>
        <small>${esc(a.domain)} · 负责 ${esc(a.owner)} · 与原站同一份页面，改一处两边同步 · <a href="${ASHARE}" target="_blank" rel="noopener">新窗口打开</a></small></div>
      <div class="ashare-full"><iframe src="${ASHARE}?embed=tianshu" title="A股市场状态" referrerpolicy="no-referrer"></iframe></div>`;
      requestAnimationFrame(() => requestAnimationFrame(fitAshare)); setTimeout(fitAshare, 300);  // 直接打开链接时首帧布局未定，再校正一次
      return;
    }
    $("#view-agent").innerHTML = `
      <div class="detail-hd"><span class="status ${a.paused ? "idle" : a.status}"></span><h2>${esc(a.name)}</h2>
        <small>${esc(a.domain)} · 负责 ${esc(a.owner)} · 每天 ${esc(a.schedule)} 交日报${a.reportAt ? ` · 本次 ${a.reportAt.slice(5, 16).replace("T", " ")}` : ""}</small></div>
      ${a.paused ? `<p class="paused-note">已封存，暂停推进：日报照收，不派工单、不上报拍板。${esc(a.pausedNote || "")}</p>` : ""}
      <div class="kpis">${a.kpis.map((k) => `<div class="kpi"><small>${esc(k.label)}</small><b>${esc(k.value)}</b></div>`).join("") || '<p class="empty">暂无指标</p>'}</div>
      <article class="panel"><h3>给天枢的汇报${a.source ? ` <small>采用 ${esc(a.source)} 的进度（证据 ${esc((a.asOf || "—").slice(0, 16).replace("T", " "))}）</small>` : ""}</h3><p>${esc(a.summary) || "（无）"}</p>
        ${a.peers && a.peers.length > 1 ? `<table><tr><th>电脑</th><th>证据时间</th><th>状态</th></tr>${a.peers.map((p) =>
          `<tr><td>${esc(p.label)}</td><td>${esc((p.asOf || "—").slice(0, 16).replace("T", " "))}</td><td class="n">${esc(p.headline)}</td></tr>`).join("")}</table>` : ""}</article>
      ${itemPanels(a.items)}
      ${listHtml(a.list)}
      <article class="panel"><h3>问题 <small>P2 自修 · P1 天枢派单 · P0 上报你</small></h3>${a.issues.map((i) =>
        `<div class="q"><span class="chip ${i.level}">${i.level}</span><div class="t">${esc(i.title)}${i.detail ? `<small>${esc(i.detail)}</small>` : ""}</div></div>`).join("") || '<p class="empty">无问题</p>'}
        ${tk.length ? `<h3 style="margin-top:14px">在办工单</h3>${tk.map(ticketRow).join("")}` : ""}</article>`;
    if (id === "knowledge" && !D.public && window.TianShuLibrary) {
      const host = $("#view-agent");
      window.TianShuLibrary.mount(host, { dashboard: D, agent: a, legacyHTML: host.innerHTML });
    }
  }

  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (tabs.some((t) => t.id === h)) go(h); });
  let start = location.hash.slice(1);
  try { start = start || localStorage.getItem("ceo-hub-tab"); } catch (_) {}
  go(tabs.some((t) => t.id === start) ? start : "overview");
})();
