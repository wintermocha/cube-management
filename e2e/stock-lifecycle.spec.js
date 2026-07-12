import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

test('RED-02 SC2 exact cube lifecycle persists and confirms destructive actions', async ({ page }, testInfo) => {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page);
  await page.goto('/');

  await page.locator('[data-tab="inventory"]').click();
  await page.locator('#lotMadeAt').fill('2026-07-11');
  await page.locator('#lotIngredient').selectOption({ index: 0 });
  await page.locator('#lotCount').fill('3');
  await page.locator('#lotGramsPerCube').fill('15');
  await page.locator('#lotDescription').fill('ULW 재고 QA');
  const createResponse = await waitForPut(page, () => page.locator('#lotForm button[type="submit"]').click());
  expect(await createResponse.status()).toBe(200);
  const created = fixture.state.cubeLots.find((lot) => lot.description === 'ULW 재고 QA');
  expect.soft(created).toMatchObject({ made_at: '2026-07-11', initial_count: 3, remaining_count: 3, grams_per_cube: 15 });
  expect.soft(fixture.state.events.some((event) => event.type === 'stock_add')).toBe(true);

  await page.reload();
  await page.locator('[data-tab="inventory"]').click();
  await page.locator(`[data-stock-toggle="${created.ingredient_id}"]`).click();
  const increment = page.locator(`[data-lot-increment="${created.id}"]`);
  await waitForPut(page, () => increment.click());
  expect.soft(fixture.state.cubeLots.find((lot) => lot.id === created.id)?.remaining_count).toBe(4);
  await page.reload();
  await page.locator('[data-tab="inventory"]').click();
  await page.locator(`[data-stock-toggle="${created.ingredient_id}"]`).click();
  await waitForPut(page, () => page.locator(`[data-lot-decrement="${created.id}"]`).click());
  expect.soft(fixture.state.cubeLots.find((lot) => lot.id === created.id)?.remaining_count).toBe(3);

  await page.reload();
  await page.locator('[data-tab="inventory"]').click();
  await page.locator(`[data-stock-toggle="${created.ingredient_id}"]`).click();
  const deleteLot = page.locator(`[data-delete-lot="${created.id}"]`);
  await deleteLot.click();
  const dialog = page.getByRole('dialog');
  const confirmation = {
    dialog: await dialog.count(),
    cancel: await dialog.getByRole('button', { name: /취소|Cancel/i }).count(),
    confirm: await dialog.getByRole('button', { name: /확인|삭제|Confirm/i }).count(),
    consequence: await dialog.getByText(/되돌릴 수 없|영구|삭제/).count(),
  };
  await dialog.getByRole('button', { name: /취소|Cancel/i }).click();
  await expect(deleteLot).toBeFocused();
  await deleteLot.click();
  await waitForPut(page, () => page.getByRole('dialog').getByRole('button', { name: /확인|삭제|Confirm/i }).click());
  await page.reload();
  expect.soft(fixture.state.cubeLots.some((lot) => lot.id === created.id && !lot.deleted_at)).toBe(false);
  expect.soft(fixture.state.events.some((event) => event.type === 'cube_lot_delete')).toBe(true);

  await page.locator('[data-tab="inventory"]').click();
  const stockShell = page.locator(`#panel-inventory [data-delete-id="${created.ingredient_id}"]`);
  await stockShell.locator('.data-card').dispatchEvent('pointerdown', { pointerId: 2, clientX: 280, clientY: 200 });
  await stockShell.locator('.data-card').dispatchEvent('pointerup', { pointerId: 2, clientX: 180, clientY: 202 });
  await stockShell.locator('[data-delete-stock]').click();
  await page.getByRole('dialog').getByRole('button', { name: /취소|Cancel/i }).click();
  const visibleStockDelete = page.locator(`[data-request-delete-stock="${created.ingredient_id}"]`);
  await expect(visibleStockDelete).toBeFocused();
  await visibleStockDelete.click();
  await waitForPut(page, () => page.getByRole('dialog').getByRole('button', { name: /확인|삭제|Confirm/i }).click());
  expect.soft(fixture.state.ingredients.some((ingredient) => ingredient.id === created.ingredient_id && !ingredient.deleted_at)).toBe(true);

  await captureEvidence({
    page, testInfo, observer, criterion: 'RED-02', name: 'SC2-cubes-before',
    actions: ['SC2 tap Cubes', 'fill 2026-07-11/first ingredient/3/15/ULW 재고 QA', 'submit PUT', 'reload', 'expand', '+ to 4', 'reload', '- to 3', 'reload', 'arm lot delete', 'Cancel', 'rearm', 'Confirm delete', 'reload', 'swipe whole stock', 'Cancel', 'use visible whole-stock alternative', 'Confirm clear stock'],
    observables: { confirmation, createdLotId: created.id, ingredientRetained: fixture.state.ingredients.some((ingredient) => ingredient.id === created.ingredient_id && !ingredient.deleted_at) },
  });
  expect.soft(confirmation).toMatchObject({ dialog: 1, cancel: 1 });
  expect.soft(confirmation.confirm).toBeGreaterThan(0);
  expect.soft(confirmation.consequence).toBeGreaterThan(0);
});
