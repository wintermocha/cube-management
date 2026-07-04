import { activeIngredients } from './domain.js';
import { mealScheduleTable } from './meal-table-view.js';

export const statusLabels = { not_tried: '미시도', planned: '예정', testing: '테스트 중', tolerated: '적응 완료', suspected_reaction: '반응 의심', cancelled: '삭제됨' };
export const statusOptions = ['not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction'];

const severityLabels = { ok: '충분', warn: '주의', error: '긴급' };
const eventLabels = { stock_add: '재고 추가', stock_increment: '재고 증가', stock_decrement: '재고 차감', cube_lot_delete: '재고 삭제', ingredient_create: '품목 추가', ingredient_delete: '품목 삭제', ingredient_status_update: '상태 변경', meal_slot_update: '식단 수정', combo_update: '조합 수정' };
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const workspaceTabs = [{ id: 'today', label: '오늘', detail: '할 일' }, { id: 'inventory', label: '재고', detail: '현재' }, { id: 'items', label: '품목', detail: '관리' }, { id: 'meals', label: '식단', detail: '계획' }, { id: 'records', label: '기록', detail: '변경' }];
const workspaceCopy = {
  today: { eyebrow: '우선순위', title: '오늘 확인할 것', body: '긴급, 주의, 부족 예정 큐브만 빠르게 확인해요.' },
  inventory: { eyebrow: '냉동실', title: '현재 재고', body: '재고 수량과 큐브 무게를 바로 조정해요.' },
  items: { eyebrow: '품목 관리', title: '품목 추가와 상태', body: '적응 상태를 바꾸고 안 쓰는 품목은 왼쪽으로 밀어 삭제해요.' },
  meals: { eyebrow: '7일 계획', title: '식단표', body: '앞으로 쓸 큐브 수량을 기준으로 부족분을 계산해요.' },
  records: { eyebrow: '변경 기록', title: '최근 기록', body: '직접 반영된 변경만 남겨요.' },
};

export function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function label(map, value) {
  return map[value] || text(value);
}

export function renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId, expandedIngredientId, todayDate }) {
  const currentCopy = workspaceCopy[activeTab] || workspaceCopy.today;
  return `
    <main id="main" class="app-shell app-shell-${text(activeTab)}">
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
      ${tabPanel('today', activeTab, todayPanel({ critical, warnings, shortages }))}
      ${tabPanel('inventory', activeTab, inventoryPanel({ ingredients, inventory, expandedStockId, todayDate }))}
      ${tabPanel('items', activeTab, itemsPanel({ ingredients, expandedIngredientId }))}
      ${tabPanel('meals', activeTab, mealsPanel({ state, weekStart }))}
      ${tabPanel('records', activeTab, recordsPanel({ state }))}
      <nav class="workspace-tabs bottom-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map((tab) => tabButton(tab, activeTab)).join('')}</nav>
    </main>`;
}

function todayPanel({ critical, warnings, shortages }) {
  return `<section class="section section-tight" aria-labelledby="alertTitle">
    <div class="section-head">
      <div><p class="eyebrow">큐브별 상태</p><h2 id="alertTitle">바로 볼 재고</h2></div>
      <p>부족한 품목은 바로 추가할 수 있어요.</p>
    </div>
    <div class="alert-grid">
      ${alertGroup('긴급 재고', critical, '긴급한 재고가 없어요.', 'error')}
      ${alertGroup('주의 재고', warnings, '주의할 재고가 없어요.', 'warning')}
      ${shortageGroup(shortages)}
    </div>
  </section>`;
}

