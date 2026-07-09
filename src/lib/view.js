import { activeIngredients } from './domain.js';
import { mealScheduleCalendar } from './meal-table-view.js';

export const statusLabels = { not_tried: '미시도', planned: '예정', testing: '테스트 중', tolerated: '적응 완료', suspected_reaction: '반응 의심', cancelled: '삭제됨' };
export const statusOptions = ['not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction'];
export const categoryOptions = ['단백질', '채소', '곡류', '과일', '고기'];
export const stageOptions = ['초기', '중기', '후기', '완료기'];

const severityLabels = { ok: '충분', warn: '주의', error: '긴급' };
const eventLabels = { stock_add: '재고 추가', stock_increment: '재고 증가', stock_decrement: '재고 차감', stock_clear: '현재 재고 삭제', cube_lot_delete: '재고 삭제', ingredient_create: '품목 추가', ingredient_delete: '품목 삭제', ingredient_status_update: '상태 변경', ingredient_category_update: '카테고리 변경', meal_slot_update: '식단 수정', meal_slot_create: '식단 추가', combo_update: '조합 수정', combo_create: '조합 추가', profile_update: '프로필 수정' };
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const workspaceTabs = [
  { id: 'today', label: '오늘', detail: '체크', icon: 'today' },
  { id: 'inventory', label: '큐브', detail: '재고', icon: 'inventory_2' },
  { id: 'meals', label: '식단', detail: '계획', icon: 'calendar_month' },
  { id: 'items', label: '품목', detail: '관리', icon: 'egg_alt' },
  { id: 'records', label: '기록', detail: '변경', icon: 'history' },
];
const workspaceCopy = {
  today: { eyebrow: 'Nurture Nest', title: '오늘 확인할 이유식', body: '긴급 재고와 이번 주 식단을 먼저 보여드려요.' },
  inventory: { eyebrow: 'Freezer Cubes', title: '큐브 재고', body: '날짜별 큐브 수량과 무게를 안전하게 조정해요.' },
  items: { eyebrow: 'Ingredients', title: '품목과 적응 상태', body: '테스트 중인 재료와 적응 완료 재료를 빠르게 나눠 봐요.' },
  meals: { eyebrow: 'Meal Plan', title: '식단과 조합', body: '저장한 조합을 드래그하거나 버튼으로 이번 주에 배치해요.' },
  records: { eyebrow: 'History', title: '최근 변경 기록', body: '재고, 품목, 식단 변경만 따뜻한 카드로 남겨요.' },
  settings: { eyebrow: 'Profile', title: '아기 프로필', body: '이름, 생일, 메모를 앱의 첫 화면과 기록에 반영해요.' },
};
const filterOptions = [{ id: 'all', label: '전체' }, ...statusOptions.map((status) => ({ id: status, label: statusLabels[status] }))];

export function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function label(map, value) {
  return map[value] || text(value);
}

