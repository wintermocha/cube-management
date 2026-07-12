import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

async function open(page) {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page);
  await page.goto('/');
  await page.locator('[data-tab="items"]').click();
  return { observer, fixture };
}

async function swipeLeft(shell, pointerId) {
  const card = shell.locator('.data-card');
  await card.dispatchEvent('pointerdown', { pointerId, clientX: 280, clientY: 200 });
  await card.dispatchEvent('pointerup', { pointerId, clientX: 180, clientY: 202 });
}

test('RED-02 SC3 unreferenced ingredient lifecycle covers all filters and deletion', async ({ page }, testInfo) => {
  const { observer, fixture } = await open(page);
  await page.locator('#ingredientName').fill('ULW 테스트 재료');
  await page.locator('#ingredientCategory').selectOption('과일');
  await waitForPut(page, () => page.locator('#ingredientForm button[type="submit"]').click());
  const created = fixture.state.ingredients.find((ingredient) => ingredient.name === 'ULW 테스트 재료');
  expect.soft(created?.category).toBe('과일');
  await page.reload();
  await page.locator('[data-tab="items"]').click();
  await page.locator(`[data-ingredient-toggle="${created.id}"]`).click();
  await waitForPut(page, () => page.locator(`[data-ingredient-status="${created.id}"]`).selectOption('testing'));
  await waitForPut(page, () => page.locator(`[data-ingredient-category="${created.id}"]`).selectOption('채소'));

  const filters = [];
  for (const filter of ['all', 'not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction']) {
    await page.locator(`[data-ingredient-filter="${filter}"]`).click();
    filters.push({ filter, pressed: await page.locator(`[data-ingredient-filter="${filter}"]`).getAttribute('aria-pressed'), visibleCreated: await page.getByText('ULW 테스트 재료', { exact: true }).count() > 0, empty: await page.locator('#panel-items .empty').count() > 0 });
  }
  await page.locator('[data-ingredient-filter="all"]').click();
  const shell = page.locator(`#panel-items [data-delete-id="${created.id}"]`);
  await swipeLeft(shell, 3);
  const action = shell.locator('[data-delete-ingredient]');
  const put = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.request().method() === 'PUT');
  await action.click();
  const dialog = page.getByRole('dialog');
  const confirmation = { dialog: await dialog.count(), cancel: await dialog.getByRole('button', { name: /취소|Cancel/i }).count(), confirm: await dialog.getByRole('button', { name: /확인|삭제|Confirm/i }).count() };
  if (confirmation.dialog) await dialog.getByRole('button', { name: /확인|삭제|Confirm/i }).click();
  await put;
  await page.reload();
  expect.soft(fixture.state.ingredients.some((ingredient) => ingredient.id === created.id && !ingredient.deleted_at)).toBe(false);
  expect.soft(fixture.state.events.some((event) => event.type === 'ingredient_delete')).toBe(true);
  await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC3-unreferenced-before', actions: ['SC3 fill ULW 테스트 재료/과일', 'submit PUT/reload', 'expand', 'status testing PUT', 'category 채소 PUT', 'select all six filters', 'swipe shortcut', 'activate visible delete', 'Confirm', 'reload'], observables: { createdId: created.id, filters, confirmation } });
  expect.soft(confirmation.dialog).toBe(1);
  expect.soft(confirmation.cancel).toBeGreaterThan(0);
  expect.soft(confirmation.confirm).toBeGreaterThan(0);
});

test('RED-02 SC3 referenced broccoli is protected and routes to Plan', async ({ page }, testInfo) => {
  const { observer, fixture } = await open(page);
  const before = structuredClone(fixture.state);
  const shell = page.locator('#panel-items [data-delete-id="ing-broccoli"]');
  await swipeLeft(shell, 4);
  const maybePut = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.request().method() === 'PUT', { timeout: 1_500 }).catch(() => null);
  await shell.locator('[data-delete-ingredient]').click();
  const dialog = page.getByRole('dialog');
  if (await dialog.count()) await dialog.getByRole('button', { name: /확인|삭제|Confirm/i }).click();
  const response = await maybePut;
  const message = await page.locator('[data-reference-alert="ing-broccoli"]').filter({ hasText: /조합·식단에 포함돼요/ }).count();
  const planAction = page.getByRole('button', { name: /식단 확인/ });
  if (await planAction.count()) await planAction.click();
  const planVisible = await page.locator('#panel-meals').isVisible().catch(() => false);
  await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC3-referenced-before', actions: ['SC3 swipe seeded broccoli', 'activate visible delete', 'Confirm attempt', 'inspect persistent reference message', 'activate 식단 확인'], observables: { putStatus: response?.status() || null, message, planAction: await planAction.count(), planVisible } });
  expect.soft(response, 'referenced delete sends no PUT').toBeNull();
  expect.soft(fixture.state.ingredients.find((item) => item.id === 'ing-broccoli')).toEqual(before.ingredients.find((item) => item.id === 'ing-broccoli'));
  expect.soft(fixture.state.combinationItems).toEqual(before.combinationItems);
  expect.soft(message).toBeGreaterThan(0);
  expect.soft(await planAction.count()).toBeGreaterThan(0);
  expect.soft(planVisible).toBe(true);
});