function inventoryPanel({ ingredients, inventory, expandedStockId, todayDate }) {
  return `<section class="section section-tight" aria-labelledby="stockAddTitle">
    <div class="section-head">
      <div><p class="eyebrow">직접 추가</p><h2 id="stockAddTitle">재고 추가</h2></div>
      <p>날짜, 품목, 수량, 무게를 한 줄에서 입력해요.</p>
    </div>
    ${ingredients.length ? `<form id="lotForm" class="form-card stock-add-form">
      <label class="field"><span>만든 날짜</span><input id="lotMadeAt" name="made_at" type="date" value="${text(todayDate)}" required></label>
      <label class="field"><span>품목</span><select id="lotIngredient" name="ingredient_id">${ingredients.map((item) => `<option value="${text(item.id)}">${text(item.name)}</option>`).join('')}</select></label>
      <label class="field"><span>수량</span><input id="lotCount" name="initial_count" type="number" inputmode="numeric" min="1" max="200" value="1" required></label>
      <label class="field"><span>무게(g)</span><input id="lotGramsPerCube" name="grams_per_cube" type="number" inputmode="decimal" min="0.1" max="500" step="0.1" value="15" required></label>
      <label class="field"><span>설명</span><input id="lotDescription" name="description" autocomplete="off" placeholder="예: A칸 앞쪽"></label>
      <button class="button button-primary" type="submit">추가</button>
    </form>` : emptyState('먼저 품목을 추가해 주세요.')}
  </section>
  <section class="section" aria-labelledby="cubeTitle">
    <div class="section-head">
      <div><p class="eyebrow">냉동실</p><h2 id="cubeTitle">현재 재고</h2></div>
      <p>품목별 요약을 먼저 보고, 아래 화살표로 날짜별 재고를 펼쳐요.</p>
    </div>
    <div class="card-grid inventory-grid">${inventory.map((item) => stockCard(item, expandedStockId)).join('') || emptyState('아직 재고가 없어요.')}</div>
  </section>`;
}

function itemsPanel({ ingredients, expandedIngredientId }) {
  return `<section class="section section-tight" aria-labelledby="ingredientTitle" data-item-management-panel>
    <div class="section-head">
      <div><p class="eyebrow">품목 관리</p><h2 id="ingredientTitle">품목 추가/상태 변경</h2></div>
      <p>상태 기준: 각 품목의 저장된 status 값이에요. 예정은 planned, 테스트 중은 testing, 적응 완료는 tolerated로 표시돼요.</p>
    </div>
    <form id="ingredientForm" class="form-card ingredient-form">
      <label class="field"><span>새 품목</span><input id="ingredientName" name="name" autocomplete="off" placeholder="예: 당근"></label>
      <button class="button button-primary" type="submit">품목 추가</button>
    </form>
    <div class="card-grid compact-grid item-management">${ingredients.map((item) => ingredientCard(item, expandedIngredientId)).join('') || emptyState('등록된 품목이 없어요.')}</div>
  </section>`;
}

function mealsPanel({ state, weekStart }) {
  return `<section class="section section-tight" aria-labelledby="mealTitle">
    <div class="section-head section-head-inline">
      <div><p class="eyebrow">7일 계획</p><h2 id="mealTitle">식단표</h2></div>
      <label class="date-control">시작일 <input id="weekStart" value="${text(weekStart)}" type="date"></label>
    </div>
    ${mealScheduleTable(state, weekStart)}
    <h3 class="subsection-title">식단표 수정</h3>
    <div class="card-grid meal-grid">${state.mealPlanSlots.map((slot) => slotCard(slot, state)).join('')}</div>
  </section>
  <section class="section" aria-labelledby="comboTitle">
    <div class="section-head">
      <div><p class="eyebrow">레시피</p><h2 id="comboTitle">조합</h2></div>
    </div>
    <div class="card-grid compact-grid">${state.combinations.map((combo) => comboCard(combo, state)).join('')}</div>
  </section>`;
}

function recordsPanel({ state }) {
  return `<section class="section section-tight" aria-labelledby="activityTitle">
    <div class="section-head">
      <div><p class="eyebrow">기록</p><h2 id="activityTitle">최근 변경</h2></div>
    </div>
    <div class="card-grid compact-grid">${state.events.slice(0, 12).map(eventCard).join('') || emptyState('아직 기록이 없어요.')}</div>
  </section>`;
}

function tabButton(tab, activeTab) {
  const selected = tab.id === activeTab;
  return `<button id="tab-${tab.id}" class="tab-button${selected ? ' is-active' : ''}" type="button" role="tab" aria-label="${text(tab.label)}" aria-selected="${selected}" aria-controls="panel-${tab.id}" data-tab="${tab.id}"><b>${text(tab.label)}</b><span>${text(tab.detail)}</span></button>`;
}

function tabPanel(id, activeTab, content) {
  return `<div id="panel-${id}" class="tab-panel" role="tabpanel" aria-labelledby="tab-${id}"${activeTab === id ? '' : ' hidden'}>${content}</div>`;
}

function metricTile(labelText, value, detail, tone) {
  return `<article class="metric metric-${tone}"><span>${text(labelText)}</span><strong>${text(value)}</strong><small>${text(detail)}</small></article>`;
}

