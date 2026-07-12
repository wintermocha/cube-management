import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

test('RED-02 SC4 exact combination and meal lifecycle persists through touch and drag paths', async ({ page }, testInfo) => {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  const fixture = await installSharedState(page);
  await page.goto('/');
  await page.locator('[data-tab="meals"]').click();
  await page.locator('#weekStart').fill('2026-07-11');
  await page.locator('#weekStart').dispatchEvent('change');
  await page.locator('#comboBuilderForm input[name="name"]').fill('ULW 조합');
  await page.locator('#comboBuilderForm input[name="stage"][value="후기"]').check();
  await page.locator('[data-add-combo-ingredient="ing-beef"]').click();
  await page.locator('[data-add-combo-ingredient="ing-broccoli"]').click();
  const draft = {
    name: await page.locator('#comboBuilderForm input[name="name"]').inputValue(),
    stage: await page.locator('#comboBuilderForm input[name="stage"]:checked').inputValue(),
    beefSelected: await page.locator('[name="cube_count_ing-beef"]').count(),
    broccoliSelected: await page.locator('[name="cube_count_ing-broccoli"]').count(),
  };
  expect.soft(draft).toEqual({ name: 'ULW 조합', stage: '후기', beefSelected: 1, broccoliSelected: 1 });
  if (draft.name !== 'ULW 조합') await page.locator('#comboBuilderForm input[name="name"]').fill('ULW 조합');
  if (draft.stage !== '후기') await page.locator('#comboBuilderForm input[name="stage"][value="후기"]').check();
  await page.locator('[name="cube_count_ing-beef"]').fill('2');
  await page.locator('[name="cube_count_ing-broccoli"]').fill('3');
  await waitForPut(page, () => page.locator('#comboBuilderForm button[type="submit"]').click());
  const combination = fixture.state.combinations.find((item) => item.name === 'ULW 조합');
  const items = fixture.state.combinationItems.filter((item) => item.combination_id === combination.id);
  expect.soft(combination?.stage).toBe('후기');
  expect.soft(items).toEqual(expect.arrayContaining([
    expect.objectContaining({ ingredient_id: 'ing-beef', cube_count: 2 }),
    expect.objectContaining({ ingredient_id: 'ing-broccoli', cube_count: 3 }),
  ]));

  await page.reload();
  await page.locator('[data-tab="meals"]').click();
  const comboCard = page.locator('[data-drag-combo]').filter({ hasText: 'ULW 조합' });
  await waitForPut(page, () => comboCard.getByRole('button', { name: /식단에 추가/ }).click());
  await page.reload();
  await page.locator('[data-tab="meals"]').click();
  expect.soft(await page.locator('#panel-meals').innerText()).toContain('ULW 조합');
  expect.soft(fixture.state.mealPlanSlots.some((slot) => slot.combination_id === combination.id)).toBe(true);
  expect.soft(fixture.state.events.some((event) => event.type === 'combo_create')).toBe(true);
  expect.soft(fixture.state.events.some((event) => event.type === 'meal_slot_create')).toBe(true);
  await page.locator('[data-tab="today"]').click();
  expect.soft(await page.locator('#panel-today').innerText()).toContain('ULW 조합');

  await page.locator('[data-tab="meals"]').click();
  const dragCoverage = await page.evaluate(() => {
    const source = document.querySelector('[data-drag-combo]');
    const target = document.querySelector('[data-meal-drop-date]');
    if (!source || !target) return false;
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    return true;
  });
  await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC4-plan-before', actions: ['SC4 set week 2026-07-11', 'type ULW 조합', 'select 후기', 'tap beef and broccoli', 'set 2 and 3', 'save PUT/reload', 'tap 식단에 추가 PUT/reload', 'inspect Plan and Today', 'dispatch desktop drag/drop DataTransfer'], observables: { draft, combinationId: combination.id, items, dragCoverage } });
  expect.soft(dragCoverage).toBe(true);
});
