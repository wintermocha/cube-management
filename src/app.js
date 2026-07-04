import { seedData } from './lib/seed.js';
import { activeIngredients, summarizeInventory, calculateForecast, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, consumeLots } from './lib/domain.js';
import { wireAppEvents } from './lib/bindings.js';
import { label, renderAppHtml, statusLabels, statusOptions } from './lib/view.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
let state = loadState();
let activeTab = 'today';
let pendingIngredientDeleteId = null;
let pendingLotDeleteId = null;
let expandedStockId = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  try { return saved ? JSON.parse(saved) : seedData(); } catch { localStorage.removeItem(STORAGE_KEY); return seedData(); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function actor() { return 'caregiver-a@example.com'; }
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
  document.querySelector('#app').innerHTML = renderAppHtml({ activeTab, state, ingredients, inventory, critical, warnings, shortages, nextMealCount, weekStart, expandedStockId });
  wireAppEvents({
    onTabChange: handleTabChange,
    onWeekChange: render,
    onLotSubmit: handleLotSubmit,
    onIngredientSubmit: handleIngredientSubmit,
    onQuickAdd: handleQuickAdd,
    onStockAdjust: handleStockAdjust,
    onStockDelete: handleStockDelete,
    onIngredientDelete: handleIngredientDelete,
    onLotDelete: handleLotDelete,
    onIngredientStatusChange: handleIngredientStatusChange,
    onSlotChange: handleSlotChange,
    onComboSubmit: handleComboSubmit,
    onStockToggle: toggleStockDescription,
  });
}
function handleTabChange(tabId) {
  activeTab = tabId;
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  expandedStockId = null;
  render();
}
function handleLotSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const description = String(fd.get('description') || '').trim();
  const grams = parseOptionalPositiveNumber(fd.get('grams_per_cube'));
  if (grams === false) { showToast('큐브 무게는 0보다 큰 숫자로 입력해 주세요.', 'warning'); return; }
  if (addLot({ ingredientId: fd.get('ingredient_id'), quantity: Number(fd.get('initial_count')), description, gramsPerCube: grams })) {
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
function handleStockAdjust(ingredientId, delta) {
  const ingredient = activeIngredients(state.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) { showToast('품목을 찾지 못했어요.', 'warning'); return; }
  if (delta > 0) {
    addLot({ ingredientId, quantity: 1, description: '수동 + 버튼으로 추가' });
    saveState();
    showToast(`${ingredient.name} 1개를 추가했어요.`, 'success');
    return;
  }
  try {
    const beforeLots = state.cubeLots;
    const result = consumeLots(state.cubeLots, ingredientId, 1);
    state = { ...state, cubeLots: result.lots };
    logEvent('stock_decrement', { ingredient_id: ingredientId, ingredient_name: ingredient.name, quantity: 1, consumed_lots: result.consumed_lots }, beforeLots, result.lots, 'manual');
    saveState();
    showToast(`${ingredient.name} 1개를 차감했어요.`, 'success');
  } catch {
    showToast('차감할 재고가 없어요.', 'warning');
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
  pendingIngredientDeleteId = null;
  pendingLotDeleteId = null;
  render();
}
function handleSlotChange(form) {
  const fd = new FormData(form);
  const slotId = form.dataset.editSlot;
  const before = state.mealPlanSlots.find((slot) => slot.id === slotId);
  if (!before) { showToast('식단을 찾지 못했어요.', 'warning'); return; }
  const targetType = String(fd.get('target_type') || 'combination');
  const combinationId = String(fd.get('combination_id') || '');
  const ingredientId = String(fd.get('ingredient_id') || '');
  const cubeCount = Number(fd.get('cube_count') || 1);
  if (!Number.isInteger(cubeCount) || cubeCount < 1 || cubeCount > 20) { showToast('식단 수량은 1~20개로 입력해 주세요.', 'warning'); return; }
  if (targetType === 'combination' && !combinationId) { showToast('조합을 선택해 주세요.', 'warning'); return; }
  if (targetType === 'ingredient' && !ingredientId) { showToast('품목을 선택해 주세요.', 'warning'); return; }
  state.mealPlanSlots = state.mealPlanSlots.map((slot) => {
    if (slot.id !== slotId) return slot;
    return {
      ...slot,
      date: String(fd.get('date') || slot.date),
      meal_type: String(fd.get('meal_type') || slot.meal_type),
      target_type: targetType,
      combination_id: targetType === 'combination' ? combinationId : null,
      ingredient_id: targetType === 'ingredient' ? ingredientId : null,
      cube_count: cubeCount,
      status: String(fd.get('status') || slot.status),
      updated_at: now(),
    };
  });
  const after = state.mealPlanSlots.find((slot) => slot.id === slotId);
  logEvent('meal_slot_update', { slot_id: slotId }, before, after, 'manual');
  saveState();
  showToast('식단표를 수정했어요.', 'success');
}
function handleComboSubmit(form) {
  const fd = new FormData(form);
  const comboId = form.dataset.editCombo;
  const before = {
    combo: state.combinations.find((combo) => combo.id === comboId),
    items: state.combinationItems.filter((item) => item.combination_id === comboId),
  };
  if (!before.combo) { showToast('조합을 찾지 못했어요.', 'warning'); return; }
  const name = String(fd.get('name') || '').trim();
  if (!name) { showToast('조합명을 입력해 주세요.', 'warning'); return; }
  const nextItems = [];
  for (const ingredient of activeIngredients(state.ingredients)) {
    const count = Number(fd.get(`cube_${ingredient.id}`) || 0);
    if (!Number.isInteger(count) || count < 0 || count > 20) { showToast('조합 수량은 0~20개로 입력해 주세요.', 'warning'); return; }
    if (count > 0) nextItems.push({ combination_id: comboId, ingredient_id: ingredient.id, cube_count: count });
  }
  if (!nextItems.length) { showToast('조합에는 품목이 1개 이상 필요해요.', 'warning'); return; }
  state.combinations = state.combinations.map((combo) => combo.id === comboId ? { ...combo, name, stage: String(fd.get('stage') || '').trim(), texture: String(fd.get('texture') || '').trim(), updated_at: now() } : combo);
  state.combinationItems = state.combinationItems.filter((item) => item.combination_id !== comboId).concat(nextItems);
  const after = { combo: state.combinations.find((combo) => combo.id === comboId), items: nextItems };
  logEvent('combo_update', { combination_id: comboId }, before, after, 'manual');
  saveState();
  showToast('조합을 수정했어요.', 'success');
}
function parseOptionalPositiveNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed;
}
function addLot({ ingredientId, quantity, description = '', source = 'manual', gramsPerCube = null }) {
  if (!ingredientId || !Number.isInteger(quantity) || quantity < 1) { showToast('수량은 1개 이상 입력해 주세요.', 'warning'); return null; }
  const lot = { id: id('lot'), household_id: 'home', ingredient_id: ingredientId, made_at: new Date().toISOString().slice(0,10), expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: gramsPerCube, storage_location: '', description, created_at: now(), updated_at: now() };
  state.cubeLots.push(lot);
  return logEvent('stock_add', { lot }, null, lot, source);
}
function showToast(message, tone = 'info') { const toast = document.querySelector('#toast'); if (toast) { toast.dataset.tone = tone; toast.textContent = message; } }
render();