export function renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId, expandedIngredientId, todayDate, lotFormDefaults, comboBuilderIngredientIds = [], activeIngredientFilter = 'all' }) {
  const currentCopy = workspaceCopy[activeTab] || workspaceCopy.today;
  const childName = childDisplayName(state);
  const showWorkspaceSummary = !['meals', 'items', 'records'].includes(activeTab);
  return `
    <main id="main" class="app-shell app-shell-${text(activeTab)}">
      <div id="toast" class="toast app-toast" aria-live="polite"></div>
      <header class="top-app-bar">
        <div class="profile-mark" aria-hidden="true"><img src="/profile-avatar.svg" alt=""></div>
        <div class="top-app-title"><span>${text(childName)}의 이유식</span><strong>Baby Food Cube Manager</strong></div>
        ${activeTab === 'settings'
          ? `<button class="icon-button" type="button" aria-label="설정 닫기" data-action-tab="today">${materialIcon('close')}</button>`
          : `<button class="icon-button" type="button" aria-label="설정" data-settings-tab>${materialIcon('settings')}</button>`}
      </header>
      ${showWorkspaceSummary ? `<section class="workspace-hero" aria-labelledby="workspaceTitle">
        <p class="eyebrow">${text(currentCopy.eyebrow)}</p>
        <h1 id="workspaceTitle">${text(currentCopy.title)}</h1>
        <p>${text(currentCopy.body)}</p>
      </section>
      <div class="metrics metrics-alerts" aria-label="요약 지표">
        ${metricTile('긴급', `${critical.length}건`, critical.length ? '바로 확인 필요' : '현재 없음', critical.length ? 'error' : 'success')}
        ${metricTile('주의', `${warnings.length}건`, warnings.length ? '재고 낮음' : '안정적', warnings.length ? 'warning' : 'success')}${metricTile('부족 예정', `${shortages.length}건`, `${nextMealCount}개 식단 반영`, shortages.length ? 'error' : 'success')}
      </div>` : ''}
      ${tabPanel('today', activeTab, todayPanel({ inventory, state, weekStart }))}
      ${tabPanel('inventory', activeTab, inventoryPanel({ ingredients, inventory, expandedStockId, todayDate, lotFormDefaults }))}
      ${tabPanel('items', activeTab, itemsPanel({ ingredients, expandedIngredientId, activeIngredientFilter }))}
      ${tabPanel('meals', activeTab, mealsPanel({ state, weekStart, comboBuilderIngredientIds }))}
      ${tabPanel('records', activeTab, recordsPanel({ state }))}
      ${tabPanel('settings', activeTab, settingsPanel({ state }))}
      ${activeTab === 'settings' ? '' : `<nav class="workspace-tabs bottom-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map((tab) => tabButton(tab, activeTab)).join('')}</nav>`}
    </main>`;
}

export function renderAuthRequiredHtml({ message, loginHref }) {
  return `
    <main id="main" class="app-shell auth-required-shell" data-auth-required>
      <section class="auth-required-panel" role="alert" aria-labelledby="authRequiredTitle">
        <div class="auth-mark">${materialIcon('lock')}</div>
        <h1 id="authRequiredTitle">로그인이 필요해요</h1>
        <p>${text(message || '로그인 세션을 확인하지 못했어요. 다시 로그인해 주세요.')}</p>
        <button class="button button-primary auth-required-action" type="button" data-auth-login data-login-href="${text(loginHref)}">확인</button>
      </section>
    </main>`;
}

function childDisplayName(state) {
  return String(state.childProfile?.display_name || '아기').trim() || '아기';
}

function todayPanel({ inventory, state, weekStart }) {
  return `<section class="section section-tight" aria-labelledby="todayStockTitle">
    <div class="section-head">
      <div><p class="eyebrow">냉동실</p><h2 id="todayStockTitle">현재 재고</h2></div>
    </div>
    <div class="card-grid inventory-grid today-readonly-grid">${inventory.map(readonlyStockCard).join('') || emptyState('아직 재고가 없어요.')}</div>
  </section>
  <section class="section" aria-labelledby="todayMealTitle">
    <div class="section-head section-head-inline">
      <div><p class="eyebrow">7일 계획</p><h2 id="todayMealTitle">식단표</h2></div>
      <button class="button button-secondary button-compact" type="button" data-action-tab="meals">${materialIcon('calendar_month')}식단 편집</button>
    </div>
    ${mealScheduleCalendar(state, weekStart, { readonly: true })}
  </section>`;
}

function inventoryPanel({ ingredients, inventory, expandedStockId, todayDate, lotFormDefaults }) {
  const defaults = lotFormDefaults || {};
  return `<section class="section section-tight" aria-labelledby="stockAddTitle">
    <div class="section-head">
      <div><p class="eyebrow">직접 추가</p><h2 id="stockAddTitle">재고 추가</h2></div>
      <p>날짜, 품목, 수량, 무게를 한 줄에서 입력해요.</p>
    </div>
    ${ingredients.length ? `<form id="lotForm" class="form-card stock-add-form">
      <label class="field"><span>만든 날짜</span><input id="lotMadeAt" name="made_at" type="date" value="${text(defaults.madeAt || todayDate)}" required></label>
      <div class="stock-add-inline-row">
        <label class="field"><span>품목</span><select id="lotIngredient" name="ingredient_id">${ingredients.map((item) => `<option value="${text(item.id)}"${defaults.ingredientId === item.id ? ' selected' : ''}>${text(item.name)}</option>`).join('')}</select></label>
        <label class="field"><span>수량</span><input id="lotCount" name="initial_count" type="number" inputmode="numeric" min="1" max="200" value="${text(defaults.quantity || 1)}" required></label>
        <label class="field"><span>무게(g)</span><input id="lotGramsPerCube" name="grams_per_cube" type="number" inputmode="decimal" min="0.1" max="500" step="0.1" value="${text(defaults.gramsPerCube || 15)}" required></label>
      </div>
      <label class="field"><span>설명</span><input id="lotDescription" name="description" autocomplete="off" placeholder="고기 100g 물 20g 블랜더 30초  " value="${text(defaults.description || '')}"></label>
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

function itemsPanel({ ingredients, expandedIngredientId, activeIngredientFilter }) {
  const filtered = activeIngredientFilter === 'all' ? ingredients : ingredients.filter((item) => item.status === activeIngredientFilter);
  return `<section class="section section-tight" aria-labelledby="ingredientTitle" data-item-management-panel>
    <div class="section-head">
      <div><p class="eyebrow">품목 관리</p><h2 id="ingredientTitle">품목 추가/상태 변경</h2></div>
      <p>상태 기준: 각 품목의 저장된 status 값이에요. 예정은 planned, 테스트 중은 testing, 적응 완료는 tolerated로 표시돼요.</p>
    </div>
    <div class="filter-strip" role="list" aria-label="품목 상태 필터">${filterOptions.map((option) => filterChip(option, activeIngredientFilter)).join('')}</div>
    <form id="ingredientForm" class="form-card ingredient-form">
      <label class="field"><span>새 품목</span><input id="ingredientName" name="name" autocomplete="off" placeholder="예: 당근"></label>
      <label class="field"><span>카테고리</span><select id="ingredientCategory" name="category">${categoryOptions.map((category) => `<option value="${text(category)}">${text(category)}</option>`).join('')}</select></label>
      <button class="button button-primary" type="submit">품목 추가</button>
    </form>
    <div class="card-grid compact-grid item-management">${filtered.map((item) => ingredientCard(item, expandedIngredientId)).join('') || emptyState('이 상태의 품목이 아직 없어요.')}</div>
  </section>`;
}

function mealsPanel({ state, weekStart, comboBuilderIngredientIds }) {
  return `<section class="section section-tight" aria-labelledby="mealTitle">
    <div class="section-head section-head-inline">
      <div><p class="eyebrow">7일 계획</p><h2 id="mealTitle">식단표</h2></div>
      <label class="date-control">시작일 <input id="weekStart" value="${text(weekStart)}" type="date"></label>
    </div>
    ${recommendationPanel(state)}
    <div class="combo-library">${state.combinations.map((combo) => comboCard(combo, state, weekStart)).join('') || emptyState('저장된 조합이 없어요.')}</div>
    ${mealScheduleCalendar(state, weekStart)}
  </section>
  <section class="section" aria-labelledby="comboTitle">
    <div class="section-head">
      <div><p class="eyebrow">레시피</p><h2 id="comboTitle">조합</h2></div>
    </div>
    ${comboBuilder(state, comboBuilderIngredientIds)}
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

function settingsPanel({ state }) {
  const profile = state.childProfile || {};
  return `<section class="section section-tight settings-screen" aria-labelledby="settingsTitle">
    <div class="settings-profile">
      <div class="profile-preview" aria-hidden="true"><img src="/profile-avatar.svg" alt=""></div>
      <div><p class="eyebrow">Child Profile</p><h2 id="settingsTitle">${text(childDisplayName(state))}</h2><span>이 정보는 이 기기 저장소에 저장돼요.</span></div>
    </div>
    <form id="profileForm" class="form-card profile-form" data-profile-form>
      <label class="field"><span>표시 이름</span><input name="display_name" autocomplete="off" value="${text(profile.display_name || '')}" placeholder="예: 주원"></label>
      <label class="field"><span>생일</span><input name="birth_date" type="date" value="${text(profile.birth_date || '')}"></label>
      <label class="field profile-notes"><span>메모</span><textarea name="notes" rows="4" placeholder="알레르기 의심, 선호 식감 등을 적어두세요.">${text(profile.notes || '')}</textarea></label>
      <div class="profile-actions">
        <button class="button button-secondary" type="button" data-profile-photo>${materialIcon('photo_camera')}사진 변경</button>
        <button class="button button-primary" type="submit" data-profile-save>${materialIcon('save')}저장</button>
      </div>
    </form>
  </section>`;
}

function tabButton(tab, activeTab) {
  const selected = tab.id === activeTab;
  return `<button id="tab-${tab.id}" class="tab-button${selected ? ' is-active' : ''}" type="button" role="tab" aria-label="${text(tab.label)}" aria-selected="${selected}" aria-controls="panel-${tab.id}" data-tab="${tab.id}">${materialIcon(tab.icon)}<b>${text(tab.label)}</b><span>${text(tab.detail)}</span></button>`;
}

function tabPanel(id, activeTab, content) {
  if (id === 'settings') {
    return `<div id="panel-${id}" class="tab-panel" role="region" aria-labelledby="settingsTitle"${activeTab === id ? '' : ' hidden'}>${content}</div>`;
  }
  return `<div id="panel-${id}" class="tab-panel" role="tabpanel" aria-labelledby="tab-${id}"${activeTab === id ? '' : ' hidden'}>${content}</div>`;
}

function metricTile(labelText, value, detail, tone) {
  return `<article class="metric metric-${tone}"><span>${text(labelText)}</span><strong>${text(value)}</strong><small>${text(detail)}</small></article>`;
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

function readonlyStockCard(item) {
  return `<article class="data-card inventory-card readonly-inventory-card is-${item.severity}">
    <div><b>${text(item.ingredient_name)}</b><span>${text(item.category || '카테고리 없음')}</span></div>
    <strong>${text(item.current_count)}개</strong>
    <em>${severityLabels[item.severity]}${item.empty_label ? ` · ${text(item.empty_label)}` : ''}</em>
  </article>`;
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

function ingredientCard(item, expandedIngredientId) {
  const expanded = expandedIngredientId === item.id;
  return `<div class="swipe-shell" data-swipe-delete data-delete-kind="ingredient" data-delete-id="${text(item.id)}">
    <button class="swipe-action" type="button" tabindex="-1" aria-hidden="true" data-delete-ingredient="${text(item.id)}">삭제</button>
    <article class="data-card ingredient-card${expanded ? ' is-expanded' : ''}">
      <div class="ingredient-summary">
        <div><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</div>
        <button class="ingredient-toggle" type="button" aria-label="${text(item.name)} 상태 변경 펼치기" aria-expanded="${expanded}" data-ingredient-toggle="${text(item.id)}">${chevronIcon()}</button>
      </div>
      ${expanded ? `<div class="ingredient-detail">
        <label class="field status-field"><span>적응 상태</span><select data-ingredient-status="${text(item.id)}">${statusOptions.map((status) => `<option value="${status}"${item.status === status ? ' selected' : ''}>${label(statusLabels, status)}</option>`).join('')}</select></label>
        <label class="field category-field"><span>카테고리</span><select data-ingredient-category="${text(item.id)}">${categoryOptions.map((category) => `<option value="${text(category)}"${item.category === category ? ' selected' : ''}>${text(category)}</option>`).join('')}</select></label>
      </div>` : ''}
    </article>
  </div>`;
}

function comboCard(combo, state, weekStart) {
  const comboItems = state.combinationItems.filter((item) => item.combination_id === combo.id);
  const itemSummary = comboItems.map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(' · ');
  return `<article class="combo-box" draggable="true" data-drag-combo="${text(combo.id)}">
    <div class="combo-box-head"><b>${text(combo.name)}</b><span>${text(combo.stage || '단계 미지정')}</span></div>
    <span>${itemSummary || '구성 품목 없음'}</span>
    <button class="button button-secondary button-compact" type="button" data-add-combo-meal="${text(combo.id)}" data-add-combo-date="${text(weekStart)}">${materialIcon('add_circle')}식단에 추가</button>
  </article>`;
}

function comboBuilder(state, selectedIds) {
  const ingredients = activeIngredients(state.ingredients);
  const selected = selectedIds.map((ingredientId) => ingredients.find((item) => item.id === ingredientId)).filter(Boolean);
  return `<form id="comboBuilderForm" class="combo-builder">
    <label class="field combo-name-field"><span>조합명</span><input name="name" autocomplete="off" placeholder="예: 소고기 브로콜리 죽"></label>
    <fieldset class="stage-selector">
      <legend>이유식 단계</legend>
      ${stageOptions.map((stage, index) => `<label><input type="radio" name="stage" value="${text(stage)}"${index === 1 ? ' checked' : ''}><span>${text(stage)}</span></label>`).join('')}
    </fieldset>
    <div class="ingredient-palette">${ingredients.map((ingredient) => ingredientToken(ingredient)).join('') || emptyState('등록된 품목이 없어요.')}</div>
    <div class="combo-drop-zone${selected.length ? ' has-items' : ''}" data-combo-drop-zone>
      <div class="builder-selection">${selected.map(selectedIngredientToken).join('') || '<span class="meal-slot-empty">품목을 여기에 넣어요</span>'}</div>
    </div>
    <button class="button button-primary" type="submit">저장</button>
  </form>`;
}

function ingredientToken(ingredient) {
  return `<button class="ingredient-token" type="button" draggable="true" data-drag-ingredient="${text(ingredient.id)}" data-add-combo-ingredient="${text(ingredient.id)}">${materialIcon(categoryIcon(ingredient.category))}<b>${text(ingredient.name)}</b><span>${text(ingredient.category || '카테고리 없음')}</span></button>`;
}

function selectedIngredientToken(ingredient) {
  return `<div class="selected-token">
    <button type="button" data-builder-remove="${text(ingredient.id)}" aria-label="${text(ingredient.name)} 제거">${materialIcon('close')}</button>
    <span>${text(ingredient.name)}</span>
    <label><span class="sr-only">${text(ingredient.name)} 큐브 수</span><input name="cube_count_${text(ingredient.id)}" type="number" min="1" max="12" inputmode="numeric" value="1"></label>
  </div>`;
}

function eventCard(event) {
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${text(event.actor_email)} · ${text(event.source)}</span><small>${text(event.created_at)}</small></article>`;
}

function emptyState(copy) {
  return `<p class="empty">${text(copy)}</p>`;
}

function recommendationPanel(state) {
  const firstCombo = state.combinations[0];
  const summary = firstCombo ? `${firstCombo.name} 조합을 이번 주에 바로 배치할 수 있어요.` : '조합을 저장하면 식단 추천이 여기 표시돼요.';
  return `<article class="recommendation-panel">
    <img src="/empty-bowl.svg" alt="" aria-hidden="true">
    <div><p class="eyebrow">Recommendation</p><b>${text(summary)}</b><span>현재 재고와 이번 주 계획을 기준으로 보여드려요.</span></div>
  </article>`;
}

function filterChip(option, activeFilter) {
  const selected = option.id === activeFilter;
  return `<button class="filter-chip${selected ? ' is-selected' : ''}" type="button" role="listitem" aria-pressed="${selected}" data-ingredient-filter="${text(option.id)}">${text(option.label)}</button>`;
}

function categoryIcon(category) {
  if (/단백질|고기|소고기/.test(String(category))) return 'restaurant';
  if (/곡|쌀|미음/.test(String(category))) return 'rice_bowl';
  if (/과일/.test(String(category))) return 'nutrition';
  if (/채소/.test(String(category))) return 'eco';
  return 'local_dining';
}

function materialIcon(name) {
  return `<span class="material-symbols-outlined" aria-hidden="true">${text(name)}</span>`;
}

function trashIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M9 4h6l1 2h4v2H4V6h4l1-2Zm-2 6h10l-.7 10H7.7L7 10Zm3 2v6h2v-6h-2Zm4 0v6h2v-6h-2Z" fill="currentColor"/></svg>';
}

function chevronIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M7 10l5 5 5-5H7Z" fill="currentColor"/></svg>';
}
