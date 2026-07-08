import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { stockSeverity, summarizeInventory, calculateForecast, parseKoreanAddStock, consumeLots, activeIngredients, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, adjustCubeLotCount, upsertCubeLotForDate } from '../src/lib/domain.js';
import { mealScheduleCalendar } from '../src/lib/meal-table-view.js';
import { renderAppHtml, renderAuthRequiredHtml } from '../src/lib/view.js';

test('current stock severity follows PRD thresholds', () => {
  assert.equal(stockSeverity(4), 'ok');
  assert.equal(stockSeverity(3), 'warn');
  assert.equal(stockSeverity(1), 'error');
  assert.equal(stockSeverity(0), 'error');
});

test('inventory summarizes lots and marks empty ingredients', () => {
  const data = seedData();
  data.ingredients.push({ id: 'ing-empty', name: '양파', status: 'planned' });
  const empty = summarizeInventory(data.ingredients, data.cubeLots).find((item) => item.ingredient_id === 'ing-empty');
  assert.equal(empty.current_count, 0);
  assert.equal(empty.severity, 'error');
  assert.equal(empty.empty_label, '재고 없음');
});

test('forecast reports planned shortage separately from current severity', () => {
  const data = seedData();
  data.mealPlanSlots.push({ id: 'slot-5', date: '2026-07-07', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', status: 'planned' });
  data.mealPlanSlots.push({ id: 'slot-6', date: '2026-07-08', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', status: 'planned' });
  const beef = calculateForecast({ ingredients: data.ingredients, lots: data.cubeLots, combinations: data.combinations, combinationItems: data.combinationItems, mealPlanSlots: data.mealPlanSlots, startDate: '2026-07-03' }).find((item) => item.ingredient_id === 'ing-beef');
  assert.equal(beef.available, 5);
  assert.equal(beef.needed, 6);
  assert.equal(beef.shortage, 1);
});

test('forecast multiplies combination needs by meal slot count', () => {
  const data = seedData();
  data.mealPlanSlots = [{ id: 'slot-double', date: '2026-07-03', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', cube_count: 2, status: 'planned' }];
  const forecast = calculateForecast({ ingredients: data.ingredients, lots: data.cubeLots, combinations: data.combinations, combinationItems: data.combinationItems, mealPlanSlots: data.mealPlanSlots, startDate: '2026-07-03' });
  assert.equal(forecast.find((item) => item.ingredient_id === 'ing-beef').needed, 2);
  assert.equal(forecast.find((item) => item.ingredient_id === 'ing-rice').needed, 4);
});

test('meal calendar exposes drop dates without meal-type rows', () => {
  const data = seedData();
  data.mealPlanSlots = [{ id: 'slot-double', date: '2026-07-03', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', cube_count: 2, status: 'planned' }];
  const html = mealScheduleCalendar(data, '2026-07-03');

  assert.doesNotMatch(html, /아침|점심|저녁/);
  assert.match(html, /data-meal-drop-date="2026-07-03"/);
  assert.match(html, /소고기 2개/);
  assert.match(html, /쌀미음 4개/);
});

test('meals tab renders draggable ingredients, combinations, and calendar drop targets', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const weekStart = '2026-07-03';
  const forecast = calculateForecast({ ingredients, lots: data.cubeLots, combinations: data.combinations, combinationItems: data.combinationItems, mealPlanSlots: data.mealPlanSlots, startDate: weekStart });
  const html = renderAppHtml({
    activeTab: 'meals',
    state: data,
    ingredients,
    inventory,
    critical: inventory.filter((item) => item.severity === 'error'),
    warnings: inventory.filter((item) => item.severity === 'warn'),
    shortages: forecast.filter((item) => item.shortage > 0),
    nextMealCount: data.mealPlanSlots.length,
    weekStart,
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: weekStart,
    lotFormDefaults: null,
  });
  const mealsHtml = html.match(/<div id="panel-meals"[\s\S]*?<\/div>\s*<div id="panel-records"/)?.[0] ?? '';

  assert.match(mealsHtml, /data-drag-ingredient="ing-beef"/);
  assert.match(mealsHtml, /data-drag-combo="combo-beef-broccoli"/);
  assert.match(mealsHtml, /data-combo-drop-zone/);
  assert.match(mealsHtml, /data-meal-drop-date="2026-07-03"/);
  assert.doesNotMatch(mealsHtml, /아침|점심|저녁|data-edit-slot|data-edit-combo/);
});

test('today tab shows inventory status and meal plan without edit controls', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const weekStart = '2026-07-03';
  const forecast = calculateForecast({ ingredients, lots: data.cubeLots, combinations: data.combinations, combinationItems: data.combinationItems, mealPlanSlots: data.mealPlanSlots, startDate: weekStart });
  const forbiddenTodayControls = /data-add-ingredient|data-lot-increment|data-lot-decrement|data-delete-stock|data-delete-lot|data-stock-toggle|data-edit-slot|data-edit-combo|data-meal-drop-date|data-combo-drop-zone|data-drag-combo|data-drag-ingredient|<form\b|<input\b|<select\b/;
  const html = renderAppHtml({
    activeTab: 'today',
    state: data,
    ingredients,
    inventory,
    critical: inventory.filter((item) => item.severity === 'error'),
    warnings: inventory.filter((item) => item.severity === 'warn'),
    shortages: forecast.filter((item) => item.shortage > 0),
    nextMealCount: data.mealPlanSlots.length,
    weekStart,
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: weekStart,
    lotFormDefaults: null,
  });
  const todayHtml = html.match(/<div id="panel-today"[\s\S]*?(?=<div id="panel-inventory")/)?.[0] ?? '';

  assert.match(todayHtml, /현재 재고/);
  assert.match(todayHtml, /readonly-inventory-card/);
  assert.match(todayHtml, /식단표/);
  assert.match(todayHtml, /meal-calendar-entry/);
  assert.doesNotMatch(todayHtml, forbiddenTodayControls);

  const emptyState = { ...data, mealPlanSlots: [] };
  const emptyHtml = renderAppHtml({
    activeTab: 'today',
    state: emptyState,
    ingredients,
    inventory: [],
    critical: [],
    warnings: [],
    shortages: [],
    nextMealCount: 0,
    weekStart,
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: weekStart,
    lotFormDefaults: null,
  });
  const emptyTodayHtml = emptyHtml.match(/<div id="panel-today"[\s\S]*?(?=<div id="panel-inventory")/)?.[0] ?? '';

  assert.match(emptyTodayHtml, /아직 재고가 없어요/);
  assert.match(emptyTodayHtml, /비어 있음/);
  assert.doesNotMatch(emptyTodayHtml, forbiddenTodayControls);
});

test('Stitch Baby Food design exposes profile, filters, and touch fallbacks', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const weekStart = '2026-07-03';
  const forecast = calculateForecast({ ingredients, lots: data.cubeLots, combinations: data.combinations, combinationItems: data.combinationItems, mealPlanSlots: data.mealPlanSlots, startDate: weekStart });
  const base = {
    state: data,
    ingredients,
    inventory,
    critical: inventory.filter((item) => item.severity === 'error'),
    warnings: inventory.filter((item) => item.severity === 'warn'),
    shortages: forecast.filter((item) => item.shortage > 0),
    nextMealCount: data.mealPlanSlots.length,
    weekStart,
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: weekStart,
    lotFormDefaults: null,
    activeIngredientFilter: 'testing',
  };

  const todayHtml = renderAppHtml({ ...base, activeTab: 'today' });
  assert.match(todayHtml, /class="top-app-bar"/);
  assert.match(todayHtml, /data-settings-tab/);
  assert.match(todayHtml, /data-action-tab="meals"/);
  assert.match(todayHtml, /profile-avatar\.svg/);

  const itemsHtml = renderAppHtml({ ...base, activeTab: 'items' });
  const itemsPanelHtml = itemsHtml.match(/<div id="panel-items"[\s\S]*?(?=<div id="panel-meals")/)?.[0] ?? '';
  assert.match(itemsPanelHtml, /data-ingredient-filter="testing"/);
  assert.match(itemsPanelHtml, /is-selected/);
  assert.match(itemsPanelHtml, /브로콜리/);
  assert.doesNotMatch(itemsPanelHtml, /쌀미음/);

  const mealsHtml = renderAppHtml({ ...base, activeTab: 'meals', comboBuilderIngredientIds: ['ing-beef'] });
  assert.match(mealsHtml, /name="stage"/);
  assert.match(mealsHtml, /name="cube_count_ing-beef"/);
  assert.match(mealsHtml, /data-add-combo-meal="combo-beef-broccoli"/);
  assert.match(mealsHtml, /empty-bowl\.svg/);

  const settingsHtml = renderAppHtml({ ...base, activeTab: 'settings' });
  assert.match(settingsHtml, /data-profile-form/);
  assert.match(settingsHtml, /name="display_name"/);
  assert.match(settingsHtml, /사진 변경/);
  const settingsPanelTag = settingsHtml.match(/<div id="panel-settings"[^>]*>/)?.[0] ?? '';
  assert.match(settingsPanelTag, /role="region"/);
  assert.match(settingsPanelTag, /aria-labelledby="settingsTitle"/);
  assert.doesNotMatch(settingsPanelTag, /role="tabpanel"/);
  assert.doesNotMatch(settingsPanelTag, /aria-labelledby="tab-settings"/);
});

test('auth-required screen hides app content and offers one login action', () => {
  const html = renderAuthRequiredHtml({
    message: '로그인 세션을 확인하지 못했어요. 다시 로그인해 주세요.',
    loginHref: 'https://jw-cube.taewooo.kim/',
  });

  assert.match(html, /data-auth-required/);
  assert.match(html, /로그인이 필요해요/);
  assert.match(html, /로그인 세션을 확인하지 못했어요/);
  assert.match(html, /data-auth-login/);
  assert.match(html, /data-login-href="https:\/\/jw-cube\.taewooo\.kim\/"/);
  assert.match(html, />확인<\/button>/);
  assert.doesNotMatch(html, /workspace-tabs|metrics-alerts|panel-today|현재 재고|식단표/);
});

test('AI parser auto-applies only low-risk add stock', () => {
  const data = seedData();
  assert.deepEqual(parseKoreanAddStock('소고기 큐브 6개 만들었어', data.ingredients), { type: 'add_stock', ingredient_id: 'ing-beef', ingredient_name: '소고기', quantity: 6, unit: 'cube' });
  assert.equal(parseKoreanAddStock('소고기 큐브 삭제해', data.ingredients).type, 'approval');
  assert.equal(parseKoreanAddStock('배우자 계정 추가해줘', data.ingredients).type, 'rejected');
});

test('manual stock use consumes FEFO lots first', () => {
  const result = consumeLots([
    { id: 'late', ingredient_id: 'ing', expires_at: '2026-08-01', made_at: '2026-07-01', remaining_count: 5 },
    { id: 'soon', ingredient_id: 'ing', expires_at: '2026-07-10', made_at: '2026-07-02', remaining_count: 2 },
  ], 'ing', 3);
  assert.deepEqual(result.consumed_lots.map((lot) => [lot.lot_id, lot.used_count]), [['soon', 2], ['late', 1]]);
});

test('deleted ingredients disappear and their stock is cleared', () => {
  const data = seedData();
  data.mealPlanSlots.push({ id: 'slot-broccoli', date: '2026-07-07', meal_type: '점심', target_type: 'ingredient', ingredient_id: 'ing-broccoli', cube_count: 1, status: 'planned' });
  const result = removeIngredientFromState(data, 'ing-broccoli', '2026-07-04T00:00:00.000Z');
  assert.equal(result.removed, true);
  assert.equal(activeIngredients(result.state.ingredients).some((item) => item.id === 'ing-broccoli'), false);
  assert.equal(result.state.cubeLots.find((lot) => lot.id === 'lot-broccoli-1').remaining_count, 0);
  assert.equal(summarizeInventory(result.state.ingredients, result.state.cubeLots).some((item) => item.ingredient_id === 'ing-broccoli'), false);
  assert.equal(result.state.combinationItems.some((item) => item.ingredient_id === 'ing-broccoli'), false);
  assert.equal(result.state.mealPlanSlots.find((slot) => slot.id === 'slot-broccoli').status, 'cancelled');
});

test('deleted cube lots disappear from inventory while keeping ingredient', () => {
  const data = seedData();
  const result = removeCubeLotFromState(data, 'lot-broccoli-1', '2026-07-04T00:00:00.000Z');
  const broccoli = summarizeInventory(result.state.ingredients, result.state.cubeLots).find((item) => item.ingredient_id === 'ing-broccoli');
  assert.equal(result.removed, true);
  assert.equal(broccoli.current_count, 0);
  assert.equal(broccoli.lots.length, 0);
  assert.equal(activeIngredients(result.state.ingredients).some((item) => item.id === 'ing-broccoli'), true);
});

test('current stock whole delete clears lots without deleting the ingredient', () => {
  const data = seedData();
  const result = removeStockForIngredientFromState(data, 'ing-broccoli', '2026-07-04T00:00:00.000Z');
  const broccoli = summarizeInventory(result.state.ingredients, result.state.cubeLots).find((item) => item.ingredient_id === 'ing-broccoli');
  assert.equal(result.removed, true);
  assert.equal(result.clearedLotCount, 1);
  assert.equal(broccoli.current_count, 0);
  assert.equal(activeIngredients(result.state.ingredients).some((item) => item.id === 'ing-broccoli'), true);
  assert.equal(result.state.combinationItems.some((item) => item.ingredient_id === 'ing-broccoli'), true);
});

test('lot stock controls adjust only the selected made-date lot', () => {
  const data = seedData();
  data.cubeLots.push({ id: 'lot-beef-older', ingredient_id: 'ing-beef', made_at: '2026-06-29', initial_count: 2, remaining_count: 2 });
  const result = adjustCubeLotCount(data.cubeLots, 'lot-beef-1', 1, '2026-07-04T00:00:00.000Z');
  const adjusted = result.lots.find((lot) => lot.id === 'lot-beef-1');
  const older = result.lots.find((lot) => lot.id === 'lot-beef-older');
  assert.equal(adjusted.remaining_count, 6);
  assert.equal(adjusted.initial_count, 6);
  assert.equal(adjusted.made_at, '2026-07-01');
  assert.equal(older.remaining_count, 2);
  assert.equal(result.adjusted_lot.lot_id, 'lot-beef-1');
});

test('adding stock merges into an existing lot for the same ingredient and made date', () => {
  const data = seedData();
  const result = upsertCubeLotForDate(data.cubeLots, {
    id: 'lot-new',
    household_id: 'home',
    ingredient_id: 'ing-broccoli',
    made_at: '2026-07-02',
    expires_at: '',
    initial_count: 2,
    remaining_count: 2,
    grams_per_cube: 15,
    storage_location: '',
    description: '고기 100g 물 20g 블랜더 30초',
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
  });
  const broccoliLots = result.lots.filter((lot) => lot.ingredient_id === 'ing-broccoli' && lot.made_at === '2026-07-02' && !lot.deleted_at);

  assert.equal(result.merged, true);
  assert.equal(broccoliLots.length, 1);
  assert.equal(broccoliLots[0].initial_count, 5);
  assert.equal(broccoliLots[0].remaining_count, 5);
  assert.equal(broccoliLots[0].description, '고기 100g 물 20g 블랜더 30초');
});

test('lot decrement does not go below zero', () => {
  const data = seedData();
  const result = adjustCubeLotCount(data.cubeLots, 'lot-broccoli-1', -3, '2026-07-04T00:00:00.000Z');
  const adjusted = result.lots.find((lot) => lot.id === 'lot-broccoli-1');
  assert.equal(adjusted.remaining_count, 0);
  assert.equal(adjusted.initial_count, 3);
  assert.equal(result.adjusted_lot.used_count, 3);
});
