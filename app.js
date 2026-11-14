/* 天枢看板：读取 window.DASHBOARD（由 hub/build_site.py 生成），无框架、无外部依赖。 */
(() => {
  const D = window.DASHBOARD;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (!D) { document.querySelector("main").innerHTML = '<p class="empty">没有看板数据，请先运行 <code>python hub/build_site.py</code>。</p>'; return; }

  const ASHARE = "https://fuguang-z.github.io/ashare-market-state/";  // 观澜 · A股 详情页嵌入的原站（D53）；内嵌带 ?embed=tianshu 用天枢深色，新窗口打开为原站白底（10-28）
  const PALETTE = ["#4f8cff", "#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f472b6", "#94a3b8", "#fb7185"];
  const proposals = D.proposals || [];
  const intelCards = D.agents.find((a) => a.id === "intel")?.list?.cards || [];
  const lingxiByCard = new Map();
  const lingxiIds = new Set();
  const hubPath = (ref) => ref.replace(/^hub:/, "");
  for (const p of proposals) {
    if (D.public || p.agentId !== "intel" || !p.source) continue;
    const matches = intelCards.filter((c) => (c.files || []).some((ref) => hubPath(ref) === hubPath(p.source)));
    if (matches.length !== 1) continue;
    const card = matches[0];
    if (!lingxiByCard.has(card)) lingxiByCard.set(card, []);
    lingxiByCard.get(card).push(p);
    lingxiIds.add(p.id);
  }
  const decisionsByProposal = new Map(D.decisions.filter((d) => d.proposal).map((d) => [d.proposal, d]));
  const proposalDecision = (p) => p.decision || decisionsByProposal.get(p.id);
  const isProposalPending = (p) => {
    if (p.delivery) return false;
    const decision = proposalDecision(p);
    return decision ? decision.status === "pending" : p.status === "proposed";
  };
  const landedIds = new Set(proposals.filter((p) => lingxiIds.has(p.id) && p.delivery).map((p) => p.id));
  const queueDecisions = D.decisions.filter((d) => !landedIds.has(d.proposal));
  const pendingDecisions = queueDecisions.filter((d) => d.status === "pending");
  const lingxiPending = proposals.filter((p) => lingxiIds.has(p.id) && isProposalPending(p)).length;
  const todoTickets = D.tickets.filter((t) => !D.decisions.some((d) => d.status === "pending" && d.key && d.key === t.key));
  const hhmm = (iso) => (iso || "").slice(11, 16);

  // ── 顶栏 ──
  const active = D.agents.filter((a) => !a.paused);  // D53：封存的不算在岗
  const online = active.filter((a) => a.status !== "idle" && !a.stale).length;
  $("#online").innerHTML = `<span class="dot">●</span> ${online}/${active.length} Agent 在岗`;
  $("#updated").textContent = `更新 ${D.generatedAt.slice(5, 16).replace("T", " ")}${D.public ? " · 公开版" : ""}`;

  const tabs = [{ id: "overview", label: "总览" }, { id: "outputs", label: "成果" },
    { id: "changes", label: "变更", badge: (D.changes?.open || []).length },
    { id: "audit", label: "勘合", badge: (D.audit?.entries || []).filter(e => !e.workflow?.eligibleForCard || e.workflow?.card?.state !== "stored").length },
    { id: "queue", label: "待办", badge: pendingDecisions.length + todoTickets.length + (D.todos || []).length },
    { id: "cmd", label: "指令" }, { id: "annual", label: "轻体" },
    ...(D.public ? [] : [{ id: "freedom", label: "扶摇", fullLabel: "扶摇 · 自由" }]),  // 扶摇 · 自由（10-29）：个人财务，公开看板不出现
    ...D.agents.map((a) => ({ id: "agent:" + a.id, label: a.name.replace(/ ?Agent/, "").split("·")[0].trim(), fullLabel: a.name,
      paused: a.paused, badge: a.id === "intel" ? lingxiPending : 0 }))];
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
    else { if (tab === "audit") renderAudit(); $("#view-" + tab).hidden = false; }
    try { localStorage.setItem("ceo-hub-tab", tab); } catch (_) {}
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
  }

  // ── 勘合：只读呈现交叉审核、两轮上限与实际入库卡片。 ──
  function renderAudit() {
    const host = $("#view-audit");
    if (!window.TianShuAudit) {
      host.innerHTML = '<article class="panel"><h2>勘合</h2><p class="empty" role="alert">勘合界面未加载，请刷新页面后重试。</p></article>';
      return;
    }
    window.TianShuAudit.mount(host, D.audit, {
      canOpenFiles: !D.public && /^(127\.0\.0\.1|localhost|100\.\d+\.\d+\.\d+)$/.test(location.hostname),
    });
  }

  // ── 总览：组织拓扑 ──
  const p = Math.max(0, D.founder.pending - proposals.filter((p) =>
    landedIds.has(p.id) && proposalDecision(p)?.status === "pending").length);
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
    ...todoTickets.map((t) => ({ tag: t.level, cls: t.level, title: t.title, where: `派给 ${t.owner} · 第 ${t.days} 天`, detail: t.detail, files: t.files })),
  ];
  $("#q-todos").innerHTML = todoRows.map((r) => `<div class="q"><span class="chip ${r.cls}">${esc(r.tag)}</span>
    <div class="t">${esc(r.title)}<small>${esc(r.where || "")}</small>${r.detail ? `<small class="detail">${esc(r.detail)}</small>` : ""}${filesHtml(r.files)}</div></div>`).join("")
    || '<p class="empty">暂无需要你处理的问题。</p>';
  $("#q-decisions").innerHTML = queueDecisions.map(decisionRow).join("")
    || `<p class="empty">暂无${lingxiByCard.size ? "其他" : ""}待拍板事项。P1 连续 3 天未解决或出现 P0 时会出现在这里（天枢提示，不接飞书）。</p>`;
  $("#q-tickets").innerHTML = D.tickets.map(ticketRow).join("") || '<p class="empty">暂无在办工单。</p>';
  const PSTAGE = { proposed: ["待拍板", "P1"], dispatched: ["执行中", "P2"], reviewing: ["待验收", "P1"],
    accepted: ["已验收", "P2"], failed: ["验收不通过·重派", "P0"], rejected: ["已驳回", "P2"], approved: ["已同意", "P2"] };
  function proposalRow(p, decision, files) {
    const [label, cls] = PSTAGE[p.status] || [p.status, "P2"];
    const eff = p.effect ? ` · 效果：${esc(p.metric)} ${p.effect.delta >= 0 ? "+" : ""}${esc(p.effect.delta)}` : "";
    return `<div class="q"><span class="chip ${cls}">${esc(label)}</span><div class="t">${esc(p.id)} ${esc(p.title)}
      <small>${decision ? `${esc(decision.id)} · ` : ""}${esc(p.from)} 提出 · 负责 ${esc(p.owner)} · ${esc(p.created)}${eff}</small>
      ${decision?.detail ? `<small class="detail">${esc(decision.detail)}</small>` : ""}
      ${decision && decision.status !== "pending" ? `<small>已${decision.status === "decided" ? "拍板" : "驳回"}：${esc(decision.decision)}</small>` : ""}${filesHtml(files)}</div></div>`;
  }
  $("#q-proposals").innerHTML = proposals.filter((p) => !lingxiIds.has(p.id)).map((p) => proposalRow(p)).join("")
    || (lingxiByCard.size ? '<p class="empty">暂无其他建议。</p>' : '<p class="empty">暂无建议。情报 Agent 研究视频后提炼的建议会出现在这里。</p>');

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

  const lingxiValue = (value) => /^https:\/\/[^\s]+$/i.test(value) ?
    `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>` : esc(value);

  function lingxiSections(sections) {
    return sections.map(({ title, fields, table, note }) => `<section class="lingxi-section"><h5>${esc(title)}</h5>
      ${fields?.length ? `<dl>${fields.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${lingxiValue(value)}</dd>`).join("")}</dl>` : ""}
      ${table?.rows?.length ? `<div class="lingxi-table" role="region" aria-label="${esc(title)}" tabindex="0">
        <table><thead><tr>${table.columns.map((column) => `<th scope="col">${esc(column)}</th>`).join("")}</tr></thead>
        <tbody>${table.rows.map((row) => `<tr>${row.map((value) => `<td>${lingxiValue(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${note ? `<p class="n">${esc(note)}</p>` : ""}</section>`).join("");
  }

  const REVIEW_FIELDS = ["标的或主题", "选对依据", "下车原因", "若持有至今结果", "可改进的一条纪律"];
  const REVIEW_KEY = "tianshu-lingxi-reviews-v1";
  const beijingDate = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

  function lingxiReviewForm() {
    const today = beijingDate();
    return `<form class="lingxi-form" data-lingxi-review><h5>记一条交易纪律复盘</h5>
      <label>复盘日期 <input type="date" name="date" required value="${today}" max="${today}"></label>
      ${REVIEW_FIELDS.map((field, i) => `<label>${field}<textarea name="field-${i}" required maxlength="400"></textarea></label>`).join("")}
      <p class="n">内容存于当前浏览器。证据不足的比较结果可填写「无法计算」并注明缺口。</p>
      <button type="submit">保存复盘</button> <output aria-live="polite"></output><div data-lingxi-reviews></div></form>`;
  }

  function mountLingxiReview(form) {
    if (!form) return;
    const output = form.querySelector("output");
    const list = form.querySelector("[data-lingxi-reviews]");
    const read = () => {
      try {
        const entries = JSON.parse(localStorage.getItem(REVIEW_KEY) || "[]");
        return Array.isArray(entries) ? entries.filter((r) => r?.date && Array.isArray(r.values)) : [];
      } catch (_) { return []; }
    };
    function refresh() {
      const entries = read();
      const day = new Date(`${beijingDate()}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      const weekStart = day.toISOString().slice(0, 10);
      const count = entries.filter((entry) => entry.date >= weekStart && entry.date <= beijingDate()).length;
      list.innerHTML = `<p class="n">本周 ${count} 条 · 交易纪律复盘</p>` + entries.slice().reverse().map(({ date, values }) =>
        `<details><summary>${esc(date)} · ${esc(values[0])}</summary><dl>${values.map((value, i) =>
          `<dt>${esc(REVIEW_FIELDS[i])}</dt><dd>${esc(value)}</dd>`).join("")}</dl></details>`).join("");
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const values = REVIEW_FIELDS.map((_, i) => String(data.get(`field-${i}`) || "").trim());
      if (values.some((value) => !value)) { output.textContent = "请完整填写各项。"; return; }
      try {
        localStorage.setItem(REVIEW_KEY, JSON.stringify([...read(), { date: data.get("date"), values }]));
        form.reset();
        output.textContent = "已保存。";
        refresh();
      } catch (_) { output.textContent = "当前浏览器无法保存，填写内容已保留。"; }
    });
    refresh();
  }

  let marketTools;
  function mountLingxiTools(host) {
    const search = host.querySelector("#lingxi-search");
    const status = host.querySelector(".lingxi-search output");
    if (search) search.addEventListener("input", () => {
      const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      let matches = 0;
      for (const card of host.querySelectorAll("[data-lingxi-source]")) {
        const source = card.dataset.lingxiSource.toLowerCase();
        const items = [...card.querySelectorAll("[data-lingxi-item]")];
        for (const item of items) {
          item.hidden = !terms.every((term) => `${source} ${item.textContent.toLowerCase()}`.includes(term));
          if (!item.hidden) matches++;
        }
        const description = [...card.children].filter((child) => !child.matches("section.lingxi-closure"))
          .map((child) => child.textContent.toLowerCase()).join(" ");
        card.hidden = !items.some((item) => !item.hidden) && !terms.every((term) => description.includes(term));
      }
      status.textContent = terms.length ? `匹配 ${matches} 项已上线内容` : "";
    });
    mountLingxiReview(host.querySelector("[data-lingxi-review]"));
    const mounts = [...host.querySelectorAll("[data-lingxi-market]")];
    if (!mounts.length) return;
    if (!marketTools) marketTools = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "lingxi-market.js?v=20261109b";
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    marketTools.then(() => mounts.forEach((mount) => {
      mount.innerHTML = window.TianShuLingxiMarket?.render(mount.dataset.lingxiMarket) || "";
    })).catch(() => {
      marketTools = undefined;
      mounts.forEach((mount) => { mount.textContent = "规则工具加载失败，重新打开灵犀可重试。"; });
    });
  }

  function lingxiDelivery(p) {
    const delivery = p.delivery;
    const hasMarketTool = ["S1108-01", "S1108-09", "S1108-10", "S1108-16"].includes(p.id);
    const reviewStatus = { accepted: "已验收", failed: "待修正", rejected: "已驳回" }[p.status];
    return `<article class="lingxi-delivery" data-lingxi-item="${esc(p.id)}">
      <h4>${esc(p.title)} <span class="chip ok">已上线</span></h4>
      <small class="n">${esc(p.id)}${reviewStatus ? ` · ${reviewStatus}` : ""}${delivery.tags?.length ? ` · ${delivery.tags.map(esc).join(" · ")}` : ""}</small>
      <p>${esc(delivery.summary)}</p>
      <details><summary>查看内容${hasMarketTool ? "与工具" : ""}</summary>
        ${lingxiSections(delivery.sections)}${delivery.note ? `<p class="n">${esc(delivery.note)}</p>` : ""}
        ${p.id === "S1108-15" ? lingxiReviewForm() : ""}
        ${hasMarketTool ? `<div class="lingxi-form" data-lingxi-market="${p.id}"></div>` : ""}
      </details></article>`;
  }

  function lingxiClosure(card, cardFiles) {
    const rows = lingxiByCard.get(card) || [];
    const landed = rows.filter((p) => p.delivery).sort((a, b) => a.id.localeCompare(b.id));
    const remaining = rows.filter((p) => !p.delivery);
    return `${landed.length ? `<section class="lingxi-closure"><h4>灵犀闭环 <small>${landed.length} 项已上线</small></h4>
      ${landed.map(lingxiDelivery).join("")}</section>` : ""}
      ${card.extraction?.length ? `<details class="lingxi-closure"><summary>结构化提炼</summary>${lingxiSections(card.extraction)}</details>` : ""}
      ${remaining.length ? `<details class="lingxi-closure"><summary>其他建议 · ${remaining.length} 条</summary>${remaining.map((p) => {
        const decision = proposalDecision(p);
        const attachments = [...new Set([...(p.files || []), ...(decision?.files || [])])].filter((ref) => !cardFiles.includes(ref));
        return proposalRow(p, decision, attachments);
      }).join("")}</details>` : ""}`;
  }

  function listHtml(L, isIntel) {
    if (!L) return "";
    if (L.cards) return `<article class="panel"><h3>${esc(L.title)}</h3>
      ${isIntel ? `<div class="lingxi-search"><label for="lingxi-search">检索灵犀内容</label>
        <input id="lingxi-search" type="search" placeholder="关键词、标签或建议编号" autocomplete="off">
        <output for="lingxi-search" aria-live="polite"></output></div>` : ""}
      <div class="${isIntel ? "lingxi-cards" : "list-scroll"}">${L.cards.map((c) => {
      const cardFiles = isIntel ? (c.files || []).map((ref) => ref.includes(":") ? ref : `hub:${ref}`) : c.files;
      return `<div class="sum-card"${isIntel ? ` data-lingxi-source="${esc(c.title)}"` : ""}><b>${esc(c.title)}</b><small>${esc(c.meta)}</small>
        ${c.points.length ? `<ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${c.landing ? `<p class="landing"><span>落地</span>${esc(c.landing)}</p>` : ""}${filesHtml(cardFiles)}${isIntel ? lingxiClosure(c, cardFiles) : ""}</div>`;
    }).join("") || '<p class="empty">暂无</p>'}</div>
      </article>`;
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
      ${id === "intel" ? listHtml(a.list, true) : ""}
      <article class="panel"><h3>给天枢的汇报${a.source ? ` <small>采用 ${esc(a.source)} 的进度（证据 ${esc((a.asOf || "—").slice(0, 16).replace("T", " "))}）</small>` : ""}</h3><p>${esc(a.summary) || "（无）"}</p>
        ${a.peers && a.peers.length > 1 ? `<table><tr><th>电脑</th><th>证据时间</th><th>状态</th></tr>${a.peers.map((p) =>
          `<tr><td>${esc(p.label)}</td><td>${esc((p.asOf || "—").slice(0, 16).replace("T", " "))}</td><td class="n">${esc(p.headline)}</td></tr>`).join("")}</table>` : ""}</article>
      ${itemPanels(a.items)}
      ${id === "intel" ? "" : listHtml(a.list, false)}
      <article class="panel"><h3>问题 <small>P2 自修 · P1 天枢派单 · P0 上报你</small></h3>${a.issues.map((i) =>
        `<div class="q"><span class="chip ${i.level}">${i.level}</span><div class="t">${esc(i.title)}${i.detail ? `<small>${esc(i.detail)}</small>` : ""}</div></div>`).join("") || '<p class="empty">无问题</p>'}
        ${tk.length ? `<h3 style="margin-top:14px">在办工单</h3>${tk.map(ticketRow).join("")}` : ""}</article>`;
    if (id === "intel" && !D.public) mountLingxiTools($("#view-agent"));
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
