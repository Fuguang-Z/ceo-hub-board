/* 轻体（原年度计划）：读取 window.ANNUAL_ENC（加密数据），口令只在本机浏览器内解密，渲染体重、饮食。
   交易页 10-30 起移到扶摇「新模式」分支：本文件暴露 window.CEO_ANNUAL_TRADING.mount(容器) 供扶摇挂载。无框架、无外部依赖。 */
(() => {
  const root = document.getElementById("view-annual");
  if (!root) return;
  const ENC = window.ANNUAL_ENC;
  const KEY_STORE = "annual-plans-key-v1", PREF_STORE = "annual-plans-view-v1";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const signed = (v, d = 2) => fin(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "—";
  const rate = (v) => fin(v) ? signed(v * 100, 2) + "%" : "—";
  const pct = (v, d = 1) => fin(v) ? (v * 100).toFixed(d) + "%" : "—";
  const num = (v, d = 1) => fin(v) ? v.toFixed(d) : "—";
  // 股票：红色盈利、绿色亏损；体重：绿色减重、红色增重；持平与首次中性。
  const pnlTone = (v) => fin(v) && v !== 0 ? (v > 0 ? "an-red" : "an-green") : "";
  const kgTone = (v) => fin(v) && v !== 0 ? (v < 0 ? "an-green" : "an-red") : "";
  const md = (date) => date ? date.slice(5).replace("-", ".") : "";
  const range = (low, high) => {
    if (!fin(low)) return fin(high) ? "至多 " + num(high, 0) : "待确认";
    if (!fin(high)) return low > 0 ? "至少 " + num(low, 0) : "待确认";
    return low === high ? num(low, 0) : num(low, 0) + "–" + num(high, 0);
  };
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const b64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  const pref = Object.assign({ section: "weight", period: "plan", tradePeriod: "plan" }, store.get(PREF_STORE) || {});
  if (pref.section === "trading") pref.section = "weight";
  // 交易页挂在扶摇「新模式」里（10-30 发起人定）；容器随扶摇重绘而替换，只认仍在文档中的那一个
  let tradeHost = null;
  const tradeVisible = () => !!(tradeHost && tradeHost.isConnected && tradeHost.offsetParent !== null);
  let V = null;
  // 电脑版（D40）：在天枢（本机）（127.0.0.1）打开时，直接向本机接口取明文，免口令；公开看板仍只认密文。
  const LOCAL = /^(127\.0\.0\.1|localhost|100\.\d+\.\d+\.\d+)$/.test(location.hostname);  // 天枢（本机）或经 Tailscale 打开的 天枢（NAS）（D45）
  let localMode = false, localError = "", localLoading = false;
  async function loadLocal(quiet = false) {
    if (!LOCAL || localLoading) return false;
    localLoading = true;
    try {
      const r = await fetch("/api/annual", { headers: { "X-CEO-Hub": "1" } }).then((x) => x.json());
      if (!r.ok) { localError = r.error || ""; return false; }
      // 后台请求返回时用户可能已切去记餐，不打断编辑或图片上传。
      if (quiet && (document.hidden || !tradeVisible())) return true;
      const changed = !V || V.asOf !== r.view.asOf || JSON.stringify(V.sync) !== JSON.stringify(r.view.sync);
      V = r.view; localMode = true;
      if (!quiet || changed) { render(); renderTrading(); }
      return true;
    } catch (_) { return false; }
    finally { localLoading = false; }
  }
  const noData = () => {
    root.innerHTML = `<article class="panel"><h3>轻体</h3><p class="empty">${esc(localError ||
      "轻体目前只在天枢电脑版显示（双击桌面「天枢」）。手机版暂缓。")}</p></article>`;
    renderTrading();
  };

  // ── 解密 ──
  async function deriveKey(pass, extractable) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(ENC.salt), iterations: ENC.iterations },
      material, { name: "AES-GCM", length: 256 }, extractable, ["decrypt"]);
  }
  async function decrypt(key) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(ENC.iv) }, key, b64(ENC.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function tryStoredKey() {
    const saved = store.get(KEY_STORE);
    if (!saved || saved.salt !== ENC.salt || !crypto.subtle) return false;
    try {
      const key = await crypto.subtle.importKey("raw", b64(saved.raw), "AES-GCM", false, ["decrypt"]);
      V = await decrypt(key); render(); return true;
    } catch (_) { store.del(KEY_STORE); return false; }
  }

  function renderLock(message) {
    const updated = (ENC.updatedAt || "").slice(0, 16).replace("T", " ");
    root.innerHTML = `<article class="panel an-lock">
      <div class="an-lock-icon">◆</div><h3>年度计划 · 已加密</h3>
      <p class="hint">交易、体重与饮食数据在笔记本上加密后发布，输入口令后只在本设备内解密。${updated ? `数据生成于 ${esc(updated)} UTC。` : ""}</p>
      ${window.crypto && crypto.subtle ? `<form id="an-form" autocomplete="off">
        <input id="an-pass" type="password" placeholder="年度计划口令" autocomplete="current-password" aria-label="年度计划口令">
        <label class="an-remember"><input id="an-keep" type="checkbox"> 在本设备记住（公共设备不要勾选）</label>
        <button type="submit" class="an-btn">解锁查看</button></form>` : `<p class="empty">当前浏览器不支持本机解密，请用 https 网址或较新的浏览器打开。</p>`}
      <p class="an-msg" id="an-msg">${esc(message || "")}</p></article>`;
    const form = root.querySelector("#an-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pass = root.querySelector("#an-pass").value, keep = root.querySelector("#an-keep").checked;
      const msg = root.querySelector("#an-msg");
      if (!pass) { msg.textContent = "请输入口令"; return; }
      msg.textContent = "正在解密…";
      try {
        const key = await deriveKey(pass, keep);
        V = await decrypt(key);
        if (keep) store.set(KEY_STORE, { salt: ENC.salt, raw: toB64(await crypto.subtle.exportKey("raw", key)) });
        render();
      } catch (_) { msg.textContent = "口令不正确，或数据已更换口令。"; }
    });
  }

  // ── 折线图：SVG，点按查看对应日期的数值 ──
  let charts = [], tradeCharts = [], reg = charts;
  function chart(points, opts) {
    const rows = (points || []).filter((p) => p && p.date);
    if (!rows.filter((p) => fin(p.value)).length) return `<p class="empty">暂无可绘制的数据，缺失不补零。</p>`;
    reg.push({ rows, opts });
    return `<div class="an-chart" data-i="${reg.length - 1}"></div>`;
  }
  function drawCharts(host = root, list = charts) {
    host.querySelectorAll(".an-chart").forEach((box) => {
      if (!list[Number(box.dataset.i)]) return;
      const { rows, opts } = list[Number(box.dataset.i)];
      const W = Math.max(280, box.clientWidth), H = W < 520 ? 190 : 230;
      const padL = 54, padR = opts.rateAxis ? 52 : 14, padT = 26, padB = 24;
      const values = rows.flatMap((p) => [p.value, p.average7]).filter(fin);
      let lo = Math.min(...values), hi = Math.max(...values);
      if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (hi === lo) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
      const x = (i) => padL + (rows.length === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (rows.length - 1));
      const y = (v) => padT + (hi - v) / (hi - lo) * (H - padT - padB);
      const line = (key) => {
        let d = "", open = false;
        rows.forEach((p, i) => { if (fin(p[key])) { d += (open ? "L" : "M") + x(i).toFixed(1) + " " + y(p[key]).toFixed(1); open = true; } else open = false; });
        return d;
      };
      // 百分比右轴仅在比例与金额同一分母（成正比）时显示，否则只在点按提示里给比例。
      const ratios = rows.filter((p) => fin(p.value) && fin(p.rate) && p.value !== 0).map((p) => p.rate / p.value);
      const proportional = opts.rateAxis && ratios.length && ratios.every((r) => Math.abs(r - ratios[0]) < Math.abs(ratios[0]) * 1e-3);
      const ticks = [hi - pad, (hi + lo) / 2, lo + pad];
      const axis = ticks.map((t) => `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${esc(opts.fmt(t))}</text>
        <line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="an-grid"/>
        ${proportional ? `<text x="${W - padR + 6}" y="${y(t) + 4}">${esc(rate(t * ratios[0]))}</text>` : ""}`).join("");
      const zero = opts.zero && lo < 0 && hi > 0 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="an-zero"/>` : "";
      const dots = rows.map((p, i) => fin(p.value) ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="${rows.length > 40 ? 1.8 : 3}" class="an-dot ${opts.tone ? opts.tone(p.value) : ""}"/>` : "").join("");
      const first = rows[0].date, last = rows[rows.length - 1].date;
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.label)}">
        <g class="an-axis">${axis}<text x="${padL}" y="${H - 6}">${md(first)}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${md(last)}</text></g>
        ${zero}${opts.average ? `<path d="${line("average7")}" class="an-avg"/>` : ""}
        <path d="${line("value")}" class="an-line"/>${dots}
        <line class="an-cursor" y1="${padT}" y2="${H - padB}" x1="-10" x2="-10"/><text class="an-tip" x="${padL}" y="14"></text></svg>`;
      const path = box.querySelector(".an-line");
      if (!reduceMotion && path.getTotalLength) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
        requestAnimationFrame(() => { path.style.transition = "stroke-dashoffset .6s ease"; path.style.strokeDashoffset = 0; });
      }
      const svg = box.querySelector("svg"), cursor = svg.querySelector(".an-cursor"), tip = svg.querySelector(".an-tip");
      const pick = (evt) => {
        const rect = svg.getBoundingClientRect(), px = (evt.clientX - rect.left) * W / rect.width;
        let best = 0; rows.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
        const p = rows[best];
        cursor.setAttribute("x1", x(best)); cursor.setAttribute("x2", x(best));
        tip.textContent = opts.tip(p);
      };
      svg.addEventListener("pointerdown", pick);
      svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) pick(e); });
      const lastValued = [...rows].reverse().find((p) => fin(p.value));
      if (lastValued) tip.textContent = opts.tip(lastValued);
    });
  }

  // 仓位建议（10-28 发起人定）：规则模块与收盘时间线都取自 A股市场状态站点（观澜同一份），浏览器跨站读取；取不到显示“—”，不猜。
  const ASHARE_SITE = "https://fuguang-z.github.io/ashare-market-state/";
  let POS = null, posLoading = false;
  async function loadPos() {
    if (POS || posLoading) return;
    posLoading = true;
    try {
      const [mod, tl] = await Promise.all([import(ASHARE_SITE + "js/position.js?v=20261028a"),
        fetch(ASHARE_SITE + "data/regime_timeline.json", { cache: "no-cache" }).then((r) => r.json())]);
      POS = { mod, tl };
    } catch (_) { POS = { error: true }; }
    finally { posLoading = false; }
    if (V && pref.tradePeriod === "day") renderTrading();
  }
  function posCells(r) {
    if (!POS) return `<span class="n">…</span><span></span>`;
    const s = POS.error ? null : POS.mod.suggestOn(POS.tl, r.date);
    if (!s || !fin(s.pct)) return `<span class="n" title="${POS.error ? "A股市场状态站点暂时取不到" : "该日收盘判定尚未更新"}">—</span><span></span>`;
    const actual = fin(r.positionRatio) ? r.positionRatio * 100 : null, ok = POS.mod.positionOk(actual, s.pct);
    const tip = `指数线 ${s.state} ${s.index}%${s.emo ? ` + 情绪主升 ${s.emo}%` : ""} = ${s.pct}%。${POS.mod.RULE_TEXT}`;
    return `<span title="${esc(tip)}">${s.pct}%<i>${esc(s.state)}</i></span><span>${ok === null ? "—" : `<span class="mk ${ok ? "mk-v1" : "mk-x1"}">${ok ? "√" : "×"}</span>`}</span>`;
  }

  // ── 各页内容 ──
  const PERIODS = [["day", "日"], ["week", "周"], ["month", "月"], ["quarter", "季"], ["year", "年"], ["plan", "全程"]];
  const kpi = (label, value, sub, tone = "") => `<div class="kpi"><small>${esc(label)}</small><b class="${tone}">${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;

  function tradingView() {
    const s = V.trading[pref.tradePeriod], H = V.tradingHistory;
    let body = `<article class="panel an-card"><div class="an-stat-hd"><span>${esc(pref.tradePeriod === "day" || pref.tradePeriod === "week" ? "计划累计 · 截至 " + V.asOf : s.periodLabel)}</span><small>盈亏 · 元 / %</small></div>
      <div class="an-big ${pnlTone(s.pnl)}">${signed(s.pnl)}<span class="an-rate">${rate(s.pnlRatio)}</span></div>
      <div class="kpis an-kpis">${kpi("交易胜率", pct(s.winRate), `${s.dayCount} 次交易（按有实绩交易日）`)}
        ${kpi("盈利 / 亏损", `赢 ${s.winningDays} / 亏 ${s.losingDays}`, s.dayCount ? `平盘 ${s.flatDays} 次` : "样本不足")}
        ${kpi("最近总仓位", pct(s.positionRatio, 2), "权益占比")}</div>`;
    const money = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0));
    const tradeTip = (p) => `${p.date}  ${signed(p.value)} 元  ${rate(p.rate)}`;
    if (pref.tradePeriod === "week") body += chart(H.weeklyCurve, { label: "每个自然周盈亏折线图", fmt: money, zero: true, tip: (p) => `${p.date} 起一周  ${signed(p.value)} 元  ${rate(p.rate)}`, tone: pnlTone });
    else if (pref.tradePeriod !== "day") body += chart(s.curve, { label: "所选周期累计盈亏折线图", fmt: money, zero: true, rateAxis: true, tip: tradeTip, tone: pnlTone });
    body += `<p class="hint">10月15日为基准，从次日计实绩。单日比例以当日期初资产为分母；累计以10月15日基准资产为分母；不是时间加权收益率。</p></article>`;
    if (pref.tradePeriod === "day") {
      loadPos();
      body += `<article class="panel"><h3>逐日统计</h3>${H.dailyRows.length ? `<div class="an-table an-t4 an-pos"><div class="an-th"><span>日期</span><span>日盈亏 / 元</span><span>累计 / 元</span><span>仓位</span><span>仓位建议</span><span>判定</span></div>
        ${H.dailyRows.slice().reverse().map((r) => `<div class="an-tr"><span>${md(r.date)}</span>
          <span class="${pnlTone(r.pnl)}">${signed(r.pnl)}<i>${rate(r.dailyReturnRate)}</i></span>
          <span class="${pnlTone(r.cumulativePnl)}">${signed(r.cumulativePnl)}<i>${rate(r.cumulativeReturnRate)}</i></span>
          <span>${pct(r.positionRatio, 2)}</span>${posCells(r)}</div>`).join("")}</div>
        <p class="hint">仓位建议按当日收盘的市场阶段：指数线大主升 80%、减仓 50%、震荡 10%、筑底与主跌 0%，情绪主升另加 50%，合计不超过 100%；实际仓位超出建议 5 个百分点以上记 ×。与观澜页面同一规则，只作复盘对照。</p>` : `<p class="empty">暂无已确认实绩，缺失不计零盈亏。</p>`}</article>`;
    }
    if (pref.tradePeriod === "week") {
      body += `<article class="panel"><h3>自然周统计 <small>周一至周日</small></h3><div class="an-table an-t4"><div class="an-th"><span>自然周</span><span>周盈亏 / 元</span><span>胜率</span><span>仓位</span></div>
        ${H.weeklyRows.slice().reverse().map((r) => `<div class="an-tr"><span>${md(r.weekStart)}–${md(r.weekEnd)}<i>覆盖 ${md(r.coverageStart)}–${md(r.coverageEnd)}</i></span>
          <span class="${pnlTone(r.pnl)}">${signed(r.pnl)}<i>${rate(r.pnlRatio)}</i></span>
          <span>${r.dayCount ? pct(r.dailyWinRate) : "—"}<i>${r.dayCount ? `${r.winningDays}盈 ${r.losingDays}亏 ${r.flatDays}平` : "无实绩"}</i></span>
          <span>${pct(r.positionRatio, 2)}<i>${md(r.positionDate) || "—"}</i></span></div>`).join("")}</div>
        <p class="hint">首尾周只统计计划内已到日期；无实绩的周显示“—”，折线保留缺口。</p></article>`;
    }
    body += `<article class="panel"><h3>市场三项判断 <small>${esc(V.marketDate || "暂无记录")}</small></h3>
      ${V.markets.map((m) => `<div class="an-market"><div><b>${esc(m.title)}</b><small>${esc(m.code)}</small></div>
        <div class="an-mk-right">${m.status === "unknown" && !m.note ? `<span class="chip P2">尚无判断</span>` : mkTag(m.note, m.status)}</div></div>`).join("")}${marketTable()}</article>`;
    return body;
  }

  // 市场三项：保留原表判断及备注；勾号统一为 √，双符号用略深底色区分。
  function mkLevel(note, status) {
    const x = (String(note).match(/[×✕✗✘叉]/g) || []).length, v = (String(note).match(/✅|[√✓✔]/g) || []).length;
    if (x || status === "below") return x >= 2 ? "mk-x2" : "mk-x1";
    if (v || status === "above") return v >= 2 ? "mk-v2" : "mk-v1";
    return "";
  }
  function mkTag(note, status) {
    const text = String(note || "").replace(/[✅√✓✔][\uFE0E\uFE0F]*/gu, "√").trim() || (status === "below" ? "×" : status === "above" ? "√" : "—");
    return `<span class="mk ${mkLevel(note, status)}">${esc(text)}</span>`;
  }
  // 市场三项逐日表（电脑版本机数据才有）：10-15 基准日起每个已确认交易日一行
  function marketTable() {
    const rows = V.local && V.local.marketRows;
    if (!rows || !rows.length) return "";
    const count = (i, re) => rows.filter((r) => re.test(mkLevel(r.cells[i].note, r.cells[i].status))).length;
    return `<h3 class="an-sub">逐日记录 <small>${md(rows[rows.length - 1].date)} 至今 · ${rows.length} 个交易日</small></h3>
      <div class="an-table an-mkt"><div class="an-th"><span>日期</span>${V.markets.map((m) => `<span>${esc(m.title)}</span>`).join("")}</div>
      ${rows.map((r) => `<div class="an-tr"><span>${md(r.date)}${r.baseline ? " <small>基准</small>" : ""}</span>${r.cells.map((c) => `<span>${mkTag(c.note, c.status)}</span>`).join("")}</div>`).join("")}
      <div class="an-tr an-total"><span>合计</span>${[0, 1, 2].map((i) => `<span><span class="mk mk-v1">√ ${count(i, /mk-v/)}</span> <span class="mk mk-x1">× ${count(i, /mk-x/)}</span></span>`).join("")}</div></div>`;
  }

  function weightView() {
    const s = V.weight[pref.period], C = V.config;
    const importedAt = V.healthSync && V.healthSync.status === "ok" ? Date.parse(V.healthSync.lastSuccessAt || "") : NaN;
    const healthHint = Number.isFinite(importedAt)
      ? `最近一次体重导入：${esc(new Date(importedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))}（北京时间）。手机自动触发是否正常仍须单独验证。`
      : "尚无本入口成功导入记录；现有手工或截图记录继续保留。";
    const caption = s.changeFromDate ? `kg · ${md(s.changeFromDate)} → ${md(s.changeToDate)}` : "kg";
    const progress = fin(s.progress) ? Math.round(s.progress * 1000) / 10 : null;
    let body = `<article class="panel an-card"><div class="an-stat-hd"><span>${esc(pref.period === "day" ? "计划累计 · 截至 " + V.asOf : s.periodLabel)}</span><small>起点 ${C.initialWeightKg} kg · 目标 ${C.targetWeightKg} kg</small></div>
      <div class="an-big">${num(s.currentKg)}<span class="an-rate">kg</span></div>
      ${progress !== null ? `<div class="an-progress" aria-label="减重进度"><i style="width:${Math.min(100, progress)}%"></i></div><small class="an-progress-t">已完成 ${progress}%</small>` : ""}
      <div class="kpis an-kpis">${kpi("周期变化", signed(s.changeKg, 1), caption, kgTone(s.changeKg))}${kpi("距离目标", num(s.remainingKg), "kg")}
        ${kpi("周趋势达标率", fin(s.weeklyWinRate) ? pct(s.weeklyWinRate, 0) : "样本不足", `${s.weekCount} 组可比较周`)}</div>`;
    if (pref.period !== "day") body += chart(s.curve, { label: "体重与七日均值折线图", fmt: (v) => v.toFixed(1), average: true, tip: (p) => `${p.date}  ${num(p.value)} kg  7日均值 ${num(p.average7)}` }) +
      `<div class="legend"><span style="--c:var(--ceo)">实测体重</span><span style="--c:var(--muted)">7 日均值</span></div>`;
    body += `</article><article class="panel"><h3>逐次测量 <small>${V.weightRecords.length} 条 · 较上次</small></h3>
      ${V.weightRecords.length ? `<div class="an-table an-t4 an-weight"><div class="an-th"><span>日期</span><span>时间</span><span>体重 / kg</span><span>较上次</span></div>
      ${V.weightRecords.map((r) => `<div class="an-tr"><span>${md(r.date)}</span><span>${esc(r.time || "—")}</span><span>${num(r.kg)}</span><span class="${kgTone(r.change)}">${signed(r.change, 1)}</span></div>`).join("")}</div>`
      : `<p class="empty">计划开始后暂无有效测量</p>`}
      <p class="hint">缺测日期保持空缺；较上次可能跨多天，不等于单日变化。${healthHint}</p></article>`;
    return body;
  }

  // ── 饮食（D43 → D46 精简）：只发图片或文字，DeepSeek 自动识别并记录，记完自动给下一餐建议 ──
  // 写入和 AI 都经天枢转发到 NAS 上的年度计划服务（NAS 是 state.json 唯一写入者）；DeepSeek 密钥只在 NAS，不经页面。
  // 发起人 10-26 决定（D46）：不复核、不选餐次——餐次按北京时间自动判断，热量取 AI 估算范围的中间值记为已记录，范围一并保留；记错就删掉重发。
  const MEALS = [["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"], ["snack", "加餐"]];
  const mealName = (k) => (MEALS.find((m) => m[0] === k) || [k, k])[1];
  const svc = (method, sub, body) => fetch("/api/annual/svc/" + sub, {
    method, headers: Object.assign({ "X-CEO-Hub": "1" }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `请求失败（${r.status}）`);
    return j;
  });
  const bjHour = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const autoType = () => { const h = bjHour(); return h < 10.5 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack"; };
  const NEXT = { breakfast: "lunch", lunch: "dinner" };  // 建议只对今天午餐、晚餐（服务端口径）
  let lastSection = "";
  let Q = { text: "", photo: null, busy: false, msg: "" }, AI = null, ADV = { meal: null, busy: false, result: null, error: "" };

  function planCard() {
    const S = V.local.today, target = S.targetKcal, have = new Set(S.types);
    const pct = fin(target) && fin(S.consumedLow) ? Math.min(100, Math.round(S.consumedLow / target * 100)) : 0;
    const missing = ["breakfast", "lunch", "dinner"].filter((k) => !have.has(k)).map(mealName);
    const state = !S.recordCount ? "还没有记录" : fin(S.estimatedExcessLow) && S.estimatedExcessLow > 0 ? "已超参考目标"
      : missing.length ? `还差 ${missing.join("、")}` : "三餐已记";
    return `<article class="panel an-card"><div class="an-stat-hd"><span>今天 · 日计划 · ${esc(V.asOf)}</span><small>大卡</small></div>
      <div class="an-big">${S.recordCount ? num(S.confirmedKcal, 0) : "—"}<span class="an-rate">/ ${num(target, 0)}</span></div>
      <div class="an-progress"><i style="width:${pct}%"></i></div><small class="hint an-progress-t">已摄入占参考目标 ${pct}% · ${esc(state)}</small>
      <div class="an-chips">${MEALS.map(([k, l]) => `<span class="${have.has(k) ? "on" : ""}">${have.has(k) ? "✓" : "○"} ${l}</span>`).join("")}</div>
      <div class="kpis an-kpis">${kpi("剩余预算", S.recordCount ? range(S.remainingLow, S.remainingHigh) : num(target, 0), "大卡")}
        ${kpi("预计超额", S.recordCount ? range(S.estimatedExcessLow, S.estimatedExcessHigh) : "—", "大卡", S.estimatedExcessLow > 0 ? "an-red" : "")}
        ${kpi("估算范围", S.recordCount ? range(S.consumedLow, S.consumedHigh) : "—", `蛋白质约 ${num(S.proteinG, 0)} g`)}</div></article>`;
  }

  function quickCard() {
    return `<article class="panel an-card" id="an-form-card"><h3>记一餐 <small>${aiText()}</small></h3>
      <div class="an-quick">
        <label class="an-btn an-cam${Q.busy ? " off" : ""}">发图片<input type="file" accept="image/*" data-photo hidden ${Q.busy ? "disabled" : ""}></label>
        <textarea data-q rows="1" placeholder="或写一句吃了什么，例：一碗牛肉面加一个卤蛋（选了图片会自动发送）">${esc(Q.text)}</textarea>
        <button type="button" class="an-btn" data-act="quick" ${Q.busy ? "disabled" : ""}>${Q.busy ? "识别中…" : "发送"}</button>
      </div>
      ${Q.photo ? `<img class="an-qimg" src="${Q.photo.url}" alt="本次餐食照片">` : ""}
      <p class="an-msg${/^已记录/.test(Q.msg) ? " ok" : ""}">${esc(Q.msg)}</p></article>`;
  }

  function adviceCard() {
    const R = ADV.result, shown = R || V.local.today.recommendation;
    const hint = ADV.busy ? "DeepSeek 正在根据今天已吃的生成建议…" : R ? `DeepSeek 建议 · 今天${mealName(ADV.meal)}，今晚 24:00 失效；不计入已吃。` : "记一餐后自动换成 DeepSeek 建议；现在是规则建议。";
    return `<article class="panel"><h3>下一餐建议${ADV.meal ? ` <small>今天${mealName(ADV.meal)}</small>` : ""}</h3>
      <div class="an-advice"><b>${esc(shown.title)}</b><p>${esc(shown.detail)}</p>
        <ul>${(shown.options || []).map((o) => `<li>${esc(o)}</li>`).join("")}</ul><small class="hint">${hint}</small></div>
      ${ADV.error ? `<p class="an-msg">${esc(ADV.error)}</p>` : ""}</article>`;
  }

  function mealsCard() {
    const M = V.local.meals.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return `<article class="panel"><h3>今天餐食 <small>${M.length} 条</small></h3>${M.length ? `<div class="an-table an-meal5"><div class="an-th"><span>餐次</span><span>食物</span><span>热量</span><span>估算范围</span><span></span></div>
      ${M.map((m) => `<div class="an-tr"><span>${mealName(m.type)}</span><span class="an-desc">${esc(m.description) || "—"}</span>
        <span>${fin(m.kcal) ? num(m.kcal, 0) : "—"}</span><span>${range(m.kcalLow, m.kcalHigh)}</span>
        <span class="an-ops"><button type="button" data-act="del" data-id="${esc(m.id)}">删除</button></span></div>`).join("")}</div>`
      : `<p class="empty">今天还没有记录；没有记录不代表摄入为零。</p>`}</article>`;
  }

  function daysCard() {
    const rows = V.local.rows, tot = V.nutrition.totals;
    const marks = (types) => ["breakfast", "lunch", "dinner"].map((k) => `<b class="${types.includes(k) ? "on" : ""}">${mealName(k)[0]}</b>`).join("") + (types.includes("snack") ? "<b class=\"on\">加</b>" : "");
    return `<article class="panel"><h3>日计划完成情况 <small>已记录 ${tot.recordedDays} 天</small></h3>
      <div class="an-counts"><div><small>超额</small><b class="an-red">${tot.overDays}</b></div><div><small>正常</small><b class="an-green">${tot.normalDays}</b></div><div><small>待确认 / 未截止</small><b>${tot.pendingDays}</b></div></div>
      <div class="an-table an-days"><div class="an-th"><span>日期</span><span>三餐</span><span>总摄入</span><span>超额</span><span>状态</span></div>
      ${rows.slice().reverse().map((r) => `<div class="an-tr"><span>${md(r.date)}</span><span class="an-marks">${marks(r.types)}</span><span>${range(r.consumedLow, r.consumedHigh)}</span>
        <span class="${r.status === "over" ? "an-red" : ""}">${range(r.excessLow, r.excessHigh)}</span><span class="${r.status === "over" ? "an-red" : r.status === "normal" ? "an-green" : ""}">${esc(r.statusText)}</span></div>`).join("")}
      ${rows.length ? "" : `<p class="empty">记录餐食后自动汇总，不补零。</p>`}
      <div class="an-tr an-total"><span>总计</span><span></span><span>${range(tot.consumedLow, tot.consumedHigh)}</span><span>${range(tot.excessLow, tot.excessHigh)}</span><span>${tot.recordedDays} 天</span></div></div>
      <p class="hint">“正常”要求早午晚三餐都有记录且不超参考目标（${num(V.nutrition.targetKcal, 0)} 大卡）；超额逐日计算、不互相抵消。</p></article>`;
  }

  function aiText() {
    if (!AI) return "DeepSeek：连接中…";
    if (AI.error) return "DeepSeek：连不上 NAS 年度计划服务";
    const a = AI.ai || {};
    return a.configured ? `DeepSeek 自动识别 · 餐次按时间自动判断${a.visionConfigured ? "" : "（当前模型不支持图片，只能发文字）"}` : "DeepSeek 未配置密钥";
  }

  function foodLocalView() {
    if (!AI) svc("GET", "status").then((r) => { AI = r; }, () => { AI = { error: true }; }).then(() => { if (pref.section === "food") render(); });
    return quickCard() + adviceCard() + planCard() + mealsCard() + daysCard();
  }

  async function quick() {
    const text = Q.text.trim();
    if (Q.busy) return;
    if (!Q.photo && !text) { Q.msg = "发一张图片，或写一句吃了什么。"; return render(); }
    Q.busy = true; Q.msg = Q.photo ? "DeepSeek 正在识别图片…" : "DeepSeek 正在估算…"; render();
    try {
      const est = Q.photo
        ? await svc("POST", "meals/analyze", { imageBase64: Q.photo.b64, mimeType: "image/jpeg", description: text })
        : await svc("POST", "meals/estimate-text", { description: text });
      if (!(est.kcalHigh > 0)) throw new Error("没认出食物或热量，换一张图片或补一句文字再发。");
      const type = autoType(), kcal = Math.round((est.kcalLow + est.kcalHigh) / 2);
      const desc = (text ? text + (est.description && est.description !== text ? `（AI：${est.description}）` : "") : est.description || "").slice(0, 1000);
      await svc("POST", "meals", { date: V.asOf, type, description: desc, status: "confirmed", kcal,
        kcalLow: est.kcalLow, kcalHigh: est.kcalHigh, proteinG: fin(est.proteinG) ? est.proteinG : null });
      Q = { text: "", photo: null, busy: false, msg: `已记录：${mealName(type)} 约 ${kcal} 千卡（估算 ${num(est.kcalLow, 0)}–${num(est.kcalHigh, 0)}）` };
      await loadLocal();
      if (NEXT[type]) requestAdvice(NEXT[type]);
      else { ADV = { meal: null, busy: false, result: null, error: type === "dinner" ? "今天晚餐已记，不再生成下一餐建议。" : "" }; render(); }
    } catch (e) { Q.busy = false; Q.msg = e.message; render(); }
  }

  async function requestAdvice(meal) {
    ADV = { meal, busy: true, result: null, error: "" }; render();
    try { ADV.result = await svc("POST", "meals/advice", { date: V.asOf, nextMeal: meal }); }
    catch (e) { ADV.error = e.message; } finally { ADV.busy = false; render(); }
  }

  // 照片在浏览器里压缩到长边 1600 像素的 JPEG，选好后立即发送（服务上限约 6 MB）
  function readPhoto(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.85);
        Q.photo = { url, b64: url.slice(url.indexOf(",") + 1) };
        quick();
      };
      img.onerror = () => { Q.msg = "这张图片读不出来，请换一张 JPG / PNG。"; render(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  root.addEventListener("input", (e) => { if (e.target.dataset && e.target.dataset.q !== undefined) Q.text = e.target.value; });
  root.addEventListener("keydown", (e) => { if (e.target.dataset && e.target.dataset.q !== undefined && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); quick(); } });
  root.addEventListener("change", (e) => {
    if (e.target.dataset && e.target.dataset.photo !== undefined && e.target.files && e.target.files[0]) readPhoto(e.target.files[0]);
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !V || !localMode) return;
    if (b.dataset.act === "quick") return quick();
    if (b.dataset.act === "del") {
      const m = V.local.meals.find((x) => x.id === b.dataset.id);
      if (!m || !confirm(`删除这条${mealName(m.type)}记录？\n${m.description || ""}`)) return;
      try { await svc("DELETE", "meals/" + encodeURIComponent(m.id)); ADV.result = null; await loadLocal(); }
      catch (err) { alert(err.message); }
    }
  });

  function foodView() {
    if (localMode && V.local) return foodLocalView();
    const N = V.nutrition, T = N.today, tot = N.totals;
    return `<article class="panel an-card"><div class="an-stat-hd"><span>今天摄入估算 · ${esc(V.asOf)}</span><small>大卡</small></div>
      <div class="an-big">${T.recordCount ? range(T.consumedLow, T.consumedHigh) : "—"}</div>
      <div class="kpis an-kpis">${kpi("预计超额", T.recordCount ? range(T.excessLow, T.excessHigh) : "—", "大卡", T.excessLow > 0 ? "an-red" : "")}
        ${kpi("参考目标", num(N.targetKcal, 0), V.config.calorieTargetConfirmed ? "已确认" : "待验证")}${kpi("已复核", num(T.confirmedKcal, 0), `蛋白质约 ${num(T.proteinG, 0)} g`)}</div></article>
      <article class="panel"><h3>今天餐食 <small>${N.meals.length} 条</small></h3>${N.meals.length ? `<div class="an-table an-t4 an-meal"><div class="an-th"><span>餐次</span><span>食物</span><span>摄入</span><span>状态</span></div>
        ${N.meals.map((m) => `<div class="an-tr"><span>${esc(m.type)}</span><span class="an-desc">${esc(m.description)}</span><span>${m.status === "confirmed" ? num(m.kcal, 0) : range(m.kcalLow, m.kcalHigh)}</span><span>${m.status === "confirmed" ? "已复核" : "待复核"}</span></div>`).join("")}</div>`
        : `<p class="empty">今天还没有记录；没有记录不代表摄入为零。</p>`}</article>
      <article class="panel"><h3>逐日饮食 <small>已记录 ${tot.recordedDays} 天</small></h3>
        <div class="an-counts"><div><small>超额</small><b class="an-red">${tot.overDays}</b></div><div><small>正常</small><b class="an-green">${tot.normalDays}</b></div><div><small>待确认 / 未截止</small><b>${tot.pendingDays}</b></div></div>
        <div class="an-table an-t4"><div class="an-th"><span>日期</span><span>总摄入</span><span>超额</span><span>状态</span></div>
        ${N.rows.slice().reverse().map((r) => `<div class="an-tr"><span>${md(r.date)}</span><span>${range(r.consumedLow, r.consumedHigh)}</span><span class="${r.status === "over" ? "an-red" : ""}">${range(r.excessLow, r.excessHigh)}</span><span class="${r.status === "over" ? "an-red" : r.status === "normal" ? "an-green" : ""}">${esc(r.statusText)}</span></div>`).join("")}
        ${N.rows.length ? "" : `<p class="empty">记录餐食后自动汇总，不补零。</p>`}
        <div class="an-tr an-total"><span>总计</span><span>${range(tot.consumedLow, tot.consumedHigh)}</span><span>${range(tot.excessLow, tot.excessHigh)}</span><span>${tot.recordedDays} 天</span></div></div>
        <p class="hint">按当前 ${num(N.targetKcal, 0)} 大卡参考目标统计；超额逐日计算、不互相抵消。记录餐食与拍照估算将在 NAS 服务上线后提供。</p></article>`;
  }

  function render() {
    if (!V) return renderLock();
    const C = V.config;
    const day = Math.max(0, Math.min(365, Math.floor((Date.parse(V.asOf) - Date.parse(C.startDate)) / 86400000) + 1));
    const localTime = (value) => value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
    const synced = localTime(V.sync && V.sync.lastSuccessAt);
    const sourceTime = localTime(V.sync && V.sync.sourceModifiedAt);
    const sections = [["weight", "体重"], ["food", "饮食"]];
    charts = [];
    root.innerHTML = `<div class="an-head"><div><h2>轻体</h2><small>第 ${day} / 365 天 · 截至 ${esc(V.asOf)} · 原表修改 ${esc(sourceTime)} · 导入 ${esc(synced)}（北京时间）</small></div>
      ${localMode ? `<button class="an-btn ghost" id="an-reload" type="button">刷新</button>` : `<button class="an-btn ghost" id="an-lockbtn" type="button">锁定</button>`}</div>
      <div class="an-seg" role="tablist">${sections.map(([k, l]) => `<button type="button" data-sec="${k}" aria-selected="${pref.section === k}">${l}</button>`).join("")}</div>
      ${pref.section === "food" ? "" : `<div class="an-periods">${PERIODS.map(([k, l]) => `<button type="button" data-per="${k}" aria-selected="${pref.period === k}">${l}</button>`).join("")}</div>`}
      <div class="an-body${pref.section === lastSection ? " an-still" : ""}">${pref.section === "weight" ? weightView() : foodView()}</div>`;
    lastSection = pref.section;  // 同一子页内的重绘（记餐、识别）不重放入场动画
    drawCharts();
  }

  // 扶摇「新模式」里的交易内容：周期切换 + 原年度计划交易页（累计折线、逐日、周、市场三项）
  function renderTrading() {
    const host = tradeHost;
    if (!host || !host.isConnected) return;
    if (!V) { host.innerHTML = `<article class="panel"><p class="empty">${esc(localError || (LOCAL ? "正在读取交易实绩…" : "交易实绩只在天枢电脑版显示。"))}</p></article>`; return; }
    tradeCharts = []; reg = tradeCharts;
    try {
      host.innerHTML = `<div class="an-periods">${PERIODS.map(([k, l]) => `<button type="button" data-tper="${k}" aria-selected="${pref.tradePeriod === k}">${l}</button>`).join("")}</div>
        <div class="an-body an-still">${tradingView()}</div>`;
    } finally { reg = charts; }
    drawCharts(host, tradeCharts);
  }
  window.CEO_ANNUAL_TRADING = { mount(el) { tradeHost = el; renderTrading(); } };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tper]");
    if (!b || !tradeHost || !tradeHost.contains(b)) return;
    pref.tradePeriod = b.dataset.tper; store.set(PREF_STORE, pref); renderTrading();
  });

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !V) return;
    if (b.id === "an-lockbtn") { store.del(KEY_STORE); V = null; renderLock("已锁定，本设备不再记住口令。"); return; }
    if (b.id === "an-reload") { loadLocal(); return; }
    if (b.dataset.sec) pref.section = b.dataset.sec;
    else if (b.dataset.per) pref.period = b.dataset.per;
    else return;
    store.set(PREF_STORE, pref); render();
  });
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (V && !root.hidden) drawCharts(); if (V && tradeVisible()) drawCharts(tradeHost, tradeCharts); }, 200); });
  // 页面隐藏时首次进入宽度为 0：切到本页时再画一次图。
  new MutationObserver(() => { if (V && !root.hidden) drawCharts(); }).observe(root, { attributes: true, attributeFilter: ["hidden"] });

  // 仅在私网、扶摇新模式的交易内容可见时查新数据；未变化不重绘，不干扰饮食编辑。
  const refreshTrading = () => {
    if (LOCAL && (localMode || !V) && !document.hidden && tradeVisible()
        && !root.querySelector("input:focus,textarea:focus,select:focus,[contenteditable=true]:focus")) loadLocal(true);
  };
  if (LOCAL) {
    setInterval(refreshTrading, 30000);
    document.addEventListener("visibilitychange", refreshTrading);
  }

  (async () => {
    if (await loadLocal()) return;
    if (!ENC) return noData();
    renderLock();
    tryStoredKey();
  })();
})();
