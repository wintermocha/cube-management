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
  meals: { eyebrow: 'Meal Plan', title: '식단과 조합', body: '저장한 조합을 드래그하거나 버튼으로 주간 식단에 배치해요.' },
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

export function ingredientReferenceMessage(name) {
  return `“${String(name ?? '')}” 품목은 조합·식단에 포함돼요. 식단을\u00a0먼저\u00a0확인해\u00a0주세요.`;
}

export function focusedControlScrollDelta({ controlTop, controlBottom, viewportTop, viewportBottom }, margin = 16) {
  const safeTop = viewportTop + margin;
  const safeBottom = viewportBottom - margin;
  if (controlBottom > safeBottom) return controlBottom - safeBottom;
  if (controlTop < safeTop) return controlTop - safeTop;
  return 0;
}

export function renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId, expandedIngredientId, todayDate, lotFormDefaults, comboBuilderIngredientIds = [], activeIngredientFilter = 'all', pending = false, feedback = null, fieldErrors = {}, confirmation = null, ingredientReferenceAlert = null, settingsReturnTab = 'today' }) {
  const currentCopy = workspaceCopy[activeTab] || workspaceCopy.today;
  const childName = childDisplayName(state);
  const showWorkspaceSummary = !['meals', 'items', 'records'].includes(activeTab);
  return `
    <main id="main" class="app-shell app-shell-${text(activeTab)}" tabindex="-1"${pending ? ' aria-busy="true"' : ''}>
      ${feedbackHtml(feedback)}
      <header class="top-app-bar">
        <div class="profile-mark" aria-hidden="true"><img src="/profile-avatar.svg" alt=""></div>
        <div class="top-app-title"><span>${text(childName)}의 이유식</span><strong>Baby Food Cube Manager</strong></div>
        ${activeTab === 'settings'
          ? `<button class="icon-button" type="button" aria-label="설정 닫기" data-action-tab="${text(settingsReturnTab)}">${materialIcon('close')}</button>`
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
      ${tabPanel('inventory', activeTab, inventoryPanel({ ingredients, inventory, expandedStockId, todayDate, lotFormDefaults, fieldErrors, pending }))}
      ${tabPanel('items', activeTab, itemsPanel({ ingredients, expandedIngredientId, activeIngredientFilter, fieldErrors, pending, ingredientReferenceAlert }))}
      ${tabPanel('meals', activeTab, mealsPanel({ state, weekStart, comboBuilderIngredientIds, fieldErrors, pending, ingredientReferenceAlert }))}
      ${tabPanel('records', activeTab, recordsPanel({ state }))}
      ${tabPanel('settings', activeTab, settingsPanel({ state, fieldErrors, pending }))}
      ${confirmationHtml(confirmation)}
      ${activeTab === 'settings' ? '' : `<nav class="workspace-tabs bottom-tabs" role="tablist" aria-label="기능 분류">${workspaceTabs.map((tab) => tabButton(tab, activeTab)).join('')}</nav>`}
    </main>`;
}

export function renderLoadingHtml() {
  return `<main id="main" class="app-shell auth-required-shell" tabindex="-1" aria-busy="true"><section class="auth-required-panel" role="status"><h1>공유 데이터를 확인하고 있어요</h1><p>잠시만 기다려 주세요.</p></section></main>`;
}

export function renderLoadErrorHtml({ message } = {}) {
  return `<main id="main" class="app-shell auth-required-shell" tabindex="-1"><section id="toast" class="auth-required-panel" role="alert"><h1>공유 데이터 연결에 실패했어요</h1><p>${text(message || '연결을 확인한 뒤 다시 눌러 주세요.')}</p><button class="button button-primary" type="button" data-state-retry>다시 시도</button></section></main>`;
}

export function renderForbiddenHtml({ message } = {}) {
  return `<main id="main" class="app-shell auth-required-shell" tabindex="-1" data-auth-required data-forbidden><section class="auth-required-panel" role="alert"><h1>이 공유 가정을 볼 권한이 없어요</h1><p>${text(message || '가정 관리자에게 멤버 등록을 요청해 주세요.')}</p></section></main>`;
}

