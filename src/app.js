import { seedData } from './lib/seed.js';
import { summarizeInventory, calculateForecast, parseKoreanAddStock, dedupeKey } from './lib/domain.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
let state = loadState();
let undoTimer = null;
let activeTab = 'today';

const severityLabels = { ok: '충분', warn: '주의', error: '긴급' };
const statusLabels = { not_tried: '미시도', planned: '예정', testing: '테스트 중', tolerated: '적응 완료', suspected_reaction: '반응 의심', cancelled: '취소' };
const eventLabels = { stock_add: '재고 추가', stock_add_rollback: '자동 추가 취소', ingredient_create: '재료 등록' };
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const workspaceTabs = [{ id: 'today', label: '오늘', detail: '요약' }, { id: 'inventory', label: '재고', detail: '큐브' }, { id: 'meals', label: '식단', detail: '계획' }, { id: 'records', label: '기록', detail: '내역' }];

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  try { return saved ? JSON.parse(saved) : seedData(); } catch { localStorage.removeItem(STORAGE_KEY); return seedData(); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function actor() { return 'caregiver-a@example.com'; }
function text(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]); }
function label(map, value) { return map[value] || text(value); }
function logEvent(type, payload, before = null, after = null, source = 'manual') {
  const event = { id: id('evt'), household_id: 'home', actor_email: actor(), source, type, payload_json: JSON.stringify(payload), before_json: before && JSON.stringify(before), after_json: after && JSON.stringify(after), created_at: now(), undo_event_id: null };
  state.events.unshift(event);
  return event;
}

