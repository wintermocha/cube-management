import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureTouchEvidence, observePage, runtimeProbe, waitForPut } from './helpers/mobile-audit.js';

test('Pixel 7 uses real tap input for the core mobile control matrix', async ({ page }, testInfo) => {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page);
  await page.goto('/');
  const runtime = await runtimeProbe(page);
  expect(runtime.userAgent).toContain('Android');
  expect(runtime.devicePixelRatio).toBeGreaterThan(1);
  expect(runtime.maxTouchPoints).toBeGreaterThan(0);
  expect(runtime.coarsePointer).toBe(true);
  expect(runtime.hoverNone).toBe(true);

  const taps = [];
  async function tap(locator, label) {
    await locator.tap();
    taps.push(label);
  }

  for (const tab of ['inventory', 'meals', 'items', 'records', 'today']) {
    await tap(page.locator(`[data-tab="${tab}"]`), `tab:${tab}`);
    await expect(page.locator(`#panel-${tab}`)).toBeVisible();
  }
  await tap(page.locator('[data-settings-tab]'), 'settings:open');
  await expect(page.locator('#panel-settings')).toBeVisible();
  await tap(page.locator('[data-action-tab="today"]'), 'settings:close');
  await expect(page.locator('#panel-today')).toBeVisible();

  await tap(page.locator('[data-tab="inventory"]'), 'tab:inventory-for-stock');
  await tap(page.locator('#lotMadeAt'), 'stock:date'); await page.locator('#lotMadeAt').fill('2026-07-11');
  await tap(page.locator('#lotCount'), 'stock:count'); await page.locator('#lotCount').fill('3');
  await tap(page.locator('#lotGramsPerCube'), 'stock:grams'); await page.locator('#lotGramsPerCube').fill('15');
  await tap(page.locator('#lotDescription'), 'stock:description'); await page.locator('#lotDescription').fill('Pixel tap QA');
  await waitForPut(page, () => tap(page.locator('#lotForm button[type="submit"]'), 'stock:submit'));
  expect(fixture.state.cubeLots.some((lot) => lot.made_at === '2026-07-11' && lot.initial_count === 3)).toBe(true);

  await tap(page.locator('[data-stock-toggle="ing-beef"]'), 'stock:expand-beef');
  await waitForPut(page, () => tap(page.locator('[data-lot-increment="lot-beef-1"]'), 'stock:increment'));
  expect(fixture.state.cubeLots.find((lot) => lot.id === 'lot-beef-1').remaining_count).toBe(6);
  await tap(page.locator('[data-delete-lot="lot-beef-1"]'), 'stock:delete-arm');
  await expect(page.getByRole('dialog')).toBeVisible();
  await tap(page.locator('[data-cancel-delete]'), 'stock:delete-cancel');
  expect(fixture.state.cubeLots.some((lot) => lot.id === 'lot-beef-1' && !lot.deleted_at)).toBe(true);
  await tap(page.locator('[data-delete-lot="lot-beef-1"]'), 'stock:delete-rearm');
  await waitForPut(page, () => tap(page.locator('[data-confirm-delete]'), 'stock:delete-confirm'));
  expect(fixture.state.cubeLots.some((lot) => lot.id === 'lot-beef-1' && !lot.deleted_at)).toBe(false);

  await tap(page.locator('[data-tab="items"]'), 'tab:items-for-filters');
  for (const filter of ['all', 'not_tried', 'planned', 'testing', 'tolerated', 'suspected_reaction']) {
    await tap(page.locator(`[data-ingredient-filter="${filter}"]`), `filter:${filter}`);
    await expect(page.locator(`[data-ingredient-filter="${filter}"]`)).toHaveAttribute('aria-pressed', 'true');
  }

  await tap(page.locator('[data-tab="meals"]'), 'tab:meals-for-touch-add');
  await waitForPut(page, () => tap(page.locator('[data-add-combo-meal]').first(), 'meal:touch-add'));
  expect(fixture.state.mealPlanSlots.length).toBeGreaterThan(4);

  await tap(page.locator('[data-settings-tab]'), 'settings:open-for-save');
  await tap(page.locator('#profileDisplayName'), 'profile:name'); await page.locator('#profileDisplayName').fill('Pixel QA 아기');
  await waitForPut(page, () => tap(page.locator('[data-profile-save]'), 'profile:save'));
  expect(fixture.state.childProfile.display_name).toBe('Pixel QA 아기');
  expect(observer.entries).toEqual([]);

  await captureTouchEvidence({
    page, testInfo, observer, name: 'pixel7-tap-matrix', actions: taps,
    observables: { runtime, tapCount: taps.length, taps, putCount: fixture.requests.filter((request) => request.method === 'PUT').length },
  });
  expect(taps.length).toBeGreaterThanOrEqual(25);
});