export function renderAuthRequiredHtml({ message, loginHref }) {
  return `
    <main id="main" class="app-shell auth-required-shell" tabindex="-1" data-auth-required>
      <section class="auth-required-panel" role="alert" aria-labelledby="authRequiredTitle">
        <div class="auth-mark">${materialIcon('lock')}</div>
        <h1 id="authRequiredTitle">로그인이 필요해요</h1>
        <p>${text(message || '로그인 세션이 끝났어요. 로그인 후 계속해 주세요.')}</p>
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

function inventoryPanel({ ingredients, inventory, expandedStockId, todayDate, lotFormDefaults, fieldErrors, pending }) {
  const defaults = lotFormDefaults || {};
  return `<section class="section section-tight" aria-labelledby="stockAddTitle">
    <div class="section-head">
      <div><p class="eyebrow">직접 추가</p><h2 id="stockAddTitle" tabindex="-1">재고 추가</h2></div>
      <p>날짜, 품목, 수량, 무게를 한 줄에서 입력해요.</p>
    </div>
    ${ingredients.length ? `<form id="lotForm" class="form-card stock-add-form">
      <label class="field"><span>만든 날짜</span><input id="lotMadeAt"${errorAttributes('lotMadeAt', fieldErrors)} name="made_at" type="date" value="${text(defaults.madeAt || todayDate)}" required${disabledAttribute(pending)}>${fieldError('lotMadeAt', fieldErrors)}</label>
      <div class="stock-add-inline-row">
        <label class="field"><span>품목</span><select id="lotIngredient"${errorAttributes('lotIngredient', fieldErrors)} name="ingredient_id"${disabledAttribute(pending)}>${ingredients.map((item) => `<option value="${text(item.id)}"${defaults.ingredientId === item.id ? ' selected' : ''}>${text(item.name)}</option>`).join('')}</select>${fieldError('lotIngredient', fieldErrors)}</label>
        <label class="field"><span>수량</span><input id="lotCount"${errorAttributes('lotCount', fieldErrors)} name="initial_count" type="number" inputmode="numeric" min="1" max="200" value="${text(defaults.quantity || 1)}" required${disabledAttribute(pending)}>${fieldError('lotCount', fieldErrors)}</label>
        <label class="field"><span>무게(g)</span><input id="lotGramsPerCube"${errorAttributes('lotGramsPerCube', fieldErrors)} name="grams_per_cube" type="number" inputmode="decimal" min="0.1" max="500" step="0.1" value="${text(defaults.gramsPerCube || 15)}" required${disabledAttribute(pending)}>${fieldError('lotGramsPerCube', fieldErrors)}</label>
      </div>
      <label class="field"><span>설명</span><input id="lotDescription" name="description" autocomplete="off" placeholder="고기 100g 물 20g 블랜더 30초  " value="${text(defaults.description || '')}"${disabledAttribute(pending)}></label>
      <button class="button button-primary" type="submit"${disabledAttribute(pending)}>추가</button>
    </form>` : emptyState('먼저 품목을 추가해 주세요.')}
  </section>
  <section class="section" aria-labelledby="cubeTitle">
    <div class="section-head">
      <div><p class="eyebrow">냉동실</p><h2 id="cubeTitle" tabindex="-1">현재 재고</h2></div>
      <p>품목별 요약을 먼저 보고, 아래 화살표로 날짜별 재고를 펼쳐요.</p>
    </div>
    <div class="card-grid inventory-grid">${inventory.map((item) => stockCard(item, expandedStockId)).join('') || emptyState('아직 재고가 없어요.')}</div>
  </section>`;
}

function itemsPanel({ ingredients, expandedIngredientId, activeIngredientFilter, fieldErrors, pending, ingredientReferenceAlert }) {
  const filtered = activeIngredientFilter === 'all' ? ingredients : ingredients.filter((item) => item.status === activeIngredientFilter);
  return `<section class="section section-tight" aria-labelledby="ingredientTitle" data-item-management-panel>
    <div class="section-head">
      <div><p class="eyebrow">품목 관리</p><h2 id="ingredientTitle" tabindex="-1">품목 추가/상태 변경</h2></div>
      <p>아직 먹지 않은 품목부터 적응을 마친 품목까지 단계별로 확인해요.</p>
    </div>
    ${ingredientReferenceAlertHtml(ingredientReferenceAlert)}
    <div class="filter-strip" role="group" aria-label="품목 상태 필터">${filterOptions.map((option) => filterChip(option, activeIngredientFilter)).join('')}</div>
    <form id="ingredientForm" class="form-card ingredient-form">
      <label class="field"><span>새 품목</span><input id="ingredientName"${errorAttributes('ingredientName', fieldErrors)} name="name" autocomplete="off" placeholder="예: 당근" required${disabledAttribute(pending)}>${fieldError('ingredientName', fieldErrors)}</label>
      <label class="field"><span>카테고리</span><select id="ingredientCategory"${errorAttributes('ingredientCategory', fieldErrors)} name="category"${disabledAttribute(pending)}>${categoryOptions.map((category) => `<option value="${text(category)}">${text(category)}</option>`).join('')}</select>${fieldError('ingredientCategory', fieldErrors)}</label>
      <button class="button button-primary" type="submit"${disabledAttribute(pending)}>품목 추가</button>
    </form>
    <div class="card-grid compact-grid item-management">${filtered.map((item) => ingredientCard(item, expandedIngredientId)).join('') || emptyState('이 상태의 품목이 아직 없어요.')}</div>
  </section>`;
}

function mealsPanel({ state, weekStart, comboBuilderIngredientIds, fieldErrors, pending, ingredientReferenceAlert }) {
  return `<section class="section section-tight" aria-labelledby="mealTitle">
    <div class="section-head section-head-inline">
      <div><p class="eyebrow">7일 계획</p><h2 id="mealTitle" tabindex="-1">식단표</h2></div>
      <label class="date-control">시작일 <input id="weekStart" value="${text(weekStart)}" type="date"${disabledAttribute(pending)}></label>
    </div>
    ${ingredientReferenceAlertHtml(ingredientReferenceAlert)}
    ${recommendationPanel(state)}
    <div class="combo-library">${state.combinations.map((combo) => comboCard(combo, state, weekStart, pending)).join('') || emptyState('저장된 조합이 없어요.')}</div>
    ${mealScheduleCalendar(state, weekStart, { pending })}
  </section>
  <section class="section" aria-labelledby="comboTitle">
    <div class="section-head">
      <div><p class="eyebrow">레시피</p><h2 id="comboTitle" tabindex="-1">조합</h2></div>
    </div>
    ${comboBuilder(state, comboBuilderIngredientIds, fieldErrors, pending)}
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

function settingsPanel({ state, fieldErrors, pending }) {
  const profile = state.childProfile || {};
  return `<section class="section section-tight settings-screen" aria-labelledby="settingsTitle">
    <div class="settings-profile">
      <div class="profile-preview" aria-hidden="true"><img src="/profile-avatar.svg" alt=""></div>
      <div><p class="eyebrow">Child Profile</p><h2 id="settingsTitle" tabindex="-1">${text(childDisplayName(state))}</h2><span>공유 가정의 보호자에게 표시돼요.</span></div>
    </div>
    <form id="profileForm" class="form-card profile-form" data-profile-form>
      <label class="field"><span>표시 이름</span><input id="profileDisplayName"${errorAttributes('profileDisplayName', fieldErrors)} name="display_name" autocomplete="off" value="${text(profile.display_name || '')}" placeholder="예: 주원" required${disabledAttribute(pending)}>${fieldError('profileDisplayName', fieldErrors)}</label>
      <label class="field"><span>생일</span><input id="profileBirthDate"${errorAttributes('profileBirthDate', fieldErrors)} name="birth_date" type="date" value="${text(profile.birth_date || '')}"${disabledAttribute(pending)}>${fieldError('profileBirthDate', fieldErrors)}</label>
      <label class="field profile-notes"><span>메모</span><textarea id="profileNotes" name="notes" rows="4" placeholder="알레르기 의심, 선호 식감 등을 적어두세요."${disabledAttribute(pending)}>${text(profile.notes || '')}</textarea></label>
      <div class="profile-actions">
        <button class="button button-secondary" type="button" data-profile-photo${disabledAttribute(pending)}>${materialIcon('photo_camera')}사진 변경</button>
        <button class="button button-primary" type="submit" data-profile-save${disabledAttribute(pending)}>${materialIcon('save')}저장</button>
      </div>
    </form>
  </section>`;
}

function tabButton(tab, activeTab) {
  const selected = tab.id === activeTab;
  return `<button id="tab-${tab.id}" class="tab-button${selected ? ' is-active' : ''}" type="button" role="tab" tabindex="${selected ? '0' : '-1'}" aria-selected="${selected}" aria-controls="panel-${tab.id}" data-tab="${tab.id}">${materialIcon(tab.icon)}<b>${text(tab.label)}</b><span>${text(tab.detail)}</span></button>`;
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
    <button class="swipe-action" type="button" tabindex="-1" aria-hidden="true" aria-label="${text(item.ingredient_name)} 현재 재고 전체 삭제" data-delete-stock="${text(item.ingredient_id)}">전체 삭제</button>
    <article class="data-card inventory-card is-${item.severity}${expanded ? ' is-expanded' : ''}" data-stock-card="${text(item.ingredient_id)}">
      <div><b>${text(item.ingredient_name)}</b><span>${text(item.category || '카테고리 없음')}</span></div>
      <strong>${text(item.current_count)}개</strong>
      <em>${severityLabels[item.severity]}${item.empty_label ? ` · ${text(item.empty_label)}` : ''}</em>
      <button class="stock-toggle" type="button" aria-label="${text(item.ingredient_name)} 날짜별 재고 펼치기" aria-expanded="${expanded}" data-stock-toggle="${text(item.ingredient_id)}">${chevronIcon()}</button>
      <button class="button button-secondary button-compact destructive-alternative" type="button" aria-label="${text(item.ingredient_name)} 현재 재고 전체 삭제" data-request-delete-stock="${text(item.ingredient_id)}">현재 재고 전체 삭제</button>
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
    <button class="swipe-action" type="button" tabindex="-1" aria-hidden="true" aria-label="${text(item.name)} 품목 삭제" data-delete-ingredient="${text(item.id)}">삭제</button>
    <article class="data-card ingredient-card${expanded ? ' is-expanded' : ''}">
      <div class="ingredient-summary">
        <div><b>${text(item.name)}</b><span>${text(item.category || '카테고리 없음')}</span><em>${label(statusLabels, item.status)}</em>${item.status === 'suspected_reaction' ? '<small>진단이 아닌 기록 상태예요.</small>' : ''}</div>
        <button class="ingredient-toggle" type="button" aria-label="${text(item.name)} 상태 변경 펼치기" aria-expanded="${expanded}" data-ingredient-toggle="${text(item.id)}">${chevronIcon()}</button>
        <button class="button button-secondary button-compact destructive-alternative" type="button" aria-label="${text(item.name)} 품목 삭제" data-request-delete-ingredient="${text(item.id)}">품목 삭제</button>
      </div>
      ${expanded ? `<div class="ingredient-detail">
        <label class="field status-field"><span>적응 상태</span><select data-ingredient-status="${text(item.id)}">${statusOptions.map((status) => `<option value="${status}"${item.status === status ? ' selected' : ''}>${label(statusLabels, status)}</option>`).join('')}</select></label>
        <label class="field category-field"><span>카테고리</span><select data-ingredient-category="${text(item.id)}">${categoryOptions.map((category) => `<option value="${text(category)}"${item.category === category ? ' selected' : ''}>${text(category)}</option>`).join('')}</select></label>
      </div>` : ''}
    </article>
  </div>`;
}

function comboCard(combo, state, weekStart, pending) {
  const comboItems = state.combinationItems.filter((item) => item.combination_id === combo.id);
  const itemSummary = comboItems.map((item) => `${text(state.ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.name || '알 수 없음')} ${text(item.cube_count)}개`).join(' · ');
  return `<article class="combo-box"${pending ? '' : ` draggable="true" data-drag-combo="${text(combo.id)}"`}>
    <div class="combo-box-head"><b>${text(combo.name)}</b><span>${text(combo.stage || '단계 미지정')}</span></div>
    <span>${itemSummary || '구성 품목 없음'}</span>
    <button class="button button-secondary button-compact" type="button" data-add-combo-meal="${text(combo.id)}" data-add-combo-date="${text(weekStart)}"${disabledAttribute(pending)}>${materialIcon('add_circle')}식단에 추가</button>
  </article>`;
}

function comboBuilder(state, selectedIds, fieldErrors, pending) {
  const ingredients = activeIngredients(state.ingredients);
  const selected = selectedIds.map((ingredientId) => ingredients.find((item) => item.id === ingredientId)).filter(Boolean);
  return `<form id="comboBuilderForm" class="combo-builder">
    <label class="field combo-name-field"><span>조합명</span><input id="comboName"${errorAttributes('comboName', fieldErrors)} name="name" autocomplete="off" placeholder="예: 소고기 브로콜리 죽" required${disabledAttribute(pending)}>${fieldError('comboName', fieldErrors)}</label>
    <fieldset id="comboStage" class="stage-selector" tabindex="-1"${errorAttributes('comboStage', fieldErrors)}>
      <legend>이유식 단계</legend>
      ${stageOptions.map((stage, index) => `<label><input type="radio" name="stage" value="${text(stage)}"${index === 1 ? ' checked' : ''}${disabledAttribute(pending)}><span>${text(stage)}</span></label>`).join('')}
      ${fieldError('comboStage', fieldErrors)}
    </fieldset>
    <div class="ingredient-palette">${ingredients.map((ingredient) => ingredientToken(ingredient, pending)).join('') || emptyState('등록된 품목이 없어요.')}</div>
    <div class="combo-drop-zone${selected.length ? ' has-items' : ''}"${pending ? '' : ' data-combo-drop-zone'}>
      <div class="builder-selection">${selected.map((ingredient) => selectedIngredientToken(ingredient, fieldErrors, pending)).join('') || '<span class="meal-slot-empty">품목을 여기에 넣어요</span>'}</div>
    </div>
    <button class="button button-primary" type="submit"${disabledAttribute(pending)}>저장</button>
  </form>`;
}

function ingredientToken(ingredient, pending) {
  return `<button class="ingredient-token" type="button"${pending ? ' disabled' : ` draggable="true" data-drag-ingredient="${text(ingredient.id)}" data-add-combo-ingredient="${text(ingredient.id)}"`}>${materialIcon(categoryIcon(ingredient.category))}<b>${text(ingredient.name)}</b><span>${text(ingredient.category || '카테고리 없음')}</span></button>`;
}

function selectedIngredientToken(ingredient, fieldErrors, pending) {
  const fieldId = `comboCount-${ingredient.id}`;
  return `<div class="selected-token">
    <button type="button" data-builder-remove="${text(ingredient.id)}" aria-label="${text(ingredient.name)} 제거"${disabledAttribute(pending)}>${materialIcon('close')}</button>
    <span>${text(ingredient.name)}</span>
    <label><span class="sr-only">${text(ingredient.name)} 큐브 수</span><input id="${text(fieldId)}"${errorAttributes(fieldId, fieldErrors)} name="cube_count_${text(ingredient.id)}" type="number" min="1" max="12" inputmode="numeric" value="1" required${disabledAttribute(pending)}>${fieldError(fieldId, fieldErrors)}</label>
  </div>`;
}

function eventCard(event) {
  const actorLabel = event.actor_email ? '보호자' : '가정';
  const sourceLabel = event.source === 'manual' ? '직접 변경' : '공유 저장';
  const timestamp = formatEventTime(event.created_at);
  return `<article class="data-card record-card"><b>${label(eventLabels, event.type)}</b><span>${actorLabel} · ${sourceLabel}</span><small>${text(timestamp)}</small></article>`;
}

function emptyState(copy) {
  return `<p class="empty">${text(copy)}</p>`;
}

function recommendationPanel(state) {
  const firstCombo = state.combinations[0];
  const summary = firstCombo ? `${firstCombo.name} 조합을 식단표에 배치할 수 있어요.` : '조합을 저장하면 식단 추천이 여기 표시돼요.';
  return `<article class="recommendation-panel">
    <img src="/empty-bowl.svg" alt="" aria-hidden="true">
    <div><p class="eyebrow">Recommendation</p><b>${text(summary)}</b><span>현재 재고와 주간 계획을 기준으로 보여드려요.</span></div>
  </article>`;
}

function filterChip(option, activeFilter) {
  const selected = option.id === activeFilter;
  return `<button class="filter-chip${selected ? ' is-selected' : ''}" type="button" aria-pressed="${selected}" data-ingredient-filter="${text(option.id)}">${text(option.label)}</button>`;
}

function feedbackHtml(feedback) {
  if (!feedback?.message) return '<div id="toast" class="toast app-toast" role="status" aria-live="polite"></div>';
  const role = feedback.tone === 'success' || feedback.tone === 'pending' ? 'status' : 'alert';
  return `<div id="toast" class="toast app-toast" role="${role}" aria-live="${role === 'alert' ? 'assertive' : 'polite'}" data-tone="${text(feedback.tone || 'info')}">${text(feedback.message)}</div>`;
}

function ingredientReferenceAlertHtml(alert) {
  if (!alert) return '';
  return `<section class="inline-alert" role="region" aria-label="품목 삭제 제한 안내" data-reference-alert="${text(alert.ingredientId)}"><p>${text(ingredientReferenceMessage(alert.name))}</p><strong>조합 ${text(alert.combinationCount)}개 · 식단 ${text(alert.mealSlotCount)}개</strong><button class="button button-secondary" type="button" data-action-tab="meals">식단 확인</button></section>`;
}

function confirmationHtml(confirmation) {
  if (!confirmation) return '';
  return `<dialog class="confirmation-panel" role="dialog" aria-modal="true" aria-labelledby="confirmationTitle" data-confirmation-kind="${text(confirmation.kind)}" data-confirmation-id="${text(confirmation.id)}"><h2 id="confirmationTitle">${text(confirmation.title)}</h2><p>${text(confirmation.consequence)}</p><div class="confirmation-actions"><button class="button button-secondary" type="button" data-cancel-delete>취소</button><button class="button button-danger" type="button" data-confirm-delete>삭제 확인</button></div></dialog>`;
}

function errorAttributes(fieldId, fieldErrors) {
  return fieldErrors[fieldId] ? ` aria-invalid="true" aria-describedby="${text(fieldId)}-error"` : '';
}

function fieldError(fieldId, fieldErrors) {
  return fieldErrors[fieldId] ? `<span id="${text(fieldId)}-error" class="field-error" role="alert">${text(fieldErrors[fieldId])}</span>` : '';
}

function disabledAttribute(pending) {
  return pending ? ' disabled' : '';
}

function formatEventTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '시간 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function categoryIcon(category) {
  if (/단백질|고기|소고기/.test(String(category))) return 'restaurant';
  if (/곡|쌀|미음/.test(String(category))) return 'rice_bowl';
  if (/과일/.test(String(category))) return 'nutrition';
  if (/채소/.test(String(category))) return 'eco';
  return 'local_dining';
}

function materialIcon(name) {
  const paths = {
    add_circle: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2Z"/>',
    calendar_month: '<path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10ZM4 8h16V6h-3v2h-2V6H9v2H7V6H4v2Z"/>',
    close: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/>',
    eco: '<path d="M20.7 3.3C13.6 3.1 8.4 5.1 6 9c-1.5 2.5-1.2 5.1.5 6.8L3 19.3 4.7 21l3.5-3.5c1.7 1.7 4.3 2 6.8.5 3.9-2.4 5.9-7.6 5.7-14.7ZM9.6 15.9l7.8-7.8-6.2 9.2c-.6-.2-1.1-.7-1.6-1.4Z"/>',
    egg_alt: '<path d="M12 2C8.3 2 5 8.5 5 13a7 7 0 1 0 14 0c0-4.5-3.3-11-7-11Zm0 18a5 5 0 0 1-5-5c0-3.9 2.9-10.8 5-10.8S17 11.1 17 15a5 5 0 0 1-5 5Z"/>',
    history: '<path d="M13 3a9 9 0 0 0-8.6 6.4L2 7v7h7l-3-3a7 7 0 1 1 1.8 6.6l-1.4 1.5A9 9 0 1 0 13 3Zm-1 5v5l4.2 2.5 1-1.7-3.2-1.9V8h-2Z"/>',
    inventory_2: '<path d="m4 3 1.2-2h13.6L20 3v3h-1v15H5V6H4V3Zm3 3v13h10V6H7Zm-.7-3-.6 1h12.6l-.6-1H6.3ZM9 9h6v2H9V9Z"/>',
    local_dining: '<path d="M8 2v8a2 2 0 0 1-2 2v10H4V12a2 2 0 0 1-2-2V2h2v6h1V2h2v6h1V2Zm9 0c2.8 0 5 2.7 5 6 0 2.6-1.4 4.8-3.5 5.6V22h-2v-8.4C14.4 12.8 13 10.6 13 8c0-3.3 1.8-6 4-6Zm0 2c-1 0-2 1.8-2 4s1 4 2 4 3-1.8 3-4-1.3-4-3-4Z"/>',
    lock: '<path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V7Zm7 13H7v-9h10v9Z"/>',
    nutrition: '<path d="M17.8 3c2.3.2 3.8 1.7 4 4-2.3-.2-3.8-1.7-4-4ZM12 5c4.8 0 9 4.2 9 9.2 0 4.5-3 7.8-7 7.8-1 0-1.5-.4-2-.4s-1 .4-2 .4c-4 0-7-3.3-7-7.8C3 9.2 7.2 5 12 5Zm0 2c-3.7 0-7 3.3-7 7.2 0 3.4 2.1 5.8 5 5.8 1 0 1.4-.4 2-.4s1 .4 2 .4c2.9 0 5-2.4 5-5.8C19 10.3 15.7 7 12 7Zm-1-5h2v4h-2V2Z"/>',
    photo_camera: '<path d="m9 3-1.8 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
    restaurant: '<path d="M7 2h2v8a3 3 0 0 1-2 2v10H5V12a3 3 0 0 1-2-2V2h2v6h2V2Zm8 0h2v20h-2v-8h-3V7a5 5 0 0 1 3-5Zm0 3.2A3 3 0 0 0 14 7v5h1V5.2Z"/>',
    rice_bowl: '<path d="M4 3h16v2H4V3Zm-1 5h18a9 9 0 0 1-18 0Zm2.3 2a7 7 0 0 0 13.4 0H5.3ZM8 22v-2h8v2H8Z"/>',
    save: '<path d="M5 2h12l5 5v15H2V2h3Zm-1 2v16h16V8h-4V4H4Zm3 0h7v5H7V4Zm0 9h10v5H7v-5Z"/>',
    settings: '<path d="m19.4 13 .1-1-.1-1 2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-4l-.4 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5-.1 1 .1 1-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1L11 21h4l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5ZM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
    today: '<path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2Zm13 8H4v10h16V10Zm-9 7-3-3 1.4-1.4 1.6 1.6 3.6-3.6L16 12l-5 5Z"/>',
  };
  const path = paths[name] || paths.local_dining;
  return `<span class="material-symbols-outlined" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false" fill="currentColor">${path}</svg></span>`;
}

function trashIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M9 4h6l1 2h4v2H4V6h4l1-2Zm-2 6h10l-.7 10H7.7L7 10Zm3 2v6h2v-6h-2Zm4 0v6h2v-6h-2Z" fill="currentColor"/></svg>';
}

function chevronIcon() {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="M7 10l5 5 5-5H7Z" fill="currentColor"/></svg>';
}
