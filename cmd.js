/* 「指令」页（D45 阶段 4）：发起人在天枢给 AI 发指令，回复都存在 NAS。
   发给 DeepSeek 的由 NAS 直接调用 API 回复（几秒到几十秒）；发给 Claude / Codex 的，它们开工时用 hub/nas_cmd.py 读取并回复。
   10-28 起可带图片和文件（每条最多 8 个、单个 ≤15 MB）：DeepSeek 能看图片；Claude / Codex 用 nas_cmd.py fetch 下载。
   发给 DeepSeek 的交易截图（指令里提到收入明细/交易/持仓/成交）会另存到 NAS「每日交易截图/当天」，供每日试填使用。
   在电脑天枢（本机）打开时由天枢转发到 NAS；公开看板不可用。 */
(() => {
  const root = document.getElementById("view-cmd");
  if (!root) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const WB = /^(127\.0\.0\.1|localhost|100\.\d+\.\d+\.\d+)$/.test(location.hostname);
  const LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const MAX_FILES = 8, MAX_SIZE = 15 * 1024 * 1024;
  const ACCEPT = "image/*,.pdf,.xlsx,.xls,.csv,.docx,.txt,.md,.zip";
  const api = (method, path, body) => fetch(path, {
    method, headers: Object.assign({ "X-CEO-Hub": "1" }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || j.message || `请求失败（${r.status}）`);
    return j;
  });
  const NAMES = { deepseek: "DeepSeek", claude: "Claude", codex: "Codex", all: "全部 AI" };
  const STATUS = { pending: "待回复", answered: "已回复", done: "已完成" };
  const isImg = (n) => /\.(png|jpe?g|webp|gif)$/i.test(n);
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  let items = [], to = "deepseek", msg = "", busy = false, loaded = false, timer = null, picked = [], filesBase = "";

  // 附件链接：NAS 页面用相对地址；电脑本机天枢直接连 NAS（本机只转发 JSON）
  if (LOCAL) api("GET", "/api/ping").then((j) => { filesBase = j.nas || ""; if (loaded) render(); }).catch(() => {});
  const fileUrl = (c, i) => `${filesBase}/api/cmd/${encodeURIComponent(c.id)}/files/${i}`;

  function render() {
    if (!WB) {
      root.innerHTML = `<article class="panel"><h3>指令</h3><p class="empty">指令与 AI 回复只在天枢里可用（桌面「天枢」或手机经 Tailscale 打开 天枢（NAS））。</p></article>`;
      return;
    }
    const draft = root.querySelector("#cmd-text")?.value || "";
    root.innerHTML = `<article class="panel"><h3>发指令 <small>存于 NAS，两台电脑、手机都能看到</small></h3>
      <div class="an-seg">${Object.entries(NAMES).map(([k, l]) => `<button type="button" data-to="${k}" aria-selected="${to === k}">${l}</button>`).join("")}</div>
      <textarea id="cmd-text" class="cmd-text" rows="4" placeholder="${to === "deepseek" || to === "all" ? "DeepSeek 会直接回复，能看图片；例：收入明细今日截图（持仓 + 当日成交）" : "Claude / Codex 下次开工时会读到并回复；例：推进论文 C10 脱敏复核的下一步"}">${esc(draft)}</textarea>
      <div class="cmd-files">
        <label class="an-btn ghost cmd-pick">＋ 图片 / 文件<input type="file" id="cmd-file" multiple accept="${ACCEPT}" hidden></label>
        <small>最多 ${MAX_FILES} 个，单个 ≤15 MB；支持图片、PDF、Excel、CSV、Word、TXT、ZIP</small>
        ${picked.length ? `<ul class="cmd-picked">${picked.map((f, i) => `<li>${isImg(f.name) ? "🖼" : "📄"} ${esc(f.name)} <small>${kb(f.size)}</small>
          <button type="button" class="cmd-x" data-act="unpick" data-i="${i}" aria-label="移除">×</button></li>`).join("")}</ul>` : ""}
      </div>
      <div class="an-actions"><button type="button" class="an-btn" data-act="send" ${busy ? "disabled" : ""}>${busy ? "发送中…" : "发送"}</button>
        <button type="button" class="an-btn ghost" data-act="reload">刷新</button></div>
      <p class="an-msg">${esc(msg)}</p></article>
      <article class="panel"><h3>往来记录 <small>${items.length} 条</small></h3>
      ${items.length ? items.map(item).join("") : `<p class="empty">还没有指令。</p>`}</article>`;
  }

  function filesHtml(c) {
    const fs = c.files || [];
    if (!fs.length) return "";
    return `<div class="cmd-att">${fs.map((f, i) => isImg(f.name)
      ? `<a href="${esc(fileUrl(c, i))}" target="_blank" rel="noopener" title="${esc(f.name)}"><img src="${esc(fileUrl(c, i))}" alt="${esc(f.name)}" loading="lazy"></a>`
      : `<a class="cmd-doc" href="${esc(fileUrl(c, i))}" target="_blank" rel="noopener">📄 ${esc(f.name.replace(/^\d{2}_/, ""))} <small>${kb(f.size)}</small></a>`).join("")}</div>
      ${c.tradingSaved ? `<small class="cmd-saved">已存入 ${esc(c.tradingSaved)}，收盘后每日试填使用</small>` : ""}`;
  }

  function item(c) {
    return `<div class="cmd-item ${c.status}"><div class="cmd-hd"><b>→ ${esc(NAMES[c.to] || c.to)}</b><small>${esc(c.at)} · 来自 ${esc(c.from)}</small>
        <span class="chip ${c.status === "pending" ? "P1" : c.status === "done" ? "ok" : "P2"}">${STATUS[c.status] || c.status}</span></div>
      ${c.text ? `<div class="cmd-body">${esc(c.text)}</div>` : ""}${filesHtml(c)}
      ${c.replies.map((r) => `<div class="cmd-reply"><small><b>${esc(r.by)}</b> · ${esc(r.at)}</small><div>${esc(r.text)}</div></div>`).join("")}
      ${c.status !== "done" ? `<div class="an-actions"><button type="button" class="an-btn ghost" data-act="done" data-id="${esc(c.id)}">标记完成</button></div>` : ""}</div>`;
  }

  async function load() {
    try { items = (await api("GET", "/api/cmd")).items || []; msg = msg.startsWith("已发出") ? msg : ""; }
    catch (e) { msg = e.message; }
    loaded = true; render();
    clearTimeout(timer);
    // DeepSeek 正在回复时每 4 秒刷新一次，回复到了就停
    if (items.some((c) => c.status === "pending" && (c.to === "deepseek" || c.to === "all") && !c.replies.some((r) => r.by === "DeepSeek")))
      timer = setTimeout(() => { if (!root.hidden) load(); }, 4000);
  }

  const toB64 = (file) => new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => bad(new Error(`读取失败：${file.name}`));
    r.readAsDataURL(file);
  });

  root.addEventListener("change", (e) => {
    if (e.target.id !== "cmd-file") return;
    const add = [...e.target.files];
    for (const f of add) {
      if (f.size > MAX_SIZE) { msg = `${f.name} 超过 15 MB，未加入`; continue; }
      if (picked.length >= MAX_FILES) { msg = `最多 ${MAX_FILES} 个附件`; break; }
      // 手机拍照可能没有扩展名，按类型补上
      const name = /\.[a-z0-9]+$/i.test(f.name) ? f.name : `${f.name || "照片"}.${(f.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
      picked.push({ file: f, name, size: f.size });
    }
    render();
  });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.to) { to = b.dataset.to; return render(); }
    if (b.dataset.act === "reload") return load();
    if (b.dataset.act === "unpick") { picked.splice(Number(b.dataset.i), 1); return render(); }
    if (b.dataset.act === "send") {
      const text = root.querySelector("#cmd-text").value.trim();
      if (!text && !picked.length) { msg = "请先写指令内容或选择图片/文件。"; return render(); }
      busy = true; msg = picked.length ? "正在上传附件…" : ""; render();
      try {
        const files = await Promise.all(picked.map(async (p) => ({ name: p.name, b64: await toB64(p.file) })));
        const r = await api("POST", "/api/cmd", { to, text, from: "天枢", files });
        root.querySelector("#cmd-text").value = ""; picked = [];
        msg = to === "claude" || to === "codex" ? "已发出，等它下次开工时回复。" : "已发出，DeepSeek 正在回复…";
        if (r.item?.tradingSaved) msg += `（截图已存入 ${r.item.tradingSaved}）`;
      } catch (err) { msg = err.message; }
      busy = false; return load();
    }
    if (b.dataset.act === "done") {
      try { await api("POST", `/api/cmd/${b.dataset.id}/reply`, { by: "发起人", text: "（标记完成）", done: true }); } catch (err) { msg = err.message; }
      return load();
    }
  });
  // 切到本页时才加载
  new MutationObserver(() => { if (!root.hidden && !loaded) load(); else if (!root.hidden) load(); }).observe(root, { attributes: true, attributeFilter: ["hidden"] });
  render();
  if (!root.hidden) load();  // 直接打开 #cmd 时本页在本脚本之前就已显示，观察器收不到变化
})();
