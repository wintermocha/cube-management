export const STATUSES = ['not_tried','planned','testing','tolerated','suspected_reaction'];
export const MEAL_TYPES = ['아침','점심','저녁'];
export const APPROVAL_ALLOWLIST = ['add_stock_after_review','stock_decrement','cube_lot_delete','single_meal_slot_change','week_meal_plan_change','ingredient_status_note'];

export function stockSeverity(count) {
  if (count <= 1) return 'error';
  if (count <= 3) return 'warn';
  return 'ok';
}

export function activeIngredients(ingredients) {
  return ingredients.filter((ingredient) => ingredient.status !== 'cancelled' && !ingredient.deleted_at);
}

export function summarizeInventory(ingredients, lots) {
  return activeIngredients(ingredients).map((ingredient) => {
    const ingredientLots = lots.filter((lot) => lot.ingredient_id === ingredient.id && !lot.deleted_at);
    const current_count = ingredientLots.reduce((sum, lot) => sum + Number(lot.remaining_count || 0), 0);
    return {
      ingredient_id: ingredient.id,
      ingredient_name: ingredient.name,
      category: ingredient.category || '',
      status: ingredient.status,
      notes: ingredient.notes || '',
      current_count,
      severity: stockSeverity(current_count),
      empty_label: current_count === 0 ? '재고 없음' : null,
      lots: ingredientLots.sort(compareLotsForUse),
    };
  });
}

export function removeIngredientFromState(data, ingredientId, deletedAt) {
  const ingredient = activeIngredients(data.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) return { removed: false, state: data, ingredient: null, clearedLotCount: 0 };
  const cubeLots = data.cubeLots.map((lot) => {
    if (lot.ingredient_id !== ingredientId || lot.deleted_at) return lot;
    return { ...lot, remaining_count: 0, deleted_at: deletedAt, updated_at: deletedAt };
  });
  const clearedLotCount = cubeLots.filter((lot) => lot.ingredient_id === ingredientId && lot.deleted_at === deletedAt).length;
  const ingredients = data.ingredients.map((item) => {
    if (item.id !== ingredientId) return item;
    return { ...item, status: 'cancelled', deleted_at: deletedAt, updated_at: deletedAt };
  });
  const combinationItems = (data.combinationItems || []).filter((item) => item.ingredient_id !== ingredientId);
  const mealPlanSlots = (data.mealPlanSlots || []).map((slot) => {
    if (slot.target_type !== 'ingredient' || slot.ingredient_id !== ingredientId) return slot;
    return { ...slot, status: 'cancelled', updated_at: deletedAt };
  });
  return { removed: true, state: { ...data, ingredients, cubeLots, combinationItems, mealPlanSlots }, ingredient, clearedLotCount };
}

export function removeStockForIngredientFromState(data, ingredientId, deletedAt) {
  const ingredient = activeIngredients(data.ingredients).find((item) => item.id === ingredientId);
  if (!ingredient) return { removed: false, state: data, ingredient: null, clearedLotCount: 0 };
  const cubeLots = data.cubeLots.map((lot) => {
    if (lot.ingredient_id !== ingredientId || lot.deleted_at) return lot;
    return { ...lot, remaining_count: 0, deleted_at: deletedAt, updated_at: deletedAt };
  });
  const clearedLotCount = cubeLots.filter((lot) => lot.ingredient_id === ingredientId && lot.deleted_at === deletedAt).length;
  return { removed: clearedLotCount > 0, state: { ...data, cubeLots }, ingredient, clearedLotCount };
}

export function removeCubeLotFromState(data, lotId, deletedAt) {
  const lot = data.cubeLots.find((item) => item.id === lotId && !item.deleted_at);
  if (!lot) return { removed: false, state: data, lot: null };
  const cubeLots = data.cubeLots.map((item) => {
    if (item.id !== lotId) return item;
    return { ...item, remaining_count: 0, deleted_at: deletedAt, updated_at: deletedAt };
  });
  return { removed: true, state: { ...data, cubeLots }, lot };
}

export function adjustCubeLotCount(lots, lotId, delta, updatedAt) {
  const lot = lots.find((item) => item.id === lotId && !item.deleted_at);
  if (!lot || !Number.isInteger(delta) || delta === 0) return { changed: false, lots, adjusted_lot: null };
  let adjustedLot = null;
  const updatedLots = lots.map((item) => {
    if (item.id !== lotId) return item;
    const current = Number(item.remaining_count || 0);
    if (delta > 0) {
      adjustedLot = { lot_id: lotId, added_count: delta, remaining_count: current + delta };
      return { ...item, initial_count: Number(item.initial_count || 0) + delta, remaining_count: current + delta, updated_at: updatedAt };
    }
    const usedCount = Math.min(current, Math.abs(delta));
    adjustedLot = { lot_id: lotId, used_count: usedCount, remaining_count: current - usedCount };
    return { ...item, remaining_count: current - usedCount, updated_at: updatedAt };
  });
  return { changed: Boolean(adjustedLot), lots: updatedLots, adjusted_lot: adjustedLot };
}

