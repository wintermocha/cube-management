import { seedData } from './lib/seed.js';
import { activeIngredients, summarizeInventory, calculateForecast, removeIngredientFromState, removeCubeLotFromState } from './lib/domain.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
let state = loadState();
let activeTab = 'today';
let pendingIngredientDeleteId = null;
let pendingLotDeleteId = null;
let expandedStockId = null;

const severityLabels = { ok: '충분', warn: '주의', error: '긴급' };
const statusLabels = { not_tried: '미시도', planned: '예정', testing: '테스트 중', tolerated: '적응 완료', suspected_reaction: '반응 의심', cancelled: '삭제됨' };
const eventLabels = { stock_add: '재고 추가', cube_lot_delete: '재고 삭제', ingredient_create: '품목 추가', ingredient_delete: '품목 삭제' };
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const workspaceTabs = [{ id: 'today', label: '오늘', detail: '할 일' }, { id: 'inventory', label: '재고', detail: '추가' }, { id: 'meals', label: '식단', detail: '계획' }, { id: 'records', label: '기록', detail: '변경' }];
const workspaceCopy = {
  today: { eyebrow: '우선순위', title: '오늘 확인할 것', body: '긴급, 주의, 부족 예정 큐브만 빠르게 확인해요.' },
  inventory: { eyebrow: '냉동실', title: '재고 추가와 목록', body: '만든 날짜, 수량, 설명을 같이 남겨요.' },
  meals: { eyebrow: '7일 계획', title: '식단표', body: '앞으로 쓸 큐브 수량을 기준으로 부족분을 계산해요.' },
  records: { eyebrow: '변경 기록', title: '최근 기록', body: '직접 반영된 변경만 남겨요.' },
};

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
  const nextMealCount = state.mealPlanSlots.filter((slot) => slot.status !== 'cancelled').length;
  const currentCopy = workspaceCopy[activeTab] || workspaceCopy.today;
  document.querySelector('#app').innerHTML = `
    <a class="skip-link" href="#main">본문으로 이동</a>
    <main id="main" class="app-shell">
      <div id="toast" class="toast app-toast" aria-live="polite"></div>
      <section class="workspace-hero" aria-labelledby="workspaceTitle">
        <p class="eyebrow">${text(currentCopy.eyebrow)}</p>
        <h1 id="workspaceTitle">${text(currentCopy.title)}</h1>
        <p>${text(currentCopy.body)}</p>
      </section>
      <div class="metrics metrics-alerts" aria-label="요약 지표">
        ${metricTile('긴급', `${critical.length}건`, critical.length ? '바로 확인 필요' : '현재 없음', critical.length ? 'error' : 'success')}
        ${metricTile('주의', `${warnings.length}건`, warnings.length ? '재고 낮음' : '안정적', warnings.length ? 'warning' : 'success')}${metricTile('부족 예정', `${shortages.length}건`, `${nextMealCount}개 식단 반영`, shortages.length ? 'error' : 'success')}
      </div>

      ${tabPanel('today', `
      <section class="section section-tight" aria-labelledby="alertTitle">
        <div class="section-head">
          <div><p class="eyebrow">큐브별 상태</p><h2 id="alertTitle">바로 볼 재고</h2></div>
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
          <label class="field field-full"><span>설명</span><textarea id="lotDescription" name="description" rows="3" placeholder="예: 오전에 만든 묽은 큐브, A칸 앞쪽"></textarea></label>
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
          <div><p class="eyebrow">기록</p><h2 id="activityTitle">최근 변경</h2></div>
        </div>
        <div class="card-grid compact-grid">${state.events.slice(0, 12).map(eventCard).join('') || emptyState('아직 기록이 없어요.')}</div>
      </section>`)}
      <nav class="workspace-tabs bottom-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map(tabButton).join('')}</nav>
    </main>`;
  bind();
}
function tabButton(tab) {
  const selected = tab.id === activeTab;
  return `<button id="tab-${tab.id}" class="tab-button${selected ? ' is-active' : ''}" type="button" role="tab" aria-label="${text(tab.label)}" aria-selected="${selected}" aria-controls="panel-${tab.id}" data-tab="${tab.id}"><b>${text(tab.label)}</b><span>${text(tab.detail)}</span></button>`;
}
function tabPanel(id, content) { return `<div id="panel-${id}" class="tab-panel" role="tabpanel" aria-labelledby="tab-${id}"${activeTab === id ? '' : ' hidden'}>${content}</div>`; }
function metricTile(labelText, value, detail, tone) { return `<article class="metric metric-${tone}"><span>${text(labelText)}</span><strong>${text(value)}</strong><small>${text(detail)}</small></article>`; }
function alertGroup(title, items, emptyCopy, tone) { return `<div class="alert-group alert-${tone}"><h3>${text(title)}</h3><div class="cube-box-list">${items.map(compactStockRow).join('') || emptyState(emptyCopy)}</div></div>`; }
function shortageGroup(items) { return `<div class="alert-group alert-error"><h3>부족 예정</h3><div class="cube-box-list">${items.map(shortageRow).join('') || emptyState('부족 예정이 없어요.')}</div></div>`; }
function compactStockRow(item) {
  return `<article class="alert-row cube-box is-${item.severity}"><div><b>${text(item.ingredient_name)}</b><span>${text(item.current_count)}개 보유</span></div><button class="button button-small button-secondary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="1">+1개</button></article>`;
}
function shortageRow(item) {
  return `<article class="alert-row cube-box action-row is-error"><div><b>${text(item.ingredient_name)}</b><span>${text(item.needed)}개 필요 / ${text(item.available)}개 보유</span></div><button class="button button-small button-primary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="${text(item.shortage)}">${text(item.shortage)}개 추가</button></article>`;
}
function stockCard(item) {
  const expanded = expandedStockId === item.ingredient_id;
  return `<article class="data-card inventory-card is-${item.severity}${expanded ? ' is-expanded' : ''}" data-stock-card="${text(item.ingredient_id)}" tabindex="0" role="button" aria-expanded="${expanded}">
    <div><b>${text(item.ingredient_name)}</b><span>${text(item.category || '카테고리 없음')}</span></div>
    <strong>${text(item.current_count)}개</strong>
    <em>${severityLabels[item.severity]}${item.empty_label ? ` · ${text(item.empty_label)}` : ''}</em>
    <div class="lot-box-list">${item.lots.map(lotRow).join('') || emptyState('등록된 큐브가 없어요.')}</div>
    ${expanded ? `<div class="stock-description"><b>설명</b>${item.lots.map(lotDescription).join('') || '<p>저장된 설명이 없어요.</p>'}</div>` : ''}
  </article>`;
}
function lotRow(lot) {
  const pending = pendingLotDeleteId === lot.id;
  return `<div class="lot-box${pending ? ' is-delete-pending' : ''}">
    <span>${text(lot.made_at || '날짜 없음')}</span>
    <b>${text(lot.initial_count)}개 만듦 · ${text(lot.remaining_count)}개 남음</b>
    <button class="trash-button" type="button" aria-label="${pending ? '한 번 더 누르면 재고 삭제' : '재고 삭제'}" title="${pending ? '한 번 더 삭제' : '휴지통'}" data-delete-lot="${text(lot.id)}">${trashIcon()}</button>
  </div>`;
}
function lotDescription(lot) {
  return `<p><span>${text(lot.made_at || '날짜 없음')}</span>${text(lot.description || '설명 없음')}</p>`;
}
function slotCard(slot) {
  const combo = state.combinations.find((item) => item.id === slot.combination_id);
  const ingredient = state.ingredients.find((item) => item.id === slot.ingredient_id);
  return `<article class="data-card meal-card"><b>${text(slot.date)} ${text(slot.meal_type)}</b><span>${text(combo?.name || ingredient?.name || '비어 있어요')}</span><em>${label(statusLabels, slot.status)}</em></article>`;
}
function ingredientCard(item) {
  const pending = pendingIngredientDeleteId === item.id;
  return `<article class="data-card ingredient-card${pending ? ' is-delete-pending' : ''}"><div><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</div><div class="card-actions"><button class="trash-button ${pending ? 'is-active' : ''}" type="button" aria-label="${pending ? '한 번 더 누르면 품목 삭제' : '품목 삭제'}" title="${pending ? '한 번 더 삭제' : '휴지통'}" data-delete-ingredient="${text(item.id)}">${trashIcon()}</button></div></article>`;
}
function comboCard(combo) {
  const items = state.combinationItems.filter((item) => item.combination_id === combo.id).map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(', ');
  return `<article class="data-card"><b>${text(combo.name)}</b><span>${text([combo.stage, combo.texture].filter(Boolean).join(' ') || '조합')}</span><small>${items}</small></article>`;
}
function eventCard(event) {
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${text(event.actor_email)} · ${text(event.source)}</span><small>${text(event.created_at)}</small></article>`;
}
function emptyState(copy) { return `<p class="empty">${text(copy)}</p>`; }
function trashIcon() { return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M9 4h6l1 2h4v2H4V6h4l1-2Zm-2 6h10l-.7 10H7.7L7 10Zm3 2v6h2v-6h-2Zm4 0v6h2v-6h-2Z" fill="currentColor"/></svg>'; }
function bind() {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.onclick = () => { activeTab = tab.dataset.tab; pendingIngredientDeleteId = null; pendingLotDeleteId = null; expandedStockId = null; render(); };
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
  document.querySelectorAll('[data-delete-lot]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handleLotDelete(button.dataset.deleteLot); };
  });
  document.querySelectorAll('[data-stock-card]').forEach((card) => {
    card.onclick = () => toggleStockDescription(card.dataset.stockCard);
    card.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleStockDescription(card.dataset.stockCard);
      }
    };
  });
}
function handleLotSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const description = String(fd.get('description') || '').trim();
  if (addLot(fd.get('ingredient_id'), Number(fd.get('initial_count')), description, 'manual')) {
    pendingIngredientDeleteId = null;
    pendingLotDeleteId = null;
    saveState();
    showToast('재고를 추가했어요.', 'success');
  }
}
function handleQuickAdd(ingredientId, quantity) {
  if (addLot(ingredientId, quantity, '', 'manual')) {
    pendingIngredientDeleteId = null;
    pendingLotDeleteId = null;
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
  pendingLotDeleteId = null;
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
    pendingLotDeleteId = null;
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
function handleLotDelete(lotId) {
  const lot = state.cubeLots.find((item) => item.id === lotId && !item.deleted_at);
  if (!lot) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  if (pendingLotDeleteId !== lotId) {
    pendingLotDeleteId = lotId;
    pendingIngredientDeleteId = null;
    render();
    showToast('재고 삭제는 한 번 더 눌러 확정해요.', 'warning');
    return;
  }
  const result = removeCubeLotFromState(state, lotId, now());
  if (!result.removed) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  state = result.state;
  pendingLotDeleteId = null;
  logEvent('cube_lot_delete', { lot_id: lotId, ingredient_id: lot.ingredient_id, initial_count: lot.initial_count }, lot, null, 'manual');
  saveState();
  showToast('재고를 삭제했어요.', 'success');
}
function toggleStockDescription(ingredientId) {
  expandedStockId = expandedStockId === ingredientId ? null : ingredientId;
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  render();
}
function addLot(ingredient_id, quantity, description = '', source='manual') {
  if (!ingredient_id || !Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상 입력해 주세요.', 'warning'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id, made_at: new Date().toISOString().slice(0,10), expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: null, storage_location: '', description, created_at: now(), updated_at: now() };
  state.cubeLots.push(lot);
  return logEvent('stock_add', { lot }, null, lot, source);
}
function showToast(message, tone = 'info') { const toast = document.querySelector('#toast'); if (toast) { toast.dataset.tone = tone; toast.textContent = message; } }
render();
