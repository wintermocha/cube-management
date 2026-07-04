import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { stockSeverity, summarizeInventory, calculateForecast, parseKoreanAddStock, consumeLots, activeIngredients, removeIngredientFromState, removeStockForIngredientFromState, removeCubeLotFromState, adjustCubeLotCount } from '../src/lib/domain.js';
import { mealScheduleTable } from '../src/lib/meal-table-view.js';

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

test('meal table displays multiplied combination item counts', () => {
  const data = seedData();
  data.mealPlanSlots = [{ id: 'slot-double', date: '2026-07-03', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', cube_count: 2, status: 'planned' }];
  const html = mealScheduleTable(data, '2026-07-03');
  assert.match(html, /소고기 2개/);
  assert.match(html, /쌀미음 4개/);
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

test('lot decrement does not go below zero', () => {
  const data = seedData();
  const result = adjustCubeLotCount(data.cubeLots, 'lot-broccoli-1', -3, '2026-07-04T00:00:00.000Z');
  const adjusted = result.lots.find((lot) => lot.id === 'lot-broccoli-1');
  assert.equal(adjusted.remaining_count, 0);
  assert.equal(adjusted.initial_count, 3);
  assert.equal(result.adjusted_lot.used_count, 3);
});
