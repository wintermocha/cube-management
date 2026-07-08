export function wireAppEvents(handlers) {
  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.onclick = () => handlers.onTabChange(tab.dataset.tab);
  });
  document.querySelectorAll('[data-action-tab]').forEach((button) => {
    button.onclick = () => handlers.onActionTab(button.dataset.actionTab);
  });
  document.querySelectorAll('[data-settings-tab]').forEach((button) => {
    button.onclick = () => handlers.onSettingsTab();
  });
  document.querySelectorAll('[data-ingredient-filter]').forEach((button) => {
    button.onclick = () => handlers.onIngredientFilter(button.dataset.ingredientFilter);
  });
  document.querySelector('#weekStart')?.addEventListener('change', handlers.onWeekChange);
  document.querySelector('#lotForm')?.addEventListener('submit', handlers.onLotSubmit);
  document.querySelector('#ingredientForm')?.addEventListener('submit', handlers.onIngredientSubmit);
  document.querySelector('#profileForm')?.addEventListener('submit', handlers.onProfileSubmit);
  document.querySelectorAll('[data-profile-save]').forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      handlers.onProfileSubmit(button.closest('form'));
    };
  });
  document.querySelectorAll('[data-profile-photo]').forEach((button) => {
    button.onclick = () => handlers.onProfilePhoto();
  });
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
  document.querySelectorAll('[data-ingredient-category]').forEach((select) => {
    select.onpointerdown = (event) => event.stopPropagation();
    select.onchange = (event) => { event.stopPropagation(); handlers.onIngredientCategoryChange(select.dataset.ingredientCategory, select.value); };
  });
  document.querySelector('#comboBuilderForm')?.addEventListener('submit', (event) => { event.preventDefault(); handlers.onComboBuilderSubmit(event.currentTarget); });
  document.querySelectorAll('[data-drag-ingredient]').forEach((element) => setupDragSource(element, { type: 'ingredient', id: element.dataset.dragIngredient }));
  document.querySelectorAll('[data-drag-combo]').forEach((element) => setupDragSource(element, { type: 'combination', id: element.dataset.dragCombo }));
  document.querySelectorAll('[data-add-combo-ingredient]').forEach((button) => {
    button.onclick = () => handlers.onComboIngredientDrop(button.dataset.addComboIngredient);
  });
  document.querySelectorAll('[data-add-combo-meal]').forEach((button) => {
    button.onclick = () => handlers.onComboAddToMeal(button.dataset.addComboMeal, button.dataset.addComboDate);
  });
  document.querySelectorAll('[data-combo-drop-zone]').forEach((zone) => setupDropZone(zone, 'ingredient', (payload) => handlers.onComboIngredientDrop(payload.id)));
  document.querySelectorAll('[data-meal-drop-date]').forEach((zone) => setupDropZone(zone, 'combination', (payload) => handlers.onMealComboDrop(payload.id, zone.dataset.mealDropDate)));
  document.querySelectorAll('[data-builder-remove]').forEach((button) => {
    button.onclick = () => handlers.onComboBuilderRemove(button.dataset.builderRemove);
  });
  document.querySelectorAll('[data-stock-toggle]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onStockToggle(button.dataset.stockToggle); };
  });
  document.querySelectorAll('[data-ingredient-toggle]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onIngredientToggle(button.dataset.ingredientToggle); };
  });
}

function setupDragSource(element, payload) {
  element.ondragstart = (event) => {
    const value = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/json', value);
    event.dataTransfer.setData('text/plain', value);
    element.classList.add('is-dragging');
  };
  element.ondragend = () => {
    element.classList.remove('is-dragging');
  };
}

function setupDropZone(zone, expectedType, onDrop) {
  zone.ondragover = (event) => {
    event.preventDefault();
    zone.classList.add('is-drag-over');
  };
  zone.ondragleave = () => {
    zone.classList.remove('is-drag-over');
  };
  zone.ondrop = (event) => {
    const payload = dragPayload(event);
    zone.classList.remove('is-drag-over');
    if (payload?.type !== expectedType || !payload.id) return;
    event.preventDefault();
    onDrop(payload);
  };
}

function dragPayload(event) {
  try {
    const raw = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain') || '';
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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
