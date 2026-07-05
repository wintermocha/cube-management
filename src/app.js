import { seedData } from './lib/seed.js';
import { DEFAULT_MEAL_TYPE, activeIngredients, summarizeInventory, calculateForecast, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, adjustCubeLotCount, upsertCubeLotForDate } from './lib/domain.js';
import { wireAppEvents } from './lib/bindings.js';
import { categoryOptions, label, renderAppHtml, renderAuthRequiredHtml, statusLabels, statusOptions } from './lib/view.js';
import { createSharedStateSync } from './lib/api-state.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
const ACTIVE_TAB_KEY = `${STORAGE_KEY}:active-tab`, TAB_IDS = ['today', 'inventory', 'items', 'meals', 'records'];
let state = loadState();
let activeTab = loadActiveTab();
let pendingIngredientDeleteId = null, pendingLotDeleteId = null, expandedStockId = null, expandedIngredientId = null;
let lotFormDefaults = null;
let comboBuilderIngredientIds = [];
let authRequiredMessage = null;
const sharedState = createSharedStateSync({ getState: () => state, setState: (next) => { state = next; }, cacheKey: STORAGE_KEY, render, warn: (message) => showToast(message, 'warning'), authRequired: showAuthRequired });

function loadState() { const saved = localStorage.getItem(STORAGE_KEY); try { return saved ? JSON.parse(saved) : seedData(); } catch { localStorage.removeItem(STORAGE_KEY); return seedData(); } }
function loadActiveTab() { const saved = localStorage.getItem(ACTIVE_TAB_KEY); return TAB_IDS.includes(saved) ? saved : 'today'; }
function saveState() { sharedState.save(); }
function saveActiveTab(tabId) { localStorage.setItem(ACTIVE_TAB_KEY, tabId); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function actor() { return 'caregiver-a@example.com'; }
function logEvent(type, payload, before = null, after = null, source = 'manual') {
  const event = { id: id('evt'), household_id: 'home', actor_email: actor(), source, type, payload_json: JSON.stringify(payload), before_json: before && JSON.stringify(before), after_json: after && JSON.stringify(after), created_at: now(), undo_event_id: null };
  state.events.unshift(event);
  return event;
}

function render() {
  if (authRequiredMessage) {
    document.querySelector('#app').innerHTML = renderAuthRequiredHtml({ message: authRequiredMessage, loginHref: loginHref() });
    wireAuthRequiredEvents();
    return;
  }
  const weekStart = document.querySelector('#weekStart')?.value || '2026-07-03';
  const ingredients = activeIngredients(state.ingredients);
  const inventory = summarizeInventory(ingredients, state.cubeLots);
  const forecast = calculateForecast({ ingredients, lots: state.cubeLots, combinations: state.combinations, combinationItems: state.combinationItems, mealPlanSlots: state.mealPlanSlots, startDate: weekStart });
  const critical = inventory.filter((item) => item.severity === 'error');
  const warnings = inventory.filter((item) => item.severity === 'warn');
  const shortages = forecast.filter((item) => item.shortage > 0);
  const nextMealCount = state.mealPlanSlots.filter((slot) => slot.status !== 'cancelled').length;
  document.querySelector('#app').innerHTML = renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId, expandedIngredientId, todayDate: localDate(), lotFormDefaults, comboBuilderIngredientIds });
  wireAppEvents({
    onTabChange: handleTabChange,
    onWeekChange: render,
    onLotSubmit: handleLotSubmit,
    onIngredientSubmit: handleIngredientSubmit,
    onQuickAdd: handleQuickAdd,
    onStockDelete: handleStockDelete,
    onLotAdjust: handleLotAdjust,
    onIngredientDelete: handleIngredientDelete,
    onLotDelete: handleLotDelete,
    onIngredientStatusChange: handleIngredientStatusChange,
    onIngredientCategoryChange: handleIngredientCategoryChange,
    onComboIngredientDrop: handleComboIngredientDrop,
    onComboBuilderRemove: handleComboBuilderRemove,
    onComboBuilderSubmit: handleComboBuilderSubmit,
    onMealComboDrop: handleMealComboDrop,
    onStockToggle: toggleStockDescription,
    onIngredientToggle: toggleIngredientCard,
  });
}
function wireAuthRequiredEvents() {
  document.querySelector('[data-auth-login]')?.addEventListener('click', (event) => {
    const target = event.currentTarget;
    window.location.assign(target.dataset.loginHref || loginHref());
  });
}
function loginHref() { return window.location.href; }
function handleTabChange(tabId) {
  if (!TAB_IDS.includes(tabId)) tabId = 'today';
  activeTab = tabId;
  saveActiveTab(tabId);
  pendingIngredientDeleteId = null; pendingLotDeleteId = null; expandedStockId = null; expandedIngredientId = null;
  render();
}
function handleLotSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const description = String(fd.get('description') || '').trim();
  const grams = parseOptionalPositiveNumber(fd.get('grams_per_cube'));
  if (grams === false) { showToast('큐브 무게는 0보다 큰 숫자로 입력해 주세요.', 'warning'); return; }
  const formValues = { ingredientId: String(fd.get('ingredient_id') || ''), quantity: Number(fd.get('initial_count')), madeAt: String(fd.get('made_at') || ''), description, gramsPerCube: grams };
  if (addLot(formValues)) {
    lotFormDefaults = formValues;
    pendingIngredientDeleteId = null;
    pendingLotDeleteId = null;
    saveState();
    showToast('재고를 추가했어요.', 'success');
  }
}
function handleQuickAdd(ingredientId, quantity) {
  if (addLot({ ingredientId, quantity })) {
    pendingIngredientDeleteId = null;
    pendingLotDeleteId = null;
    saveState();
    showToast(`${quantity}개를 추가했어요.`, 'success');
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
  saveState();
  showToast(`${lot.made_at || '날짜 없음'} 재고를 ${delta > 0 ? '추가' : '차감'}했어요.`, 'success');
}
function handleIngredientSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('name') || '').trim();
  const category = String(fd.get('category') || '채소');
  if (!name) { showToast('품목명을 입력해 주세요.', 'warning'); return; }
  if (!categoryOptions.includes(category)) { showToast('카테고리를 선택해 주세요.', 'warning'); return; }
  if (activeIngredients(state.ingredients).some((item) => item.name === name)) { showToast('이미 등록된 품목이에요.', 'warning'); return; }
  const ingredient = { id: id('ing'), household_id: 'home', name, category, status: 'planned', notes: '', created_at: now(), updated_at: now() };
  state.ingredients.push(ingredient);
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  logEvent('ingredient_create', ingredient);
  e.target.reset();
  saveState();
  showToast('품목을 추가했어요.', 'success');
}
function handleIngredientStatusChange(ingredientId, status) {
  if (!statusOptions.includes(status)) { showToast('지원하지 않는 상태예요.', 'warning'); return; }
  const before = state.ingredients.find((item) => item.id === ingredientId);
  if (!before) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  state.ingredients = state.ingredients.map((item) => item.id === ingredientId ? { ...item, status, updated_at: now() } : item);
  const after = state.ingredients.find((item) => item.id === ingredientId);
  logEvent('ingredient_status_update', { ingredient_id: ingredientId, status }, before, after, 'manual');
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  saveState();
  showToast(`${before.name} 상태를 ${label(statusLabels, status)}(으)로 바꿨어요.`, 'success');
}
function handleIngredientCategoryChange(ingredientId, category) {
  if (!categoryOptions.includes(category)) { showToast('지원하지 않는 카테고리예요.', 'warning'); return; }
  const before = state.ingredients.find((item) => item.id === ingredientId);
  if (!before) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  state.ingredients = state.ingredients.map((item) => item.id === ingredientId ? { ...item, category, updated_at: now() } : item);
  const after = state.ingredients.find((item) => item.id === ingredientId);
  logEvent('ingredient_category_update', { ingredient_id: ingredientId, category }, before, after, 'manual');
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  saveState();
  showToast(`${before.name} 카테고리를 ${category}(으)로 바꿨어요.`, 'success');
}
function handleIngredientDelete(ingredientId, confirmed = false) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('삭제할 품목을 찾지 못했어요.', 'warning'); return; }
  if (activeIngredients(state.ingredients).length <= 1) { showToast('품목은 최소 1개가 필요해요.', 'warning'); return; }
  if (!confirmed && pendingIngredientDeleteId !== ingredientId) {
    pendingIngredientDeleteId = ingredientId;
    pendingLotDeleteId = null;
    render();
    showToast(`${ingredient.name} 삭제는 왼쪽 스와이프 후 삭제 버튼으로 확정해요.`, 'warning');
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
function handleStockDelete(ingredientId) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('삭제할 재고를 찾지 못했어요.', 'warning'); return; }
  const result = removeStockForIngredientFromState(state, ingredientId, now());
  if (!result.removed) { showToast('삭제할 재고가 없어요.', 'warning'); return; }
  state = result.state;
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  logEvent('stock_clear', { ingredient_id: ingredientId, ingredient_name: ingredient.name, cleared_lot_count: result.clearedLotCount }, null, state.cubeLots, 'manual');
  saveState();
  showToast(`${ingredient.name} 현재 재고를 삭제했어요.`, 'success');
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
  pendingIngredientDeleteId = null; pendingLotDeleteId = null; render();
}
function toggleIngredientCard(ingredientId) {
  expandedIngredientId = expandedIngredientId === ingredientId ? null : ingredientId;
  pendingIngredientDeleteId = null; pendingLotDeleteId = null; render();
}
function handleComboIngredientDrop(ingredientId) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  if (comboBuilderIngredientIds.includes(ingredientId)) { showToast('이미 조합에 들어간 품목이에요.', 'warning'); return; }
  comboBuilderIngredientIds = comboBuilderIngredientIds.concat(ingredientId);
  render();
}
function handleComboBuilderRemove(ingredientId) {
  comboBuilderIngredientIds = comboBuilderIngredientIds.filter((idValue) => idValue !== ingredientId);
  render();
}
function handleComboBuilderSubmit(form) {
  const selectedIngredients = comboBuilderIngredientIds.map((ingredientId) => activeIngredients(state.ingredients).find((item) => item.id === ingredientId)).filter(Boolean);
  if (!selectedIngredients.length) { showToast('조합에 넣을 품목을 선택해 주세요.', 'warning'); return; }
  const fd = new FormData(form);
  const generatedName = selectedIngredients.map((ingredient) => ingredient.name).join(' ');
  const name = String(fd.get('name') || generatedName).trim();
  if (!name) { showToast('조합명을 입력해 주세요.', 'warning'); return; }
  const timestamp = now();
  const combination = { id: id('combo'), household_id: 'home', name, stage: '', texture: '', notes: '', created_at: timestamp, updated_at: timestamp };
  const items = selectedIngredients.map((ingredient) => ({ combination_id: combination.id, ingredient_id: ingredient.id, cube_count: 1 }));
  const before = { combinations: state.combinations, combinationItems: state.combinationItems };
  state = { ...state, combinations: state.combinations.concat(combination), combinationItems: state.combinationItems.concat(items) };
  comboBuilderIngredientIds = [];
  logEvent('combo_create', { combination_id: combination.id, name }, before, { combination, items }, 'manual');
  saveState();
  showToast('조합을 저장했어요.', 'success');
}
function handleMealComboDrop(comboId, date) {
  const combination = state.combinations.find((combo) => combo.id === comboId);
  if (!combination) { showToast('조합을 찾지 못했어요.', 'warning'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) { showToast('날짜를 찾지 못했어요.', 'warning'); return; }
  const timestamp = now();
  const slot = { id: id('slot'), household_id: 'home', date, meal_type: DEFAULT_MEAL_TYPE, target_type: 'combination', combination_id: comboId, ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp };
  const beforeSlots = state.mealPlanSlots;
  state = { ...state, mealPlanSlots: state.mealPlanSlots.concat(slot) };
  logEvent('meal_slot_create', { slot_id: slot.id, combination_id: comboId, date }, beforeSlots, state.mealPlanSlots, 'manual');
  saveState();
  showToast(`${date}에 ${combination.name} 조합을 넣었어요.`, 'success');
}
function parseOptionalPositiveNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed;
}
function localDate() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addLot({ ingredientId, quantity, madeAt = localDate(), description = '', source = 'manual', gramsPerCube = null }) {
  if (!ingredientId || !Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상 입력해 주세요.', 'warning'); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(madeAt))) { showToast('만든 날짜를 선택해 주세요.', 'warning'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id: ingredientId, made_at: madeAt, expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: gramsPerCube, storage_location: '', description, created_at: now(), updated_at: now() };
  const beforeLots = state.cubeLots;
  const result = upsertCubeLotForDate(beforeLots, lot);
  state = { ...state, cubeLots: result.lots };
  return logEvent('stock_add', { lot: result.lot, merged: result.merged }, beforeLots, result.lots, source);
}
function showToast(message, tone = 'info') { const toast = document.querySelector('#toast'); if (toast) { toast.dataset.tone = tone; toast.textContent = message; } }
function showAuthRequired(message) { authRequiredMessage = message; render(); }
render(); sharedState.load();
