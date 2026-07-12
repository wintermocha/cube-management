import { test, expect } from 'playwright/test';
import { deterministicState, installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureFinalEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

async function openPage(page, initial = deterministicState()) {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page, initial);
  await page.goto('/');
  return { observer, fixture };
}

async function geometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.tab-panel:not([hidden])') || document.querySelector('#main');
    const bounds = panel.getBoundingClientRect();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const clipped = Array.from(panel.querySelectorAll('*')).filter((element) => visible(element) && !element.closest('.meal-calendar') && (element.getBoundingClientRect().left < bounds.left - 1 || element.getBoundingClientRect().right > bounds.right + 1)).map((element) => element.id || element.className || element.tagName);
    const undersized = Array.from(panel.querySelectorAll('button,a:not(.skip-link),input:not([type="radio"]),select,textarea')).filter((element) => visible(element) && (element.getBoundingClientRect().width < 48 || element.getBoundingClientRect().height < 48)).map((element) => element.getAttribute('aria-label') || element.id || element.textContent.trim());
    return { documentWidth: document.documentElement.scrollWidth, documentClientWidth: document.documentElement.clientWidth, panelWidth: panel.scrollWidth, panelClientWidth: panel.clientWidth, clipped, undersized };
  });
}

async function captureState(page, testInfo, observer, name, actions) {
  const observables = await geometry(page);
  await captureFinalEvidence({ page, testInfo, observer, name, actions, observables });
  expect(observables.documentWidth, `${name} document containment`).toBe(observables.documentClientWidth);
  expect(observables.panelWidth, `${name} panel containment`).toBe(observables.panelClientWidth);
  expect(observables.clipped, `${name} descendant bounds`).toEqual([]);
  expect(observables.undersized, `${name} 48px targets`).toEqual([]);
}

test('all six application screens are contained and replayable', async ({ page }, testInfo) => {
  const { observer } = await openPage(page);
  await captureState(page, testInfo, observer, '01-today', ['load Today']);
  for (const [tab, name] of [['inventory', '02-inventory'], ['meals', '03-plan'], ['items', '04-ingredients'], ['records', '05-history']]) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await captureState(page, testInfo, observer, name, [`activate ${tab}`]);
  }
  await page.locator('[data-settings-tab]').click();
  await captureState(page, testInfo, observer, '06-settings', ['open Settings']);
});

test('critical interaction states remain contained and safe', async ({ page }, testInfo) => {
  const { observer } = await openPage(page);
  await page.locator('[data-tab="inventory"]').click();
  await page.locator('[data-stock-toggle="ing-beef"]').click();
  await captureState(page, testInfo, observer, '07-stock-expanded', ['activate Cubes', 'expand beef stock']);
  await page.locator('[data-delete-lot="lot-beef-1"]').click();
  await captureState(page, testInfo, observer, '08-lot-delete-confirm', ['arm beef lot delete']);
  await page.locator('[data-cancel-delete]').click();
  await page.locator('[data-tab="items"]').click();
  await page.locator('#ingredientForm button[type="submit"]').click();
  await captureState(page, testInfo, observer, '09-inline-invalid', ['activate Ingredients', 'submit empty ingredient form']);
  await page.locator('[data-tab="inventory"]').click();
  await waitForPut(page, () => page.locator('#lotForm button[type="submit"]').click());
  await captureState(page, testInfo, observer, '10-success-status', ['submit deterministic stock lot', 'await PUT 200']);
  await page.locator('[data-tab="items"]').click();
  await page.locator('[data-request-delete-ingredient="ing-broccoli"]').click();
  await captureState(page, testInfo, observer, '11-referenced-delete-block', ['request referenced broccoli deletion']);

  const longState = deterministicState();
  longState.childProfile.display_name = '아주긴이름의테스트아기';
  longState.ingredients[0].name = '아주길고끊기어려운소고기테스트재료';
  const longPage = await page.context().newPage();
  const longAudit = await openPage(longPage, longState);
  await longPage.locator('[data-tab="inventory"]').click();
  await captureState(longPage, testInfo, longAudit.observer, '12-long-cjk', ['load long Korean fixture', 'activate Cubes']);
  await longPage.close();
});

test('loading, failure, auth, conflict, and empty states are isolated', async ({ page }, testInfo) => {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const delayed = await installSharedState(page);
  delayed.delayGet(500);
  const loaded = page.waitForResponse((response) => response.url().endsWith('/api/state'));
  await page.goto('/');
  await captureFinalEvidence({ page, testInfo, observer, name: '13-loading', actions: ['delay GET', 'capture loading gate'], observables: { householdPanels: await page.locator('.tab-panel').count() } });
  await loaded;

  for (const [status, name] of [[500, '14-load-error'], [401, '15-auth-required'], [403, '16-forbidden']]) {
    const gatePage = await page.context().newPage();
    const gateObserver = observePage(gatePage);
    await installDeterministicRuntime(gatePage);
    const fixture = await installSharedState(gatePage);
    fixture.failGet(status);
    await gatePage.goto('/');
    await expect(gatePage.locator('[role="alert"]')).toBeVisible();
    await captureFinalEvidence({ page: gatePage, testInfo, observer: gateObserver, name, actions: [`GET ${status}`, 'capture isolated gate'], observables: { householdPanels: await gatePage.locator('.tab-panel').count() } });
    await gatePage.close();
  }

  const conflictPage = await page.context().newPage();
  const conflictAudit = await openPage(conflictPage);
  conflictAudit.fixture.queuePut(409);
  await conflictPage.locator('[data-tab="inventory"]').click();
  await conflictPage.locator('[data-stock-toggle="ing-beef"]').click();
  const conflictResponse = conflictPage.waitForResponse((response) => response.request().method() === 'PUT');
  await conflictPage.locator('[data-lot-increment="lot-beef-1"]').click();
  await conflictResponse;
  await captureState(conflictPage, testInfo, conflictAudit.observer, '17-conflict', ['increment beef lot', 'receive PUT 409']);
  await conflictPage.close();

  const emptyState = deterministicState();
  emptyState.cubeLots = [];
  emptyState.events = [];
  const emptyPage = await page.context().newPage();
  const emptyAudit = await openPage(emptyPage, emptyState);
  await emptyPage.locator('[data-tab="inventory"]').click();
  await captureState(emptyPage, testInfo, emptyAudit.observer, '18-empty-inventory', ['load empty stock fixture', 'activate Cubes']);
  await emptyPage.locator('[data-tab="records"]').click();
  await captureState(emptyPage, testInfo, emptyAudit.observer, '19-empty-history', ['activate History with no events']);
  await emptyPage.close();
});
