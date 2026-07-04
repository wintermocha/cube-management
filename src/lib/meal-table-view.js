const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const mealTypes = ['아침', '점심', '저녁'];
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function mealScheduleTable(state, weekStart) {
  const days = Array.from({ length: 7 }, (_, index) => makeDay(weekStart, index));
  return `<div class="meal-table-scroll" aria-label="식단표 보기">
    <table class="meal-plan-table">
      <thead><tr><th scope="col">끼니</th>${days.map(dayHead).join('')}</tr></thead>
      <tbody>${mealTypes.map((mealType) => mealRow(mealType, days, state)).join('')}${newFoodRow(days, state)}</tbody>
    </table>
  </div>`;
}

function makeDay(weekStart, offset) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const key = date.toISOString().slice(0, 10);
  return { key, date, label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, weekday: weekdays[date.getUTCDay()] };
}

function dayHead(day) {
  return `<th scope="col"><b>${text(day.weekday)}</b><span>${text(day.label)}</span></th>`;
}

function mealRow(mealType, days, state) {
  return `<tr><th scope="row">${text(mealType)}</th>${days.map((day) => `<td>${slotList(day.key, mealType, state)}</td>`).join('')}</tr>`;
}

function slotList(date, mealType, state) {
  const slots = state.mealPlanSlots.filter((slot) => slot.date === date && slot.meal_type === mealType && slot.status !== 'cancelled');
  return `<div class="meal-slot-list">${slots.map((slot) => slotSummary(slot, state)).join('') || '<span class="meal-slot-empty">-</span>'}</div>`;
}

function slotSummary(slot, state) {
  const combo = state.combinations.find((item) => item.id === slot.combination_id);
  const ingredient = state.ingredients.find((item) => item.id === slot.ingredient_id);
  const comboItems = combo ? state.combinationItems.filter((item) => item.combination_id === combo.id) : [];
  const multiplier = Number(slot.cube_count || 1);
  const itemRows = comboItems.map((item) => {
    const name = state.ingredients.find((ingredientItem) => ingredientItem.id === item.ingredient_id)?.name || '알 수 없음';
    return `<span>${text(name)} ${text(Number(item.cube_count || 0) * multiplier)}개</span>`;
  }).join('');
  return `<div class="meal-table-entry"><b>${text(combo?.name || ingredient?.name || '비어 있음')}</b>${itemRows || `<span>${text(slot.cube_count || 1)}개</span>`}</div>`;
}

function newFoodRow(days, state) {
  return `<tr class="meal-new-row"><th scope="row">New</th>${days.map((day) => `<td>${newFoodList(day.key, state)}</td>`).join('')}</tr>`;
}

function newFoodList(date, state) {
  const names = state.mealPlanSlots
    .filter((slot) => slot.date === date && ['planned', 'testing'].includes(slot.status))
    .map((slot) => state.ingredients.find((item) => item.id === slot.ingredient_id)?.name || state.combinations.find((item) => item.id === slot.combination_id)?.name)
    .filter(Boolean);
  return names.length ? `<span class="meal-new-text">${names.map(text).join(', ')}</span>` : '<span class="meal-slot-empty">-</span>';
}