function render() {
  const weekStart = document.querySelector('#weekStart')?.value || '2026-07-03';
  const inventory = summarizeInventory(state.ingredients, state.cubeLots);
  const forecast = calculateForecast({ ingredients: state.ingredients, lots: state.cubeLots, combinations: state.combinations, combinationItems: state.combinationItems, mealPlanSlots: state.mealPlanSlots, startDate: weekStart });
  const critical = inventory.filter((item) => item.severity === 'error');
  const warnings = inventory.filter((item) => item.severity === 'warn');
  const shortages = forecast.filter((item) => item.shortage > 0);
  const totalCubes = inventory.reduce((sum, item) => sum + item.current_count, 0);
  const nextMealCount = state.mealPlanSlots.filter((slot) => slot.status !== 'cancelled').length;
  document.querySelector('#app').innerHTML = `
    <a class="skip-link" href="#main">본문으로 이동</a>
    <header class="topbar">
      <div class="brand"><strong>이유식 큐브</strong><span>재고와 식단 관리</span></div>
      <button id="reset" class="button button-secondary" type="button">초기화</button>
    </header>
    <main id="main" class="app-shell">
      <section class="workbench" aria-labelledby="workspaceTitle">
        <div class="workbench-copy"><p class="eyebrow">오늘</p><h1 id="workspaceTitle">${text(state.childProfile.display_name)}의 큐브를 확인하세요</h1><p>부족한 재료와 다음 식단을 먼저 보여드려요.</p></div>
        <div class="quick-add" aria-labelledby="quickAddTitle">
          <div><p class="eyebrow">빠른 입력</p><h2 id="quickAddTitle">문장으로 추가</h2></div>
          <form id="aiForm" class="quick-form">
            <label class="sr-only" for="aiRaw">추가할 재고 내용</label><input id="aiRaw" name="raw" autocomplete="off" placeholder="예: 소고기 큐브 6개 만들었어">
            <button class="button button-primary" type="submit">추가하기</button>
          </form>
          <p class="hint">1-30개 재고 추가만 바로 반영해요. 삭제와 권한 요청은 승인으로 넘깁니다.</p>
          <div id="toast" class="toast" aria-live="polite"></div>
        </div>
      </section>

      <nav class="workspace-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map(tabButton).join('')}</nav>

      <div class="metrics" aria-label="요약 지표">
        ${metricTile('총 보유', `${totalCubes}개`, `${inventory.length}개 재료`, 'neutral')}${metricTile('긴급', `${critical.length}건`, critical.length ? '바로 확인 필요' : '현재 없음', critical.length ? 'error' : 'success')}
        ${metricTile('주의', `${warnings.length}건`, warnings.length ? '재고 낮음' : '안정적', warnings.length ? 'warning' : 'success')}${metricTile('부족 예정', `${shortages.length}건`, `${nextMealCount}개 식단 반영`, shortages.length ? 'error' : 'success')}
      </div>

      ${tabPanel('today', `
      <section class="section section-tight" aria-labelledby="alertTitle">
        <div class="section-head">
          <div><p class="eyebrow">우선순위</p><h2 id="alertTitle">오늘 확인할 것</h2></div>
          <p>오늘 처리할 재고만 모았어요.</p>
        </div>
        <div class="alert-grid">
          ${alertGroup('긴급 재고', critical, '긴급한 재고가 없어요.', 'error')}
          ${alertGroup('주의 재고', warnings, '주의할 재고가 없어요.', 'warning')}
          ${shortageGroup(shortages)}
        </div>
      </section>`)}

      ${tabPanel('inventory', `
      <section class="section section-tight" aria-labelledby="cubeTitle">
        <div class="section-head section-head-inline">
          <div><p class="eyebrow">냉동실</p><h2 id="cubeTitle">큐브 재고</h2></div>
          <form id="lotForm" class="inline-form">
            <label class="sr-only" for="lotIngredient">재료</label><select id="lotIngredient" name="ingredient_id">${state.ingredients.map((item) => `<option value="${text(item.id)}">${text(item.name)}</option>`).join('')}</select>
            <label class="sr-only" for="lotCount">추가 수량</label><input id="lotCount" name="initial_count" type="number" min="1" max="200" value="1">
            <button class="button button-primary" type="submit">추가하기</button>
          </form>
        </div>
        <div class="card-grid inventory-grid">${inventory.map(stockCard).join('')}</div>
      </section>
      <section class="section" aria-labelledby="ingredientTitle">
        <div class="section-head">
          <div><p class="eyebrow">재료 상태</p><h2 id="ingredientTitle">재료</h2></div>
        </div>
        <form id="ingredientForm" class="inline-form ingredient-form">
          <label class="sr-only" for="ingredientName">새 재료명</label><input id="ingredientName" name="name" placeholder="새 재료">
          <label class="sr-only" for="ingredientStatus">상태</label><select id="ingredientStatus" name="status">${Object.keys(statusLabels).filter((item) => item !== 'cancelled').map((item) => `<option value="${item}">${statusLabels[item]}</option>`).join('')}</select>
          <button class="button button-primary" type="submit">등록하기</button>
        </form>
        <div class="card-grid compact-grid">${state.ingredients.map(ingredientCard).join('')}</div>
      </section>`)}

      ${tabPanel('meals', `
      <section class="section section-tight" aria-labelledby="mealTitle">
        <div class="section-head section-head-inline">
          <div><p class="eyebrow">7일 계획</p><h2 id="mealTitle">식단표</h2></div>
          <label class="date-control">시작일 <input id="weekStart" value="${text(weekStart)}" type="date"></label>
        </div>
        <div class="card-grid meal-grid">${state.mealPlanSlots.map(slotCard).join('')}</div>
      </section>
      <section class="section" aria-labelledby="comboTitle">
        <div class="section-head">
          <div><p class="eyebrow">레시피</p><h2 id="comboTitle">조합</h2></div>
        </div>
        <div class="card-grid compact-grid">${state.combinations.map(comboCard).join('')}</div>
      </section>`)}

      ${tabPanel('records', `
      <section class="section section-tight" aria-labelledby="activityTitle">
        <div class="section-head">
          <div><p class="eyebrow">기록</p><h2 id="activityTitle">승인과 최근 기록</h2></div>
        </div>
        <div class="activity-grid">
          <div>
            <h3>승인 대기</h3>
            <div class="card-grid compact-grid">${state.approvalRequests.map(approvalCard).join('') || emptyState('승인 대기 요청이 없어요.')}</div>
          </div>
          <div>
            <h3>최근 이벤트</h3>
            <div class="card-grid compact-grid">${state.events.slice(0, 10).map(eventCard).join('') || emptyState('아직 기록이 없어요.')}</div>
          </div>
        </div>
      </section>`)}
    </main>`;
  bind();
}
function tabButton(tab) {
  const selected = tab.id === activeTab;
  return `<button id="tab-${tab.id}" class="tab-button${selected ? ' is-active' : ''}" type="button" role="tab" aria-label="${text(tab.label)}" aria-selected="${selected}" aria-controls="panel-${tab.id}" data-tab="${tab.id}"><b>${text(tab.label)}</b><span>${text(tab.detail)}</span></button>`;
}
function tabPanel(id, content) { return `<div id="panel-${id}" class="tab-panel" role="tabpanel" aria-labelledby="tab-${id}"${activeTab === id ? '' : ' hidden'}>${content}</div>`; }
function metricTile(labelText, value, detail, tone) { return `<article class="metric metric-${tone}"><span>${text(labelText)}</span><strong>${text(value)}</strong><small>${text(detail)}</small></article>`; }
function alertGroup(title, items, emptyCopy, tone) { return `<div class="alert-group alert-${tone}"><h3>${text(title)}</h3>${items.map(compactStockRow).join('') || emptyState(emptyCopy)}</div>`; }
function shortageGroup(items) { return `<div class="alert-group alert-error"><h3>부족 예정</h3>${items.map(shortageRow).join('') || emptyState('부족 예정이 없어요.')}</div>`; }
function compactStockRow(item) {
  return `<article class="alert-row is-${item.severity}"><div><b>${text(item.ingredient_name)}</b><span>${text(item.current_count)}개 보유</span></div><em>${severityLabels[item.severity]}</em></article>`;
}
function shortageRow(item) {
  return `<article class="alert-row is-error"><div><b>${text(item.ingredient_name)}</b><span>${text(item.needed)}개 필요 / ${text(item.available)}개 보유</span></div><em>${text(item.shortage)}개 부족</em></article>`;
}
function stockCard(item) {
  return `<article class="data-card inventory-card is-${item.severity}"><div><b>${text(item.ingredient_name)}</b><span>${text(item.category || '카테고리 없음')}</span></div><strong>${text(item.current_count)}개</strong><em>${severityLabels[item.severity]}${item.empty_label ? ` · ${text(item.empty_label)}` : ''}</em></article>`;
}
function slotCard(slot) {
  const combo = state.combinations.find((item) => item.id === slot.combination_id);
  const ingredient = state.ingredients.find((item) => item.id === slot.ingredient_id);
  return `<article class="data-card meal-card"><b>${text(slot.date)} ${text(slot.meal_type)}</b><span>${text(combo?.name || ingredient?.name || '비어 있어요')}</span><em>${label(statusLabels, slot.status)}</em></article>`;
}
function ingredientCard(item) {
  return `<article class="data-card"><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</article>`;
}
function comboCard(combo) {
  const items = state.combinationItems.filter((item) => item.combination_id === combo.id).map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(', ');
  return `<article class="data-card"><b>${text(combo.name)}</b><span>${text([combo.stage, combo.texture].filter(Boolean).join(' ') || '조합')}</span><small>${items}</small></article>`;
}
function approvalCard(request) {
  const payload = parseJson(request.payload_json);
  const rawText = payload?.raw_text ? `요청: ${payload.raw_text}` : request.request_type;
  return `<article class="data-card record-card"><b>${text(request.request_type)}</b><span>${text(request.status)}</span><small>${text(rawText)}</small></article>`;
}
function eventCard(event) {
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${text(event.actor_email)} · ${text(event.source)}</span><small>${text(event.created_at)}</small></article>`;
}
function emptyState(copy) { return `<p class="empty">${text(copy)}</p>`; }
function parseJson(value) { try { return JSON.parse(value); } catch { return null; } }
function bind() {
  document.querySelector('#reset').onclick = () => { state = seedData(); saveState(); };
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.onclick = () => { activeTab = tab.dataset.tab; render(); };
  });
  document.querySelector('#weekStart').onchange = render;
  document.querySelector('#lotForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (addLot(fd.get('ingredient_id'), Number(fd.get('initial_count')), 'manual')) {
      saveState();
      showToast('재고를 추가했어요.', 'success');
    }
  };
  document.querySelector('#ingredientForm').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) { showToast('재료명을 입력해 주세요.', 'warning'); return; }
    const ingredient = { id: id('ing'), household_id: 'home', name, category: '', status: String(fd.get('status') || 'planned'), notes: '', created_at: now(), updated_at: now() };
    state.ingredients.push(ingredient);
    logEvent('ingredient_create', ingredient);
    e.target.reset();
    saveState();
    showToast('재료를 등록했어요.', 'success');
  };
  document.querySelector('#aiForm').onsubmit = handleAi;
}
function addLot(ingredient_id, quantity, source='manual') {
  if (!ingredient_id || !Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상 입력해 주세요.', 'warning'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id, made_at: new Date().toISOString().slice(0,10), expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: null, storage_location: '', created_at: now(), updated_at: now() };
  state.cubeLots.push(lot);
  const event = logEvent('stock_add', { lot }, null, lot, source);
  return event;
}
function handleAi(e) {
  e.preventDefault();
  const raw_text = new FormData(e.target).get('raw');
  const intent = parseKoreanAddStock(raw_text, state.ingredients);
  const command = { id: id('cmd'), household_id: 'home', actor_email: actor(), raw_text, parsed_intent_json: JSON.stringify(intent), validation_result_json: '{}', status: 'rejected', event_id: null, dedupe_key: null, model_name: 'local-rule-parser', created_at: now() };
  if (intent.type === 'add_stock') {
    command.dedupe_key = dedupeKey({ household_id: 'home', actor_email: actor(), intent });
    const duplicate = state.aiCommands.find(c => c.dedupe_key === command.dedupe_key && Date.now() - Date.parse(c.created_at) < 60000);
    if (duplicate) { command.status = 'rejected'; command.validation_result_json = JSON.stringify({ reason: 'duplicate_within_60s' }); state.aiCommands.unshift(command); saveState(); showToast('60초 안에 같은 요청을 이미 처리했어요.', 'warning'); return; }
    const event = addLot(intent.ingredient_id, intent.quantity, 'ai');
    if (!event) return;
    command.status = 'auto_applied'; command.event_id = event.id;
    state.aiCommands.unshift(command); saveState(); showUndo(command, event);
  } else if (intent.type === 'approval') {
    const req = { id: id('apr'), household_id: 'home', actor_email: actor(), request_type: intent.request_type, payload_json: JSON.stringify({ raw_text, intent }), status: 'pending', reviewer_email: null, created_at: now(), reviewed_at: null };
    state.approvalRequests.unshift(req); command.status = 'pending_approval'; state.aiCommands.unshift(command); saveState(); showToast(intent.reason, 'warning');
  } else { state.aiCommands.unshift(command); saveState(); showToast(intent.reason, 'warning'); }
}
function showUndo(command, event) { const toast = document.querySelector('#toast'); if (!toast) return; toast.dataset.tone = 'success'; toast.innerHTML = '자동으로 추가했어요. <button id="undoAi" class="button button-link" type="button">취소하기</button>'; clearTimeout(undoTimer); document.querySelector('#undoAi').onclick = () => rollbackAi(command, event); undoTimer = setTimeout(()=>{ const t=document.querySelector('#toast'); if(t) t.textContent=''; }, 3000); }
function rollbackAi(command, event) { const payload = JSON.parse(event.payload_json); const lot = state.cubeLots.find(l=>l.id===payload.lot.id); if (lot) lot.remaining_count = 0; event.undo_event_id = 'rolled-back'; command.status = 'rolled_back'; logEvent('stock_add_rollback', { original_event_id: event.id }, payload.lot, null, 'ai'); saveState(); showToast('자동 추가를 취소했어요.', 'success'); }
function showToast(message, tone = 'info') { const toast = document.querySelector('#toast'); if (toast) { toast.dataset.tone = tone; toast.textContent = message; } }
render();
