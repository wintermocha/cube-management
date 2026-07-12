import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

async function openAuditPage(page) {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page);
  await page.goto('/');
  return { observer, fixture };
}

async function capture(page, testInfo, observer, criterion, name, actions, observables) {
  return captureEvidence({ page, testInfo, observer, criterion, name, actions, observables });
}

test.describe('D01-D10 same-state visual contracts', () => {
  test('D01 compact controls use deliberate styling and 48px containment', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="inventory"]').click();
    const form = await page.locator('#lotForm').evaluate((element) => {
      const formRect = element.getBoundingClientRect();
      const submit = element.querySelector('button[type="submit"]');
      const submitRect = submit.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        submitAppearance: getComputedStyle(submit).webkitAppearance,
        formRight: formRect.right,
        widestControlRight: submitRect.right,
      };
    });
    await capture(page, testInfo, observer, 'D01', 'controls-375-before', ['open app at 375x812', 'activate 큐브'], form);
    await page.locator('[data-stock-toggle="ing-beef"]').click();
    const stock = await page.locator('[data-stock-card="ing-beef"]').evaluate((card) => Array.from(card.querySelectorAll('.stock-toggle,[data-lot-decrement],[data-lot-increment],[data-delete-lot]')).map((control) => {
      const rect = control.getBoundingClientRect();
      const container = control.parentElement.getBoundingClientRect();
      const style = getComputedStyle(control);
      return { name: control.getAttribute('aria-label') || control.textContent.trim(), width: rect.width, height: rect.height, contained: rect.left >= container.left && rect.right <= container.right, appearance: style.webkitAppearance, border: `${style.borderWidth} ${style.borderStyle}`, fill: style.backgroundColor };
    }));
    await capture(page, testInfo, observer, 'D01', 'stock-controls-375-before', ['open app at 375x812', 'activate 큐브', 'expand 소고기 stock'], stock);
    await page.locator('[data-tab="items"]').click();
    const ingredient = await page.locator('[data-ingredient-toggle]').first().evaluate((control) => {
      const rect = control.getBoundingClientRect();
      const container = control.parentElement.getBoundingClientRect();
      const style = getComputedStyle(control);
      return { name: control.getAttribute('aria-label'), width: rect.width, height: rect.height, contained: rect.left >= container.left && rect.right <= container.right, appearance: style.webkitAppearance, border: `${style.borderWidth} ${style.borderStyle}`, fill: style.backgroundColor };
    });
    await capture(page, testInfo, observer, 'D01', 'ingredient-toggle-375-before', ['activate 품목', 'inspect first compact toggle'], ingredient);
    for (const control of [...stock, ingredient]) {
      expect.soft(control.width, `${control.name} width`).toBeGreaterThanOrEqual(48);
      expect.soft(control.height, `${control.name} height`).toBeGreaterThanOrEqual(48);
      expect.soft(control.contained, `${control.name} containment`).toBe(true);
      expect.soft(control.appearance, `${control.name} deliberate appearance`).toBe('none');
    }
  });

  test('D02 stock submit remains in the first panel at desktop breakpoints', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    const measurements = [];
    for (const width of [759, 760, 768, 800, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 1024 });
      await page.locator('[data-tab="inventory"]').click();
      const value = await page.locator('#lotForm').evaluate((form) => {
        const button = form.querySelector('button[type="submit"]').getBoundingClientRect();
        const panel = form.closest('section').getBoundingClientRect();
        return { width: innerWidth, submitLeft: button.left, submitRight: button.right, contentLeft: panel.left, contentRight: panel.right };
      });
      measurements.push(value);
      await capture(page, testInfo, observer, 'D02', `stock-form-${width}-before`, [`resize to ${width}px`, 'activate 큐브'], value);
    }
    for (const value of measurements) {
      expect.soft(value.submitLeft, `submit left edge at ${value.width}px`).toBeGreaterThanOrEqual(value.contentLeft);
      expect.soft(value.submitRight, `submit right edge at ${value.width}px`).toBeLessThanOrEqual(value.contentRight);
    }
  });

  test('D03 draft values survive a workspace rerender', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="inventory"]').click();
    await page.locator('#lotDescription').fill('결정적 QA 초안');
    await page.locator('[data-tab="today"]').click();
    await page.locator('[data-tab="inventory"]').click();
    const restored = await page.locator('#lotDescription').inputValue();
    await capture(page, testInfo, observer, 'D03', 'draft-rerender-before', ['activate 큐브', 'type draft', 'activate 오늘', 'activate 큐브'], { expected: '결정적 QA 초안', restored });
    expect.soft(restored).toBe('결정적 QA 초안');
  });

  test('D04 meal week derives from the fixed current date', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="meals"]').click();
    const weekStart = await page.locator('#weekStart').inputValue();
    await capture(page, testInfo, observer, 'D04', 'current-week-before', ['fix time at 2026-07-11', 'activate 식단'], { expectedWeekStart: '2026-07-06', weekStart });
    expect.soft(weekStart).toBe('2026-07-06');
  });

  test('D05 destructive flows expose consequence, Cancel, Confirm, and focus', async ({ page }, testInfo) => {
    const { observer, fixture } = await openAuditPage(page);
    await page.locator('[data-tab="inventory"]').click();
    await page.locator('[data-stock-toggle="ing-beef"]').click();
    const lotDelete = page.locator('[data-delete-lot="lot-beef-1"]');
    await lotDelete.focus();
    await lotDelete.click();
    const confirmation = {
      dialogCount: await page.getByRole('dialog').count(),
      ariaModal: await page.getByRole('dialog').getAttribute('aria-modal'),
      modal: await page.getByRole('dialog').evaluate((dialog) => dialog.matches(':modal')),
      cancelCount: await page.getByRole('button', { name: /취소|Cancel/i }).count(),
      confirmCount: await page.getByRole('button', { name: /확인|삭제|Confirm/i }).count(),
      consequenceCount: await page.getByText(/되돌릴 수 없|영구|재고.*삭제/).count(),
      focus: await page.evaluate(() => document.activeElement?.getAttribute('data-delete-lot') || document.activeElement?.tagName),
      lotStillPresent: fixture.state.cubeLots.some((lot) => lot.id === 'lot-beef-1' && !lot.deleted_at),
    };
    await capture(page, testInfo, observer, 'D05', 'lot-delete-armed-before', ['activate 큐브', 'expand 소고기 stock', 'focus lot trash', 'activate lot trash once'], confirmation);
    await page.getByRole('button', { name: /삭제 확인/ }).focus();
    await page.keyboard.press('Tab');
    confirmation.focusTrapped = await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    confirmation.escapeCancelled = true;
    confirmation.focusReturned = await page.evaluate(() => document.activeElement?.getAttribute('data-delete-lot'));
    await page.locator('[data-tab="items"]').click();
    const shell = page.locator('#panel-items [data-swipe-delete]').first();
    const keyboardAction = shell.locator('[data-request-delete-ingredient]');
    const keyboardState = { visible: await keyboardAction.isVisible(), tabIndex: await keyboardAction.getAttribute('tabindex'), ariaHidden: await keyboardAction.getAttribute('aria-hidden') };
    await capture(page, testInfo, observer, 'D05', 'keyboard-delete-before', ['activate 품목', 'inspect first destructive action before gesture'], keyboardState);
    await shell.locator('.data-card').dispatchEvent('pointerdown', { pointerId: 1, clientX: 280, clientY: 200 });
    await shell.locator('.data-card').dispatchEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 202 });
    const alternative = shell.locator('[data-delete-ingredient]');
    const alternativeState = { visible: await alternative.isVisible(), tabIndex: await alternative.getAttribute('tabindex'), ariaHidden: await alternative.getAttribute('aria-hidden') };
    await capture(page, testInfo, observer, 'D05', 'ingredient-swipe-alternative-before', ['activate 품목', 'swipe first ingredient left', 'inspect visible delete alternative'], alternativeState);
    expect.soft(confirmation.dialogCount, 'semantic confirmation dialog').toBe(1);
    expect.soft(confirmation.ariaModal, 'dialog declares modal semantics').toBe('true');
    expect.soft(confirmation.modal, 'dialog is in the browser modal top layer').toBe(true);
    expect.soft(confirmation.cancelCount, 'Cancel action').toBeGreaterThan(0);
    expect.soft(confirmation.confirmCount, 'Confirm action').toBeGreaterThan(0);
    expect.soft(confirmation.consequenceCount, 'explicit consequence').toBeGreaterThan(0);
    expect.soft(confirmation.focus, 'focus moves into confirmation').not.toBe('BODY');
    expect.soft(confirmation.focusTrapped, 'Tab remains inside confirmation').toBe(true);
    expect.soft(confirmation.escapeCancelled, 'Escape cancels confirmation').toBe(true);
    expect.soft(confirmation.focusReturned, 'Escape returns focus to the trigger').toBe('lot-beef-1');
    expect.soft(confirmation.lotStillPresent, 'arming does not delete').toBe(true);
    expect.soft(keyboardState).toEqual({ visible: true, tabIndex: null, ariaHidden: null });
    expect.soft(alternativeState).toEqual({ visible: true, tabIndex: null, ariaHidden: null });
  });

  test('D06 validation errors are inline and associated to fields', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="items"]').click();
    await page.locator('#ingredientForm button[type="submit"]').click();
    const errors = await page.locator('#ingredientForm [role="alert"], #ingredientForm [aria-invalid="true"]').count();
    await capture(page, testInfo, observer, 'D06', 'inline-errors-before', ['activate 품목', 'submit empty ingredient form'], { associatedInlineErrors: errors });
    expect.soft(errors).toBeGreaterThan(0);
  });

  test('D07 success feedback survives the server rerender', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="inventory"]').click();
    await waitForPut(page, () => page.locator('#lotForm button[type="submit"]').click());
    const toast = (await page.locator('#toast').textContent())?.trim() || '';
    await capture(page, testInfo, observer, 'D07', 'toast-after-save-before', ['activate 큐브', 'submit deterministic stock lot', 'await PUT 200'], { toast });
    expect.soft(toast).toContain('추가했어요');
  });

  test('D08 ingredient copy contains no backend tokens or orphan English', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="items"]').click();
    const text = await page.locator('#panel-items').innerText();
    const leaks = ['planned', 'testing', 'tolerated', 'Ingredients'].filter((token) => text.includes(token));
    await capture(page, testInfo, observer, 'D08', 'ingredient-copy-before', ['activate 품목', 'inspect rendered copy'], { leakedTokens: leaks });
    expect.soft(leaks).toEqual([]);
  });

  test('D09 history presents localized actor, source, and time', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    await page.locator('[data-tab="records"]').click();
    const text = await page.locator('#panel-records').innerText();
    const raw = { email: /@example\.com/.test(text), source: /\bmanual\b/.test(text), isoTime: /2026-07-03T00:00:00/.test(text) };
    await capture(page, testInfo, observer, 'D09', 'history-localization-before', ['activate 기록', 'inspect first record'], raw);
    expect.soft(raw).toEqual({ email: false, source: false, isoTime: false });
  });

  test('D10 skip link is hidden at rest and moves focus to main', async ({ page }, testInfo) => {
    const { observer } = await openAuditPage(page);
    const atRest = await page.locator('.skip-link').evaluate((element) => element.getBoundingClientRect().bottom > 0);
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    await capture(page, testInfo, observer, 'D10', 'skip-link-before', ['open app', 'inspect skip link at rest', 'focus skip link', 'Enter'], { atRest, focused });
    expect.soft(atRest).toBe(false);
    expect.soft(focused).toBe('main');
  });

  test('D11 post-save focus remains visible at 200% zoom equivalent', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 188, height: 406 });
    const { observer } = await openAuditPage(page);
    const focusMetrics = async (selector) => page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dock = document.querySelector('.bottom-tabs');
      const dockRect = dock?.getBoundingClientRect();
      const visualBottom = visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight;
      const safeBottom = dockRect ? Math.min(visualBottom, dockRect.top) : visualBottom;
      return { active: document.activeElement === element, top: rect.top, bottom: rect.bottom, safeBottom, visible: rect.top >= 0 && rect.bottom <= safeBottom };
    });

    await page.locator('[data-tab="inventory"]').click();
    await waitForPut(page, () => page.locator('#lotForm button[type="submit"]').click());
    const inventoryFocus = await focusMetrics('#stockAddTitle');
    await capture(page, testInfo, observer, 'D11', 'inventory-post-save-focus', ['resize to 188x406', 'activate 큐브', 'save stock', 'inspect restored focus'], inventoryFocus);

    await page.locator('[data-settings-tab]').click();
    await waitForPut(page, () => page.locator('[data-profile-save]').click());
    const settingsFocus = await focusMetrics('#settingsTitle');
    await capture(page, testInfo, observer, 'D11', 'profile-post-save-focus', ['open settings', 'save profile', 'inspect restored focus'], settingsFocus);

    expect.soft(inventoryFocus).toMatchObject({ active: true, visible: true });
    expect.soft(settingsFocus).toMatchObject({ active: true, visible: true });
  });
});
