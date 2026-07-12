import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedData } from '../src/lib/seed.js';
import { stockSeverity, summarizeInventory, calculateForecast, parseKoreanAddStock, consumeLots, activeIngredients, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, adjustCubeLotCount, upsertCubeLotForDate } from '../src/lib/domain.js';
import { mealScheduleCalendar } from '../src/lib/meal-table-view.js';
import { renderAppHtml, renderAuthRequiredHtml } from '../src/lib/view.js';
import * as domainModule from '../src/lib/domain.js';
import * as viewModule from '../src/lib/view.js';
import * as bindingsModule from '../src/lib/bindings.js';

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

test('ingredient reference counts include distinct combinations and active direct or indirect meal slots', () => {
  const data = seedData();
  data.combinations.push({ id: 'combo-second', household_id: 'home', name: '두 번째 조합' });
  data.combinationItems.push(
    { combination_id: 'combo-beef-broccoli', ingredient_id: 'ing-broccoli', cube_count: 2 },
    { combination_id: 'combo-second', ingredient_id: 'ing-broccoli', cube_count: 1 },
    { combination_id: 'combo-foreign', ingredient_id: 'ing-broccoli', cube_count: 9 },
  );
  data.mealPlanSlots = [
    { id: 'slot-indirect', household_id: 'home', target_type: 'combination', combination_id: 'combo-second', status: 'planned' },
    { id: 'slot-direct', household_id: 'home', target_type: 'ingredient', ingredient_id: 'ing-broccoli', status: 'planned' },
    { id: 'slot-cancelled', household_id: 'home', target_type: 'ingredient', ingredient_id: 'ing-broccoli', status: 'cancelled' },
    { id: 'slot-foreign', household_id: 'other-home', target_type: 'ingredient', ingredient_id: 'ing-broccoli', status: 'planned' },
  ];

  assert.deepEqual(domainModule.ingredientReferenceCounts(data, 'ing-broccoli'), {
    combinationCount: 2,
    mealSlotCount: 2,
  });

  data.ingredients = data.ingredients.filter((ingredient) => ingredient.id === 'ing-broccoli');
  assert.deepEqual(domainModule.ingredientDeletionGuard(data, 'ing-broccoli'), {
    kind: 'referenced',
    combinationCount: 2,
    mealSlotCount: 2,
  });

  const unreferenced = { ...data, combinations: [], combinationItems: [], mealPlanSlots: [] };
  assert.deepEqual(domainModule.ingredientDeletionGuard(unreferenced, 'ing-broccoli'), { kind: 'minimum' });
});

test('semantic render contract exposes loading/error gates, roving tabs, field errors, and durable feedback', () => {
  assert.equal(typeof viewModule.renderLoadingHtml, 'function');
  assert.equal(typeof viewModule.renderLoadErrorHtml, 'function');
  assert.equal(typeof viewModule.renderForbiddenHtml, 'function');

  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const html = renderAppHtml({
    activeTab: 'items',
    state: data,
    ingredients,
    inventory,
    critical: [],
    warnings: [],
    shortages: [],
    nextMealCount: data.mealPlanSlots.length,
    weekStart: '2026-07-06',
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: '2026-07-11',
    lotFormDefaults: null,
    activeIngredientFilter: 'all',
    pending: true,
    feedback: { tone: 'error', message: '저장 충돌이 발생했어요.' },
    fieldErrors: { ingredientName: '품목명을 입력해 주세요.' },
  });

  assert.match(html, /id="tab-items"[^>]*tabindex="0"/);
  assert.match(html, /id="tab-today"[^>]*tabindex="-1"/);
  assert.doesNotMatch(html, /role="listitem"/);
  assert.match(html, /id="ingredientName"[^>]*aria-invalid="true"[^>]*aria-describedby="ingredientName-error"/);
  assert.match(html, /id="ingredientName-error"[^>]*role="alert"/);
  assert.match(html, /role="alert"[^>]*>저장 충돌이 발생했어요/);
  assert.match(html, /button[^>]*type="submit"[^>]*disabled/);
  const visibleCopy = html.replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visibleCopy, /planned|testing|tolerated|저장된 status/);
});

