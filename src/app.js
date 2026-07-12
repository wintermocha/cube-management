import { DEFAULT_MEAL_TYPE, activeIngredients, summarizeInventory, calculateForecast, ingredientDeletionGuard, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, adjustCubeLotCount, upsertCubeLotForDate } from './lib/domain.js';
import { focusFallbackSelector, idSelector, nextComboRemovalFocusId, wireAppEvents } from './lib/bindings.js';
import { categoryOptions, focusedControlScrollDelta, ingredientReferenceMessage, label, renderAppHtml, renderAuthRequiredHtml, renderForbiddenHtml, renderLoadErrorHtml, renderLoadingHtml, stageOptions, statusLabels, statusOptions } from './lib/view.js';
import { createSharedStateSync } from './lib/api-state.js';
import { safeStorage } from './lib/safe-storage.js';
import { loginHref } from './lib/auth-navigation.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
const ACTIVE_TAB_KEY = `${STORAGE_KEY}:active-tab`, WEEK_START_KEY = `${STORAGE_KEY}:week-start`;
const TAB_IDS = ['today', 'inventory', 'items', 'meals', 'records', 'settings'];
const MUTATION_SELECTOR = 'form input, form select, form textarea, form button, [data-lot-increment], [data-lot-decrement], [data-delete-lot], [data-delete-stock], [data-delete-ingredient], [data-request-delete-stock], [data-request-delete-ingredient], [data-ingredient-status], [data-ingredient-category], [data-add-combo-ingredient], [data-builder-remove], [data-add-combo-meal]';
let state = null, acknowledgedState = null;
let activeTab = loadActiveTab();
let settingsReturnTab = activeTab === 'settings' ? 'today' : activeTab;
let weekStart = loadWeekStart();
let surface = 'loading', pending = false;
let expandedStockId = null, expandedIngredientId = null;
let lotFormDefaults = null;
let comboBuilderIngredientIds = [];
let activeIngredientFilter = 'all';
let feedback = null, pendingSuccessMessage = null, fieldErrors = {}, confirmation = null, ingredientReferenceAlert = null;
let desiredFocus = null, skipDraftCaptureFormId = null;
const formDrafts = new Map(), panelScroll = new Map();
const sharedState = createSharedStateSync();

