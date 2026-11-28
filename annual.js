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
  const dayTone = (value, emptyFlatRed) => value === 0 && emptyFlatRed === true ? "an-red" : pnlTone(value);
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
  // 交易页挂在扶摇「新模式」与「交易统计」里；容器随扶摇重绘而替换，只认仍在文档中的那一个
  let tradeHost = null, tradeCtx = null;
  const tradeVisible = () => !!(tradeHost && tradeHost.isConnected && tradeHost.offsetParent !== null);
  const DEFAULT_MARKETS = [
    { title: "同花顺全A", code: "883957" },
    { title: "同花顺成交额前10", code: "883902" },
    { title: "同花顺热门股", code: "883910" },
  ];
  const marketDateText = (date, withYear) => withYear && date ? date.slice(2).replace(/-/g, ".") : md(date);
  let V = null;
  // 电脑版（D40）：在天枢（本机）（127.0.0.1）打开时，直接向本机接口取明文，免口令；公开看板仍只认密文。
  const LOCAL = /^(127\.0\.0\.1|localhost|100\.\d+\.\d+\.\d+)$/.test(location.hostname);  // 天枢（本机）或经 Tailscale 打开的 天枢（NAS）（D45）
  let localMode = false, localError = "", localLoading = false;
  const MARKET_CODES = ["883957", "883902", "883910"];
  const MARKET_SEED_URL = "https://fuguang-z.github.io/ashare-market-state/data/market_seed.json";
  let marketSeed = null, marketSeedRequest = null, marketSeedRevision = "unrequested";
  const validMarketDate = (date) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const time = Date.parse(date + "T00:00:00Z");
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
  };
  // 公开种子的日期与三条收盘序列必须逐项对齐；null 保留为缺口，不挪用相邻日补齐窗口。
  function validateMarketSeed(data) {
    const dates = data && data.dates;
    if (data?.schemaVersion !== 1 || data.kind !== "market-seed" || !Array.isArray(dates) || !dates.length
        || !validMarketDate(data.through) || data.through !== dates[dates.length - 1]
        || dates.some((date, i) => !validMarketDate(date) || (i > 0 && date <= dates[i - 1]))) throw new Error("invalid market dates");
    const boards = {};
    for (const code of MARKET_CODES) {
      const close = data.boards?.[code]?.close;
      if (!Array.isArray(close) || close.length !== dates.length
          || close.some(value => value !== null && (!fin(value) || value <= 0))) throw new Error("invalid market closes");
      boards[code] = { close: close.slice() };
    }
    return { through: data.through, dates: dates.slice(), boards,
      indexByDate: new Map(dates.map((date, i) => [date, i])),
      revision: JSON.stringify([dates, MARKET_CODES.map(code => boards[code].close)]) };
  }
  function marketAverageState(seed, date, code, length) {
    if (!seed || !validMarketDate(date) || date > seed.through) return null;
    const i = seed.indexByDate.get(date), close = seed.boards[code]?.close;
    if (!Number.isInteger(i) || i < length - 1 || !close) return null;
    if (seed.gaps?.some(index => index > i - length + 1 && index <= i)) return null;
    const window = close.slice(i - length + 1, i + 1);
    if (window.length !== length || window.some(value => !fin(value) || value <= 0)) return null;
    return close[i] >= window.reduce((sum, value) => sum + value, 0) / length;
  }
  let rollingSeed = null, archiveSeed = null, archiveRequest = null;
  async function fetchSeed(url) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, { cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      return response.ok ? validateMarketSeed(await response.json()) : null;
    } catch (_) { return null; }
    finally { clearTimeout(timeout); }
  }

  function applyMarketSeeds() {
    let next = rollingSeed;
    if (tradeCtx?.book && archiveSeed) {
      next = archiveSeed;
      if (rollingSeed) {
        const dates = [...new Set([...archiveSeed.dates, ...rollingSeed.dates])].sort();
        const boards = Object.fromEntries(MARKET_CODES.map(code => [code, { close: dates.map(date => {
          const old = archiveSeed.indexByDate.get(date), recent = rollingSeed.indexByDate.get(date);
          return rollingSeed.boards[code].close[recent] ?? archiveSeed.boards[code].close[old] ?? null;
        }) }]));
        next = validateMarketSeed({ schemaVersion: 1, kind: "market-seed", through: dates.at(-1), dates, boards });
        // 两源没有日期重叠时，不能把相隔数月的收盘价拼成一个均线窗口。
        next.gaps = [];
        for (let i = 1; i < dates.length; i++) {
          const adjacent = [archiveSeed, rollingSeed].some(seed => {
            const index = seed.indexByDate.get(dates[i]);
            return index > 0 && seed.dates[index - 1] === dates[i - 1];
          });
          if (!adjacent) next.gaps.push(i);
        }
        next.revision += ":" + next.gaps.join(",");
      }
    }
    const revision = next?.revision || "unavailable";
    if (revision === marketSeedRevision) return;
    marketSeed = next;
    marketSeedRevision = revision;
    if (tradeVisible()) renderTrading();
  }

  function refreshMarketSeed() {
    if (!tradeVisible() || !activeTradingData()?.marketRows?.length) return;
    if (tradeCtx?.book && !archiveSeed && !archiveRequest) {
      archiveRequest = fetchSeed("fuyao-market-history.json").then(seed => {
        archiveSeed = seed;
        applyMarketSeeds();
      }).finally(() => { archiveRequest = null; });
    }
    if (!marketSeedRequest) {
      marketSeedRequest = fetchSeed(MARKET_SEED_URL).then(seed => {
        rollingSeed = seed;
        applyMarketSeeds();
      }).finally(() => { marketSeedRequest = null; });
    }
    return marketSeedRequest;
  }
  async function loadLocal(quiet = false) {
    if (!LOCAL || localLoading) return false;
    localLoading = true;
    try {
      const r = await fetch("/api/annual", { headers: { "X-CEO-Hub": "1" } }).then((x) => x.json());
      if (!r.ok) { localError = r.error || ""; return false; }
      // 后台请求返回时用户可能已切去记餐，不打断编辑或图片上传。
      if (quiet && (document.hidden || !tradeVisible())) return true;
      const changed = !V || V.asOf !== r.view.asOf || JSON.stringify(V.sync) !== JSON.stringify(r.view.sync)
        || V.local?.positionAdvice?.revision !== r.view.local?.positionAdvice?.revision;
      V = r.view; localMode = true;
      if (!quiet || changed) { render(); renderTrading(); }
      // 行情请求独立完成，不让公网故障或超时挡住年度内容；同轮请求在途时复用一次。
      void refreshMarketSeed();
      return true;
    } catch (_) { return false; }
    finally { localLoading = false; }
  }
  const annualLogo = () => window.TianShuScenes?.logo ? window.TianShuScenes.logo("annual") : '<div class="ts-head-logo" data-logo="annual" aria-hidden="true"></div>';
  const annualHead = (meta = "", actions = "") => `<header class="ts-page-head an-head">
    <div class="ts-head-main">${annualLogo()}<div class="ts-head-copy">
      <div class="ts-head-title"><h2>轻体 <span>· 体重与饮食</span></h2></div>
      <p class="ts-head-desc">年度体重趋势、周达标追踪与每日饮食热量估算</p>
      ${meta ? `<p class="ts-head-meta">${meta}</p>` : ""}
    </div></div>
    ${actions ? `<div class="ts-head-actions">${actions}</div>` : ""}
  </header>`;
  const noData = () => {
    root.innerHTML = `${annualHead()}<article class="panel"><p class="empty">${esc(localError ||
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
    root.innerHTML = `${annualHead(updated ? `密文生成于 ${esc(updated)} UTC` : "")}<article class="panel an-lock">
      <div class="an-lock-icon">◆</div><h3>轻体 · 已加密</h3>
      <p class="hint">体重与饮食数据在笔记本上加密后发布，输入口令后只在本设备内解密。${updated ? `数据生成于 ${esc(updated)} UTC。` : ""}</p>
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
        // bridge：缺测日直接连到下一次测量（体重看趋势，发起人 11-04）；交易曲线仍保留缺口
        rows.forEach((p, i) => { if (fin(p[key])) { d += (open ? "L" : "M") + x(i).toFixed(1) + " " + y(p[key]).toFixed(1); open = true; } else if (!opts.bridge) open = false; });
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
      const dots = rows.map((p, i) => fin(p.value) ? `<circle cx="${x(i)}" cy="${y(p.value)}" r="${rows.length > 40 ? 1.8 : 3}" class="an-dot ${opts.tone ? opts.tone(p.value, p.emptyFlatRed) : ""}"/>` : "").join("");
      const first = rows[0].date, last = rows[rows.length - 1].date;
      box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.label)}">
        <g class="an-axis">${axis}<text x="${padL}" y="${H - 6}">${marketDateText(first, first.slice(0, 4) !== last.slice(0, 4))}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${marketDateText(last, first.slice(0, 4) !== last.slice(0, 4))}</text></g>
        ${zero}${opts.average ? `<path d="${line("average7")}" class="an-avg"/>` : ""}
        <path d="${line("value")}" class="an-line"/>${dots}
        <line class="an-cursor" y1="${padT}" y2="${H - padB}" x1="-10" x2="-10"/><circle class="an-hl" r="5" cx="-10" cy="-10"/>
        <g class="an-float" visibility="hidden"><rect rx="6"/><text></text></g></svg>`;
      const path = box.querySelector(".an-line");
      if (!reduceMotion && path.getTotalLength) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
        requestAnimationFrame(() => { path.style.transition = "stroke-dashoffset .6s ease"; path.style.strokeDashoffset = 0; });
      }
      // 悬停提示（发起人 11-04）：只吸附到有数值的点，提示框跟着该点走，不再固定在左上角
      const svg = box.querySelector("svg"), cursor = svg.querySelector(".an-cursor"), hl = svg.querySelector(".an-hl");
      const fl = svg.querySelector(".an-float"), flBox = fl.querySelector("rect"), flText = fl.querySelector("text");
      const pick = (evt) => {
        const rect = svg.getBoundingClientRect(), px = (evt.clientX - rect.left) * W / rect.width;
        let best = -1; rows.forEach((p, i) => { if (fin(p.value) && (best < 0 || Math.abs(x(i) - px) < Math.abs(x(best) - px))) best = i; });
        if (best < 0) return;
        const p = rows[best], cx = x(best), cy = y(p.value);
        cursor.setAttribute("x1", cx); cursor.setAttribute("x2", cx);
        hl.setAttribute("cx", cx); hl.setAttribute("cy", cy);
        flText.innerHTML = [].concat(opts.tip(p)).map((l, k) => `<tspan x="0" dy="${k ? 15 : 0}"${k ? "" : ` class="b"`}>${esc(l)}</tspan>`).join("");
        fl.setAttribute("visibility", "visible");
        const bb = flText.getBBox(), bw = bb.width + 16, bh = bb.height + 10;
        const bx = Math.max(4, Math.min(W - bw - 4, cx - bw / 2));
        let by = cy - bh - 10; if (by < 2) by = cy + 12;
        flBox.setAttribute("x", bx); flBox.setAttribute("y", by); flBox.setAttribute("width", bw); flBox.setAttribute("height", bh);
        flText.setAttribute("transform", `translate(${bx + 8},${by + 5 - bb.y})`);
      };
      const hide = () => { fl.setAttribute("visibility", "hidden"); hl.setAttribute("cx", -10); cursor.setAttribute("x1", -10); cursor.setAttribute("x2", -10); };
      svg.addEventListener("pointerdown", pick);
      svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) pick(e); });
      svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    });
    host.querySelectorAll("[data-mkt-chart]").forEach((box) => drawMarketTrend(box));
  }

  // 与图片工作流共用 NAS 派生产物；建议变化也触发重绘，避免首次跨站结果永久缓存。
  // 仓位建议按市场阶段着色，兼容已发布的历史标签。
  const STATE_CLS = { "主升": "pos-up", "反弹": "pos-rebound", "筑底": "pos-bottom", "主跌": "pos-down",
    "大主升": "pos-up", "大主升-减仓": "pos-reduce", "震荡": "pos-range" };
  const weekOf = (date) => {
    const day = new Date(date + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
  };
  const addDays = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);

  function summarizeRange(rows, periodLabel) {
    const returns = window.CEO_FUYAO_RETURNS.range();
    let sum = 0, dayCount = 0, winningDays = 0, losingDays = 0;
    const curve = rows.map(row => {
      const rate = returns.add(row.capital);
      if (!fin(row.pnl)) return { date: row.date, value: null, rate: null };
      dayCount++;
      sum = Math.round((sum + row.pnl) * 100) / 100;
      if (row.pnl > 0 || row.emptyFlatRed) winningDays++;
      if (row.pnl < 0) losingDays++;
      return { date: row.date, value: sum, rate };
    });
    const pnl = dayCount ? sum : null;
    return { periodLabel, pnl, emptyFlatRed: rows.length > 0 && rows.every(r => r.emptyFlatRed), pnlRatio: returns.rate(), curve, dayCount,
      winRate: dayCount ? winningDays / dayCount : null, winningDays, losingDays, flatDays: dayCount - winningDays - losingDays,
      positionRatio: rows.findLast(row => fin(row.positionRatio))?.positionRatio ?? null };
  }

  // 早期原表相同栏位写过交易笔记。只接受完整指数标签，排除夹在自然语言中的勾叉或均线词。
  function indexRecord(text) {
    const note = String(text ?? "").trim();
    if (!note || note.replace(/[✅√✓✔×✕✗✘叉]|[上下破]5日(?:线)?|创新[高低]|(?:10日(?:均)?线[上下](?:方)?)|[\s，,。·、；;()[\]（）]/g, "")) return null;
    const up = /[✅√✓✔]|10日(?:均)?线上/.test(note), down = /[×✕✗✘叉]|10日(?:均)?线下/.test(note);
    return { status: up === down ? "unknown" : up ? "above" : "below", note };
  }

  function bookMarketRows(dates, tradeByDate, ctx) {
    const annualByDate = new Map((V?.local?.marketRows || []).map(row => [row.date, row]));
    const latest = ctx.marketDaily;
    return dates.slice().reverse().map(date => ({
      date,
      cells: MARKET_CODES.map((code, i) => {
        const ledger = indexRecord(tradeByDate.get(date)?.indices?.[i]?.text);
        const old = annualByDate.get(date)?.cells?.[i];
        const annual = old && (!old.note || indexRecord(old.note)) ? old : null;
        const close = date === latest?.date ? indexRecord(latest.indexLabels?.[i]) : null;
        const recorded = [ledger, annual, close].find(cell => cell?.status === "above" || cell?.status === "below");
        const estimate = recorded ? null : marketAverageState(marketSeed, date, code, 10);
        const status = recorded?.status || (estimate === null ? "unknown" : estimate ? "above" : "below");
        const note = [ledger, annual, close].map(cell => cell?.note || "")
          .filter(text => /[上下破]5日|创新[高低]/.test(text)).at(0) || "";
        return { status, note, source10: recorded ? (recorded === close ? "daily" : "record") : estimate !== null ? "market" : "pending" };
      }),
    }));
  }

  function buildBookTradingData(ctx) {
    const book = ctx.book, start = ctx.startDate;
    const inScope = ({ d }) => validMarketDate(d) && (!start || d >= start) && (!book.asOf || d <= book.asOf);
    const tradeDays = (book.trades?.days || []).filter(inScope);
    const tradeByDate = new Map(tradeDays.map(row => [row.d, row]));
    const capital = (book.capital?.days || []).filter(inScope).sort((a, b) => a.d.localeCompare(b.d));
    const dates = [...new Set([...capital.map(row => row.d), ...tradeByDate.keys()])].sort();
    const from = start || dates[0], asOf = book.asOf || dates.at(-1) || "";
    const capByDate = new Map(capital.map(row => [row.d, row]));
    const dailyRows = dates.map(date => {
      const row = capByDate.get(date), pos = tradeByDate.get(date)?.totalPosition;
      const positionRatio = fin(pos) && pos >= 0 && pos <= 1 ? pos : null;
      const realized = row && row.confirmed !== false && fin(row.pnl) && (row.pnl !== 0 || row.confirmed === true
        || fin(row.actualEquity ?? row.cash) || positionRatio !== null);
      const pnl = realized ? row.pnl : null;
      const capitalDay = !row || realized || row.confirmed === true ? row : { ...row, confirmed: false };
      return { date, pnl, emptyFlatRed: window.CEO_FUYAO_RETURNS.emptyFlatRed(capitalDay), capital: capitalDay, dailyReturnRate: window.CEO_FUYAO_RETURNS.daily(capitalDay), positionRatio };
    });
    const label = start ? "新模式" : "全量";
    const plan = summarizeRange(dailyRows, `${label}累计${from ? " · " + from + " 起" : ""}`);
    dailyRows.forEach((row, i) => {
      row.cumulativePnl = plan.curve[i].value;
      row.cumulativeReturnRate = plan.curve[i].rate;
    });
    const weekly = new Map();
    for (const row of dailyRows) {
      const key = weekOf(row.date);
      if (!weekly.has(key)) weekly.set(key, []);
      weekly.get(key).push(row);
    }
    const weeklyRows = [];
    for (let monday = from && weekOf(from); monday && monday <= asOf; monday = addDays(monday, 7)) {
      const rows = weekly.get(monday) || [], sunday = addDays(monday, 6);
      const summary = summarizeRange(rows, monday);
      const lastPosition = rows.findLast(row => fin(row.positionRatio));
      weeklyRows.push({ ...summary, weekStart: monday, weekEnd: sunday, coverageStart: monday > from ? monday : from,
        coverageEnd: sunday < asOf ? sunday : asOf, dailyWinRate: summary.winRate, positionDate: lastPosition?.date || "" });
    }
    const month = asOf.slice(0, 7), year = asOf.slice(0, 4);
    const quarter = (date) => Math.ceil(Number(date.slice(5, 7)) / 3);
    const trading = { day: plan, week: plan, plan,
      month: summarizeRange(dailyRows.filter(row => row.date.startsWith(month)), "本月 · " + month),
      quarter: summarizeRange(dailyRows.filter(row => row.date.startsWith(year) && quarter(row.date) === quarter(asOf)), `本季 · ${year} Q${quarter(asOf)}`),
      year: summarizeRange(dailyRows.filter(row => row.date.startsWith(year)), "本年 · " + year) };
    const marketDates = new Set(dates);
    for (const date of [...(marketSeed?.dates || []), ...(V?.local?.marketRows || []).map(row => row.date), ctx.marketDaily?.date]) {
      if (from && validMarketDate(date) && date >= from && date <= asOf) marketDates.add(date);
    }
    const marketRows = bookMarketRows([...marketDates].sort(), tradeByDate, ctx);
    return { asOf, trading, tradingHistory: { dailyRows, weeklyRows, weeklyCurve: weeklyRows.map(w => ({ date: w.coverageStart, end: w.coverageEnd, value: w.pnl, rate: w.pnlRatio, emptyFlatRed: w.emptyFlatRed })) },
      marketRows, markets: V?.markets?.length ? V.markets : DEFAULT_MARKETS,
      positionAdvice: ctx.positionAdvice || V?.local?.positionAdvice, withYear: from && from.slice(0, 4) !== asOf.slice(0, 4),
      hint: `${start ? "新模式自 " + start + " 起" : "按原表全部历史记录"}统计。日盈亏比例按原表当日期初资产计算。区间盈亏已扣除转入转出，本金按《收入明细》同期公式调整。`,
      marketDate: marketRows[0]?.date || "" };
  }

  let bookProjection;
  function activeTradingData() {
    if (tradeCtx) {
      if (!tradeCtx.book) return null;
      if (bookProjection?.ctx !== tradeCtx || bookProjection.view !== V || bookProjection.seed !== marketSeed) {
        bookProjection = { ctx: tradeCtx, view: V, seed: marketSeed, data: buildBookTradingData(tradeCtx) };
      }
      return bookProjection.data;
    }
    if (!V) return null;
    return {
      asOf: V.asOf, trading: V.trading, tradingHistory: V.tradingHistory,
      marketRows: V.local?.marketRows || [], markets: V.markets || DEFAULT_MARKETS,
      positionAdvice: V.local?.positionAdvice || null,
      hint: "单日比例以当日期初资产为分母；累计以区间起始期初资产为分母。",
      marketDate: V.marketDate || "",
    };
  }

  function posCells(r, advice = V?.local?.positionAdvice) {
    const s = advice?.days?.[r.date];
    if (!s || r.date > advice.through || !fin(s.pct) || !fin(advice.tolerance)) {
      if (!s && advice?.status === "ready" && r.date <= advice.through) {
        return `<span class="n" title="该日没有已发布的仓位建议">—</span><span class="n">—</span>`;
      }
      const tip = `当日市场状态尚未齐备${advice?.through ? `，当前更新至 ${advice.through}` : ""}。`;
      return `<span class="n an-pos-pending" title="${esc(tip)}">等待更新</span><span class="n">—</span>`;
    }
    const actual = fin(r.positionRatio) ? r.positionRatio * 100 : null;
    const ok = actual === null ? null : actual <= s.pct + advice.tolerance;
    const tip = `指数线 ${s.state} ${s.index}%${s.emo ? ` + 情绪主升 ${s.emo}%` : ""} = ${s.pct}%。${advice.ruleText}`;
    return `<span class="st ${STATE_CLS[s.state] || ""}" title="${esc(tip)}">${s.pct}%<i>${esc(s.state)}</i></span><span>${ok === null ? "—" : `<span class="mk ${ok ? "mk-v1" : "mk-x1"}">${ok ? "√" : "×"}</span>`}</span>`;
  }

  // ── 各页内容 ──
  const PERIODS = [["day", "日"], ["week", "周"], ["month", "月"], ["quarter", "季"], ["year", "年"], ["plan", "全程"]];
  const kpi = (label, value, sub, tone = "") => `<div class="kpi"><small>${esc(label)}</small><b class="${tone}">${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;

  const RECORD_PAGE_SIZE = 20;
  const recordPageIndex = new Map();

  // 两张表各自记住所在日期段。只替换表内记录行，走势、累计值及另一张表保持原位。
  function recordTable(kind, title, rows, tableClass, header, renderRow, footer, bindings) {
    const pageCount = Math.ceil(rows.length / RECORD_PAGE_SIZE);
    const key = (tradeCtx?.scope || "annual") + ":" + kind;
    const page = Math.min(recordPageIndex.get(key) || 0, pageCount - 1);
    const pageRows = index => rows.slice(index * RECORD_PAGE_SIZE, (index + 1) * RECORD_PAGE_SIZE).map(renderRow).join("");
    let controls = "";
    if (pageCount > 1) {
      const label = kind === "daily" ? "逐日统计" : "逐日记录";
      const options = Array.from({ length: pageCount }, (_, index) => {
        const recent = rows[index * RECORD_PAGE_SIZE].date;
        const oldest = rows[Math.min((index + 1) * RECORD_PAGE_SIZE, rows.length) - 1].date;
        const dates = oldest === recent ? marketDateText(recent, true) : marketDateText(oldest, true) + "–" + marketDateText(recent, true);
        return `<option value="${index}"${index === page ? " selected" : ""}>${index + 1}/${pageCount}　${esc(dates)}</option>`;
      }).join("");
      controls = `<nav class="an-record-pager" aria-label="${label}分页"><button type="button" data-record-prev${page === 0 ? " disabled" : ""}>上一页</button>
        <select aria-label="${label}日期范围">${options}</select><button type="button" data-record-next${page === pageCount - 1 ? " disabled" : ""}>下一页</button></nav>`;
      bindings.push(host => {
        const section = host.querySelector(`[data-record-table="${kind}"]`);
        const picker = section.querySelector("select");
        const prev = section.querySelector("[data-record-prev]"), next = section.querySelector("[data-record-next]");
        function show(index) {
          if (index < 0 || index >= pageCount) return;
          recordPageIndex.set(key, index);
          picker.selectedIndex = index;
          section.querySelector("[data-record-rows]").innerHTML = pageRows(index);
          if ((index === 0 && document.activeElement === prev) || (index === pageCount - 1 && document.activeElement === next)) picker.focus({ preventScroll: true });
          prev.disabled = index === 0;
          next.disabled = index === pageCount - 1;
        }
        picker.onchange = () => show(picker.selectedIndex);
        prev.onclick = () => show(picker.selectedIndex - 1);
        next.onclick = () => show(picker.selectedIndex + 1);
      });
    }
    return `<div data-record-table="${kind}"><div class="an-record-head">${title}${controls}</div><div class="an-table ${tableClass}">
      <div class="an-th">${header}</div><div data-record-rows>${pageRows(page)}</div>${footer}</div></div>`;
  }

  function tradingView(active, bindings) {
    const D = active || activeTradingData();
    const fmtDate = date => marketDateText(date, D.withYear);
    const s = D.trading[pref.tradePeriod] || D.trading.plan, H = D.tradingHistory, advice = D.positionAdvice;
    const periodFlat = ["month", "quarter", "year"].includes(pref.tradePeriod) && s.emptyFlatRed;
    let body = `<article class="panel an-card"><div class="an-stat-hd"><span>${esc(pref.tradePeriod === "day" || pref.tradePeriod === "week" ? `${tradeCtx?.startDate ? "新模式" : "全量"}累计 · 截至 ` + D.asOf : s.periodLabel)}</span><small>盈亏 · 元 / %</small></div>
      <div class="an-big ${dayTone(s.pnl, periodFlat)}">${signed(s.pnl)}<span class="an-rate">${rate(s.pnlRatio)}</span></div>
      <div class="kpis an-kpis">${kpi("交易日红盘率", pct(s.winRate), `${s.dayCount} 个有实绩的交易日`)}
        ${kpi("红盘 / 亏损", `红 ${s.winningDays} / 亏 ${s.losingDays}`, s.dayCount ? `平盘 ${s.flatDays} 次 · 空仓零盈亏计红盘` : "样本不足")}
        ${kpi("最近总仓位", pct(s.positionRatio, 2), "权益占比")}</div>`;
    const money = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0));
    // 累计曲线同时给当日比例；按日期匹配日实绩，缺失不从累计比例相减推算。
    const dailyRates = new Map(H.dailyRows.map(r => [r.date, r.dailyReturnRate]));
    const tradeTip = (p) => [p.date, `累计 ${signed(p.value)} 元 · ${rate(p.rate)}`, `当日盈亏比例 ${rate(dailyRates.get(p.date))}`];
    if (pref.tradePeriod === "week") body += chart(H.weeklyCurve, { label: "每个自然周盈亏折线图", fmt: money, zero: true, tip: (p) => `${p.date}–${p.end || addDays(p.date, 6)}  ${signed(p.value)} 元  ${rate(p.rate)}`, tone: dayTone });
    else if (pref.tradePeriod !== "day") body += chart(s.curve, { label: "所选周期累计盈亏折线图", fmt: money, zero: true, rateAxis: true, tip: tradeTip, tone: pnlTone });
    body += `<p class="hint">${esc(D.hint)}</p></article>`;
    if (pref.tradePeriod === "day") {
      const dailyTitle = "<h3>逐日统计</h3>";
      body += `<article class="panel">${H.dailyRows.length ? recordTable("daily", dailyTitle, H.dailyRows.slice().reverse(), "an-t4 an-pos",
        "<span>日期</span><span>日盈亏 / 元</span><span>累计 / 元</span><span>仓位</span><span>仓位建议</span><span>判定</span>",
        r => `<div class="an-tr"><span>${fmtDate(r.date)}</span>
          <span class="${dayTone(r.pnl, r.emptyFlatRed)}"${r.emptyFlatRed ? ' title="空仓零盈亏，计红盘"' : ""}>${signed(r.pnl)}<i>${rate(r.dailyReturnRate)}</i></span>
          <span class="${pnlTone(r.cumulativePnl)}">${signed(r.cumulativePnl)}<i>${rate(r.cumulativeReturnRate)}</i></span>
          <span>${pct(r.positionRatio, 2)}</span>${posCells(r, advice)}</div>`, "", bindings)
        + `<p class="hint">${esc(advice?.ruleText || "仓位建议按观澜发布的收盘市场阶段计算。")} 用于复盘对照。</p>`
        : dailyTitle + `<p class="empty">暂无已确认实绩，缺失不计零盈亏。</p>`}</article>`;
    }
    if (pref.tradePeriod === "week") {
      body += `<article class="panel"><h3>自然周统计 <small>周一至周日</small></h3><div class="an-table an-t4"><div class="an-th"><span>自然周</span><span>周盈亏 / 元</span><span>红盘率</span><span>仓位</span></div>
        ${H.weeklyRows.slice().reverse().map((r) => `<div class="an-tr"><span>${fmtDate(r.weekStart)}–${fmtDate(r.weekEnd)}<i>覆盖 ${fmtDate(r.coverageStart)}–${fmtDate(r.coverageEnd)}</i></span>
          <span class="${dayTone(r.pnl, r.emptyFlatRed)}">${signed(r.pnl)}<i>${rate(r.pnlRatio)}</i></span>
          <span>${r.dayCount ? pct(r.dailyWinRate) : "—"}<i>${r.dayCount ? `${r.winningDays}红 ${r.losingDays}亏 ${r.flatDays}平` : "无实绩"}</i></span>
          <span>${pct(r.positionRatio, 2)}<i>${fmtDate(r.positionDate) || "—"}</i></span></div>`).join("")}</div>
        <p class="hint">首尾周只统计区间内已到日期；无实绩的周显示“—”，折线保留缺口。</p></article>`;
    }
    // 发起人 11-03：取消顶部「当日」三项，直接放累计；逐日记录表保留，表下加累计走势图
    const mkRows = marketRowsAsc(D);
    const mkHead = mkRows.length ? `累计 · ${fmtDate(mkRows[0].date)}–${fmtDate(mkRows[mkRows.length - 1].date)} · ${mkRows.length} 个记录日`
      : esc(D.marketDate || "暂无记录");
    // 发起人 11-04：累计 √/× 计数挪到右侧、紧挨「当前」「连续」之前；当前、连续拆成两个填色格并带动效
    const mkTop = mkRows.length
      ? `<div class="an-mkt-sum">${marketStats(mkRows, D.markets).map((s) => {
        const tone = s.lastLabel === "√" ? "is-v" : s.lastLabel === "×" ? "is-x" : "";
        const share = mkRows.length ? Math.round(s.streak / mkRows.length * 100) : 0;
        return `<div class="an-market"><div><b>${esc(s.title)}</b><small>${esc(s.code)}</small></div>
        <div class="an-mk-right"><span class="mk mk-v1">√ ${s.ok}</span><span class="mk mk-x1">× ${s.bad}</span>
          <span class="an-mk-cell an-mk-now ${tone}" title="最近一个记录日的状态：√ 站上 10 日均线，× 在下方"><small>当前</small><b>${s.lastLabel}</b></span>
          <span class="an-mk-cell an-mk-streak ${tone}" style="--fill:${share}%" title="当前状态连续出现的记录日数（占区间 ${share}%）"><small>连续</small><b data-count="${s.streak}">${reduceMotion ? s.streak : 0}</b><small>天</small></span></div></div>`;
      }).join("")}</div>`
      : D.markets.map((m) => `<div class="an-market"><div><b>${esc(m.title)}</b><small>${esc(m.code)}</small></div>
        <div class="an-mk-right"><span class="chip P2">尚无判断</span></div></div>`).join("");
    const mkStats = mkRows.length ? marketStats(mkRows, D.markets) : [];
    // 发起人 11-04：纵轴改为均线位置分档（创新低 / 5日线下 / 5日线上 / 10日线上），看每天强弱走到哪一档
    body += `<article class="panel"><h3>市场三项判断 <small>${mkHead}</small></h3>${mkTop}${marketTable(D, bindings)}
      ${mkRows.length ? `<div class="an-mkt-trend"><div class="an-mkt-trend-hd"><h3 class="an-sub">均线位置走势 <small>每日收盘相对 5 日、10 日均线的位置</small></h3>
        <div class="an-mkt-read" data-mkt-read>${mkStats.map((s, i) => `<span style="--c:${MKT_COLORS[i]}"><i></i>${esc(s.title)}<b>—</b></span>`).join("")}<em></em></div></div>
        <div class="an-chart" data-mkt-chart></div>
        <p class="hint">逐日优先采用原表或收盘汇总的 10 日线记录。缺少判断时，仅用当日及此前完整的 10 个收盘价计算。5 日线采用完整的 5 个收盘价，缺行情时参考当日明确备注。</p></div>` : ""}</article>`;
    return body;
  }

  // 累计和逐日使用相同的 10 日判断，5 日标记不参与 10 日计数。
  function mkLevel(note, status) {
    const state = marketTenDay(note, status);
    return state === null ? "" : state ? "mk-v1" : "mk-x1";
  }
  function marketTenDay(note, status) {
    if (status === "above") return true;
    if (status === "below") return false;
    const text = String(note ?? ""), up = /[✅√✓✔]/.test(text), down = /[×✕✗✘叉]/.test(text);
    return up === down ? null : up;
  }
  function marketNoteFiveDay(note) {
    const text = String(note ?? ""), up = /上\s*5\s*日/.test(text), down = /[破下]\s*5\s*日/.test(text);
    return up === down ? null : up;
  }
  function marketMaState(cell, date, code) {
    const market5 = marketAverageState(marketSeed, date, code, 5), note5 = marketNoteFiveDay(cell.note);
    return { above5: market5 ?? note5, above10: marketTenDay(cell.note, cell.status),
      source10: cell.source10 || "record", source5: market5 !== null ? "market" : note5 !== null ? "note" : "pending" };
  }
  // 只比较相邻记录的已知位置；未知值切断比较链，不把恢复数据当成穿线。
  function marketChangeRows(rows) {
    const asc = rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))), frequencies = new Map();
    asc.forEach(r => frequencies.set(r.date, (frequencies.get(r.date) || 0) + 1));
    const stateByRow = new Map(), stateOf = row => {
      if (!stateByRow.has(row)) stateByRow.set(row, MARKET_CODES.map((code, i) => {
        const cell = (row.cells || [])[i] || {};
        return { ...marketMaState(cell, row.date, code), changed5: false, changed10: false };
      }));
      return stateByRow.get(row);
    };
    const flip = (a, b) => typeof a === 'boolean' && typeof b === 'boolean' && a !== b;
    for (let k = 1; k < asc.length; k++) {
      const previous = asc[k - 1], row = asc[k];
      if (!validMarketDate(previous.date) || !validMarketDate(row.date)
          || frequencies.get(previous.date) !== 1 || frequencies.get(row.date) !== 1) continue;
      // 行情若能证明中间漏了一天，不能把跨缺口的变化记到当前日。
      // 过期或尚未返回的行情不会否定原表相邻交易日的 10 日线变化。
      if (marketSeed?.dates.some(date => date > previous.date && date < row.date)) continue;
      const states = stateOf(row);
      MARKET_CODES.forEach((code, i) => {
        const before = marketMaState((previous.cells || [])[i] || {}, previous.date, code);
        states[i].changed5 = flip(before.above5, states[i].above5);
        states[i].changed10 = flip(before.above10, states[i].above10);
      });
    }
    const changed = asc.filter(row => stateOf(row).some(s => s.changed5 || s.changed10)).reverse().map(row => ({ row, states: stateOf(row) }));
    return { changed, stateOf, firstDate: asc[0].date };
  }
  function mkTag(note, date, code, state) {
    const { above5, above10, source5, source10, changed5, changed10 } = state;
    const title10 = source10 === "market" ? "日线行情：当日收盘与完整10日均价比较"
      : source10 === "daily" ? "当日收盘行情汇总" : "原表10日均线记录";
    const known = typeof above10 === 'boolean';
    const level = known ? (above10 ? 'mk-v1' : 'mk-x1') : '';
    const sign = known ? (above10 ? '√' : '×') : '—';
    const tag = (period, value, changed, source, title) => changed
      ? `<span class="mtag mk-ma${period} ${value ? 'is-up' : 'is-down'}" data-source="${source}" title="${esc(title)}">${value ? '上' : '下'}${period}日</span>`
      : '';
    const title5 = source5 === 'market' ? '5日：公共行情当日收盘与完整5日均价比较（含当日，相等记线上）'
      : '5日：公共行情待更新，暂据原表当日明确均线备注';
    const labels = tag(5, above5, changed5, source5, title5)
      + tag(10, above10, changed10, source10, title10);
    const text = String(note ?? ''), high = /创新高/.test(text), low = /创新低/.test(text);
    const ext = high ? `<span class="mtag mk-ext is-up" title="原表当日备注">创新高</span>`
      : low ? `<span class="mtag mk-ext is-low" title="原表当日备注">创新低</span>` : '';
    const group = labels ? `<span class="mk-ma-group">${labels}</span>` : '';
    return `<span class="mk-cell" data-market-date="${esc(date || '')}" data-market-code="${esc(code || '')}"><span class="mk ${level}" title="${known ? title10 : '10日均线未知'}">${sign}</span>${group}${ext}</span>`;
  }
  // 逐日记录完整保留；合计、累计和趋势仍使用完整交易日记录。
  function marketTable(active, bindings) {
    const D = active || activeTradingData();
    const rows = D && D.marketRows;
    if (!rows || !rows.length) return '';
    const { stateOf, firstDate } = marketChangeRows(rows);
    const fmtDate = date => marketDateText(date, D.withYear);
    const rowDate = date => `<time datetime="${esc(date)}">${esc(D.withYear ? date.replace(/-/g, ".") : md(date))}</time>`;
    const cellAt = (row, i) => (row.cells || [])[i] || {};
    const count = (i, re) => rows.filter(r => re.test(mkLevel(cellAt(r, i).note, cellAt(r, i).status))).length;
    const ordered = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const title = `<h3 class="an-sub">逐日记录 <small>${fmtDate(firstDate)} 至今 · ${rows.length} 个记录日</small></h3>`;
    const header = "<span>日期</span>" + D.markets.map(m => `<span>${esc(m.title)}</span>`).join("");
    const footer = `<div class="an-tr an-total"><span>合计</span>${[0, 1, 2].map(i => `<span><span class="mk mk-v1">√ ${count(i, /mk-v/)}</span> <span class="mk mk-x1">× ${count(i, /mk-x/)}</span></span>`).join("")}</div>`;
    return recordTable("market", title, ordered, "an-mkt", header, r => {
      const states = stateOf(r);
      return `<div class="an-tr"><span>${rowDate(r.date)}${r.baseline ? ' <small>基准</small>' : ''}</span>${MARKET_CODES.map((code, i) => `<span>${mkTag(cellAt(r, i).note, r.date, code, states[i])}</span>`).join("")}</div>`;
    }, footer, bindings);
  }
  // 三项走势配色：天枢青蓝、青绿、琥珀
  const MKT_COLORS = ["var(--ceo)", "var(--mkt2)", "var(--warn)"];
  function marketRowsAsc(active) {
    const D = active || activeTradingData();
    const rows = D && D.marketRows;
    return rows && rows.length ? rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))) : [];
  }
  function marketStats(rows, markets) {
    const list = markets || activeTradingData()?.markets || DEFAULT_MARKETS;
    return list.map((m, i) => {
      let ok = 0, bad = 0;
      rows.forEach((r) => {
        const c = r.cells[i] || {};
        const level = mkLevel(c.note, c.status);
        if (/mk-v/.test(level)) ok += 1; else if (/mk-x/.test(level)) bad += 1;
      });
      // 当前状态（最后一天的 √/×）连续持续了几天，给累计块右侧显示（发起人 11-03）；
      // 按「上/下 10 日线」判定连续性，不把 ×（破5日）/××（创新低）这些备注档位当成不同状态
      const lastCell = rows.length ? (rows[rows.length - 1].cells[i] || {}) : {};
      const lastLevel = mkLevel(lastCell.note, lastCell.status);
      const lastSign = /mk-v/.test(lastLevel) ? "v" : /mk-x/.test(lastLevel) ? "x" : "";
      let streak = 0;
      for (let k = rows.length - 1; k >= 0 && lastSign; k--) {
        const c = rows[k].cells[i] || {};
        const lv = mkLevel(c.note, c.status);
        if ((/mk-v/.test(lv) ? "v" : /mk-x/.test(lv) ? "x" : "") !== lastSign) break;
        streak += 1;
      }
      return { title: m.title, code: m.code, ok, bad, streak,
               lastLabel: lastSign === "v" ? "√" : lastSign === "x" ? "×" : "—" };
    });
  }
  // 均线位置分档（发起人 11-04）：0 创新低、1 5日线下、2 5日线上（仍在 10 日线下）、3 10日线上、4 创新高（出现才显示）。
  const MKT_LV = ["创新低", "5日线下", "5日线上", "10日线上", "创新高"];
  function marketLevels(rows, i) {
    return rows.map(row => {
      const cell = row.cells[i] || {}, note = String(cell.note || "");
      const { above5, above10 } = marketMaState(cell, row.date, MARKET_CODES[i]);
      if (/创新高/.test(note)) return 4;
      if (above10 === true) return 3;
      if (/创新低/.test(note) && !/[上下破]5日/.test(note)) return 0;
      return above10 === false && above5 !== null ? (above5 ? 2 : 1) : null;
    });
  }
  // 两个统计范围分别记住当前时间轴；停在末端时，新数据仍跟随最新日。
  const marketTrendViews = new Map();
  function drawMarketTrend(box) {
    const D = activeTradingData();
    const rows = marketRowsAsc(D);
    if (!rows.length || !box) return;
    const n = rows.length, short = (t) => String(t).replace(/^同花顺/, "").trim();
    const series = D.markets.map((m, i) => ({ title: m.title, values: marketLevels(rows, i) }));
    const top = series.some((s) => s.values.includes(4)) ? 4 : 3;
    const narrow = box.clientWidth < 520, H = narrow ? 196 : 224;
    const axisWidth = narrow ? 54 : 66, padR = narrow ? 0 : 118, padT = 6, padB = 24;
    const dayWidth = 56, visibleWidth = Math.max(1, box.clientWidth - axisWidth);
    const plotEnd = n * dayWidth, W = Math.max(visibleWidth, plotEnd + padR);
    const band = (H - padT - padB) / (top + 1), off = Math.min(6, band * 0.16);
    const yc = (lv) => padT + (top - lv + 0.5) * band;
    const y = (lv, k) => yc(lv) + (k - 1) * off;  // 三项同档时上下错开几像素，三种颜色都看得见
    const x = (i) => (i + 0.5) * dayWidth;
    let axis = "", scale = "";
    for (let lv = 0; lv <= top; lv++) {
      axis += `<rect y="${(padT + (top - lv) * band).toFixed(1)}" width="${W - padR}" height="${band.toFixed(1)}" class="an-lv-band lv-${lv}"/>`;
      scale += `<text x="${axisWidth - 8}" y="${(yc(lv) + 4).toFixed(1)}" text-anchor="end" class="an-lv-lab lv-${lv}">${MKT_LV[lv]}</text>`;
    }
    // 两条分界即两条均线：5 日线（1/2 档之间）、10 日线（2/3 档之间）；发起人 11-04：5 日线改成加粗红色虚线
    [[2, "5 日线", "an-ma-line-strong"], [3, "10 日线", ""]].forEach(([lv, t, cls]) => {
      const yy = (padT + (top - lv + 1) * band).toFixed(1);
      axis += `<line x1="0" x2="${W - padR}" y1="${yy}" y2="${yy}" class="an-ma-line ${cls}"/>`;
      scale += `<text x="${axisWidth - 8}" y="${yy - 3}" text-anchor="end" class="an-ma-tag">${t}</text>`;
    });
    axis += rows.map((row, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(marketDateText(row.date, D.withYear))}</text>`).join("");
    // 阶梯线：当天档位保持到两日中点再换档
    const stepPath = (vals, k) => {
      let d = "", prevX = null;
      vals.forEach((v, i) => {
        if (v === null) { prevX = null; return; }
        const px = x(i), py = y(v, k).toFixed(1);
        d += prevX === null ? `M${px.toFixed(1)} ${py}` : `H${((prevX + px) / 2).toFixed(1)}V${py}H${px.toFixed(1)}`;
        prevX = px;
      });
      return d;
    };
    const lines = series.map((s, k) => `<path d="${stepPath(s.values, k)}" class="an-line an-mkt-line mkt-${k + 1}"/>`).join("");
    const dots = series.map((s, k) => s.values.map((v, i) => v === null ? "" : `<circle cx="${x(i)}" cy="${y(v, k).toFixed(1)}" r="2.4" class="an-mkt-end mkt-${k + 1}"/>`).join("")).join("");
    // 末端标注：当前档位 + 简称，纵向避让
    const lastOf = (s) => [...s.values].reverse().find((v) => v !== null);
    const ends = narrow ? [] : series.map((s, k) => ({ k, v: lastOf(s), y: y(lastOf(s) ?? 0, k), name: short(s.title) })).filter((e) => e.v !== undefined).sort((a, b) => a.y - b.y);
    ends.forEach((e, j) => { if (j && e.y - ends[j - 1].y < 13) e.y = ends[j - 1].y + 13; });
    const over = ends.length ? ends[ends.length - 1].y - (H - padB) : 0;
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    const labels = ends.map((e) => `<text x="${plotEnd + 6}" y="${(e.y + 4).toFixed(1)}" class="an-mkt-lab mkt-${e.k + 1}"><tspan class="v">${esc(e.name)}</tspan><tspan dx="5">${MKT_LV[e.v]}</tspan></text>`).join("");
    const hover = series.map((_, k) => `<circle r="4" class="an-mkt-hov mkt-${k + 1}" cx="-10" cy="-10"/>`).join("");
    const scope = tradeCtx?.startDate || "all", saved = marketTrendViews.get(scope);
    const wasFocused = box.contains(document.activeElement);
    box.innerHTML = `<svg viewBox="0 0 ${axisWidth} ${H}" width="${axisWidth}" height="${H}" aria-hidden="true"><g class="an-axis">${scale}</g></svg>
      <div class="an-mkt-scroll" tabindex="0" role="region" aria-label="均线位置时间轴，左右方向键逐日查看，Home 和 End 跳至首日和末日">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:${W}px" role="img" aria-label="市场三项每日均线位置走势">
      <g class="an-axis">${axis}</g>${lines}${dots}${labels}
      <line class="an-cursor" y1="${padT}" y2="${H - padB}" x1="-10" x2="-10"/>${hover}</svg></div>`;
    const scroll = box.querySelector(".an-mkt-scroll"), svg = scroll.querySelector("svg");
    const cursor = svg.querySelector(".an-cursor"), hovs = svg.querySelectorAll(".an-mkt-hov");
    const read = box.parentElement && box.parentElement.querySelector("[data-mkt-read]");
    const clamp = i => Math.max(0, Math.min(n - 1, i));
    let selected = n - 1;
    const remember = () => marketTrendViews.set(scope, {
      left: scroll.scrollLeft + scroll.clientWidth >= W - 1 ? null : scroll.scrollLeft, date: rows[selected].date,
    });
    const pick = (i, quiet) => {
      selected = i;
      cursor.setAttribute("x1", quiet ? -10 : x(i)); cursor.setAttribute("x2", quiet ? -10 : x(i));
      hovs.forEach((c, k) => { const v = series[k].values[i]; c.setAttribute("cx", quiet || v === null ? -10 : x(i)); c.setAttribute("cy", v === null ? -10 : y(v, k)); });
      remember();
      if (!read) return;
      read.querySelectorAll("b").forEach((b, k) => { const v = series[k].values[i]; b.textContent = v === null ? "—" : MKT_LV[v]; });
      read.querySelector("em").textContent = `${marketDateText(rows[i].date, D.withYear)} · 第 ${i + 1}/${n} 日`;
    };
    scroll.scrollLeft = saved?.left ?? W;
    const restored = saved?.left != null ? rows.findIndex(row => row.date === saved.date) : -1;
    pick(restored < 0 ? n - 1 : restored, true);
    if (wasFocused) scroll.focus({ preventScroll: true });
    scroll.addEventListener("scroll", () => {
      const first = clamp(Math.ceil(scroll.scrollLeft / dayWidth - 0.5));
      const last = clamp(Math.floor((scroll.scrollLeft + scroll.clientWidth) / dayWidth - 0.5));
      if (selected < first || selected > last) pick(Math.max(first, Math.min(selected, last)), true);
      else remember();
    });
    scroll.addEventListener("keydown", e => {
      const page = Math.max(1, Math.floor(scroll.clientWidth / dayWidth));
      const target = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: n - 1,
        PageUp: selected - page, PageDown: selected + page }[e.key];
      if (target === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const i = clamp(target), left = i * dayWidth;
      if (left < scroll.scrollLeft) scroll.scrollLeft = left;
      else if (left + dayWidth > scroll.scrollLeft + scroll.clientWidth) scroll.scrollLeft = left + dayWidth - scroll.clientWidth;
      if (i === n - 1) scroll.scrollLeft = W;
      if (read) read.setAttribute("aria-live", "polite");
      pick(i);
    });
    const pointerPick = e => {
      if (read) read.removeAttribute("aria-live");
      pick(clamp(Math.floor((e.clientX - svg.getBoundingClientRect().left) / dayWidth)));
    };
    // 触屏使用原生平移与轻点；鼠标拖动走同一个滚动容器，松开后仍可悬停读数。
    let drag = null;
    svg.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      scroll.focus({ preventScroll: true });
      drag = { x: e.clientX, left: scroll.scrollLeft };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      if (drag && Math.abs(e.clientX - drag.x) > 3) scroll.classList.add("dragging");
      if (drag && scroll.classList.contains("dragging")) scroll.scrollLeft = drag.left + drag.x - e.clientX;
      else pointerPick(e);
    });
    svg.addEventListener("pointerup", e => {
      if (!scroll.classList.contains("dragging")) pointerPick(e);
    });
    svg.addEventListener("lostpointercapture", () => {
      drag = null;
      scroll.classList.remove("dragging");
    });
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
    if (pref.period !== "day") body += chart(s.curve, { label: "体重与七日均值折线图", fmt: (v) => v.toFixed(1), average: true, bridge: true, tip: (p) => [`${md(p.date)} · ${num(p.value)} kg`, `7 日均值 ${num(p.average7)}`] }) +
      `<div class="legend"><span style="--c:var(--ceo)">实测体重</span><span style="--c:var(--muted)">7 日均值</span></div>`;
    body += `</article><article class="panel"><h3>逐次测量 <small>${V.weightRecords.length} 条 · 较上次</small></h3>
      ${V.weightRecords.length ? `<div class="an-table an-t4 an-weight"><div class="an-th"><span>日期</span><span>时间</span><span>体重 / kg</span><span>较上次</span></div>
      ${V.weightRecords.map((r) => `<div class="an-tr"><span>${md(r.date)}</span><span>${esc(r.time || "—")}</span><span>${num(r.kg)}</span><span class="${kgTone(r.change)}">${signed(r.change, 1)}</span></div>`).join("")}</div>`
      : `<p class="empty">计划开始后暂无有效测量</p>`}
      <p class="hint">缺测日期保持空缺；较上次可能跨多天，不等于单日变化。${healthHint}</p></article>`;
    return body;
  }

  // ── 饮食（D43 → D46 精简）：只发图片或文字，DeepSeek 自动识别并记录 ──
  // 11-12 发起人改：不再生成「下一餐建议」，改为每日营养素摄入情况（见下方 nutrientCard）。
  // 写入和 AI 都经天枢转发到 NAS 上的年度计划服务（NAS 是 state.json 唯一写入者）；DeepSeek 密钥只在 NAS，不经页面。
  // 发起人 10-26 决定（D46）：不复核、不选餐次——餐次按北京时间自动判断，热量取 AI 估算范围的中间值记为已记录，范围一并保留；记错就删掉重发。
  // 发起人 11-06 决定：去掉加餐，只保留早/午/晚；旧 snack 记录按晚餐显示。
  const MEALS = [["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"]];
  const mealName = (k) => (k === "snack" ? "晚餐" : (MEALS.find((m) => m[0] === k) || [k, k])[1]);
  const svc = (method, sub, body) => fetch("/api/annual/svc/" + sub, {
    method, headers: Object.assign({ "X-CEO-Hub": "1" }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || j.error || `请求失败（${r.status}）`);
    return j;
  });
  // 日期与餐次都由文字决定（site/meal-time.js）：「昨天晚餐」记到昨天晚餐，而不是今天早餐；
  // 文字里没写日期且这一餐今天还没到（凌晨写「晚餐」），自动算昨天；什么都没写才按当前北京时间推断。
  const mealWhen = (t) => (window.MealTime ? window.MealTime.parse(t) : {
    date: V ? V.asOf : "", type: "breakfast", error: "页面脚本 meal-time.js 没加载完整，请按 Ctrl+F5 强制刷新后再试。",
  });
  let lastSection = "";
  const MAX_Q_PHOTOS = 6;
  let Q = { text: "", photos: [], busy: false, msg: "" }, AI = null;
  let DAY = null;  // 逐日表点开的日期（11-04 发起人：点某天看当天饮食明细）
  let LB = null;   // 餐食照片灯箱（11-27 发起人：点击放大查看、左右切换、旋转保存）
  let PHOTO_BUSY = {};  // { [mealId]: true } 历史/当日记录补传照片中的状态

  const PHOTO_REL_RE = /^\d{4}-\d{2}\/[A-Za-z0-9_-]{8,80}\.(jpg|jpeg|png|webp)$/;
  function photoUrl(p) {
    if (!p || !PHOTO_REL_RE.test(p.path || "")) return "";
    const v = p.updatedAt ? `?v=${encodeURIComponent(p.updatedAt)}` : "";
    return `/api/annual/svc/meals/photos/${p.path}${v}`;
  }
  function photoRotStyle(p) {
    const deg = p && [90, 180, 270].includes(p.rotation) ? p.rotation : 0;
    return deg ? ` style="transform:rotate(${deg}deg)"` : "";
  }

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
    const n = Q.photos.length;
    const camLabel = n ? `添加图片 (${n}/${MAX_Q_PHOTOS})` : "发图片";
    const sendLabel = Q.busy ? "识别中…" : n ? `发送（${n} 张）` : "发送";
    const strip = n ? `<div class="an-qphotos" aria-label="待发送餐食图片">${Q.photos.map((p, i) => `
      <div class="an-qthumb">
        <button type="button" class="an-qthumb-img" data-act="q-zoom" data-idx="${i}" title="放大查看第 ${i + 1} 张">
          <img src="${p.url}" alt="待发送餐食图片 ${i + 1}">
        </button>
        <div class="an-qthumb-ops">
          <button type="button" data-act="q-rot" data-idx="${i}" title="顺时针旋转 90°" aria-label="旋转第 ${i + 1} 张" ${Q.busy ? "disabled" : ""}>↻</button>
          <button type="button" data-act="q-rm" data-idx="${i}" title="移除这张图片" aria-label="移除第 ${i + 1} 张" ${Q.busy ? "disabled" : ""}>×</button>
        </div>
      </div>`).join("")}</div>` : "";
    return `<article class="panel an-card" id="an-form-card"><h3>记一餐 <small>${aiText()}</small></h3>
      <div class="an-quick">
        <label class="an-btn an-cam${Q.busy || n >= MAX_Q_PHOTOS ? " off" : ""}">${camLabel}<input type="file" accept="image/*" multiple data-photo hidden ${Q.busy || n >= MAX_Q_PHOTOS ? "disabled" : ""}></label>
        <textarea data-q rows="1" placeholder="选 1–6 张照片（可预览旋转），或写一句吃了什么；没吃就写「早餐没吃」">${esc(Q.text)}</textarea>
        <button type="button" class="an-btn" data-act="quick" ${Q.busy ? "disabled" : ""}>${sendLabel}</button>
      </div>
      ${strip}
      <p class="an-msg${/^已记录|^已保存|^已补传/.test(Q.msg) ? " ok" : ""}">${esc(Q.msg)}</p></article>`;
  }

  // ── 每日营养素（11-12 发起人定）：红框原来的「下一餐建议」不再做，换成这个人群每天需要的营养素吃了多少。
  // 目标口径在 site/nutrients.js：男 · 31 岁 · 173 cm · 北方人、在上海生活 · 计划减脂，蛋白按当天体重 1.6 g/kg。
  function nutrientBasis() {
    const N = window.CEO_NUTRIENTS;
    if (!N || !V || !V.local) return null;
    const day = V.weight && V.weight.day;
    const kg = fin(day && day.currentKg) ? day.currentKg
      : fin(V.config.initialWeightKg) ? V.config.initialWeightKg : 70;
    const kcal = fin(V.local.today.targetKcal) ? V.local.today.targetKcal : V.config.dailyKcalTarget;
    return { N, T: N.targets({ weightKg: kg, energyKcal: kcal }), weightKg: kg };
  }

  function nutrientCard() {
    const B = nutrientBasis();
    if (!B) return "";
    const { N, T } = B, S = N.sum(V.local.meals || []), V2 = S.values;
    // 目标值有小数（锌 12.5、B1 1.4）就保留一位，整数不拖 .0；钠这类上限加「≤」。
    const figure = (v) => Number.isInteger(v) ? num(v, 0) : num(v, 1);
    const main = N.MAIN.map((f) => {
      const value = V2[f.key], target = T[f.key], r = N.ratio(value, target);
      const over = f.kind !== "limit" && fin(value) && value > target;
      const shown = fin(value) ? `${figure(value)}<em> / ${figure(target)} ${esc(f.unit)}</em>` : `<em>未估算 · 目标 ${figure(target)} ${esc(f.unit)}</em>`;
      return `<div class="an-nu-row"><div class="an-nu-lab"><b>${esc(f.label)}</b><small>${esc(f.ref)}</small></div>
        <div class="an-nu-track"><i class="${over ? "over" : ""}" style="width:${r === null ? 0 : Math.min(100, Math.round(r * 100))}%"></i></div>
        <div class="an-nu-num ${over ? "an-nu-over-num" : ""} ${fin(value) ? "" : "an-nu-todo"}">${shown}</div></div>`;
    }).join("");
    const cell = (f) => {
      const value = V2[f.key], target = T[f.key];
      // 只对识别服务会逐餐粗估的项报「已摄入」；其余如实标每日目标，不拿估算冒充实吃。
      const known = f.est && fin(value);
      // 钠是上限项，超了才标红；其余项吃到目标的 90% 才标绿，避免「有数据」被当成「吃够了」。
      const over = f.limit && known && value > target;
      const enough = known && !f.limit && value >= target * 0.9;
      const state = known ? (over ? "an-nu-over" : enough ? "an-nu-known" : "an-nu-known-dim") : (f.est ? "an-nu-todo" : "an-nu-ref");
      const numText = known
        ? `${figure(value)}<em> / ${figure(target)}</em>`
        : `${f.limit ? "≤ " : ""}${figure(target)}<em> ${esc(f.unit)}</em>`;
      return `<div class="an-nu-cell ${state}" title="${esc(f.label)} ${esc(f.ref)}">
        <span>${esc(f.label)}${known ? "" : `<small>${f.est ? "未估算" : "每日目标"}</small>`}</span>
        <b>${numText}</b><small>${esc(f.ref)}</small></div>`;
    };
    const minerals = N.MINOR.filter((f) => f.group === "mineral").map(cell).join("");
    const vitamins = N.MINOR.filter((f) => f.group === "vitamin").map(cell).join("");
    const energy = fin(V2.energy) ? `${figure(V2.energy)} / ${figure(T.energy)} 大卡` : `目标 ${figure(T.energy)} 大卡`;
    // 加营养素之前记的餐只有热量与蛋白质：说清楚是「没估算」，别让人读成「没吃」。
    const legacy = (V.local.meals || []).filter((m) => !fin(m.fatG) && !fin(m.carbG)).length;
    return `<article class="panel an-nutri"><h3>每日营养素 <small>减脂期 · 男 31 岁 · 173 cm · 北方人，在上海生活</small></h3>
      <div class="an-nu-hd"><span>今天已记录 ${S.meals} 餐 · 能量 ${energy}</span>
        <small>目标按 DRIs 2023 成年男性（18–49 岁）加减脂期调整；蛋白按当天 ${num(B.weightKg, 1)} kg 计 1.6 g/kg。${legacy ? `其中 ${legacy} 餐是加营养素之前记的，脂肪、碳水和矿物质没有估算值——不是没吃。` : ""}</small></div>
      <div class="an-nu-main">${main}</div>
      <div class="an-nu-sub"><h4>矿物质与膳食纤维</h4><div class="an-nu-grid">${minerals}</div></div>
      <div class="an-nu-sub"><h4>维生素</h4><div class="an-nu-grid">${vitamins}</div></div>
      <p class="hint">能量与三大宏量按已记录餐食累加（未确认的取估算下限）；膳食纤维、钠、钾、钙、铁、维生素 C 来自识别服务的粗估，只看趋势、不当精确值；标「每日目标」的项不逐餐推算，按当天膳食结构自行对照。北方人到上海生活，口味偏咸、主食偏多，而上海海产和深色蔬菜好买：奶或酸奶 300 g、豆制品每天一份、深色蔬菜 300–500 g、水果 200–350 g、全谷杂豆 50–150 g；盐 &lt;5 g（酱油、酱料和外卖汤汁都算盐）、油 25–30 g，每周两三次海鱼贝类或海带紫菜补碘和硒，日晒少留意维生素 D。</p></article>`;
  }

  function mealThumbs(m, context) {
    const photos = Array.isArray(m.photos) ? m.photos : [];
    const uploading = !!PHOTO_BUSY[m.id];
    const items = photos.map((p, i) => {
      const src = photoUrl(p);
      if (!src) return "";
      return `<button type="button" class="an-mthumb" data-act="zoom" data-meal-id="${esc(m.id)}" data-photo-id="${esc(p.id)}" data-date="${esc(m.date)}" title="点击放大查看或旋转">
        <img src="${src}" loading="lazy" decoding="async" alt="${esc(mealName(m.type))}照片 ${i + 1}"${photoRotStyle(p)}>
      </button>`;
    }).join("");
    const addLabel = uploading ? "上传中…" : photos.length ? "+ 图" : (context === "history" ? "+ 补传照片" : "+ 照片");
    const canAdd = !uploading && photos.length < 12;
    const addBtn = canAdd
      ? `<label class="an-upbtn" title="为这条餐食补充或复原照片（不改原有热量记录）">${addLabel}<input type="file" accept="image/*" multiple data-meal-photo="${esc(m.id)}" hidden></label>`
      : (uploading ? `<span class="an-upbtn off">${addLabel}</span>` : "");
    if (!items && !addBtn) return "";
    return `<div class="an-mthumbs">${items}${addBtn}</div>`;
  }

  function mealsCard() {
    const M = V.local.meals.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return `<article class="panel"><h3>今天餐食 <small>${M.length} 条</small></h3>${M.length ? `<div class="an-table an-meal5"><div class="an-th"><span>餐次</span><span>食物</span><span>热量</span><span>估算范围</span><span></span></div>
      ${M.map((m) => `<div class="an-tr"><span>${mealName(m.type)}</span><span class="an-desc"><div>${esc(m.description) || "—"}</div>${mealThumbs(m, "today")}</span>
        <span>${fin(m.kcal) ? num(m.kcal, 0) : "—"}</span><span>${range(m.kcalLow, m.kcalHigh)}</span>
        <span class="an-ops"><button type="button" data-act="del" data-id="${esc(m.id)}">删除</button></span></div>`).join("")}</div>`
      : `<p class="empty">今天还没有记录；没有记录不代表摄入为零。</p>`}</article>`;
  }

  function daysCard() {
    const rows = V.local.rows, tot = V.nutrition.totals;
    // 只标早/午/晚；旧 snack 记录并入晚餐，不再显示「加」。
    const marks = (types) => {
      const set = new Set(types.map((k) => (k === "snack" ? "dinner" : k)));
      return ["breakfast", "lunch", "dinner"].map((k) => `<b class="${set.has(k) ? "on" : ""}">${mealName(k)[0]}</b>`).join("");
    };
    // 平均摄入按“已记录的天”平均；未记录日不补 0（项目口径），未知热量只按已知值平均。
    const avg = (key) => {
      const vals = rows.map((r) => r[key]).filter(fin);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const avgLow = avg("consumedLow"), avgHigh = avg("consumedHigh");
    // 上限的已知样本可能比下限少；算出来反而更小时只报下限，不拼出倒挂区间。
    const avgText = rows.length ? range(avgLow, fin(avgLow) && fin(avgHigh) && avgHigh < avgLow ? null : avgHigh) : "—";
    return `<article class="panel"><h3>日计划完成情况 <small>已记录 ${tot.recordedDays} 天</small></h3>
      <div class="an-counts an-counts4"><div><small>超额</small><b class="an-red">${tot.overDays}</b></div><div><small>正常</small><b class="an-green">${tot.normalDays}</b></div>
        <div title="按已记录的天数平均，未记录日不补 0；未知热量只按已知值平均"><small>平均摄入 / 天</small><b>${avgText}</b></div>
        <div><small>待确认 / 未截止</small><b>${tot.pendingDays}</b></div></div>
      <div class="an-table an-days"><div class="an-th"><span>日期</span><span>三餐</span><span>总摄入</span><span>超额</span><span>状态</span></div>
      ${rows.slice().reverse().map((r) => {
        const open = DAY === r.date;
        const pCount = r.photoCount || (Array.isArray(r.photos) ? r.photos.length : 0);
        return `<div class="an-tr an-dayrow${open ? " open" : ""}" data-act="day" data-date="${esc(r.date)}" role="button" tabindex="0" aria-expanded="${open}" title="${open ? "收起" : "展开"} ${md(r.date)} 的饮食明细"><span class="an-daydate"><b class="an-caret">${open ? "▾" : "▸"}</b>${md(r.date)}${pCount ? `<em class="an-pbadge" title="已保存 ${pCount} 张照片">${pCount}图</em>` : ""}</span><span class="an-marks">${marks(r.types)}</span><span>${range(r.consumedLow, r.consumedHigh)}</span>
          <span class="${r.status === "over" ? "an-red" : ""}">${range(r.excessLow, r.excessHigh)}</span><span class="${r.status === "over" ? "an-red" : r.status === "normal" ? "an-green" : ""}">${esc(r.statusText)}</span></div>${open ? dayPanel(r) : ""}`;
      }).join("")}
      ${rows.length ? "" : `<p class="empty">记录餐食后自动汇总，不补零。</p>`}
      <div class="an-tr an-total"><span>总计</span><span></span><span>${range(tot.consumedLow, tot.consumedHigh)}</span><span>${range(tot.excessLow, tot.excessHigh)}</span><span>${tot.recordedDays} 天</span></div></div>
      <p class="hint">点日期行展开/收起当天饮食明细，在明细内查看已上传照片（含放大查看、旋转保存）或点击「+ 补传照片」复原历史餐图。过了当天自动结算：不超参考目标（${num(V.nutrition.targetKcal, 0)} 大卡）记为正常，三餐没记全的标“未记全”；超额逐日计算、不互相抵消。</p></article>`;
  }

  // 逐日表内展开的当天明细（11-05 发起人：不要弹层，像交易明细那样行内展开）
  function dayPanel(row) {
    const list = (V.local.mealDays && V.local.mealDays[row.date]) || [];
    return `<div class="an-daypanel">
      <div class="an-daypanel-hd"><b>${md(row.date)} 饮食明细</b><span>总摄入 ${range(row.consumedLow, row.consumedHigh)} 大卡 · 预计超额 ${range(row.excessLow, row.excessHigh)} · 参考目标 ${num(V.nutrition.targetKcal, 0)} 大卡</span>
        <button type="button" class="an-btn ghost an-daypanel-close" data-act="day-close">收起</button></div>
      ${list.length ? `<div class="an-table an-meal"><div class="an-th"><span>餐次</span><span>食物</span><span>热量</span><span>范围</span></div>
        ${list.map((m) => `<div class="an-tr"><span>${mealName(m.type)}</span><span class="an-desc"><div>${esc(m.description) || "—"}</div>${mealThumbs(m, "history")}</span>
          <span>${fin(m.kcal) ? num(m.kcal, 0) : "待确认"}</span><span>${range(m.kcalLow, m.kcalHigh)}</span></div>`).join("")}</div>`
        : `<p class="empty">这天没有记录。</p>`}
      <p class="hint">只列当天已记录的餐食，没有记录的一餐不当作 0；补传照片仅挂入记录，不改动原有热量与营养素。</p>
    </div>`;
  }

  function renderLightbox() {
    if (!LB || !LB.items || !LB.items.length) return "";
    const cur = LB.items[LB.index] || LB.items[0];
    const multi = LB.items.length > 1;
    const totalDeg = (((cur.rotation || 0) + (LB.delta || 0)) % 360 + 360) % 360;
    const dirty = ((LB.delta || 0) % 360 + 360) % 360 !== 0;
    const swapped = totalDeg === 90 || totalDeg === 270;
    return `<div class="an-lb-backdrop" data-lb="backdrop" role="dialog" aria-modal="true" aria-label="餐食照片放大查看">
      <div class="an-lb-dialog">
        <div class="an-lb-hd">
          <div class="an-lb-title"><b>${esc(cur.caption || "餐食照片")}</b>${multi ? `<span class="an-lb-idx">${LB.index + 1} / ${LB.items.length}</span>` : ""}${cur.subcaption ? `<small>${esc(cur.subcaption)}</small>` : ""}</div>
          <button type="button" class="an-lb-close" data-lb="close" aria-label="关闭大图">×</button>
        </div>
        <div class="an-lb-stage">
          ${multi ? `<button type="button" class="an-lb-nav prev" data-lb="prev" aria-label="上一张" ${LB.busy ? "disabled" : ""}>‹</button>` : ""}
          <div class="an-lb-frame${swapped ? " is-swapped" : ""}">
            <img class="an-lb-img" src="${cur.url}" alt="${esc(cur.caption || "餐食照片")}" style="transform:rotate(${totalDeg}deg)">
          </div>
          ${multi ? `<button type="button" class="an-lb-nav next" data-lb="next" aria-label="下一张" ${LB.busy ? "disabled" : ""}>›</button>` : ""}
        </div>
        <div class="an-lb-ft">
          <div class="an-lb-tools">
            <button type="button" class="an-btn ghost" data-lb="rot-l" ${LB.busy ? "disabled" : ""}>↺ 左转 90°</button>
            <button type="button" class="an-btn ghost" data-lb="rot-r" ${LB.busy ? "disabled" : ""}>↻ 右转 90°</button>
            ${LB.mode === "saved" ? `<button type="button" class="an-btn" data-lb="save" ${LB.busy || !dirty ? "disabled" : ""}>${LB.busy ? "保存中…" : "保存旋转"}</button>` : ""}
            <button type="button" class="an-btn ghost an-lb-del" data-lb="del" ${LB.busy ? "disabled" : ""}>${LB.mode === "saved" ? "删除此图" : "移除此图"}</button>
          </div>
          ${LB.msg ? `<p class="an-lb-msg${/^已保存/.test(LB.msg) ? " ok" : ""}">${esc(LB.msg)}</p>` : ""}
        </div>
      </div>
    </div>`;
  }

  function aiText() {
    if (!AI) return "DeepSeek：连接中…";
    if (AI.error) return "DeepSeek：连不上 NAS 年度计划服务";
    const a = AI.ai || {};
    return a.configured ? `DeepSeek 自动识别 · 餐次按时间自动判断${a.visionConfigured ? "" : "（当前模型不支持图片，只能发文字）"}` : "DeepSeek 未配置密钥";
  }

  function foodLocalView() {
    if (!AI) svc("GET", "status").then((r) => { AI = r; }, () => { AI = { error: true }; }).then(() => { if (pref.section === "food") render(); });
    return quickCard() + nutrientCard() + planCard() + mealsCard() + daysCard() + renderLightbox();
  }

  // 明确说「早餐没吃」这类整餐没吃的：直接记 0 千卡的「未吃」，不调识别服务猜热量（11-07 发起人报障）。
  // 记录口径与手工补的「未吃」一致：description=未吃、kcal/low/high 全 0、status=confirmed，计入当天已记录但不加摄入。
  const NOT_EATEN = "未吃";
  async function recordSkipped(when) {
    const today = window.MealTime ? window.MealTime.today() : V.asOf, toDay = when.date === today;
    const label = `${toDay ? "今天" : md(when.date)}${mealName(when.type)}`;
    const same = ((V.local && V.local.mealDays) || {})[when.date] || [];
    if (same.some((m) => m.type === when.type && m.description === NOT_EATEN)) {
      Q.busy = false; Q.msg = `${label}已经记过未吃，不重复记录。`; return render();
    }
    Q.msg = `正在记录${label}未吃…`; render();
    await svc("POST", "meals", { date: when.date, type: when.type, description: NOT_EATEN, status: "confirmed", kcal: 0, kcalLow: 0, kcalHigh: 0 });
    Q = { text: "", photos: [], busy: false, msg: `已记录：${label}未吃（0 千卡）` };
    await loadLocal();
  }

  async function quick() {
    const text = Q.text.trim();
    const photos = Q.photos.slice();
    if (Q.busy) return;
    if (!photos.length && !text) { Q.msg = "发 1–6 张图片，或写一句吃了什么。"; return render(); }
    Q.busy = true; Q.msg = photos.length ? `DeepSeek 正在识别 ${photos.length} 张图片…` : "DeepSeek 正在估算…"; render();
    try {
      const when = mealWhen(text);
      if (when.error) { Q.busy = false; Q.msg = when.error; return render(); }
      if (when.skip && !photos.length) return await recordSkipped(when);
      const est = photos.length
        ? await svc("POST", "meals/analyze", {
            images: photos.map((p) => ({ imageBase64: p.b64, mimeType: p.mimeType || "image/jpeg" })),
            description: text,
          })
        : await svc("POST", "meals/estimate-text", { description: text });
      if (!(est.kcalHigh > 0)) throw new Error("没认出食物或热量：没吃就写「早餐没吃」，吃了就补一句份量再发。");
      const type = when.type, kcal = Math.round((est.kcalLow + est.kcalHigh) / 2);
      const desc = (text ? text + (est.description && est.description !== text ? `（AI：${est.description}）` : "") : est.description || "").slice(0, 1000);
      // 识别服务给出的营养素随餐一起存；没给的不补 0，卡片上如实显示「未估算」（11-12 每日营养素卡片用）
      const nut = {};
      (window.CEO_NUTRIENTS ? window.CEO_NUTRIENTS.ESTIMATED : ["proteinG"]).forEach((k) => {
        if (fin(est[k])) nut[k] = est[k];
      });
      const payload = Object.assign({
        date: when.date, type, description: desc, status: "confirmed", kcal,
        kcalLow: est.kcalLow, kcalHigh: est.kcalHigh,
      }, nut);
      if (photos.length) {
        payload.newPhotos = photos.map((p) => ({ imageBase64: p.b64, mimeType: p.mimeType || "image/jpeg" }));
      }
      await svc("POST", "meals", payload);
      const today = window.MealTime ? window.MealTime.today() : V.asOf, toDay = when.date === today;
      const pHint = photos.length ? `，已保存 ${photos.length} 张照片` : "";
      Q = { text: "", photos: [], busy: false, msg: `已记录：${toDay ? "今天" : md(when.date)} ${mealName(type)} 约 ${kcal} 千卡（估算 ${num(est.kcalLow, 0)}–${num(est.kcalHigh, 0)}${pHint}）` };
      await loadLocal();
    } catch (e) { Q.busy = false; Q.msg = e.message; render(); }
  }

  // 读取并按 EXIF 自动转正后压缩到长边 ≤1600 像素的 JPEG，确保图片方向为正且适配多图上传。
  async function normalizeImageFile(file) {
    if (typeof createImageBitmap === "function") {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        try {
          const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(bmp.width * s));
          c.height = Math.max(1, Math.round(bmp.height * s));
          c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
          const url = c.toDataURL("image/jpeg", 0.84);
          return { url, b64: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg" };
        } finally { bmp.close(); }
      } catch { /* 回退到 Image 解码 */ }
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const s = Math.min(1, 1600 / Math.max(w, h));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(w * s));
          c.height = Math.max(1, Math.round(h * s));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL("image/jpeg", 0.84);
          resolve({ url, b64: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg" });
        };
        img.onerror = () => reject(new Error("这张图片读不出来，请换一张 JPG / PNG / WebP。"));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error("图片读取失败，请重试。"));
      reader.readAsDataURL(file);
    });
  }

  // 把任意图片 URL/DataURL 旋转指定角度并导出新的正向 JPEG，旋转结果永久落盘不依赖 CSS。
  function bakeRotatedImage(src, deg) {
    const norm = ((deg % 360) + 360) % 360;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
        const s = Math.min(1, 1600 / Math.max(sw, sh));
        const dw = Math.max(1, Math.round(sw * s)), dh = Math.max(1, Math.round(sh * s));
        const swapped = norm === 90 || norm === 270;
        const c = document.createElement("canvas");
        c.width = swapped ? dh : dw;
        c.height = swapped ? dw : dh;
        const ctx = c.getContext("2d");
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((norm * Math.PI) / 180);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        const url = c.toDataURL("image/jpeg", 0.88);
        resolve({ url, b64: url.slice(url.indexOf(",") + 1), mimeType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("无法加载原图进行旋转保存，请刷新页面后重试。"));
      img.src = src;
    });
  }

  async function addQueuedPhotos(fileList) {
    const files = Array.from(fileList || []).filter((f) => f && (!f.type || f.type.startsWith("image/")));
    if (!files.length) return;
    const remain = MAX_Q_PHOTOS - Q.photos.length;
    if (remain <= 0) { Q.msg = `每次最多发送 ${MAX_Q_PHOTOS} 张图片。`; return render(); }
    const picked = files.slice(0, remain);
    const trimmed = files.length > remain;
    Q.msg = `正在读取 ${picked.length} 张图片…`; render();
    const errors = [];
    for (const file of picked) {
      try {
        const img = await normalizeImageFile(file);
        Q.photos.push({ id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name || "餐食照片", ...img });
      } catch (err) { errors.push(err.message); }
    }
    Q.msg = errors.length
      ? errors[0]
      : `已选 ${Q.photos.length} 张图片${trimmed ? `（单次上限 ${MAX_Q_PHOTOS} 张）` : ""}，可点图预览旋转或补充说明后点「发送」。`;
    render();
  }

  async function attachPhotosToMeal(mealId, fileList) {
    const files = Array.from(fileList || []).filter((f) => f && (!f.type || f.type.startsWith("image/")));
    if (!files.length || PHOTO_BUSY[mealId]) return;
    const picked = files.slice(0, MAX_Q_PHOTOS);
    PHOTO_BUSY[mealId] = true; render();
    try {
      const batch = [];
      for (const file of picked) {
        const img = await normalizeImageFile(file);
        batch.push({ imageBase64: img.b64, mimeType: img.mimeType });
      }
      await svc("POST", `meals/${encodeURIComponent(mealId)}/photos`, { photos: batch });
      Q.msg = `已补传 ${batch.length} 张照片到餐食记录。`;
      await loadLocal();
    } catch (err) {
      Q.msg = err.message || "补传照片失败，请重试。";
    } finally {
      delete PHOTO_BUSY[mealId];
      render();
    }
  }

  function collectSavedDayPhotos(dateStr, mealId) {
    const out = [];
    const list = (V && V.local && V.local.mealDays && V.local.mealDays[dateStr])
      || (V && V.local && V.local.meals && V.local.meals.filter((m) => m.date === dateStr))
      || [];
    for (const m of list) {
      for (const p of (m.photos || [])) {
        const url = photoUrl(p);
        if (!url) continue;
        out.push({
          id: p.id, mealId: m.id, path: p.path, url, rotation: p.rotation || 0,
          caption: `${md(m.date)} ${mealName(m.type)}`,
          subcaption: (m.description || "").slice(0, 60),
        });
      }
    }
    if (!out.length && mealId && V && V.local) {
      const m = (V.local.meals || []).find((x) => x.id === mealId);
      if (m) {
        for (const p of (m.photos || [])) {
          const url = photoUrl(p);
          if (url) out.push({ id: p.id, mealId: m.id, path: p.path, url, rotation: p.rotation || 0, caption: `${md(m.date)} ${mealName(m.type)}`, subcaption: (m.description || "").slice(0, 60) });
        }
      }
    }
    return out;
  }

  function openSavedLightbox(dateStr, mealId, photoId) {
    const items = collectSavedDayPhotos(dateStr, mealId);
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex((x) => x.id === photoId && (!mealId || x.mealId === mealId)));
    LB = { mode: "saved", date: dateStr, items, index: idx, delta: 0, busy: false, msg: "" };
    render();
  }

  function openQueuedLightbox(index) {
    if (!Q.photos.length) return;
    const items = Q.photos.map((p, i) => ({
      id: p.id, url: p.url, rotation: 0, caption: `待发送图片 ${i + 1}`, subcaption: p.name || "",
    }));
    LB = { mode: "queued", items, index: Math.max(0, Math.min(index, items.length - 1)), delta: 0, busy: false, msg: "" };
    render();
  }

  async function handleLightboxAction(act) {
    if (!LB || LB.busy) return;
    if (act === "close" || act === "backdrop") { LB = null; return render(); }
    if (act === "prev") { LB.index = (LB.index - 1 + LB.items.length) % LB.items.length; LB.delta = 0; LB.msg = ""; return render(); }
    if (act === "next") { LB.index = (LB.index + 1) % LB.items.length; LB.delta = 0; LB.msg = ""; return render(); }
    if (act === "rot-l" || act === "rot-r") {
      const step = act === "rot-l" ? -90 : 90;
      if (LB.mode === "queued") {
        const i = LB.index;
        if (!Q.photos[i]) return;
        LB.busy = true; render();
        try {
          const rotated = await bakeRotatedImage(Q.photos[i].url, step);
          Q.photos[i] = { ...Q.photos[i], ...rotated };
          LB.items[i] = { ...LB.items[i], url: rotated.url };
          LB.msg = "已调整方向";
        } catch (err) { LB.msg = err.message; }
        LB.busy = false; return render();
      }
      LB.delta = (((LB.delta || 0) + step) % 360 + 360) % 360;
      LB.msg = LB.delta ? "已预览旋转，点「保存旋转」永久写入记录" : "";
      return render();
    }
    if (act === "save" && LB.mode === "saved") {
      const cur = LB.items[LB.index];
      const totalDeg = (((cur.rotation || 0) + (LB.delta || 0)) % 360 + 360) % 360;
      if (!cur || !((LB.delta || 0) % 360)) return;
      LB.busy = true; LB.msg = "正在保存正向图片…"; render();
      try {
        const baked = await bakeRotatedImage(cur.url, totalDeg);
        await svc("POST", `meals/${encodeURIComponent(cur.mealId)}/photos/${encodeURIComponent(cur.id)}/rotate`, {
          imageBase64: baked.b64, mimeType: baked.mimeType,
        });
        await loadLocal();
        const refreshed = collectSavedDayPhotos(LB.date, cur.mealId);
        if (refreshed.length) {
          const nextIdx = Math.max(0, refreshed.findIndex((x) => x.id === cur.id && x.mealId === cur.mealId));
          LB = { mode: "saved", date: LB.date, items: refreshed, index: nextIdx, delta: 0, busy: false, msg: "已保存正向图片到记录" };
        } else {
          LB = null;
        }
        render();
      } catch (err) {
        LB.busy = false; LB.msg = err.message || "保存旋转失败，请重试"; render();
      }
      return;
    }
    if (act === "del") {
      const cur = LB.items[LB.index];
      if (!cur) return;
      if (LB.mode === "queued") {
        Q.photos.splice(LB.index, 1);
        if (!Q.photos.length) { LB = null; }
        else { openQueuedLightbox(Math.min(LB.index, Q.photos.length - 1)); return; }
        return render();
      }
      if (!confirm("从这条餐食记录中删除这张照片？\n（仅删照片，不影响原有热量与营养记录）")) return;
      LB.busy = true; LB.msg = "正在删除…"; render();
      try {
        await svc("DELETE", `meals/${encodeURIComponent(cur.mealId)}/photos/${encodeURIComponent(cur.id)}`);
        await loadLocal();
        const refreshed = collectSavedDayPhotos(LB.date, cur.mealId);
        LB = refreshed.length
          ? { mode: "saved", date: LB.date, items: refreshed, index: Math.min(LB.index, refreshed.length - 1), delta: 0, busy: false, msg: "" }
          : null;
        render();
      } catch (err) {
        LB.busy = false; LB.msg = err.message || "删除照片失败"; render();
      }
    }
  }

  root.addEventListener("input", (e) => { if (e.target.dataset && e.target.dataset.q !== undefined) Q.text = e.target.value; });
  root.addEventListener("keydown", (e) => { if (e.target.dataset && e.target.dataset.q !== undefined && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); quick(); } });
  root.addEventListener("change", (e) => {
    const ds = e.target && e.target.dataset;
    if (!ds) return;
    if (ds.photo !== undefined && e.target.files && e.target.files.length) {
      addQueuedPhotos(e.target.files);
      e.target.value = "";
      return;
    }
    if (ds.mealPhoto && e.target.files && e.target.files.length) {
      attachPhotosToMeal(ds.mealPhoto, e.target.files);
      e.target.value = "";
    }
  });
  root.addEventListener("click", async (e) => {
    if (e.target.classList && e.target.classList.contains("an-lb-backdrop")) {
      return handleLightboxAction("backdrop");
    }
    const lbBtn = e.target.closest("[data-lb]");
    if (lbBtn && lbBtn.dataset.lb !== "backdrop") {
      e.stopPropagation();
      return handleLightboxAction(lbBtn.dataset.lb);
    }
    if (e.target.closest(".an-upbtn")) {
      e.stopPropagation();
      return;
    }
    const b = e.target.closest("button");
    if (!b || !V || !localMode) return;
    if (b.dataset.act === "quick") return quick();
    if (b.dataset.act === "q-zoom") { e.stopPropagation(); return openQueuedLightbox(Number(b.dataset.idx) || 0); }
    if (b.dataset.act === "q-rot") {
      e.stopPropagation();
      const idx = Number(b.dataset.idx);
      if (Q.busy || !Q.photos[idx]) return;
      try {
        const rotated = await bakeRotatedImage(Q.photos[idx].url, 90);
        Q.photos[idx] = { ...Q.photos[idx], ...rotated };
        render();
      } catch (err) { Q.msg = err.message; render(); }
      return;
    }
    if (b.dataset.act === "q-rm") {
      e.stopPropagation();
      const idx = Number(b.dataset.idx);
      if (Q.busy || !Q.photos[idx]) return;
      Q.photos.splice(idx, 1);
      if (!Q.photos.length && /^已选/.test(Q.msg)) Q.msg = "";
      return render();
    }
    if (b.dataset.act === "zoom") {
      e.stopPropagation();
      return openSavedLightbox(b.dataset.date || "", b.dataset.mealId || "", b.dataset.photoId || "");
    }
    if (b.dataset.act === "del") {
      const m = V.local.meals.find((x) => x.id === b.dataset.id);
      if (!m || !confirm(`删除这条${mealName(m.type)}记录？\n${m.description || ""}`)) return;
      try { await svc("DELETE", "meals/" + encodeURIComponent(m.id)); await loadLocal(); }
      catch (err) { alert(err.message); }
    }
  });
  // 逐日表点开当天明细（11-04 发起人）：整行可点，也支持 Enter/空格与 Esc。
  root.addEventListener("click", (e) => {
    if (!V) return;
    if (e.target.closest("[data-act='day-close']")) { DAY = null; return render(); }
    if (e.target.closest(".an-mthumb, .an-upbtn, .an-lb-backdrop")) return;
    const row = e.target.closest(".an-dayrow");
    if (row && row.dataset.date) { DAY = DAY === row.dataset.date ? null : row.dataset.date; render(); }
  });
  root.addEventListener("keydown", (e) => {
    const row = e.target.closest && e.target.closest(".an-dayrow");
    if (row && e.target === row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); DAY = DAY === row.dataset.date ? null : row.dataset.date; render(); }
  });
  document.addEventListener("keydown", (e) => {
    if (LB) {
      if (e.key === "Escape") { e.preventDefault(); return handleLightboxAction("close"); }
      if (e.key === "ArrowLeft" && LB.items.length > 1) { e.preventDefault(); return handleLightboxAction("prev"); }
      if (e.key === "ArrowRight" && LB.items.length > 1) { e.preventDefault(); return handleLightboxAction("next"); }
      return;
    }
    if (e.key === "Escape" && DAY) { DAY = null; render(); }
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
    // reg 必须随 charts 一起换新：否则 chart() 登记到旧数组，体重折线容器永远画不出来（11-04 发起人图1 空白）
    charts = []; reg = charts;
    root.innerHTML = `${annualHead(
      `第 ${day} / 365 天 · 截至 ${esc(V.asOf)} · 原表修改 ${esc(sourceTime)} · 导入 ${esc(synced)}（北京时间）`,
      localMode ? `<button class="ts-head-btn" id="an-reload" type="button">刷新</button>` : `<button class="ts-head-btn" id="an-lockbtn" type="button">锁定</button>`
    )}
      <div class="an-seg" role="tablist">${sections.map(([k, l]) => `<button type="button" data-sec="${k}" aria-selected="${pref.section === k}">${l}</button>`).join("")}</div>
      ${pref.section === "food" ? "" : `<div class="an-periods">${PERIODS.map(([k, l]) => `<button type="button" data-per="${k}" aria-selected="${pref.period === k}">${l}</button>`).join("")}</div>`}
      <div class="an-body${pref.section === lastSection ? " an-still" : ""}">${pref.section === "weight" ? weightView() : foodView()}</div>`;
    lastSection = pref.section;  // 同一子页内的重绘（记餐、识别）不重放入场动画
    drawCharts();
  }

  // 扶摇「新模式」与「交易统计」里的交易内容：周期切换 + 累计折线、逐日、周、市场三项
  function renderTrading() {
    const host = tradeHost;
    if (!host || !host.isConnected) return;
    const active = activeTradingData();
    if (!active) { host.innerHTML = `<article class="panel"><p class="empty">${esc(localError || (LOCAL ? "正在读取交易实绩…" : "交易实绩只在天枢电脑版显示。"))}</p></article>`; return; }
    const bindings = [];
    tradeCharts = []; reg = tradeCharts;
    try {
      host.innerHTML = `<div class="an-periods">${PERIODS.map(([k, l]) => `<button type="button" data-tper="${k}" aria-selected="${pref.tradePeriod === k}">${l}</button>`).join("")}</div>
        <div class="an-body an-still">${tradingView(active, bindings)}</div>`;
    } finally { reg = charts; }
    bindings.forEach(bind => bind(host));
    drawCharts(host, tradeCharts);
    countUp(host);
  }
  // 「连续 N 天」数字从 0 滚到 N，与格子填色同步（发起人 11-04 要动效）
  function countUp(host) {
    if (reduceMotion) return;
    host.querySelectorAll("[data-count]").forEach((el) => {
      const to = Number(el.dataset.count) || 0, t0 = performance.now(), dur = 700;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  window.CEO_ANNUAL_TRADING = {
    mount(el, ctx) {
      tradeHost = el;
      tradeCtx = ctx || null;
      renderTrading();
      if (marketSeedRevision === "unrequested" || (ctx?.book && !archiveSeed)) void refreshMarketSeed();
    },
  };
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
    if (b.dataset.sec) { pref.section = b.dataset.sec; DAY = null; LB = null; }
    else if (b.dataset.per) pref.period = b.dataset.per;
    else return;
    store.set(PREF_STORE, pref); render();
  });
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (V && !root.hidden) drawCharts(); if (tradeVisible()) drawCharts(tradeHost, tradeCharts); }, 200); });
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
