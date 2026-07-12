const TAB_FOCUS_FALLBACKS = Object.freeze({
  today: '#todayStockTitle',
  inventory: '#stockAddTitle',
  items: '#ingredientTitle',
  meals: '#mealTitle',
  records: '#activityTitle',
  settings: '#settingsTitle',
});

export function focusFallbackSelector(activeTab) {
  return TAB_FOCUS_FALLBACKS[activeTab] || '#main';
}

export function nextComboRemovalFocusId(selectedIds, removedId) {
  const removedIndex = selectedIds.indexOf(removedId);
  if (removedIndex < 0) return selectedIds[0] || null;
  return selectedIds[removedIndex + 1] || selectedIds[removedIndex - 1] || null;
}

export function idSelector(value) {
  const identifier = Array.from(String(value), (character, index) => {
    const codePoint = character.codePointAt(0);
    const isAsciiLetter = codePoint >= 65 && codePoint <= 90 || codePoint >= 97 && codePoint <= 122;
    const isDigit = codePoint >= 48 && codePoint <= 57;
    if (codePoint === 0) return '\uFFFD';
    if (isAsciiLetter || character === '_' || character === '-' || isDigit && index > 0) return character;
    return `\\${codePoint.toString(16)} `;
  }).join('');
  return `#${identifier}`;
}

export function wireAppEvents(handlers) {
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  tabs.forEach((tab, index) => {
    tab.onclick = () => handlers.onTabChange(tab.dataset.tab, true);
    tab.onkeydown = (event) => {
      const last = tabs.length - 1;
      const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
      if (nextIndex === null) return;
      event.preventDefault();
      handlers.onTabChange(tabs[nextIndex].dataset.tab, true);
    };
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
  document.querySelector('#weekStart')?.addEventListener('change', (event) => handlers.onWeekChange(event.currentTarget.value));
  document.querySelector('#lotForm')?.addEventListener('submit', handlers.onLotSubmit);
  document.querySelector('#ingredientForm')?.addEventListener('submit', handlers.onIngredientSubmit);
  document.querySelector('#profileForm')?.addEventListener('submit', handlers.onProfileSubmit);
  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('invalid', (event) => {
      event.preventDefault();
      handlers.onInvalidField(event.target.id || event.target.name);
    }, true);
  });
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
  document.querySelectorAll('[data-lot-increment]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onLotAdjust(button.dataset.lotIncrement, 1); };
  });
  document.querySelectorAll('[data-lot-decrement]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); handlers.onLotAdjust(button.dataset.lotDecrement, -1); };
  });
  document.querySelectorAll('[data-delete-ingredient]').forEach((button) => {
    button.onclick = () => handlers.onIngredientDelete(button.dataset.deleteIngredient);
  });
  document.querySelectorAll('[data-request-delete-ingredient]').forEach((button) => {
    button.onclick = () => handlers.onIngredientDelete(button.dataset.requestDeleteIngredient);
  });
  document.querySelectorAll('[data-delete-stock]').forEach((button) => {
    button.onclick = () => handlers.onStockDelete(button.dataset.deleteStock);
  });
  document.querySelectorAll('[data-request-delete-stock]').forEach((button) => {
    button.onclick = () => handlers.onStockDelete(button.dataset.requestDeleteStock);
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
  document.querySelector('[data-confirm-delete]')?.addEventListener('click', handlers.onConfirmDelete);
  document.querySelector('[data-cancel-delete]')?.addEventListener('click', handlers.onCancelDelete);
  setupConfirmationDialog(document.querySelector('dialog[data-confirmation-kind]'), handlers.onCancelDelete);
  document.querySelector('[data-state-retry]')?.addEventListener('click', handlers.onRetryLoad);
}

function setupConfirmationDialog(dialog, onCancel) {
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onCancel();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  if (!dialog.open) dialog.showModal();
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
