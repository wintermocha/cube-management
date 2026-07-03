import { seedData } from './lib/seed.js';
import { activeIngredients, summarizeInventory, calculateForecast, removeIngredientFromState } from './lib/domain.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
let state = loadState();
let activeTab = 'today';
let pendingIngredientDeleteId = null;

const severityLabels = { ok: '충분', warn: '주의', error: '긴급' };
const statusLabels = { not_tried: '미시도', planned: '예정', testing: '테스트 중', tolerated: '적응 완료', suspected_reaction: '반응 의심', cancelled: '삭제됨' };
const eventLabels = { stock_add: '재고 추가', ingredient_create: '품목 추가', ingredient_delete: '품목 삭제' };
const requestLabels = { add_stock_after_review: '재고 추가 확인', stock_decrement: '재고 차감 확인', cube_lot_delete: '큐브 삭제 확인', single_meal_slot_change: '식단 변경 확인', week_meal_plan_change: '주간 식단 변경 확인', ingredient_status_note: '품목 상태 확인' };
const approvalStatusLabels = { pending: '승인 대기', approved: '승인됨', rejected: '거절됨' };
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const workspaceTabs = [{ id: 'today', label: '오늘', detail: '할 일' }, { id: 'inventory', label: '재고', detail: '추가' }, { id: 'meals', label: '식단', detail: '계획' }, { id: 'records', label: '승인', detail: '기록' }];

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
  const ingredients = activeIngredients(state.ingredients);
  const inventory = summarizeInventory(ingredients, state.cubeLots);
  const forecast = calculateForecast({ ingredients, lots: state.cubeLots, combinations: state.combinations, combinationItems: state.combinationItems, mealPlanSlots: state.mealPlanSlots, startDate: weekStart });
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
      <div id="toast" class="toast app-toast" aria-live="polite"></div>
      <div class="metrics" aria-label="요약 지표">
        ${metricTile('총 보유', `${totalCubes}개`, `${inventory.length}개 품목`, 'neutral')}${metricTile('긴급', `${critical.length}건`, critical.length ? '바로 확인 필요' : '현재 없음', critical.length ? 'error' : 'success')}
        ${metricTile('주의', `${warnings.length}건`, warnings.length ? '재고 낮음' : '안정적', warnings.length ? 'warning' : 'success')}${metricTile('부족 예정', `${shortages.length}건`, `${nextMealCount}개 식단 반영`, shortages.length ? 'error' : 'success')}
      </div>

      <nav class="workspace-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map(tabButton).join('')}</nav>

      ${tabPanel('today', `
      <section class="section section-tight" aria-labelledby="alertTitle">
        <div class="section-head">
          <div><p class="eyebrow">우선순위</p><h2 id="alertTitle">오늘 확인할 것</h2></div>
          <p>부족한 품목은 바로 추가할 수 있어요.</p>
        </div>
        <div class="alert-grid">
          ${alertGroup('긴급 재고', critical, '긴급한 재고가 없어요.', 'error')}
          ${alertGroup('주의 재고', warnings, '주의할 재고가 없어요.', 'warning')}
          ${shortageGroup(shortages)}
        </div>
      </section>`)}

      ${tabPanel('inventory', `
      <section class="section section-tight" aria-labelledby="stockAddTitle">
        <div class="section-head">
          <div><p class="eyebrow">직접 추가</p><h2 id="stockAddTitle">재고 추가</h2></div>
          <p>품목을 고르고 수량을 입력한 뒤 추가하세요.</p>
        </div>
        ${ingredients.length ? `<form id="lotForm" class="form-card stock-add-form">
          <label class="field"><span>품목</span><select id="lotIngredient" name="ingredient_id">${ingredients.map((item) => `<option value="${text(item.id)}">${text(item.name)}</option>`).join('')}</select></label>
          <label class="field"><span>수량</span><input id="lotCount" name="initial_count" type="number" inputmode="numeric" min="1" max="200" value="1"></label>
          <button class="button button-primary" type="submit">추가</button>
        </form>` : emptyState('먼저 품목을 추가해 주세요.')}
      </section>
      <section class="section" aria-labelledby="cubeTitle">
        <div class="section-head">
          <div><p class="eyebrow">냉동실</p><h2 id="cubeTitle">현재 재고</h2></div>
        </div>
        <div class="card-grid inventory-grid">${inventory.map(stockCard).join('') || emptyState('아직 재고가 없어요.')}</div>
      </section>
      <section class="section" aria-labelledby="ingredientTitle">
        <div class="section-head">
          <div><p class="eyebrow">품목 관리</p><h2 id="ingredientTitle">품목 추가/삭제</h2></div>
          <p>안 쓰는 품목은 삭제하면 재고 목록에서 숨겨져요.</p>
        </div>
        <form id="ingredientForm" class="form-card ingredient-form">
          <label class="field"><span>새 품목</span><input id="ingredientName" name="name" autocomplete="off" placeholder="예: 당근"></label>
          <button class="button button-primary" type="submit">품목 추가</button>
        </form>
        <div class="card-grid compact-grid item-management">${ingredients.map(ingredientCard).join('') || emptyState('등록된 품목이 없어요.')}</div>
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
  return `<article class="alert-row is-${item.severity}"><div><b>${text(item.ingredient_name)}</b><span>${text(item.current_count)}개 보유</span></div><button class="button button-small button-secondary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="1">+1개</button></article>`;
}
function shortageRow(item) {
  return `<article class="alert-row action-row is-error"><div><b>${text(item.ingredient_name)}</b><span>${text(item.needed)}개 필요 / ${text(item.available)}개 보유</span></div><button class="button button-small button-primary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="${text(item.shortage)}">${text(item.shortage)}개 추가</button></article>`;
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
  const pending = pendingIngredientDeleteId === item.id;
  return `<article class="data-card ingredient-card"><div><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</div><div class="card-actions"><button class="button button-small ${pending ? 'button-danger' : 'button-secondary'}" type="button" data-delete-ingredient="${text(item.id)}">${pending ? '한 번 더 삭제' : '삭제'}</button></div></article>`;
}
function comboCard(combo) {
  const items = state.combinationItems.filter((item) => item.combination_id === combo.id).map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(', ');
  return `<article class="data-card"><b>${text(combo.name)}</b><span>${text([combo.stage, combo.texture].filter(Boolean).join(' ') || '조합')}</span><small>${items}</small></article>`;
}
function approvalCard(request) {
  const payload = parseJson(request.payload_json);
  const rawText = payload?.raw_text ? `요청: ${payload.raw_text}` : '검토가 필요한 요청이에요.';
  return `<article class="data-card record-card"><b>${label(requestLabels, request.request_type)}</b><span>${label(approvalStatusLabels, request.status)}</span><small>${text(rawText)}</small></article>`;
}
function eventCard(event) {
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${text(event.actor_email)} · ${text(event.source)}</span><small>${text(event.created_at)}</small></article>`;
}
function emptyState(copy) { return `<p class="empty">${text(copy)}</p>`; }
function parseJson(value) { try { return JSON.parse(value); } catch { return null; } }
function bind() {
  document.querySelector('#reset').onclick = () => { state = seedData(); pendingIngredientDeleteId = null; saveState(); };
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.onclick = () => { activeTab = tab.dataset.tab; pendingIngredientDeleteId = null; render(); };
  });
  document.querySelector('#weekStart')?.addEventListener('change', render);
  document.querySelector('#lotForm')?.addEventListener('submit', handleLotSubmit);
  document.querySelector('#ingredientForm')?.addEventListener('submit', handleIngredientSubmit);
  document.querySelectorAll('[data-add-ingredient]').forEach((button) => {
    button.onclick = () => handleQuickAdd(button.dataset.addIngredient, Number(button.dataset.addQuantity || 1));
  });
  document.querySelectorAll('[data-delete-ingredient]').forEach((button) => {
    button.onclick = () => handleIngredientDelete(button.dataset.deleteIngredient);
  });
}
function handleLotSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (addLot(fd.get('ingredient_id'), Number(fd.get('initial_count')), 'manual')) {
    pendingIngredientDeleteId = null;
    saveState();
    showToast('재고를 추가했어요.', 'success');
  }
}
function handleQuickAdd(ingredientId, quantity) {
  if (addLot(ingredientId, quantity, 'manual')) {
    pendingIngredientDeleteId = null;
    saveState();
    showToast(`${quantity}개를 추가했어요.`, 'success');
  }
}
function handleIngredientSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('name') || '').trim();
  if (!name) { showToast('품목명을 입력해 주세요.', 'warning'); return; }
  if (activeIngredients(state.ingredients).some((item) => item.name === name)) { showToast('이미 등록된 품목이에요.', 'warning'); return; }
  const ingredient = { id: id('ing'), household_id: 'home', name, category: '', status: 'planned', notes: '', created_at: now(), updated_at: now() };
  state.ingredients.push(ingredient);
  pendingIngredientDeleteId = null;
  logEvent('ingredient_create', ingredient);
  e.target.reset();
  saveState();
  showToast('품목을 추가했어요.', 'success');
}
function handleIngredientDelete(ingredientId) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('삭제할 품목을 찾지 못했어요.', 'warning'); return; }
  if (activeIngredients(state.ingredients).length <= 1) { showToast('품목은 최소 1개가 필요해요.', 'warning'); return; }
  if (pendingIngredientDeleteId !== ingredientId) {
    pendingIngredientDeleteId = ingredientId;
    render();
    showToast(`${ingredient.name} 삭제는 한 번 더 눌러 확정해요.`, 'warning');
    return;
  }
  const result = removeIngredientFromState(state, ingredientId, now());
  if (!result.removed) { showToast('삭제할 품목을 찾지 못했어요.', 'warning'); return; }
  state = result.state;
  pendingIngredientDeleteId = null;
  logEvent('ingredient_delete', { ingredient_id: ingredientId, ingredient_name: ingredient.name, cleared_lot_count: result.clearedLotCount }, ingredient, null, 'manual');
  saveState();
  showToast(`${ingredient.name} 품목을 삭제했어요.`, 'success');
}
function addLot(ingredient_id, quantity, source='manual') {
  if (!ingredient_id || !Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상 입력해 주세요.', 'warning'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id, made_at: new Date().toISOString().slice(0,10), expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: null, storage_location: '', created_at: now(), updated_at: now() };
  state.cubeLots.push(lot);
  return logEvent('stock_add', { lot }, null, lot, source);
}
function showToast(message, tone = 'info') { const toast = document.querySelector('#toast'); if (toast) { toast.dataset.tone = tone; toast.textContent = message; } }
render();
