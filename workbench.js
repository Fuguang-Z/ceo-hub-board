/* 「成果」页渲染 + 天枢（本机）对接（D36）。
   在 hub/workbench.py 提供的天枢（本机）（http://127.0.0.1:8770）里打开时，文件引用旁出现「打开 / 定位」按钮；
   在公开看板或双击 index.html 打开时，只显示文件位置文字。 */
(() => {
  const D = window.DASHBOARD;
  if (!D) return;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const O = D.outputs || { projects: [], audit: [] };
  const day = (t) => { const d = new Date(t * 1000); return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // ── 成果页 ──
  $("#o-projects").innerHTML = O.projects.map((p) => `<article class="panel${p.paused ? " paused" : ""}"><h3>${esc(p.name)}${p.paused ? ' <span class="stale">封存</span>' : ""}${p.sensitive ? " <small>敏感 · 仅本机版可见</small>" : ""}</h3>
    ${p.items.map((it) => `<div class="out-item"><div><b>${esc(it.label)}</b>
        <div class="meta">${esc(it.file)} · ${kb(it.size)} · ${day(it.mtime)} · 来自 ${esc(it.machine)}</div>
        ${it.ref ? window.filesHtml([it.ref]) : ""}</div></div>`).join("")}
    ${(p.links || []).map((l) => `<div class="out-item"><div><b>${esc(l.label)}</b><div class="meta"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></div></div></div>`).join("")}
    ${!p.items.length && !(p.links || []).length ? '<p class="empty">本机还没有这个项目的成果（另一台电脑发布后经绿联云同步过来）。</p>' : ""}
  </article>`).join("") || '<p class="empty">还没有成果清单。运行 <code>python hub/outputs.py publish</code>。</p>';

  $("#o-audit").innerHTML = O.audit && O.audit.length ? `<table class="audit"><tr><th>项目</th><th>进度</th><th>记忆</th><th>成果</th></tr>${O.audit.map((a) =>
    `<tr><td>${esc(a.name)}</td><td>${esc(a.progress)}</td><td>${esc(a.memory)}</td><td>${esc(a.outputs)}</td></tr>`).join("")}</table>
    <p class="hint">成果同步区：<code>${esc(O.syncDir)}</code>${O.nasTask ? "（已建绿联云任务）" : "（⚠ 还没建绿联云同步任务，见 docs/成果同步区_建任务.md）"}</p>`
    : '<p class="empty">公开版不显示同步体检。</p>';

  // ── 天枢对接 ──
  const hint = $("#wb-hint");
  const api = (path) => fetch(path, { headers: { "X-CEO-Hub": "1" } }).then((r) => r.json());
  // 只在天枢（本机 127.0.0.1 / 经 Tailscale 打开的 NAS 100.x）探测接口；公开看板上不发请求，避免控制台 404
  const local = /^(127\.0\.0\.1|localhost|100\.\d+\.\d+\.\d+)$/.test(location.hostname);
  let nasMode = false;
  (local ? api("/api/ping") : Promise.reject()).then((r) => {
    if (!r.ok) throw 0;
    nasMode = r.mode === "nas";
    document.body.classList.add("wb-on");
    if (nasMode) document.body.classList.add("wb-nas");
    hint.innerHTML = nasMode
      ? `天枢（NAS）已连接：点「打开」在浏览器里查看或下载文件（文件来自绿联云成果同步区）。`
      : `天枢（本机）已连接（${esc(r.label)}）：点「打开」用默认程序打开文件，点「定位」在资源管理器里选中。`;
    const refs = [...new Set([...document.querySelectorAll(".fref")].map((e) => e.dataset.ref))];
    return api(`/api/check?refs=${encodeURIComponent(JSON.stringify(refs))}`).then((c) => {
      document.querySelectorAll(".fref").forEach((e) => {
        const ok = c.found[e.dataset.ref];
        e.classList.toggle("missing", !ok);
        if (ok && !e.querySelector(".path")) e.insertAdjacentHTML("beforeend", `<small class="path">${esc(c.paths[e.dataset.ref])}</small>`);
        if (!ok) e.title = "本机找不到：可能还没从另一台电脑同步过来";
      });
    });
  }).catch(() => {
    hint.innerHTML = "要一键打开文件：双击项目目录里的 <code>打开天枢.cmd</code>（只在本机运行，公开看板不能打开本地文件）。";
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".fbtn");
    if (!b) return;
    if (nasMode) { window.open(`/api/file?ref=${encodeURIComponent(b.dataset.ref)}`, "_blank", "noopener"); return; }
    api(`/api/${b.dataset.act}?ref=${encodeURIComponent(b.dataset.ref)}`).then((r) => {
      if (!r.ok) alert(r.error || "打不开");
    });
  });
})();
