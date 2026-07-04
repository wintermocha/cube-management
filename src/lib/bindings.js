export function wireAppEvents(handlers) {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.onclick = () => handlers.onTabChange(tab.dataset.tab);
  });
  document.querySelector('#weekStart')?.addEventListener('change', handlers.onWeekChange);
  document.querySelector('#lotForm')?.addEventListener('submit', handlers.onLotSubmit);
  document.querySelector('#ingredientForm')?.addEventListener('submit', handlers.onIngredientSubmit);
  document.querySelectorAll('[data-swipe-delete]').forEach(setupSwipeDelete);
  document.querySelectorAll('[data-add-ingredient]').forEach((button) => {
    button.onclick = () => handlers.onQuickAdd(button.dataset.addIngredient, Number(button.dataset.addQuantity || 1));
  });
  document.querySelectorAll('[data-lot-increment]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onLotAdjust(button.dataset.lotIncrement, 1); };
  });
  document.querySelectorAll('[data-lot-decrement]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onLotAdjust(button.dataset.lotDecrement, -1); };
  });
  document.querySelectorAll('[data-delete-ingredient]').forEach((button) => {
    button.onclick = () => handlers.onIngredientDelete(button.dataset.deleteIngredient, true);
  });
  document.querySelectorAll('[data-delete-stock]').forEach((button) => {
    button.onclick = () => handlers.onStockDelete(button.dataset.deleteStock);
  });
  document.querySelectorAll('[data-delete-lot]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onLotDelete(button.dataset.deleteLot); };
  });
  document.querySelectorAll('[data-ingredient-status]').forEach((select) => {
    select.onpointerdown = (event) => event.stopPropagation();
    select.onchange = (event) => { event.stopPropagation(); handlers.onIngredientStatusChange(select.dataset.ingredientStatus, select.value); };
  });
  document.querySelectorAll('[data-edit-slot]').forEach((form) => {
    form.onchange = () => handlers.onSlotChange(form);
  });
  document.querySelectorAll('[data-edit-combo]').forEach((form) => {
    form.onsubmit = (event) => { event.preventDefault(); handlers.onComboSubmit(form); };
  });
  document.querySelectorAll('[data-stock-toggle]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onStockToggle(button.dataset.stockToggle); };
  });
  document.querySelectorAll('[data-ingredient-toggle]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onIngredientToggle(button.dataset.ingredientToggle); };
  });
}

function setupSwipeDelete(shell) {
  const card = shell.querySelector('.data-card');
  const action = shell.querySelector('.swipe-action');
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const setOpen = (open) => {
    shell.classList.toggle('is-swiped', open);
    if (open) {
      action?.removeAttribute('tabindex');
      action?.removeAttribute('aria-hidden');
      card?.setAttribute('aria-label', '왼쪽 스와이프됨, 삭제 버튼 사용 가능');
      return;
    }
    action?.setAttribute('tabindex', '-1');
    action?.setAttribute('aria-hidden', 'true');
    card?.removeAttribute('aria-label');
  };
  const begin = (event) => {
    if (event.target?.closest?.('button, input, select, textarea, label, .swipe-action')) return false;
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
    return true;
  };
  const finish = (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.4) setOpen(true);
    if (dx > 24) setOpen(false);
  };
  shell.onpointerdown = (event) => {
    if (!begin(event)) return;
    shell.setPointerCapture?.(event.pointerId);
  };
  shell.onpointerup = (event) => {
    finish(event);
    shell.releasePointerCapture?.(event.pointerId);
  };
  shell.onpointercancel = (event) => {
    tracking = false;
    shell.releasePointerCapture?.(event.pointerId);
  };
  shell.onmousedown = begin;
  shell.onmouseup = finish;
}