test('workspace tab accessible names contain every visible label token exactly once', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const html = renderAppHtml({
    activeTab: 'today',
    state: data,
    ingredients,
    inventory,
    critical: [],
    warnings: [],
    shortages: [],
    nextMealCount: data.mealPlanSlots.length,
    weekStart: '2026-07-06',
    expandedStockId: null,
    expandedIngredientId: null,
    todayDate: '2026-07-11',
    lotFormDefaults: null,
  });
  const expectedTabs = [
    ['today', '오늘', '체크'],
    ['inventory', '큐브', '재고'],
    ['meals', '식단', '계획'],
    ['items', '품목', '관리'],
    ['records', '기록', '변경'],
  ];

  for (const [id, labelText, detailText] of expectedTabs) {
    const button = html.match(new RegExp(`<button id="tab-${id}"[^>]*>([\\s\\S]*?)<\\/button>`));
    assert.ok(button, `${id} tab is rendered`);
    const openingTag = button[0].match(/^<button[^>]*>/)?.[0] ?? '';
    const explicitName = openingTag.match(/aria-label="([^"]*)"/)?.[1];
    const textContent = button[1]
      .replace(/<span class="material-symbols-outlined" aria-hidden="true">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const accessibleName = explicitName ?? textContent;

    for (const token of [labelText, detailText]) {
      assert.equal(accessibleName.split(token).length - 1, 1, `${id} accessible name contains ${token} exactly once`);
    }
  }
});

test('destructive confirmations and referenced ingredient blocks render safe actions', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const base = {
    activeTab: 'items', state: data, ingredients, inventory, critical: [], warnings: [], shortages: [],
    nextMealCount: data.mealPlanSlots.length, weekStart: '2026-07-06', expandedStockId: null,
    expandedIngredientId: null, todayDate: '2026-07-11', lotFormDefaults: null,
  };
  const blocked = renderAppHtml({
    ...base,
    feedback: { tone: 'error', message: viewModule.ingredientReferenceMessage('브로콜리') },
    ingredientReferenceAlert: { ingredientId: 'ing-broccoli', name: '브로콜리', combinationCount: 1, mealSlotCount: 1 },
  });
  assert.equal(blocked.includes('role="alert"'), true);
  assert.equal((blocked.match(/role="alert"/g) || []).length, 1);
  assert.equal(blocked.includes('role="region"'), true);
  assert.equal(blocked.includes('“브로콜리” 품목은 조합·식단에 포함돼요. 식단을\u00a0먼저\u00a0확인해\u00a0주세요.'), true);
  assert.equal(blocked.includes('조합 1개 · 식단 1개'), true);
  assert.equal(blocked.includes('data-action-tab="meals"'), true);

  const confirm = renderAppHtml({
    ...base,
    confirmation: { kind: 'ingredient', id: 'ing-beef', title: '소고기 품목 삭제', consequence: '삭제하면 되돌릴 수 없어요.' },
  });
  assert.equal(confirm.includes('role="dialog"'), true);
  assert.equal(confirm.includes('<dialog'), true);
  assert.equal(confirm.includes('aria-modal="true"'), true);
  assert.equal(confirm.includes('>취소<'), true);
  assert.equal(confirm.includes('data-confirm-delete'), true);
});

test('History and Settings render shared-storage user language without raw backend metadata', () => {
  const data = seedData();
  data.events = [{
    id: 'event-localized', type: 'stock_add', actor_email: 'caregiver-a@example.com', source: 'manual',
    created_at: '2026-07-03T00:00:00.000Z',
  }];
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const base = {
    state: data, ingredients, inventory, critical: [], warnings: [], shortages: [], nextMealCount: 0,
    weekStart: '2026-07-06', expandedStockId: null, expandedIngredientId: null,
    todayDate: '2026-07-11', lotFormDefaults: null,
  };
  const history = renderAppHtml({ ...base, activeTab: 'records' });
  assert.equal(/@example\.com|\bmanual\b|2026-07-03T00:00:00/.test(history), false);
  assert.equal(history.includes('보호자 · 직접 변경'), true);
  assert.equal(history.includes('2026'), true);

  const settings = renderAppHtml({ ...base, activeTab: 'settings' });
  assert.equal(settings.includes('이 기기 저장소'), false);
  assert.equal(settings.includes('공유 가정'), true);
});

