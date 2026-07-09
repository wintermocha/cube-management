const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function text(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);
}

export function mealScheduleCalendar(state, weekStart, { readonly = false } = {}) {
  const days = Array.from({ length: 7 }, (_, index) => makeDay(weekStart, index));
  return `<div class="meal-calendar${readonly ? ' meal-calendar-readonly' : ''}" aria-label="식단 달력">
    ${days.map((day) => dayCard(day, state, readonly)).join('')}
  </div>`;
}

function makeDay(weekStart, offset) {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const key = date.toISOString().slice(0, 10);
  return { key, date, label: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`, weekday: weekdays[date.getUTCDay()] };
}

function dayCard(day, state, readonly) {
  const slots = state.mealPlanSlots
    .filter((slot) => slot.date === day.key && slot.status !== 'cancelled')
    .sort((a, b) => String(a.created_at || a.id).localeCompare(String(b.created_at || b.id)));
  return `<article class="meal-day-card"${readonly ? '' : ` data-meal-drop-date="${text(day.key)}"`}>
    <div class="meal-day-head"><b>${text(day.weekday)}</b><span>${text(day.label)}</span></div>
    <div class="meal-day-drop">${slots.map((slot) => slotSummary(slot, state)).join('') || '<span class="meal-slot-empty">비어 있음</span>'}</div>
  </article>`;
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
  return `<div class="meal-calendar-entry"><b>${text(combo?.name || ingredient?.name || '비어 있음')}</b>${itemRows || `<span>${text(slot.cube_count || 1)}개</span>`}</div>`;
}
