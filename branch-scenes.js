/* 天枢分支意境：手绘 SVG 背景，仅用主题色；不读业务数据、不发网络请求。 */
(() => {
  const path = (d, cls = '', extra = '') => `<path class="${cls}" d="${d}" ${extra}/>`;
  const group = (cls, content) => `<g class="${cls}">${content}</g>`;
  const dot = (x, y, r = 2) => `<circle cx="${x}" cy="${y}" r="${r}" class="ts-star"/>`;
  const lines = (items, cls = '') => items.map(d => path(d, cls)).join('');
  // 共享的长风与岸线为留白定方向；每个分支的主体保持独立。
  const wind = lines([
    'M18 294 C156 302 220 204 352 206 S535 136 624 118',
    'M64 320 C194 302 249 232 378 233 S552 168 632 153',
    'M10 262 C144 282 205 179 324 184 S486 116 588 94'
  ], 'ts-fine');
  const feather = path('M321 177 C280 123 215 103 158 92 C197 145 243 176 310 192 Z M337 182 C401 178 470 125 524 96 C485 159 426 210 334 199 Z', 'ts-wash') +
    path('M315 181 Q330 155 349 150 Q352 132 365 133 L381 138 L366 143 Q364 160 348 179 L329 202 L304 236 L307 212 L286 224 L315 191 Z', 'ts-wash') +
    lines(['M190 112 Q251 154 309 180', 'M213 140 Q265 169 306 188', 'M493 123 Q425 178 351 191',
      'M463 163 Q411 194 351 198'], 'ts-fine');
  const scenes = {
    freedom: { label: '扶摇 · 自由', art: group('ts-drift', wind) + group('ts-soar', feather) + dot(520, 76) },
    thesis: { label: '文心 · 论文', art:
      path('M138 122 Q229 99 323 145 Q414 99 514 122 L514 260 Q411 239 323 283 Q234 239 138 260 Z', 'ts-wash') +
      lines(['M138 122 Q229 99 323 145 Q414 99 514 122 L514 260 Q411 239 323 283 Q234 239 138 260 Z',
        'M323 145 L323 283', 'M126 138 L126 274 Q224 255 323 296 Q422 255 526 274 L526 138'], 'ts-ink') +
      group('ts-breathe', lines(['M167 153 Q229 144 294 169', 'M167 178 Q231 170 294 194', 'M167 204 Q227 195 272 213',
        'M354 169 Q416 145 484 153', 'M354 194 Q416 170 484 178', 'M354 219 Q405 199 452 203'], 'ts-fine')) +
      path('M487 85 Q514 44 546 42 Q537 83 502 110 M492 104 L475 132 M507 86 L530 64', 'ts-ink') },
    invest: { label: '观澜 · A股', art:
      lines(['M36 210 L137 139 L186 171 L266 89 L364 179 L422 145 L586 213',
        'M210 143 L266 89 L285 134 L303 124', 'M55 231 Q221 209 320 230 T617 229'], 'ts-fine') +
      group('ts-tide', lines(['M28 256 C109 232 162 282 249 256 S391 232 474 256 S580 279 640 254',
        'M-28 284 C54 260 109 310 195 284 S337 260 420 284 S539 309 620 283',
        'M40 311 Q147 289 267 312 T590 312'], 'ts-ink')) +
      '<circle cx="444" cy="87" r="29" class="ts-fine"/>' },
    knowledge: { label: '石渠 · 库藏', art:
      path('M137 101 H172 V260 H137 Z M184 87 H228 V260 H184 Z M240 116 H272 V260 H240 Z M284 77 H328 V260 H284 Z M347 113 L381 103 L426 251 L392 261 Z', 'ts-wash') +
      lines(['M137 101 H172 V260 H137 Z', 'M184 87 H228 V260 H184 Z', 'M240 116 H272 V260 H240 Z',
        'M284 77 H328 V260 H284 Z', 'M347 113 L381 103 L426 251 L392 261 Z',
        'M131 272 H487', 'M145 127 H163 M145 234 H163 M193 119 H219 M193 229 H219 M292 108 H320 M292 231 H320'], 'ts-ink') +
      group('ts-drift', lines(['M52 297 H280 Q323 297 345 318 H579', 'M72 310 H273 Q315 310 338 331 H599'], 'ts-fine')) +
      group('ts-breathe', path('M456 115 V226 M440 132 H474 M441 208 H474', 'ts-fine') + dot(456, 104)) },
    intel: { label: '灵犀 · 巧思', art:
      '<ellipse cx="334" cy="178" rx="147" ry="51" transform="rotate(-31 334 178)" class="ts-fine"/><ellipse cx="334" cy="178" rx="147" ry="51" transform="rotate(31 334 178)" class="ts-fine"/>' +
      lines(['M118 245 L206 204 L273 237 L334 178 L413 150 L509 101', 'M206 204 L230 107 L334 178 L408 269 L509 225'], 'ts-fine') +
      group('ts-breathe', dot(334, 178, 5) + dot(206, 204, 3) + dot(413, 150, 3) + dot(230, 107) + dot(509, 101)) +
      path('M334 149 V160 M334 196 V207 M306 178 H316 M352 178 H363', 'ts-ink') },
    content: { label: '飞鸿 · 媒体', art: group('ts-drift', wind) +
      group('ts-glide', lines(['M183 152 Q218 135 237 153 Q244 126 275 112',
        'M302 116 Q338 100 360 121 Q369 93 407 80', 'M418 165 Q445 148 464 169 Q472 145 500 138'], 'ts-ink')) +
      lines(['M400 248 Q433 254 461 240', 'M390 264 Q442 277 480 250', 'M379 282 Q444 300 500 263'], 'ts-fine') },
    docs: { label: '简牍 · 资料', art:
      [0, 1, 2, 3, 4, 5, 6].map(i => {
        const x = 166 + i * 38, y = 87 + Math.abs(3 - i) * 6;
        return `<rect x="${x}" y="${y}" width="28" height="176" rx="9" class="ts-wash"/>` +
          path(`M${x + 10} ${y + 26} V${y + 80} M${x + 18} ${y + 28} V${y + 65}`, 'ts-fine');
      }).join('') +
      group('ts-breathe', lines(['M147 137 Q305 117 444 137', 'M147 236 Q305 216 444 236'], 'ts-ink')) +
      path('M455 270 Q495 246 509 209 Q476 222 455 270 L443 293 M462 259 L492 229', 'ts-ink') },
    assistant: { label: '晷刻 · 助理', art:
      '<ellipse cx="322" cy="224" rx="178" ry="74" class="ts-fine"/><ellipse cx="322" cy="224" rx="154" ry="58" class="ts-ink"/>' +
      lines(['M322 223 L354 87 L370 224 Z', 'M167 224 H184 M460 224 H477 M322 166 V177 M322 270 V283',
        'M205 184 L217 192 M427 183 L416 191 M205 264 L217 256 M426 265 L414 256'], 'ts-ink') +
      group('ts-shadow', path('M322 223 L216 260 L355 234 Z', 'ts-wash')) +
      '<path d="M178 138 Q318 36 467 137" class="ts-fine" stroke-dasharray="2 12"/>' + dot(450, 121, 3) },
    product: { label: '匠心 · 产品', art:
      lines(['M176 237 V130 L295 70 L413 130 V237 L295 297 Z', 'M176 130 L295 193 L413 130 M295 193 V297',
        'M226 105 L346 168 V210 L319 224 V181 L202 119', 'M245 163 V210 L271 223 V176',
        'M147 119 V248 M137 119 H157 M137 248 H157', 'M430 144 L466 126 M449 250 L483 232'], 'ts-ink') +
      path('M176 130 L295 193 L295 297 L176 237 Z', 'ts-wash') +
      path('M142 278 L266 340 M142 270 V286 M266 332 V348', 'ts-fine') },
    game: { label: '逍遥 · 游戏', art:
      lines(['M53 276 Q113 230 183 263 Q221 192 278 234 Q325 214 368 259 Q442 220 502 257 Q560 231 610 276',
        'M78 297 Q163 267 244 290 T431 286 T600 303', 'M106 116 H166 Q174 95 190 104 Q205 81 222 104 H255'], 'ts-fine') +
      path('M321 66 L389 111 L345 174 L285 128 Z M321 66 L345 174 M285 128 L389 111 M345 174 Q399 209 365 234 Q335 254 381 274', 'ts-ink') +
      path('M460 178 Q502 149 543 178 Q507 208 460 178 L440 160 V196 Z', 'ts-wash') },
    annual: { label: '轻体', art:
      group('ts-breathe', path('M319 230 Q279 127 414 69 Q434 184 319 230 Z', 'ts-wash') +
        lines(['M309 261 Q337 180 393 101', 'M332 206 L380 171 M346 176 L354 132',
          'M311 221 Q239 216 213 143 Q292 143 311 221 Z', 'M243 173 L311 221'], 'ts-ink')) +
      group('ts-tide', lines(['M136 278 Q241 252 322 277 T536 278', 'M171 301 Q266 280 346 300 T502 302'], 'ts-fine')) },
    // 五个主页面与分支共用 640×360 画幅，主体偏右，长线延伸入页面留白。
    overview: { label: '总览', art: group('ts-drift', wind) +
      '<circle cx="460" cy="180" r="114" class="ts-fine"/><ellipse cx="460" cy="180" rx="158" ry="52" transform="rotate(-28 460 180)" class="ts-fine"/>' +
      group('ts-orbit', '<circle cx="460" cy="180" r="91" class="ts-fine" stroke-dasharray="1 13"/>' +
        path('M365 117 A114 114 0 0 1 524 86 M555 243 A114 114 0 0 1 396 274', 'ts-ink')) +
      lines(['M74 273 L263 221 L371 232 L460 180 L512 109 L581 124', 'M371 232 L392 103 L460 180 L544 252'], 'ts-fine') +
      path('M460 156 L465 175 L484 180 L465 185 L460 204 L455 185 L436 180 L455 175 Z', 'ts-wash') +
      group('ts-breathe', [[371,232],[392,103],[512,109],[581,124],[544,252]].map(([x,y]) => dot(x,y,3)).join('')) },
    outputs: { label: '成果', art: group('ts-drift', wind) +
      group('ts-unfurl', path('M319 104 Q433 57 568 86 L568 248 Q446 219 329 271 L310 271 V119 Q310 107 319 104 Z', 'ts-wash') +
        lines(['M319 104 Q338 99 338 115 L310 126', 'M568 86 Q550 82 550 103 V252',
          'M329 271 Q347 265 347 280 Q326 292 310 284 V271', 'M368 133 Q445 109 520 119',
          'M368 162 Q437 141 497 145', 'M368 192 Q446 167 520 178'], 'ts-ink')) +
      lines(['M172 307 Q365 275 593 296', 'M238 330 Q415 294 620 315'], 'ts-fine') +
      group('ts-breathe', '<circle cx="527" cy="235" r="24" class="ts-fine"/>' +
        path('M516 228 L527 221 L538 228 V242 L527 249 L516 242 Z', 'ts-ink')) },
    changes: { label: '变更', art: group('ts-drift', wind) +
      lines(['M43 285 C185 296 254 244 347 215 S443 70 588 73',
        'M347 215 C402 201 431 147 485 157 S554 192 613 161',
        'M347 215 C417 196 436 275 506 263 S565 230 615 244'], 'ts-ink') +
      path('M43 285 C185 296 254 244 347 215 S443 70 588 73', 'ts-route-trace') +
      [[347,215],[422,149],[495,88],[588,73],[485,157],[506,263],[594,246]].map(([x,y]) =>
        `<circle cx="${x}" cy="${y}" r="7" class="ts-wash"/>`).join('') +
      lines(['M461 111 Q518 75 574 93', 'M477 285 Q540 286 579 265'], 'ts-fine') },
    queue: { label: '待办', art: group('ts-drift', wind) +
      path('M75 310 C242 333 292 257 357 257 S430 216 423 181 S463 116 503 120 S558 82 574 57', 'ts-fine') +
      path('M75 310 C242 333 292 257 357 257 S430 216 423 181 S463 116 503 120 S558 82 574 57', 'ts-route-trace') +
      [[357,257],[423,181],[503,120],[574,57]].map(([x,y],i) =>
        `<circle cx="${x}" cy="${y}" r="${i===1?21:13}" class="ts-ink"/>`).join('') +
      path('M351 257 L356 262 L365 251', 'ts-ink') + group('ts-sequence', dot(423,181,5)) +
      lines(['M458 180 H519', 'M457 194 H491', 'M390 255 H468', 'M525 120 H590'], 'ts-fine') },
    cmd: { label: '指令', art: group('ts-drift', wind) +
      path('M24 291 C166 329 343 311 424 203 S494 81 583 63', 'ts-fine') +
      path('M24 291 C166 329 343 311 424 203 S494 81 583 63', 'ts-route-trace') +
      group('ts-signal', path('M376 157 L533 105 L486 237 L448 189 Z M448 189 L533 105 M448 189 L440 217 L465 204', 'ts-wash')) +
      lines(['M528 180 Q550 203 529 231', 'M550 164 Q590 203 553 247',
        'M335 216 L391 195', 'M316 242 L393 212'], 'ts-ink') +
      group('ts-breathe', dot(583,63,4) + '<circle cx="583" cy="63" r="14" class="ts-fine"/>') }
  };
  const theme = getComputedStyle(document.documentElement);
  const cyan = theme.getPropertyValue('--ceo').trim() || '#38bdf8';
  const blue = theme.getPropertyValue('--accent').trim() || '#4f8cff';
  // 同一份图形用于 SVG 动效层和标题处静态背景图，避免两套图形偏离。
  const artStyle = `.ts-fine{fill:none;stroke:${blue};stroke-width:1}.ts-ink{fill:none;stroke:${cyan};stroke-width:1.5}.ts-wash{fill:${cyan};fill-opacity:.07;stroke:${cyan};stroke-width:1.3}.ts-star{fill:${cyan};stroke:none}`;
  const svg = (key, css = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scenes[key].viewBox || '0 0 640 360'}" class="${css}" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><style>${artStyle}</style>${scenes[key].art}</svg>`;
  const layer = document.createElement('div');
  layer.className = 'ts-atmosphere';
  layer.setAttribute('aria-hidden', 'true');
  document.body.prepend(layer);
  let current = '';
  let userPaused = false;
  try { userPaused = localStorage.getItem('tianshu-motion-paused') === '1'; } catch (_) {}
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'ts-motion-control';
  const meta = document.querySelector('.top .meta');
  if (meta) meta.append(control);
  function syncMotion() {
    document.body.classList.toggle('ts-motion-paused', userPaused || document.hidden || reduce.matches);
    const label = reduce.matches ? '动效已随系统静止' : userPaused ? '播放背景动效' : '暂停背景动效';
    control.textContent = reduce.matches ? '静态' : userPaused ? '动效停' : '动效开';
    control.title = label;
    control.setAttribute('aria-label', '暂停背景动效');
    control.disabled = reduce.matches;
    control.setAttribute('aria-pressed', String(userPaused || reduce.matches));
  }
  control.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('tianshu-motion-paused', userPaused ? '1' : '0'); } catch (_) {}
    syncMotion();
  });
  document.addEventListener('visibilitychange', syncMotion);
  reduce.addEventListener('change', syncMotion);
  syncMotion();
  function show(tab, paused = false) {
    const candidate = tab.replace(/^agent:/, '');
    const key = Object.hasOwn(scenes, candidate) ? candidate : 'overview';
    document.body.dataset.scene = key;
    document.body.classList.toggle('ts-scene-archived', paused);
    if (key === current) return;
    current = key;
    layer.innerHTML = svg(key, 'ts-scene-corner') + `<svg class="ts-scene-edge" viewBox="0 0 640 360" aria-hidden="true" focusable="false"><style>${artStyle}</style>${wind}</svg>`;
    document.body.style.setProperty('--ts-scene-image', `url("data:image/svg+xml,${encodeURIComponent(svg(key))}")`);
  }
  window.TianShuScenes = { show };
})();
