/* 勘合：只读展示 Git 中的审核链与已落盘技能卡片，不在镜像页面修改状态。 */
'use strict';
(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const settled = w => ['approved', 'closed_by_author'].includes(w.state) && w.eligibleForCard === true;
  const stored = e => settled(flow(e)) && flow(e).card?.state === 'stored';
  const delegatedReviewLabel = w => `仅 ${w.currentAuthor || '未登记 agent'} 审核（发起人指定）`;
  const mounted = new WeakMap();

  function flow(entry) {
    return entry.workflow || { state: 'legacy', label: entry.verified ? '历史已验' : entry.returned ? '历史退回' : '待审核',
      nextActor: '待补流程信息', nextAction: '补齐最初 agent、当前修改人、审核链与入库证据。', history: [], card: { state: 'none' } };
  }

  function groupEntries(entries) {
    const all = list(entries);
    return { all, pending: all.filter(e => !settled(flow(e))),
      ready: all.filter(e => settled(flow(e)) && !stored(e)), cards: all.filter(stored) };
  }

  function fileLink(path, label, canOpenFiles) {
    // 卡片仅能指向勘合目录内的相对文件；其余证据按文字展示。
    const value = String(path || '');
    const valid = value.startsWith('audit/') && !value.split('/').some(p => p === '..' || p === '.') &&
      !/[\\\x00-\x1f?#:]/.test(value);
    return canOpenFiles && valid
      ? `<a href="/api/file?ref=${encodeURIComponent('hub:' + value)}" target="_blank" rel="noopener">${esc(label || value)}</a>`
      : `<span>${esc(label || value)}</span>`;
  }

  function roundLabel(w) {
    return Number.isInteger(w.repairRounds) && w.repairRounds >= 0
      ? `已交叉修复 ${w.repairRounds} / ${w.maxRepairRounds || 2} 轮` : '流程信息待补';
  }

  function stateTone(w) {
    if (w.state === 'invalid') return 'error';
    if (w.state === 'closed_by_author' || w.state === 'author_closure') return 'closure';
    if (w.state === 'approved') return 'approved';
    if (w.state === 'reviewer_fix') return 'repair';
    return 'pending';
  }

  function skillStatus(entry) {
    const w = flow(entry);
    if (stored(entry)) return w.card.closeMode === 'delegated' ? `已入库 · ${delegatedReviewLabel(w)}`
      : w.card.closeMode === 'original' || w.state === 'closed_by_author' ? '已入库 · 最初 agent 闭合' : '已入库 · 交叉审核通过';
    if (w.card?.state === 'invalid') return '卡片证据无效，需重新核验入库';
    if (settled(w)) return w.state === 'closed_by_author' ? '最初 agent 已闭合，待存为技能卡片' : '审核通过，待存为技能卡片';
    return '尚未达到入卡条件';
  }

  function historyHtml(history) {
    const events = list(history);
    const labels = { import: '登记/迁移', upload: '上传修改', submit: '上传修改', review: '交叉审核', repair: '接手修复',
      fix: '接手修复', close: '最初 agent 闭合', closure: '最初 agent 闭合', card: '存为技能卡片' };
    const decisionLabel = value => ({ approve: '通过', pass: '通过', reject: '未通过', fail: '未通过' }[value] || value);
    const findingText = (item, index) => item && typeof item === 'object'
      ? `${item.id || 'F' + (index + 1)}：${item.text || item.note || ''}` : `F${index + 1}：${text(item)}`;
    const resolutionRows = value => Array.isArray(value) ? value.map(text)
      : value && typeof value === 'object' ? Object.entries(value).map(([key, answer]) => `${key}：${text(answer)}`) : [];
    if (!events.length) return '<p class="hint">暂无结构化审核记录，请以原始勘合记录和证据为准。</p>';
    return `<ol class="audit-history">${events.map(event => `<li>
      <div><b>${esc(labels[event.type] || event.type || '记录')}</b> · ${esc(event.actor || '未登记 agent')}
        <small>${esc(event.at || '')}${event.decision ? ` · ${esc(decisionLabel(event.decision))}` : ''}</small></div>
      ${event.revision ? `<p class="audit-version">上传版本 <code>${esc(event.revision)}</code></p>` : ''}
      ${event.note ? `<p>${esc(text(event.note))}</p>` : ''}
      ${list(event.findings).length ? `<ul aria-label="审核意见">${event.findings.map((item, index) => `<li>${esc(findingText(item, index))}</li>`).join('')}</ul>` : ''}
      ${resolutionRows(event.resolutions).length ? `<ul aria-label="逐条处理">${resolutionRows(event.resolutions).map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
      ${list(event.evidence).length ? `<ul class="audit-evidence" aria-label="证据">${event.evidence.map(item => `<li>${esc(text(item))}</li>`).join('')}</ul>` : ''}
    </li>`).join('')}</ol>`;
  }

  function recordHtml(entry, options) {
    const w = flow(entry);
    return `<details class="audit-entry" data-audit-record="${esc(entry.no)}">
      <summary><span class="audit-entry-main"><span class="audit-id">#${esc(entry.no)}</span>
        <span><strong>${esc(entry.summary)}</strong><small>${esc(entry.category || '')} · ${esc(entry.date || '')} · ${esc(roundLabel(w))}</small></span></span>
        <span class="audit-entry-state"><span class="audit-state audit-state-${stateTone(w)}">${esc(w.label || entry.status || '待审核')}</span>
          <small>${stored(entry) ? '流程已完成' : `下一步：${esc(w.nextActor || '待登记')}`}</small></span></summary>
      <div class="audit-entry-body">
        <dl class="audit-roles"><div><dt>最初 agent</dt><dd>${esc(w.originalAgent || '未登记')}</dd></div>
          <div><dt>本轮修改</dt><dd>${esc(w.currentAuthor || '未登记')}</dd></div>
          <div><dt>最近审核</dt><dd>${esc(w.card?.closeMode === 'delegated' ? delegatedReviewLabel(w) : w.reviewer || '待另一 agent 审核')}</dd></div>
          <div><dt>技能卡片</dt><dd>${esc(skillStatus(entry))}</dd></div></dl>
        ${w.revision ? `<p class="audit-version">当前上传版本 <code>${esc(w.revision)}</code></p>` : ''}
        <p class="audit-next"><b>下一步</b> ${esc(w.nextAction || '补齐记录后按流程继续。')}</p>
        ${w.error ? `<p class="audit-error">${esc(w.error)}</p>` : ''}
        <h4>审核与修复记录</h4>${historyHtml(w.history)}
        <p class="hint">原始记录：${fileLink('audit/勘合录.md', 'audit/勘合录.md · #' + entry.no, options.canOpenFiles)}</p>
      </div></details>`;
  }

  function cardHtml(entry, options) {
    const w = flow(entry), card = w.card;
    const closure = card.closeMode === 'original' || w.state === 'closed_by_author';
    return `<article class="skill-card${closure ? ' skill-card-closure' : ''}" data-audit-card="${esc(entry.no)}">
      <div class="sc-hd"><span class="sc-no">#${esc(entry.no)}</span><span class="sc-cat">${esc(entry.category || '')}</span></div>
      <h3 class="sc-title">${esc(card.name || entry.summary)}</h3>
      <p>${esc(entry.summary)}</p><div class="sc-ft">${esc(card.closeMode === 'delegated' ? delegatedReviewLabel(w) : closure ? '最初 agent 闭合' : '交叉审核通过入卡')} · ${esc(entry.date || '')}</div>
      ${card.path ? `<div class="sc-path">${fileLink(card.path, '查看技能卡片', options.canOpenFiles)}<small>${esc(card.path)}</small></div>` : ''}
    </article>`;
  }

  const skillCategory = entry => String(entry.category || '').trim() || '未分类';
  const skillGroups = [
    ['系统与网络', ['基础设施', '网络·git', '网络复核', '客户端', '电脑设置']],
    ['智能体与协作', ['agent 配置', '架构约定', '复核闭环']],
    ['勘合与技能', ['勘合流程', '勘合显示', '开工自检']],
    ['业务应用', ['A股流水线', '扶摇规则', '收盘双线路', '收盘双路']],
    ['其他', []],
  ];
  const categoryGroups = new Map(skillGroups.flatMap(([group, categories]) => categories.map(category => [category, group])));
  const skillGroup = entry => categoryGroups.get(skillCategory(entry)) || '其他';

  function inventoryGroups(cards, requestedGroup = '', requestedCategory = '') {
    const byGroup = new Map();
    cards.forEach(entry => {
      const group = skillGroup(entry), category = skillCategory(entry);
      if (!byGroup.has(group)) byGroup.set(group, { count: 0, categories: new Map() });
      const bucket = byGroup.get(group);
      bucket.count++;
      bucket.categories.set(category, (bucket.categories.get(category) || 0) + 1);
    });
    const counts = new Map(skillGroups.filter(([group]) => byGroup.has(group)).map(([group]) => [group, byGroup.get(group).count]));
    const group = byGroup.has(requestedGroup) ? requestedGroup : '';
    const categories = byGroup.get(group)?.categories || new Map();
    const category = categories.has(requestedCategory) ? requestedCategory : '';
    return { counts, group, categories, category,
      selected: cards.filter(entry => (!group || skillGroup(entry) === group) && (!category || skillCategory(entry) === category)) };
  }

  function inventoryHtml(cards, options) {
    const { counts, group, categories, category, selected } = inventoryGroups(cards, options.skillGroup, options.skillCategory);
    const groups = [['', '全部', cards.length], ...Array.from(counts, ([name, count]) => [name, name, count])];
    const subcategories = group ? [['', '本组全部', counts.get(group)], ...Array.from(categories, ([name, count]) => [name, name, count])] : [];
    return `<h2>技能库 <small>审核完成且卡片已保存</small></h2>
      <div class="skill-inventory-layout">
        <nav class="skill-nav" aria-label="技能一级分类"><h3>一级分类</h3>${groups.map(([id, name, count]) =>
          `<button type="button" data-audit-skill-group="${esc(id)}" aria-pressed="${id === group}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')}</nav>
        <div class="skill-inventory-main">
          <div class="skill-result-head" aria-live="polite"><strong>${esc(group ? group + (category ? ' / ' + category : '') : '全部技能')}</strong><span>${selected.length} 张技能卡片</span></div>
          ${group ? `<nav class="skill-subnav" aria-label="${esc(group)}二级分类">${subcategories.map(([id, name, count]) =>
            `<button type="button" data-audit-skill-category="${esc(id)}" aria-pressed="${id === category}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')}</nav>` : ''}
          ${selected.length ? `<div class="skill-stock">${selected.map(entry => cardHtml(entry, options)).join('')}</div>`
            : '<p class="empty">暂无已入库技能卡片。通过审核后，还需保存卡片并核对入库证据。</p>'}
        </div>
      </div>
      <p class="hint">按记录查看完整审核链；最初 agent 闭合的卡片单独标识。${fileLink('audit/README.md', '查看勘合规则', options.canOpenFiles)}</p>`;
  }

  function render(data, options = {}) {
    const groups = groupEntries(data?.entries);
    const filter = ['pending', 'ready', 'all'].includes(options.filter) ? options.filter : 'pending';
    const selected = groups[filter];
    const filters = [['pending', '待处理', groups.pending.length], ['ready', '待入卡', groups.ready.length], ['all', '全部记录', groups.all.length]];
    return `<article class="panel audit-guide">
      <div class="audit-heading"><h2>勘合</h2><span class="hint">修改有记录，审核可追溯</span></div>
      <ol class="audit-process" aria-label="勘合流程"><li><b>01</b><span>上传记录<small>记录修改人和证据</small></span></li>
        <li><b>02</b><span>另一 agent 审核<small>不能审核自己的本轮修改</small></span></li>
        <li><b>03</b><span>通过后入卡<small>保存可复用方法与验证边界</small></span></li></ol>
      <p class="audit-rule">未通过时，由审核 agent 接手修改，再交另一 agent 审核；最多完成 <b>2 轮</b>交叉修复。
        第三次仍未通过，审核 agent <b>只提意见</b>，由<b>最初 agent 修改并验证闭合</b>后入卡。</p>
      <div class="audit-counts"><span>待处理 <b>${groups.pending.length}</b></span><span>待入卡 <b>${groups.ready.length}</b></span>
        <span>已入库 <b>${groups.cards.length}</b></span><span>全部记录 <b>${groups.all.length}</b></span></div>
    </article>
    <article class="panel audit-records"><h2>审核记录</h2>
      <div class="audit-filters" role="group" aria-label="筛选审核记录">${filters.map(([id, label, count]) =>
        `<button type="button" data-audit-filter="${id}" aria-pressed="${id === filter}">${label} <span>${count}</span></button>`).join('')}</div>
      <div aria-live="polite" class="audit-result-count">${esc(filters.find(f => f[0] === filter)[1])} · ${selected.length} 条</div>
      ${selected.length ? selected.map(e => recordHtml(e, options)).join('') : `<p class="empty">${!groups.all.length ? '还没有勘合记录。' : filter === 'ready' ? '没有待入卡的记录。' : '当前筛选下没有记录。'}</p>`}
    </article>
    <article class="panel" id="audit-inventory">${inventoryHtml(groups.cards, options)}</article>`;
  }

  function mount(host, data, options = {}) {
    let context = mounted.get(host);
    if (!context) {
      context = { filter: 'pending', skillGroup: '', skillCategory: '' };
      mounted.set(host, context);
      host.addEventListener('click', event => {
        const button = event.target.closest('[data-audit-filter], [data-audit-skill-group], [data-audit-skill-category]');
        if (!button) return;
        if (['pending', 'ready', 'all'].includes(button.dataset.auditFilter)) {
          context.filter = button.dataset.auditFilter;
          host.innerHTML = render(context.data, { ...context.options, filter: context.filter,
            skillGroup: context.skillGroup, skillCategory: context.skillCategory });
          host.querySelector(`[data-audit-filter="${context.filter}"]`)?.focus();
        } else if (button.dataset.auditSkillGroup !== undefined || button.dataset.auditSkillCategory !== undefined) {
          const cards = groupEntries(context.data?.entries).cards;
          const isGroup = button.dataset.auditSkillGroup !== undefined;
          const selection = inventoryGroups(cards, isGroup ? button.dataset.auditSkillGroup : context.skillGroup,
            isGroup ? '' : button.dataset.auditSkillCategory);
          context.skillGroup = selection.group;
          context.skillCategory = selection.category;
          // 分类只刷新技能库，保留上方审核记录的展开状态。
          const inventory = host.querySelector('#audit-inventory');
          if (!inventory) return;
          inventory.innerHTML = inventoryHtml(cards, { ...context.options, skillGroup: context.skillGroup, skillCategory: context.skillCategory });
          inventory.querySelector(isGroup ? '[data-audit-skill-group][aria-pressed="true"]'
            : '[data-audit-skill-category][aria-pressed="true"]')?.focus();
        }
      });
    }
    context.data = data;
    context.options = options;
    const selection = inventoryGroups(groupEntries(data?.entries).cards, context.skillGroup, context.skillCategory);
    context.skillGroup = selection.group;
    context.skillCategory = selection.category;
    host.innerHTML = render(data, { ...options, filter: context.filter, skillGroup: context.skillGroup, skillCategory: context.skillCategory });
  }

  const api = { render, groupEntries, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TianShuAudit = api;
})();