function loadActiveTab() { const saved = safeStorage.get(ACTIVE_TAB_KEY); return saved.ok && TAB_IDS.includes(saved.value) ? saved.value : 'today'; }
function loadWeekStart() { const saved = safeStorage.get(WEEK_START_KEY); return saved.ok && /^\d{4}-\d{2}-\d{2}$/.test(saved.value || '') ? saved.value : localMonday(); }
function saveActiveTab(tabId) { safeStorage.set(ACTIVE_TAB_KEY, tabId); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function actor() { return 'caregiver-a@example.com'; }
function logEvent(type, payload, before = null, after = null, source = 'manual') {
  const event = { id: id('evt'), household_id: 'home', actor_email: actor(), source, type, payload_json: JSON.stringify(payload), before_json: before && JSON.stringify(before), after_json: after && JSON.stringify(after), created_at: now(), undo_event_id: null };
  state.events.unshift(event);
  return event;
}

function render() {
  const focusSnapshot = desiredFocus || captureFocusAnchor();
  captureFormDrafts(skipDraftCaptureFormId);
  skipDraftCaptureFormId = null;
  capturePanelScroll();
  const app = document.querySelector('#app');
  if (surface !== 'authenticated' || !state) {
    app.innerHTML = surface === 'loading' ? renderLoadingHtml()
      : surface === 'auth-required' ? renderAuthRequiredHtml({ message: feedback?.message, loginHref: loginHref() })
        : surface === 'forbidden' ? renderForbiddenHtml({ message: feedback?.message })
          : renderLoadErrorHtml({ message: feedback?.message });
    wireGateEvents();
    desiredFocus = null;
    return;
  }
  const ingredients = activeIngredients(state.ingredients);
  const inventory = summarizeInventory(ingredients, state.cubeLots);
  const forecast = calculateForecast({ ingredients, lots: state.cubeLots, combinations: state.combinations, combinationItems: state.combinationItems, mealPlanSlots: state.mealPlanSlots, startDate: weekStart });
  const critical = inventory.filter((item) => item.severity === 'error');
  const warnings = inventory.filter((item) => item.severity === 'warn');
  const shortages = forecast.filter((item) => item.shortage > 0);
  const nextMealCount = state.mealPlanSlots.filter((slot) => slot.status !== 'cancelled').length;
  app.innerHTML = renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId, expandedIngredientId, todayDate: localDate(), lotFormDefaults, comboBuilderIngredientIds, activeIngredientFilter, pending, feedback, fieldErrors, confirmation, ingredientReferenceAlert, settingsReturnTab });
  wireAppEvents({
    onTabChange: handleTabChange,
    onActionTab: handleActionTab,
    onSettingsTab: handleSettingsTab,
    onWeekChange: handleWeekChange,
    onLotSubmit: handleLotSubmit,
    onIngredientSubmit: handleIngredientSubmit,
    onStockDelete: handleStockDelete,
    onLotAdjust: handleLotAdjust,
    onIngredientDelete: handleIngredientDelete,
    onLotDelete: handleLotDelete,
    onIngredientStatusChange: handleIngredientStatusChange,
    onIngredientCategoryChange: handleIngredientCategoryChange,
    onComboIngredientDrop: handleComboIngredientDrop,
    onComboBuilderRemove: handleComboBuilderRemove,
    onComboBuilderSubmit: handleComboBuilderSubmit,
    onComboAddToMeal: handleComboAddToMeal,
    onMealComboDrop: handleMealComboDrop,
    onIngredientFilter: handleIngredientFilter,
    onProfileSubmit: handleProfileSubmit,
    onProfilePhoto: handleProfilePhoto,
    onStockToggle: toggleStockDescription,
    onIngredientToggle: toggleIngredientCard,
    onConfirmDelete: handleConfirmDelete,
    onCancelDelete: handleCancelDelete,
    onRetryLoad: loadAuthoritativeState,
    onInvalidField: handleInvalidField,
  });
  if (pending) document.querySelectorAll(MUTATION_SELECTOR).forEach((control) => { control.disabled = true; });
  restoreFormDrafts();
  restorePanelScroll();
  restoreFocus(focusSnapshot);
  desiredFocus = null;
}
function capturePanelScroll() {
  const panel = document.querySelector('.tab-panel:not([hidden])');
  if (panel instanceof HTMLElement) panelScroll.set(panel.id, panel.scrollTop);
  const shell = document.querySelector('.app-shell');
  const shellTab = TAB_IDS.find((tabId) => shell?.classList.contains(`app-shell-${tabId}`));
  if (shell instanceof HTMLElement && shellTab) panelScroll.set(`shell:${shellTab}`, shell.scrollTop);
}
function restorePanelScroll() {
  const panel = document.querySelector(`#panel-${activeTab}`);
  if (panel instanceof HTMLElement) {
    const maxScrollTop = Math.max(0, panel.scrollHeight - panel.clientHeight);
    panel.scrollTop = Math.min(panelScroll.get(panel.id) || 0, maxScrollTop);
  }
  const shell = document.querySelector('.app-shell');
  if (shell instanceof HTMLElement) {
    const maxScrollTop = Math.max(0, shell.scrollHeight - shell.clientHeight);
    shell.scrollTop = Math.min(panelScroll.get(`shell:${activeTab}`) || 0, maxScrollTop);
  }
}
function wireGateEvents() {
  document.querySelector('[data-auth-login]')?.addEventListener('click', () => window.location.reload());
  document.querySelector('[data-state-retry]')?.addEventListener('click', loadAuthoritativeState);
}
function handleTabChange(tabId, focusTab = false) {
  if (!TAB_IDS.includes(tabId)) tabId = 'today';
  activeTab = tabId;
  saveActiveTab(tabId);
  confirmation = null;
  if (focusTab && tabId !== 'settings') desiredFocus = `#tab-${tabId}`;
  render();
}
function handleActionTab(tabId) {
  desiredFocus = `#panel-${tabId} h2`;
  handleTabChange(tabId);
}
function handleSettingsTab() {
  settingsReturnTab = activeTab === 'settings' ? settingsReturnTab : activeTab;
  desiredFocus = '[data-action-tab]';
  handleTabChange('settings');
}
function handleWeekChange(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  weekStart = value;
  safeStorage.set(WEEK_START_KEY, weekStart);
  desiredFocus = '#weekStart';
  render();
}
function handleIngredientFilter(filter) {
  const allowed = ['all', ...statusOptions];
  if (!allowed.includes(filter)) return;
  activeIngredientFilter = filter;
  activeTab = 'items';
  saveActiveTab(activeTab);
  confirmation = null;
  desiredFocus = `[data-ingredient-filter="${filter}"]`;
  render();
}
function handleLotSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const description = String(fd.get('description') || '').trim();
  const grams = parseOptionalPositiveNumber(fd.get('grams_per_cube'));
  if (grams === false) { validationError('lotGramsPerCube', '큐브 무게는 0보다 큰 숫자로 입력해 주세요.'); return; }
  const formValues = { ingredientId: String(fd.get('ingredient_id') || ''), quantity: Number(fd.get('initial_count')), madeAt: String(fd.get('made_at') || ''), description, gramsPerCube: grams };
  if (addLot(formValues)) {
    lotFormDefaults = formValues;
    saveState({ formId: 'lotForm', focus: '#stockAddTitle' });
    showToast('재고를 추가했어요.', 'success');
  }
}
function handleLotAdjust(lotId, delta) {
  const beforeLots = state.cubeLots;
  const lot = beforeLots.find((item) => item.id === lotId && !item.deleted_at);
  if (!lot) { showToast('조정할 재고를 찾지 못했어요.', 'warning'); return; }
  if (delta < 0 && Number(lot.remaining_count || 0) <= 0) { showToast('차감할 재고가 없어요.', 'warning'); return; }
  const result = adjustCubeLotCount(beforeLots, lotId, delta, now());
  if (!result.changed) { showToast('재고를 조정하지 못했어요.', 'warning'); return; }
  state = { ...state, cubeLots: result.lots };
  logEvent(delta > 0 ? 'stock_increment' : 'stock_decrement', { lot_id: lotId, ingredient_id: lot.ingredient_id, delta, adjusted_lot: result.adjusted_lot }, beforeLots, result.lots, 'manual');
  saveState({ focus: dataSelector(`data-lot-${delta > 0 ? 'increment' : 'decrement'}`, lotId) });
  showToast(`${lot.made_at || '날짜 없음'} 재고를 ${delta > 0 ? '추가' : '차감'}했어요.`, 'success');
}
function handleIngredientSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('name') || '').trim();
  const category = String(fd.get('category') || '채소');
  if (!name) { validationError('ingredientName', '품목명을 입력해 주세요.'); return; }
  if (!categoryOptions.includes(category)) { validationError('ingredientCategory', '카테고리를 선택해 주세요.'); return; }
  if (activeIngredients(state.ingredients).some((item) => item.name === name)) { validationError('ingredientName', '이미 등록된 품목이에요.'); return; }
  const ingredient = { id: id('ing'), household_id: 'home', name, category, status: 'planned', notes: '', created_at: now(), updated_at: now() };
  state.ingredients.push(ingredient);
  logEvent('ingredient_create', ingredient);
  saveState({ formId: 'ingredientForm', focus: '#ingredientTitle' });
  showToast('품목을 추가했어요.', 'success');
}
function handleIngredientStatusChange(ingredientId, status) {
  if (!statusOptions.includes(status)) { showToast('지원하지 않는 상태예요.', 'warning'); return; }
  const before = state.ingredients.find((item) => item.id === ingredientId);
  if (!before) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  state.ingredients = state.ingredients.map((item) => item.id === ingredientId ? { ...item, status, updated_at: now() } : item);
  const after = state.ingredients.find((item) => item.id === ingredientId);
  logEvent('ingredient_status_update', { ingredient_id: ingredientId, status }, before, after, 'manual');
  saveState({ focus: dataSelector('data-ingredient-status', ingredientId) });
  showToast(`${before.name} 상태를 ${label(statusLabels, status)}(으)로 바꿨어요.`, 'success');
}
function handleIngredientCategoryChange(ingredientId, category) {
  if (!categoryOptions.includes(category)) { showToast('지원하지 않는 카테고리예요.', 'warning'); return; }
  const before = state.ingredients.find((item) => item.id === ingredientId);
  if (!before) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  state.ingredients = state.ingredients.map((item) => item.id === ingredientId ? { ...item, category, updated_at: now() } : item);
  const after = state.ingredients.find((item) => item.id === ingredientId);
  logEvent('ingredient_category_update', { ingredient_id: ingredientId, category }, before, after, 'manual');
  saveState({ focus: dataSelector('data-ingredient-category', ingredientId) });
  showToast(`${before.name} 카테고리를 ${category}(으)로 바꿨어요.`, 'success');
}
function handleIngredientDelete(ingredientId) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('삭제할 품목을 찾지 못했어요.', 'warning'); return; }
  const guard = ingredientDeletionGuard(state, ingredientId);
  if (guard.kind === 'referenced') {
    ingredientReferenceAlert = { ingredientId, name: ingredient.name, combinationCount: guard.combinationCount, mealSlotCount: guard.mealSlotCount };
    confirmation = null;
    feedback = { tone: 'error', message: ingredientReferenceMessage(ingredient.name) };
    desiredFocus = `${dataSelector('data-reference-alert', ingredientId)} [data-action-tab="meals"]`;
    render();
    return;
  }
  if (guard.kind === 'minimum') { showToast('품목은 최소 1개가 필요해요.', 'warning'); return; }
  confirmation = { kind: 'ingredient', id: ingredientId, title: `${ingredient.name} 품목 삭제`, consequence: '이 품목과 현재 큐브 재고가 영구 삭제돼요.' };
  desiredFocus = '[data-cancel-delete]';
  render();
}
function handleStockDelete(ingredientId) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  if (!state.cubeLots.some((lot) => lot.ingredient_id === ingredientId && !lot.deleted_at)) { showToast('삭제할 재고가 없어요.', 'warning'); return; }
  confirmation = { kind: 'stock', id: ingredientId, title: `${ingredient.name} 현재 재고 전체 삭제`, consequence: '날짜별 큐브 재고가 모두 삭제되고 품목은 남아요.' };
  desiredFocus = '[data-cancel-delete]';
  render();
}
function handleLotDelete(lotId) {
  const lot = state.cubeLots.find((item) => item.id === lotId && !item.deleted_at);
  if (!lot) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  confirmation = { kind: 'lot', id: lotId, title: `${lot.made_at || '날짜 없음'} 재고 삭제`, consequence: '이 날짜의 큐브 재고가 영구 삭제돼요.' };
  desiredFocus = '[data-cancel-delete]';
  render();
}
function handleConfirmDelete() {
  const target = confirmation;
  if (!target) return;
  confirmation = null;
  if (target.kind === 'ingredient') {
    const ingredient = activeIngredients(state.ingredients).find((item) => item.id === target.id);
    const result = removeIngredientFromState(state, target.id, now());
    if (!ingredient || !result.removed) { showToast('삭제할 품목을 찾지 못했어요.', 'warning'); return; }
    state = result.state;
    logEvent('ingredient_delete', { ingredient_id: target.id, ingredient_name: ingredient.name, cleared_lot_count: result.clearedLotCount }, ingredient, null, 'manual');
    saveState({ ingredientId: target.id, focus: '#ingredientTitle' });
    showToast(`${ingredient.name} 품목을 삭제했어요.`, 'success');
    return;
  }
  if (target.kind === 'stock') {
    const ingredient = activeIngredients(state.ingredients).find((item) => item.id === target.id);
    const result = removeStockForIngredientFromState(state, target.id, now());
    if (!ingredient || !result.removed) { showToast('삭제할 재고가 없어요.', 'warning'); return; }
    state = result.state;
    logEvent('stock_clear', { ingredient_id: target.id, ingredient_name: ingredient.name, cleared_lot_count: result.clearedLotCount }, null, state.cubeLots, 'manual');
    saveState({ focus: '#cubeTitle' });
    showToast(`${ingredient.name} 현재 재고를 삭제했어요.`, 'success');
    return;
  }
  const lot = state.cubeLots.find((item) => item.id === target.id && !item.deleted_at);
  const result = removeCubeLotFromState(state, target.id, now());
  if (!lot || !result.removed) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  state = result.state;
  logEvent('cube_lot_delete', { lot_id: target.id, ingredient_id: lot.ingredient_id, initial_count: lot.initial_count }, lot, null, 'manual');
  saveState({ focus: dataSelector('data-stock-toggle', lot.ingredient_id) });
  showToast('재고를 삭제했어요.', 'success');
}
function handleCancelDelete() {
  const target = confirmation;
  confirmation = null;
  if (target?.kind === 'lot') desiredFocus = dataSelector('data-delete-lot', target.id);
  else if (target?.kind === 'ingredient') desiredFocus = dataSelector('data-request-delete-ingredient', target.id);
  else if (target?.kind === 'stock') desiredFocus = dataSelector('data-request-delete-stock', target.id);
  render();
}
function toggleStockDescription(ingredientId) {
  expandedStockId = expandedStockId === ingredientId ? null : ingredientId;
  desiredFocus = dataSelector('data-stock-toggle', ingredientId); render();
}
function toggleIngredientCard(ingredientId) {
  expandedIngredientId = expandedIngredientId === ingredientId ? null : ingredientId;
  desiredFocus = dataSelector('data-ingredient-toggle', ingredientId); render();
}
function handleComboIngredientDrop(ingredientId) {
  if (pending) { showToast('저장이 끝난 뒤 조합을 다시 바꿔 주세요.', 'warning'); return; }
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  if (comboBuilderIngredientIds.includes(ingredientId)) { showToast('이미 조합에 들어간 품목이에요.', 'warning'); return; }
  comboBuilderIngredientIds = comboBuilderIngredientIds.concat(ingredientId);
  desiredFocus = dataSelector('data-builder-remove', ingredientId);
  render();
}
function handleComboBuilderRemove(ingredientId) {
  if (pending) { showToast('저장이 끝난 뒤 조합을 다시 바꿔 주세요.', 'warning'); return; }
  const nextFocusId = nextComboRemovalFocusId(comboBuilderIngredientIds, ingredientId);
  comboBuilderIngredientIds = comboBuilderIngredientIds.filter((idValue) => idValue !== ingredientId);
  desiredFocus = nextFocusId
    ? dataSelector('data-builder-remove', nextFocusId)
    : '#comboTitle';
  render();
}
function handleComboBuilderSubmit(form) {
  const selectedIngredients = comboBuilderIngredientIds.map((ingredientId) => activeIngredients(state.ingredients).find((item) => item.id === ingredientId)).filter(Boolean);
  if (!selectedIngredients.length) { validationError('comboStage', '조합에 넣을 품목을 선택해 주세요.'); return; }
  const fd = new FormData(form);
  const generatedName = selectedIngredients.map((ingredient) => ingredient.name).join(' ');
  const name = String(fd.get('name') || generatedName).trim();
  if (!name) { validationError('comboName', '조합명을 입력해 주세요.'); return; }
  const stage = String(fd.get('stage') || '중기');
  if (!stageOptions.includes(stage)) { validationError('comboStage', '이유식 단계를 선택해 주세요.'); return; }
  const items = [];
  for (const ingredient of selectedIngredients) {
    const cubeCount = Number(fd.get(`cube_count_${ingredient.id}`));
    if (!Number.isInteger(cubeCount) || cubeCount < 1 || cubeCount > 12) {
      validationError(`comboCount-${ingredient.id}`, `${ingredient.name} 큐브 수는 1개에서 12개 사이로 입력해 주세요.`);
      return;
    }
    items.push({ combination_id: null, ingredient_id: ingredient.id, cube_count: cubeCount });
  }
  const timestamp = now();
  const combination = { id: id('combo'), household_id: 'home', name, stage, texture: '', notes: '', created_at: timestamp, updated_at: timestamp };
  const combinationItems = items.map((item) => ({ ...item, combination_id: combination.id }));
  const before = { combinations: state.combinations, combinationItems: state.combinationItems };
  state = { ...state, combinations: state.combinations.concat(combination), combinationItems: state.combinationItems.concat(combinationItems) };
  logEvent('combo_create', { combination_id: combination.id, name, stage }, before, { combination, items: combinationItems }, 'manual');
  saveState({ formId: 'comboBuilderForm', focus: '#comboTitle' });
  showToast('조합을 저장했어요.', 'success');
}
function handleComboAddToMeal(comboId, date) {
  const targetDate = date || document.querySelector('#weekStart')?.value || localDate();
  handleMealComboDrop(comboId, targetDate);
}
function handleMealComboDrop(comboId, date) {
  if (pending) { showToast('저장이 끝난 뒤 식단에 다시 추가해 주세요.', 'warning'); return; }
  const combination = state.combinations.find((combo) => combo.id === comboId);
  if (!combination) { showToast('조합을 찾지 못했어요.', 'warning'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) { showToast('날짜를 찾지 못했어요.', 'warning'); return; }
  const timestamp = now();
  const slot = { id: id('slot'), household_id: 'home', date, meal_type: DEFAULT_MEAL_TYPE, target_type: 'combination', combination_id: comboId, ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp };
  const beforeSlots = state.mealPlanSlots;
  state = { ...state, mealPlanSlots: state.mealPlanSlots.concat(slot) };
  logEvent('meal_slot_create', { slot_id: slot.id, combination_id: comboId, date }, beforeSlots, state.mealPlanSlots, 'manual');
  saveState({ focus: dataSelector('data-add-combo-meal', comboId) });
  showToast(`${date}에 ${combination.name} 조합을 넣었어요.`, 'success');
}
function handleProfileSubmit(eventOrForm) {
  eventOrForm?.preventDefault?.();
  const form = eventOrForm?.currentTarget || eventOrForm;
  if (!(form instanceof HTMLFormElement)) { showToast('프로필 폼을 찾지 못했어요.', 'warning'); return; }
  const fd = new FormData(form);
  const displayName = String(fd.get('display_name') || '').trim();
  const birthDate = String(fd.get('birth_date') || '').trim();
  const notes = String(fd.get('notes') || '').trim();
  if (!displayName) { validationError('profileDisplayName', '표시 이름을 입력해 주세요.'); return; }
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) { validationError('profileBirthDate', '생일 형식을 확인해 주세요.'); return; }
  const timestamp = now();
  const before = state.childProfile || {};
  const after = {
    id: before.id || id('child'),
    household_id: before.household_id || 'home',
    display_name: displayName,
    birth_date: birthDate,
    notes,
    created_at: before.created_at || timestamp,
    updated_at: timestamp,
  };
  state = { ...state, childProfile: after };
  logEvent('profile_update', { child_id: after.id, display_name: displayName }, before, after, 'manual');
  saveState({ formId: 'profileForm', focus: '#settingsTitle' });
  showToast('프로필을 저장했어요.', 'success');
}
function handleProfilePhoto() {
  showToast('사진 업로드는 아직 준비 중이에요. 이름과 메모는 바로 저장돼요.', 'warning');
}
function parseOptionalPositiveNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed;
}
function localDate() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function localMonday() {
  const date = new Date();
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() - (day === 0 ? 6 : day - 1));
  return new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addLot({ ingredientId, quantity, madeAt = localDate(), description = '', source = 'manual', gramsPerCube = null }) {
  if (!ingredientId) { validationError('lotIngredient', '품목을 선택해 주세요.'); return null; }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) { validationError('lotCount', '수량은 1개에서 200개 사이로 입력해 주세요.'); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(madeAt))) { validationError('lotMadeAt', '만든 날짜를 선택해 주세요.'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id: ingredientId, made_at: madeAt, expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: gramsPerCube, storage_location: '', description, created_at: now(), updated_at: now() };
  const beforeLots = state.cubeLots;
  const result = upsertCubeLotForDate(beforeLots, lot);
  state = { ...state, cubeLots: result.lots };
  return logEvent('stock_add', { lot: result.lot, merged: result.merged }, beforeLots, result.lots, source);
}
function validationError(fieldId, message) {
  fieldErrors = { [fieldId]: message };
  feedback = { tone: 'error', message };
  desiredFocus = idSelector(fieldId);
  render();
}
function handleInvalidField(fieldId) {
  const messages = {
    lotMadeAt: '만든 날짜를 선택해 주세요.',
    lotIngredient: '품목을 선택해 주세요.',
    lotCount: '수량은 입력 범위 안에서 선택해 주세요.',
    lotGramsPerCube: '큐브 무게는 입력 범위 안에서 선택해 주세요.',
    ingredientName: '품목명을 입력해 주세요.',
    comboName: '조합명을 입력해 주세요.',
    profileDisplayName: '표시 이름을 입력해 주세요.',
  };
  validationError(fieldId, messages[fieldId] || '입력값을 확인해 주세요.');
}
function showToast(message, tone = 'info') {
  if (tone === 'success' && pending) {
    pendingSuccessMessage = message;
    return;
  }
  feedback = { tone: tone === 'warning' ? 'error' : tone, message };
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.dataset.tone = feedback.tone;
  toast.setAttribute('role', feedback.tone === 'success' ? 'status' : 'alert');
  toast.textContent = message;
}
async function saveState(context = {}) {
  if (pending || sharedState.isSaving()) {
    showToast('저장이 끝나면 한 번 더 눌러 주세요.', 'warning');
    return;
  }
  pending = true;
  fieldErrors = {};
  feedback = { tone: 'pending', message: '공유 가정에 저장하고 있어요.' };
  render();
  const optimisticState = structuredClone(state);
  const result = await sharedState.save(optimisticState);
  pending = false;
  if (result.status === 'acknowledged') {
    state = structuredClone(result.state);
    acknowledgedState = structuredClone(result.state);
    if (context.formId) formDrafts.delete(context.formId);
    skipDraftCaptureFormId = context.formId || null;
    if (context.formId === 'comboBuilderForm') comboBuilderIngredientIds = [];
    if (context.formId === 'lotForm') lotFormDefaults = null;
    confirmation = null;
    ingredientReferenceAlert = null;
    feedback = { tone: 'success', message: pendingSuccessMessage || '공유 가정에 저장했어요.' };
    desiredFocus = context.focus || null;
    pendingSuccessMessage = null;
    render();
    return;
  }
  pendingSuccessMessage = null;
  state = structuredClone(result.state || acknowledgedState);
  if (result.status === 'auth-required' || result.status === 'forbidden') {
    surface = result.status;
    state = null;
    feedback = { tone: 'error', message: result.error.message };
    render();
    return;
  }
  if (result.status === 'conflict' && result.conflict.type === 'ingredient_referenced') {
    const ingredientId = result.conflict.ingredient_ids[0] || context.ingredientId;
    const ingredient = activeIngredients(acknowledgedState.ingredients).find((item) => item.id === ingredientId);
    if (ingredient) {
      ingredientReferenceAlert = {
        ingredientId,
        name: ingredient.name,
        combinationCount: result.conflict.combination_count,
        mealSlotCount: result.conflict.slot_count,
      };
      activeTab = 'items';
      saveActiveTab(activeTab);
      feedback = { tone: 'error', message: ingredientReferenceMessage(ingredient.name) };
      desiredFocus = `${dataSelector('data-reference-alert', ingredientId)} [data-action-tab="meals"]`;
    }
  } else if (result.status === 'conflict') {
    if (result.state) acknowledgedState = structuredClone(result.state);
    feedback = { tone: 'error', message: '다른 보호자가 먼저 저장했어요. 최신 내용을 확인한 뒤 저장을 눌러 주세요.' };
    desiredFocus = context.focus || '#main';
  } else {
    feedback = { tone: 'error', message: result.error?.message || '공유 저장에 실패했어요. 입력 내용을 확인한 뒤 저장을 눌러 주세요.' };
    desiredFocus = context.focus || '#main';
  }
  render();
}
async function loadAuthoritativeState() {
  surface = 'loading';
  state = null;
  feedback = null;
  render();
  const result = await sharedState.load();
  if (result.status === 'authenticated') {
    state = structuredClone(result.state);
    acknowledgedState = structuredClone(result.state);
    surface = 'authenticated';
    feedback = null;
    render();
    return;
  }
  surface = result.status;
  feedback = { tone: 'error', message: result.error.message };
  render();
}
function captureFormDrafts(skipFormId = null) {
  document.querySelectorAll('form[id]').forEach((form) => {
    if (form.id === skipFormId) return;
    const values = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((control) => {
      if ((control.type === 'radio' || control.type === 'checkbox') && !control.checked) return;
      values[control.name] = control.value;
    });
    formDrafts.set(form.id, values);
  });
}
function restoreFormDrafts() {
  for (const [formId, values] of formDrafts) {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) continue;
    for (const [name, value] of Object.entries(values)) {
      const controls = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      controls.forEach((control) => {
        if (control.type === 'radio' || control.type === 'checkbox') control.checked = control.value === value;
        else control.value = value;
      });
    }
  }
}
function captureFocusAnchor() {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement) || element === document.body) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  const attribute = Array.from(element.attributes).find((item) => item.name.startsWith('data-') && item.value);
  if (attribute) return `[${attribute.name}="${CSS.escape(attribute.value)}"]`;
  if (element.getAttribute('name')) return `[name="${CSS.escape(element.getAttribute('name'))}"]`;
  return null;
}
function restoreFocus(selector) {
  if (!selector) return;
  const selectors = [selector, focusFallbackSelector(activeTab), '#main'];
  for (const candidate of new Set(selectors)) {
    let element = null;
    try {
      element = document.querySelector(candidate);
    } catch {
      continue;
    }
    if (!(element instanceof HTMLElement)) continue;
    if (element.tabIndex < 0 && !element.hasAttribute('tabindex')) element.tabIndex = -1;
    element.focus({ preventScroll: true });
    if (document.activeElement === element) {
      revealFocusedElement(element);
      return;
    }
  }
}
function revealFocusedElement(element) {
  const scrollOwner = scrollableAncestor(element);
  if (!scrollOwner) return;
  const alertContext = element.closest('.inline-alert');
  const headingContext = element.matches('h1,h2,h3') ? element.closest('.section-head') : null;
  const revealTarget = alertContext instanceof HTMLElement ? alertContext
    : headingContext instanceof HTMLElement ? headingContext : element;
  const dock = document.querySelector('.workspace-tabs');
  const ownerRect = scrollOwner.getBoundingClientRect();
  const controlRect = revealTarget.getBoundingClientRect();
  const visualTop = window.visualViewport?.offsetTop || 0;
  const visualBottom = visualTop + (window.visualViewport?.height || window.innerHeight);
  const viewportBottom = dock instanceof HTMLElement ? Math.min(visualBottom, dock.getBoundingClientRect().top) : visualBottom;
  const delta = focusedControlScrollDelta({
    controlTop: controlRect.top,
    controlBottom: controlRect.bottom,
    viewportTop: Math.max(visualTop, ownerRect.top),
    viewportBottom: Math.min(viewportBottom, ownerRect.bottom),
  });
  if (!delta) return;
  scrollOwner.scrollTop += delta;
  if (scrollOwner.classList.contains('tab-panel')) panelScroll.set(scrollOwner.id, scrollOwner.scrollTop);
  else if (scrollOwner.classList.contains('app-shell')) panelScroll.set(`shell:${activeTab}`, scrollOwner.scrollTop);
}
function scrollableAncestor(element) {
  for (let current = element.parentElement; current; current = current.parentElement) {
    if (!(current instanceof HTMLElement)) continue;
    const overflowY = window.getComputedStyle(current).overflowY;
    if (/(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight + 1) return current;
  }
  return null;
}
function dataSelector(attribute, value) {
  return `[${attribute}="${CSS.escape(String(value))}"]`;
}

loadAuthoritativeState();