function alertGroup(title, items, emptyCopy, tone) {
  return `<div class="alert-group alert-${tone}"><h3>${text(title)}</h3><div class="cube-box-list">${items.map(compactStockRow).join('') || emptyState(emptyCopy)}</div></div>`;
}

function shortageGroup(items) {
  return `<div class="alert-group alert-error"><h3>부족 예정</h3><div class="cube-box-list">${items.map(shortageRow).join('') || emptyState('부족 예정이 없어요.')}</div></div>`;
}

function compactStockRow(item) {
  return `<article class="alert-row cube-box is-${item.severity}"><div><b>${text(item.ingredient_name)}</b><span>${text(item.current_count)}개 보유</span></div><button class="button button-small button-secondary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="1">+1개</button></article>`;
}

function shortageRow(item) {
  return `<article class="alert-row cube-box action-row is-error"><div><b>${text(item.ingredient_name)}</b><span>${text(item.needed)}개 필요 / ${text(item.available)}개 보유</span></div><button class="button button-small button-primary" type="button" data-add-ingredient="${text(item.ingredient_id)}" data-add-quantity="${text(item.shortage)}">${text(item.shortage)}개 추가</button></article>`;
}

function stockCard(item, expandedStockId) {
  const expanded = expandedStockId === item.ingredient_id;
  return `<div class="swipe-shell" data-swipe-delete data-delete-kind="stock" data-delete-id="${text(item.ingredient_id)}">
    <button class="swipe-action" type="button" tabindex="-1" aria-hidden="true" data-delete-stock="${text(item.ingredient_id)}">전체 삭제</button>
    <article class="data-card inventory-card is-${item.severity}${expanded ? ' is-expanded' : ''}" data-stock-card="${text(item.ingredient_id)}">
      <div><b>${text(item.ingredient_name)}</b><span>${text(item.category || '카테고리 없음')}</span></div>
      <strong>${text(item.current_count)}개</strong>
      <em>${severityLabels[item.severity]}${item.empty_label ? ` · ${text(item.empty_label)}` : ''}</em>
      <button class="stock-toggle" type="button" aria-label="${text(item.ingredient_name)} 날짜별 재고 펼치기" aria-expanded="${expanded}" data-stock-toggle="${text(item.ingredient_id)}">${chevronIcon()}</button>
      ${expanded ? `<div class="stock-detail"><div class="lot-box-list">${item.lots.map(lotRow).join('') || emptyState('등록된 큐브가 없어요.')}</div><div class="stock-description"><b>설명</b>${item.lots.map(lotDescription).join('') || '<p>저장된 설명이 없어요.</p>'}</div></div>` : ''}
    </article>
  </div>`;
}

function lotRow(lot) {
  return `<div class="lot-box">
    <div><span>${text(lot.made_at || '날짜 없음')}</span><b>${text(lot.initial_count)}개 만듦 · ${text(lot.remaining_count)}개 남음${lot.grams_per_cube ? ` · ${text(lot.grams_per_cube)}g/개` : ''}</b></div>
    <div class="lot-controls" aria-label="${text(lot.made_at || '날짜 없음')} 재고 증감">
      <button class="button button-small button-secondary" type="button" data-lot-decrement="${text(lot.id)}">-</button>
      <span>${text(lot.remaining_count)}개</span>
      <button class="button button-small button-secondary" type="button" data-lot-increment="${text(lot.id)}">+</button>
    </div>
    <button class="trash-button" type="button" aria-label="재고 삭제" title="휴지통" data-delete-lot="${text(lot.id)}">${trashIcon()}</button>
  </div>`;
}

function lotDescription(lot) {
  return `<p><span>${text(lot.made_at || '날짜 없음')}</span>${text(lot.description || '설명 없음')}</p>`;
}