export function upsertCubeLotForDate(lots, nextLot) {
  const found = lots.find((lot) => lot.ingredient_id === nextLot.ingredient_id && lot.made_at === nextLot.made_at && !lot.deleted_at);
  if (!found) return { merged: false, lots: lots.concat(nextLot), lot: nextLot };
  const mergedLot = {
    ...found,
    initial_count: Number(found.initial_count || 0) + Number(nextLot.initial_count || 0),
    remaining_count: Number(found.remaining_count || 0) + Number(nextLot.remaining_count || 0),
    grams_per_cube: nextLot.grams_per_cube ?? found.grams_per_cube,
    storage_location: nextLot.description || nextLot.storage_location || found.storage_location || '',
    description: nextLot.description || found.description || found.storage_location || '',
    updated_at: nextLot.updated_at,
  };
  return { merged: true, lots: lots.map((lot) => lot.id === found.id ? mergedLot : lot), lot: mergedLot };
}

export function calculateForecast({ ingredients, lots, combinations, combinationItems, mealPlanSlots, startDate, days = 7 }) {
  const inventory = summarizeInventory(ingredients, lots);
  const stock = new Map(inventory.map((item) => [item.ingredient_id, item.current_count]));
  const needed = new Map();
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);
  const comboItemsByCombo = groupBy(combinationItems, 'combination_id');

  for (const slot of mealPlanSlots) {
    const slotDate = new Date(`${slot.date}T00:00:00.000Z`);
    if (slotDate < start || slotDate >= end || slot.status === 'cancelled') continue;
    if (slot.target_type === 'ingredient') {
      addNeeded(needed, slot.ingredient_id, Number(slot.cube_count || 0));
    } else if (slot.target_type === 'combination') {
      const multiplier = Number(slot.cube_count || 1);
      for (const item of comboItemsByCombo.get(slot.combination_id) || []) {
        addNeeded(needed, item.ingredient_id, Number(item.cube_count || 0) * multiplier);
      }
    }
  }

  return activeIngredients(ingredients).map((ingredient) => {
    const available = stock.get(ingredient.id) || 0;
    const required = needed.get(ingredient.id) || 0;
    return {
      ingredient_id: ingredient.id,
      ingredient_name: ingredient.name,
      available,
      needed: required,
      shortage: Math.max(0, required - available),
    };
  }).filter((item) => item.needed > 0 || item.shortage > 0);
}

export function compareLotsForUse(a, b) {
  const ax = a.expires_at || '9999-12-31';
  const bx = b.expires_at || '9999-12-31';
  if (ax !== bx) return ax.localeCompare(bx);
  return (a.made_at || '').localeCompare(b.made_at || '');
}

export function consumeLots(lots, ingredientId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('quantity_positive_integer_required');
  let remaining = quantity;
  const consumed_lots = [];
  const updatedLots = lots.map((lot) => ({ ...lot })).sort(compareLotsForUse);
  for (const lot of updatedLots) {
    if (lot.ingredient_id !== ingredientId || lot.remaining_count <= 0 || remaining <= 0) continue;
    const used = Math.min(lot.remaining_count, remaining);
    lot.remaining_count -= used;
    remaining -= used;
    consumed_lots.push({ lot_id: lot.id, used_count: used, remaining_count: lot.remaining_count });
  }
  if (remaining > 0) throw new Error('insufficient_stock');
  return { lots: updatedLots, consumed_lots };
}

export function parseKoreanAddStock(rawText, ingredients) {
  const raw = String(rawText || '').trim();
  const qtyMatch = raw.match(/(\d+)\s*(개|cube|큐브)?/i);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : null;
  const normalized = raw.replace(/\s+/g, '').toLowerCase();
  const matches = activeIngredients(ingredients).filter((ingredient) => normalized.includes(String(ingredient.name).replace(/\s+/g, '').toLowerCase()));
  const deleteLike = /(삭제|버려|차감|먹였|사용|줄여)/.test(raw);
  const authLike = /(계정|권한|토큰|credential|비밀번호|초대)/i.test(raw);
  const medicalLike = /(알레르기|진단|영양|반응이상|의사)/.test(raw);
  if (authLike || medicalLike) return { type: 'rejected', reason: authLike ? '권한/credential 변경은 지원하지 않습니다.' : '의료/영양 진단은 지원하지 않습니다.' };
  if (deleteLike) return { type: 'approval', request_type: 'stock_decrement', reason: '재고 차감/삭제는 승인 후 처리합니다.' };
  if (!quantity || matches.length !== 1) return { type: 'approval', request_type: 'add_stock_after_review', reason: '식재료 또는 수량을 명확히 확인해야 합니다.' };
  if (quantity < 1 || quantity > 30) return { type: 'approval', request_type: 'add_stock_after_review', reason: '자동 반영 수량 범위(1-30)를 벗어났습니다.' };
  return { type: 'add_stock', ingredient_id: matches[0].id, ingredient_name: matches[0].name, quantity, unit: 'cube' };
}

export function dedupeKey({ household_id, actor_email, intent }) {
  return [household_id, actor_email, intent.type, intent.ingredient_id, intent.quantity].join(':');
}

function addNeeded(map, ingredientId, count) { map.set(ingredientId, (map.get(ingredientId) || 0) + count); }
function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
  }
  return map;
}
