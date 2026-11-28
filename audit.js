/* 勘合：只读展示 Git 中的审核链与已落盘技能卡片，不在镜像页面修改状态。 */
'use strict';
(() => {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const settled = w => ['approved', 'closed_by_author', 'migrated'].includes(w.state) && w.eligibleForCard === true;
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

  function fileLink(path, label, canOpenFiles, className = '') {
    // 卡片仅能指向勘合目录内的相对文件；其余证据按文字展示。
    const value = String(path || '');
    const valid = value.startsWith('audit/') && !value.split('/').some(p => p === '..' || p === '.') &&
      !/[\\\x00-\x1f?#:]/.test(value);
    const cls = className ? ` class="${esc(className)}"` : '';
    return canOpenFiles && valid
      ? `<a${cls} href="/api/file?ref=${encodeURIComponent('hub:' + value)}" target="_blank" rel="noopener">${esc(label || value)}</a>`
      : `<span>${esc(label || value)}</span>`;
  }

  function roundLabel(w) {
    return Number.isInteger(w.repairRounds) && w.repairRounds >= 0
      ? `已交叉修复 ${w.repairRounds} / ${w.maxRepairRounds || 2} 轮` : '流程信息待补';
  }

  function stateTone(w) {
    if (w.state === 'invalid') return 'error';
    if (w.state === 'closed_by_author' || w.state === 'author_closure') return 'closure';
    if (w.state === 'approved' || w.state === 'migrated') return 'approved';
    if (w.state === 'reviewer_fix') return 'repair';
    return 'pending';
  }

  function skillStatus(entry) {
    const w = flow(entry);
    if (w.state === 'migrated') return '已汇总 · 按原记录追溯审核';
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
          ${subcategories.length ? `<nav class="skill-subnav" aria-label="${esc(group)}二级分类">${subcategories.map(([id, name, count]) =>
            `<button type="button" data-audit-skill-category="${esc(id)}" aria-pressed="${id === category}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')}</nav>` : ''}
          ${selected.length ? `<div class="skill-stock">${selected.map(entry => cardHtml(entry, options)).join('')}</div>`
            : '<p class="empty">暂无已入库技能卡片。通过审核后，还需保存卡片并核对入库证据。</p>'}
        </div>
      </div>
      <p class="hint">${fileLink('audit/README.md', '查看勘合规则', options.canOpenFiles)}</p>`;
  }

  const settingsCategories = ['电脑设置', 'Agent 设置', '天枢设置', 'Git 设置'];
  const topicStates = { all: '全部状态', progress: '完善中', complete: '已完善', attention: '待核对' };
  const topicSymbols = {
    book: '<path d="M12 7v13M12 7C9 4 6 4 3 5v13c3-1 6-1 9 2 3-3 6-3 9-2V5c-3-1-6-1-9 2Z"/>',
    progress: '<path d="M20 12a8 8 0 1 1-8-8M12 1v3h3"/>',
    complete: '<path d="m5 12 4 4L19 6"/>',
    attention: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4m0 4h.01"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
  };

  function topicIcon(name, className) {
    return `<span class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${topicSymbols[name]}</svg></span>`;
  }

  function topicStage(entry) {
    const w = flow(entry);
    if (w.state === 'invalid' || w.state === 'legacy' || w.card?.state === 'invalid') return 'attention';
    return stored(entry) ? 'complete' : 'progress';
  }

  function inlineCardText(value, canOpenFiles) {
    value = String(value ?? '');
    const tokens = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^()\s]+)\)|\*\*([^*\n]+)\*\*/g;
    let html = '', offset = 0;
    for (const token of value.matchAll(tokens)) {
      html += esc(value.slice(offset, token.index));
      if (token[1]) html += '<code>' + esc(token[1]) + '</code>';
      else if (token[4]) html += '<strong>' + esc(token[4]) + '</strong>';
      else {
        // 由事项卡所在目录解析相对证据链接，继续使用勘合文件入口的范围检查。
        const ref = token[3];
        const path = /^[\w.\-/\u0080-\uFFFF]+$/u.test(ref) && !ref.startsWith('/')
          ? decodeURIComponent(new URL(ref, 'https://card.invalid/audit/cards/topics/').pathname).slice(1) : '';
        html += fileLink(path, token[2], canOpenFiles);
      }
      offset = token.index + token[0].length;
    }
    return html + esc(value.slice(offset));
  }

  function cardBodyHtml(source, canOpenFiles) {
    const blocks = [];
    const lines = source.trim().split(/\r?\n/);
    if (/^#\s/.test(lines[0])) lines.shift();
    let i = 0;
    const inline = value => inlineCardText(value, canOpenFiles);
    while (i < lines.length) {
      const line = lines[i++].trim();
      if (!line) continue;
      if (line.startsWith('```')) {
        const code = [];
        while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
        i++;
        const pre = '<pre><code>' + esc(code.join('\n')) + '</code></pre>';
        blocks.push(line === '```audit-scope' ? '<details><summary>核验文件范围</summary>' + pre + '</details>' : pre);
      } else if (/^#{1,6}\s/.test(line)) {
        blocks.push('<h5>' + inline(line.replace(/^#{1,6}\s+/, '')) + '</h5>');
      } else if (/^[-*]\s/.test(line)) {
        const items = [line.slice(2)];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) items.push(lines[i++].trim().slice(2));
        blocks.push('<ul>' + items.map(item => '<li>' + inline(item) + '</li>').join('') + '</ul>');
      } else {
        blocks.push('<p>' + inline(line) + '</p>');
      }
    }
    return blocks.join('');
  }

  function topicCardHtml(entry, options) {
    const stage = topicStage(entry);
    return `<button type="button" class="audit-library-card audit-library-summary" data-audit-card="${esc(entry.no)}"
      aria-expanded="${options.openTopic === entry.no}" aria-controls="audit-topic-reader">
        ${topicIcon('book', 'audit-library-icon')}
        <span class="audit-library-card-text"><strong class="audit-library-title">${esc(entry.summary)}</strong>
          <span class="audit-library-category">${esc(entry.category)}</span></span>
        <span class="audit-library-status" data-stage="${stage}">${topicIcon(stage, 'audit-library-status-icon')}${topicStates[stage]}</span>
        ${topicIcon('chevron', 'audit-library-chevron')}
      </button>`;
  }

  function topicDetailHtml(entry, options) {
    const w = flow(entry);
    const links = options.canOpenFiles;
    const cycles = list(w.cycles);
    const roles = [['当前状态', w.label], ['本轮修改', w.currentAuthor],
      ['审核者', w.card?.closeMode === 'delegated' ? delegatedReviewLabel(w) : w.reviewer],
      ['待处理人', w.nextActor], ['修复轮次', Number.isInteger(w.repairRounds) ? roundLabel(w) : '']];
    const sourceLink = no => fileLink('audit/cards/' + no + '.md', '#' + no, links);
    const registrations = cycles.length ? cycles : (list(w.history).length ? [w.history] : []);
    const changes = list(entry.sourceRecords).slice();
    const actions = { import: '登记修改', upload: '上传修改', submit: '上传修改', fix: '接手修复',
      repair: '接手修复', close: '闭合修改', closure: '闭合修改' };
    registrations.forEach((events, index) => {
      for (const event of events) {
        if (!Object.hasOwn(actions, event.type)) continue;
        changes.push({ date: event.at, registration: index + 1, title: [event.actor, actions[event.type]].filter(Boolean).join(' · '),
          summary: event.note || event.revision });
      }
    });
    changes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.no || '').localeCompare(String(a.no || '')));
    const privateDetails = Array.isArray(entry.sourceRecords) || list(entry.sources).length || w.cardText || links;
    return `<div class="audit-detail-heading"><h3 id="audit-topic-heading">${esc(entry.summary)}</h3>
      ${stored(entry) && w.card.path && links ? fileLink(w.card.path, '打开原卡', links) : ''}</div>
      <div class="audit-detail-columns">
        <section><h4>修改记录</h4>
          ${changes.length ? `<ol class="audit-change-list">${changes.map(change => `<li>
            <div class="audit-change-meta">${change.registration ? `第 ${change.registration} 次登记` : sourceLink(change.no)}
              <time datetime="${esc(change.date)}">${esc(String(change.date || '').slice(0, 10))}</time></div>
            <h5>${inlineCardText(change.title, false)}</h5>
            ${change.summary ? `<p>${inlineCardText(change.summary, false)}</p>` : ''}
          </li>`).join('')}</ol>` :
            `<p class="hint">${privateDetails ? '暂无已登记的修改摘要。' : '修改明细仅在私有工作台提供。'}</p>
            ${list(entry.sources).map(sourceLink).join(' · ')}`}
        </section>
        <section><h4>技能卡内容</h4>
          ${w.cardText ? `${stored(entry) ? '' : '<p class="hint">当前登记稿 · 待完成审核入卡</p>'}
          <div class="audit-card-body">${cardBodyHtml(w.cardText, links)}</div>` :
            `<p class="hint">${privateDetails ? '当前版本暂无可核验的技能卡正文。' : '技能卡正文仅在私有工作台提供。'}</p>`}
        </section>
      </div>
      <details class="audit-review-details"><summary>审核状态与版本</summary>
        <dl class="audit-roles">${roles.filter(([, value]) => value).map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
        ${w.revision ? `<p class="audit-version">当前上传版本 <code>${esc(w.revision)}</code></p>` : ''}
        ${topicStage(entry) !== 'complete' && w.nextAction ? `<p class="audit-next">${esc(w.nextAction)}</p>` : ''}
        ${registrations.map((events, index) => `<h4>第 ${index + 1} 次登记</h4>${historyHtml(events)}`).reverse().join('')}
      </details>`;
  }

  const auditLogo = () => (typeof window !== 'undefined' && window.TianShuScenes?.logo)
    ? window.TianShuScenes.logo('audit') : '<div class="ts-head-logo" data-logo="audit" aria-hidden="true"></div>';

  function topicLibraryHtml(data, options) {
    const entries = list(data.entries);
    const category = settingsCategories.includes(options.skillGroup) ? options.skillGroup : '';
    const inCategory = entries.filter(e => !category || e.category === category);
    const states = Object.keys(topicStates).filter(state => state !== 'attention' || entries.some(e => topicStage(e) === state));
    const state = states.includes(options.topicFilter) ? options.topicFilter : 'all';
    const selected = inCategory.filter(e => state === 'all' || topicStage(e) === state);
    const open = selected.find(e => e.no === options.openTopic);
    const categories = [['', '全部分类'], ...settingsCategories.map(name => [name, name])];
    const headActions = [
      options.canOpenFiles && Number.isInteger(data.historyCount)
        ? fileLink('audit/勘合录.md', `历史勘合录（${data.historyCount} 条）`, true, 'ts-head-btn') : '',
      options.canOpenFiles ? fileLink('audit/README.md', '勘合规则', true, 'ts-head-btn') : '',
    ].filter(Boolean).join('');
    return `<header class="ts-page-head audit-head">
      <div class="ts-head-main">${auditLogo()}<div class="ts-head-copy">
        <div class="ts-head-title"><h2 id="audit-library-title">勘合 <span>· 技能库</span></h2></div>
        <p class="ts-head-desc">电脑、Agent、天枢与 Git 设置的交叉审核链与已落盘技能卡片</p>
      </div></div>
      ${headActions ? `<div class="ts-head-actions">${headActions}</div>` : ''}
    </header>
    <article class="panel audit-library" id="audit-inventory" aria-labelledby="audit-library-title">
      ${data.error ? `<p class="audit-error" role="alert">${esc(data.error)}</p>` : ''}
      <div class="audit-library-toolbar">
        <nav class="skill-nav" aria-label="设置分类">${categories.map(([value, name]) =>
          `<button type="button" data-audit-skill-group="${esc(value)}" aria-pressed="${value === category}"><span>${esc(name)}</span><b>${entries.filter(e => !value || e.category === value).length}</b></button>`).join('')}</nav>
        <div class="audit-filters" role="group" aria-label="技能卡状态">${states.map(value =>
          `<button type="button" data-audit-library-state="${value}" aria-pressed="${value === state}">${topicStates[value]} <span>${inCategory.filter(e => value === 'all' || topicStage(e) === value).length}</span></button>`).join('')}</div>
      </div>
      <div class="audit-library-count" aria-live="polite">${selected.length} 项设置</div>
      ${selected.length ? `<div class="audit-library-grid">${selected.map(e => topicCardHtml(e, options)).join('')}
        <section class="audit-library-detail" id="audit-topic-reader" aria-labelledby="audit-topic-heading"${open ? '' : ' hidden'}>${open ? topicDetailHtml(open, options) : ''}</section></div>` :
        '<p class="empty">当前筛选下没有事项。</p>'}
    </article>`;
  }

  function render(data, options = {}) {
    if (data?.topicMode) return topicLibraryHtml(data, options);
    const groups = groupEntries(data?.entries);
    const filter = ['pending', 'ready', 'all'].includes(options.filter) ? options.filter : 'pending';
    const selected = groups[filter];
    const filters = [['pending', '待处理', groups.pending.length], ['ready', '待入卡', groups.ready.length], ['all', '全部记录', groups.all.length]];
    return `<header class="ts-page-head audit-head">
      <div class="ts-head-main">${auditLogo()}<div class="ts-head-copy">
        <div class="ts-head-title"><h2>勘合 <span>· 交叉审核</span></h2></div>
        <p class="ts-head-desc">修改有记录，审核可追溯；经另一 agent 交叉审核后沉淀为技能卡片</p>
      </div></div>
      ${options.canOpenFiles ? `<div class="ts-head-actions">${fileLink('audit/README.md', '勘合规则', true, 'ts-head-btn')}</div>` : ''}
    </header>
    <article class="panel audit-guide">
      <div class="audit-heading"><h2>勘合流程</h2><span class="hint">修改有记录，审核可追溯</span></div>
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

  function placeReader(grid) {
    const active = grid.querySelector('[aria-expanded="true"]');
    if (!active) return;
    const reader = grid.querySelector('#audit-topic-reader');
    const cards = Array.from(grid.querySelectorAll('[data-audit-card]'));
    // 使用网格实际列数，同一个阅读区在换行、缩放和筛选后仍跟随所选行。
    const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length;
    const rowEnd = Math.ceil((cards.indexOf(active) + 1) / columns) * columns;
    const last = cards[Math.min(rowEnd, cards.length) - 1];
    if (last.nextElementSibling !== reader) last.after(reader);
  }

  function selectTopic(button, context) {
    const grid = button.parentElement;
    const reader = grid.querySelector('#audit-topic-reader');
    const closing = button.getAttribute('aria-expanded') === 'true';
    const old = grid.querySelector('[aria-expanded="true"]');
    const readerWasAbove = !reader.hidden && Boolean(reader.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
    const top = button.getBoundingClientRect().top;
    old?.setAttribute('aria-expanded', 'false');
    context.openTopic = closing ? '' : button.dataset.auditCard;
    reader.hidden = closing;
    if (closing) {
      reader.replaceChildren();
      return;
    }
    button.setAttribute('aria-expanded', 'true');
    const entry = context.data.entries.find(e => e.no === context.openTopic);
    reader.innerHTML = topicDetailHtml(entry, context.options);
    placeReader(grid);
    // 收起上方的旧记录时，让正在操作的按钮保持在视野中。
    if (readerWasAbove) window.scrollBy(0, button.getBoundingClientRect().top - top);
  }

  function drawLibrary(host, context) {
    host.innerHTML = render(context.data, { ...context.options, skillGroup: context.skillGroup,
      topicFilter: context.topicFilter, openTopic: context.openTopic });
    const grid = host.querySelector('.audit-library-grid');
    if (context.observer) context.observer.disconnect();
    if (!grid) {
      context.openTopic = '';
      return;
    }
    if (!grid.querySelector('[aria-expanded="true"]')) context.openTopic = '';
    placeReader(grid);
    if (typeof ResizeObserver !== 'undefined') {
      context.observer ??= new ResizeObserver(entries => {
        for (const entry of entries) if (entry.contentRect.width) placeReader(entry.target);
      });
      context.observer.observe(grid);
    }
  }

  function mount(host, data, options = {}) {
    let context = mounted.get(host);
    if (!context) {
      context = { filter: 'pending', topicFilter: 'all', skillGroup: '', skillCategory: '' };
      mounted.set(host, context);
      host.addEventListener('click', event => {
        const button = event.target.closest('button[data-audit-card], [data-audit-filter], [data-audit-skill-group], [data-audit-skill-category], [data-audit-library-state]');
        if (!button) return;
        if (context.data?.topicMode) {
          if (button.dataset.auditCard !== undefined) {
            selectTopic(button, context);
            return;
          }
          const isCategory = button.dataset.auditSkillGroup !== undefined;
          if (isCategory) context.skillGroup = button.dataset.auditSkillGroup;
          else context.topicFilter = button.dataset.auditLibraryState;
          drawLibrary(host, context);
          host.querySelector(isCategory ? '[data-audit-skill-group][aria-pressed="true"]'
            : '[data-audit-library-state][aria-pressed="true"]')?.focus();
          return;
        }
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
    if (data?.topicMode) {
      drawLibrary(host, context);
      return;
    }
    context.observer?.disconnect();
    const selection = inventoryGroups(groupEntries(data?.entries).cards, context.skillGroup, context.skillCategory);
    context.skillGroup = selection.group;
    context.skillCategory = selection.category;
    host.innerHTML = render(data, { ...options, filter: context.filter, skillGroup: context.skillGroup, skillCategory: context.skillCategory });
  }

  const api = { render, groupEntries, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TianShuAudit = api;
})();