function slotCard(slot, state) {
  const combo = state.combinations.find((item) => item.id === slot.combination_id);
  const ingredient = state.ingredients.find((item) => item.id === slot.ingredient_id);
  return `<form class="data-card meal-card edit-card" data-edit-slot="${text(slot.id)}">
    <b>${text(slot.date)} ${text(slot.meal_type)}</b>
    <label class="field"><span>날짜</span><input name="date" type="date" value="${text(slot.date)}"></label>
    <label class="field"><span>끼니</span><select name="meal_type">${['아침','점심','저녁'].map((type) => `<option value="${text(type)}"${slot.meal_type === type ? ' selected' : ''}>${text(type)}</option>`).join('')}</select></label>
    <label class="field"><span>종류</span><select name="target_type">${['combination','ingredient'].map((type) => `<option value="${type}"${slot.target_type === type ? ' selected' : ''}>${type === 'combination' ? '조합' : '단일 품목'}</option>`).join('')}</select></label>
    <label class="field"><span>조합</span><select name="combination_id"><option value="">선택 없음</option>${state.combinations.map((item) => `<option value="${text(item.id)}"${slot.combination_id === item.id ? ' selected' : ''}>${text(item.name)}</option>`).join('')}</select></label>
    <label class="field"><span>품목</span><select name="ingredient_id"><option value="">선택 없음</option>${activeIngredients(state.ingredients).map((item) => `<option value="${text(item.id)}"${slot.ingredient_id === item.id ? ' selected' : ''}>${text(item.name)}</option>`).join('')}</select></label>
    <label class="field"><span>수량</span><input name="cube_count" type="number" min="1" max="20" value="${text(slot.cube_count || 1)}"></label>
    <label class="field"><span>상태</span><select name="status">${['planned','testing','tolerated','cancelled'].map((status) => `<option value="${status}"${slot.status === status ? ' selected' : ''}>${label(statusLabels, status)}</option>`).join('')}</select></label>
    <small>현재: ${text(combo?.name || ingredient?.name || '비어 있어요')} · ${label(statusLabels, slot.status)}</small>
  </form>`;
}

function ingredientCard(item, expandedIngredientId) {
  const expanded = expandedIngredientId === item.id;
  return `<div class="swipe-shell" data-swipe-delete data-delete-kind="ingredient" data-delete-id="${text(item.id)}">
    <button class="swipe-action" type="button" tabindex="-1" aria-hidden="true" data-delete-ingredient="${text(item.id)}">삭제</button>
    <article class="data-card ingredient-card${expanded ? ' is-expanded' : ''}">
      <div class="ingredient-summary">
        <div><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</div>
        <button class="ingredient-toggle" type="button" aria-label="${text(item.name)} 상태 변경 펼치기" aria-expanded="${expanded}" data-ingredient-toggle="${text(item.id)}">${chevronIcon()}</button>
      </div>
      ${expanded ? `<div class="ingredient-detail"><label class="field status-field"><span>적응 상태</span><select data-ingredient-status="${text(item.id)}">${statusOptions.map((status) => `<option value="${status}"${item.status === status ? ' selected' : ''}>${label(statusLabels, status)}</option>`).join('')}</select></label></div>` : ''}
    </article>
  </div>`;
}

function comboCard(combo, state) {
  const comboItems = state.combinationItems.filter((item) => item.combination_id === combo.id);
  const itemSummary = comboItems.map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(', ');
  return `<form class="data-card combo-card edit-card" data-edit-combo="${text(combo.id)}">
    <label class="field"><span>조합명</span><input name="name" value="${text(combo.name)}"></label>
    <label class="field"><span>단계</span><input name="stage" value="${text(combo.stage || '')}" placeholder="예: 중기"></label>
    <label class="field"><span>질감</span><input name="texture" value="${text(combo.texture || '')}" placeholder="예: 죽"></label>
    <div class="combo-items">${activeIngredients(state.ingredients).map((ingredient) => {
      const found = comboItems.find((item) => item.ingredient_id === ingredient.id);
      return `<label class="field"><span>${text(ingredient.name)}</span><input name="cube_${text(ingredient.id)}" type="number" min="0" max="20" value="${text(found?.cube_count || 0)}"></label>`;
    }).join('')}</div>
    <small>${itemSummary || '구성 품목 없음'}</small>
    <button class="button button-secondary" type="submit">조합 저장</button>
  </form>`;
}

function eventCard(event) {
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${text(event.actor_email)} · ${text(event.source)}</span><small>${text(event.created_at)}</small></article>`;
}

function emptyState(copy) {
  return `<p class="empty">${text(copy)}</p>`;
}

function trashIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M9 4h6l1 2h4v2H4V6h4l1-2Zm-2 6h10l-.7 10H7.7L7 10Zm3 2v6h2v-6h-2Zm4 0v6h2v-6h-2Z" fill="currentColor"/></svg>';
}

function chevronIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M7 10l5 5 5-5H7Z" fill="currentColor"/></svg>';
}