test('post-action focus anchors are programmatically focusable and confirmation semantics are truthful', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const html = renderAppHtml({
    activeTab: 'inventory', state: data, ingredients, inventory, critical: [], warnings: [], shortages: [],
    nextMealCount: data.mealPlanSlots.length, weekStart: '2026-07-06', expandedStockId: null,
    expandedIngredientId: null, todayDate: '2026-07-11', lotFormDefaults: null,
    confirmation: { kind: 'lot', id: 'lot-beef-1', title: '재고 삭제', consequence: '되돌릴 수 없어요.' },
  });

  for (const headingId of ['stockAddTitle', 'cubeTitle', 'ingredientTitle', 'comboTitle', 'settingsTitle']) {
    assert.match(html, new RegExp(`<h2 id="${headingId}"[^>]*tabindex="-1"`));
  }
  assert.match(html, /aria-modal="true"/);

  assert.equal(bindingsModule.focusFallbackSelector('inventory'), '#stockAddTitle');
  assert.equal(bindingsModule.focusFallbackSelector('meals'), '#mealTitle');
  assert.equal(bindingsModule.focusFallbackSelector('unknown'), '#main');
  assert.equal(bindingsModule.nextComboRemovalFocusId(['ing-a', 'ing-b', 'ing-c'], 'ing-b'), 'ing-c');
  assert.equal(bindingsModule.nextComboRemovalFocusId(['ing-a', 'ing-b', 'ing-c'], 'ing-c'), 'ing-b');
  assert.equal(bindingsModule.nextComboRemovalFocusId(['ing-a'], 'ing-a'), null);
  assert.equal(bindingsModule.idSelector('comboCount-ing,["\\'), '#comboCount-ing\\2c \\5b \\22 \\5c ');
});

test('pending render disables every form control and removes all drag and drop entry points', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const html = renderAppHtml({
    activeTab: 'meals', state: data, ingredients, inventory, critical: [], warnings: [], shortages: [],
    nextMealCount: data.mealPlanSlots.length, weekStart: '2026-07-06', expandedStockId: null,
    expandedIngredientId: null, todayDate: '2026-07-11', lotFormDefaults: null,
    comboBuilderIngredientIds: ['ing-beef'], pending: true,
  });

  for (const controlId of ['lotMadeAt', 'ingredientName', 'comboName', 'profileDisplayName']) {
    assert.match(html, new RegExp(`id="${controlId}"[^>]*disabled`));
  }
  assert.doesNotMatch(html, /draggable="true"|data-drag-combo|data-drag-ingredient|data-combo-drop-zone|data-meal-drop-date/);
});

test('narrow-mobile Korean copy avoids stable predicate and phrase orphans', () => {
  const data = seedData();
  const ingredients = activeIngredients(data.ingredients);
  const inventory = summarizeInventory(ingredients, data.cubeLots);
  const base = {
    state: data, ingredients, inventory, critical: [], warnings: [], shortages: [],
    nextMealCount: data.mealPlanSlots.length, weekStart: '2026-07-06', expandedStockId: null,
    expandedIngredientId: null, todayDate: '2026-07-11', lotFormDefaults: null,
  };
  const surfaces = [
    renderAppHtml({ ...base, activeTab: 'meals' }),
    renderAppHtml({ ...base, activeTab: 'settings' }),
    renderAppHtml({
      ...base,
      activeTab: 'items',
      ingredientReferenceAlert: { ingredientId: 'ing-broccoli', name: '브로콜리', combinationCount: 1, mealSlotCount: 1 },
    }),
    viewModule.renderLoadErrorHtml(),
    renderAuthRequiredHtml({ loginHref: 'https://jw-cube.taewooo.kim/' }),
    readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'),
  ].join('\n');

  for (const unstablePhrase of [
    /이번 주에/,
    /사용 중이에요/,
    /삭제 전에/,
    /함께 보여요/,
    /되돌릴 수 없어요/,
    /삭제할 수 없어요/,
    /공유 데이터를 불러오지 못했어요/,
    /다시 로그인해 주세요/,
    /시도해 주세요/,
  ]) {
    assert.doesNotMatch(surfaces, unstablePhrase);
  }
  assert.match(surfaces, /식단 확인/);
  assert.match(surfaces, /조합·식단에 포함돼요/);
});

test('restored focus visibility adjusts only controls outside the dock-safe viewport', () => {
  assert.equal(typeof viewModule.focusedControlScrollDelta, 'function');
  assert.equal(viewModule.focusedControlScrollDelta({
    controlTop: 690,
    controlBottom: 742,
    viewportTop: 150,
    viewportBottom: 741,
  }), 17);
  assert.equal(viewModule.focusedControlScrollDelta({
    controlTop: 420,
    controlBottom: 472,
    viewportTop: 150,
    viewportBottom: 741,
  }), 0);
  assert.equal(viewModule.focusedControlScrollDelta({
    controlTop: 140,
    controlBottom: 192,
    viewportTop: 150,
    viewportBottom: 741,
  }), -26);

  const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const bindingsSource = readFileSync(new URL('../src/lib/bindings.js', import.meta.url), 'utf8');
  assert.match(appSource, /scrollableAncestor/);
  assert.match(appSource, /focusedControlScrollDelta/);
  assert.match(bindingsSource, /showModal/);
  assert.match(bindingsSource, /event\.key !== 'Tab'/);
});
