import { test, expect } from 'playwright/test';
import { seedData } from '../src/lib/seed.js';

function seedScrollableInventory() {
  const data = seedData();
  const createdAt = '2026-07-03T00:00:00.000Z';
  const extraIngredients = [];
  const extraLots = [];

  for (let index = 0; index < 12; index += 1) {
    const ingredientId = `ing-scroll-${index}`;
    extraIngredients.push({
      id: ingredientId,
      household_id: 'home',
      name: `스크롤 품목 ${index + 1}`,
      category: index % 2 ? '과일' : '채소',
      status: 'tolerated',
      notes: '',
      created_at: createdAt,
      updated_at: createdAt,
    });
    extraLots.push({
      id: `lot-scroll-${index}`,
      household_id: 'home',
      ingredient_id: ingredientId,
      made_at: `2026-07-${String(index + 1).padStart(2, '0')}`,
      expires_at: '2026-07-30',
      initial_count: 4,
      remaining_count: 4,
      grams_per_cube: 15,
      storage_location: '냉동실 A',
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  return { ...data, ingredients: data.ingredients.concat(extraIngredients), cubeLots: data.cubeLots.concat(extraLots), syncVersion: 1 };
}

test('cube lot adjustment keeps the inventory scroll position', async ({ page }) => {
  let sharedState = seedScrollableInventory();

  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sharedState) });
      return;
    }

    if (route.request().method() === 'PUT') {
      sharedState = { ...JSON.parse(route.request().postData() || '{}'), syncVersion: sharedState.syncVersion + 1 };
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(sharedState) });
      return;
    }

    await route.fallback();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-tab="inventory"]').click();

  const panel = page.locator('#panel-inventory');
  await page.locator('#panel-inventory [data-stock-toggle="ing-scroll-9"]').click();
  await page.locator('#panel-inventory [data-lot-increment="lot-scroll-9"]').scrollIntoViewIfNeeded();
  const before = await panel.evaluate((element) => element.scrollTop);

  expect(before, 'expanded lot controls should be below the top of the inventory panel').toBeGreaterThan(100);

  const saveResponse = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.request().method() === 'PUT');
  await page.locator('#panel-inventory [data-lot-increment="lot-scroll-9"]').click();
  await expect(page.locator('#panel-inventory [data-lot-increment="lot-scroll-9"]')).toBeVisible();

  const afterOptimisticRender = await panel.evaluate((element) => element.scrollTop);
  await saveResponse;
  const afterSharedStateRender = await panel.evaluate((element) => element.scrollTop);

  expect(afterOptimisticRender).toBeGreaterThanOrEqual(before - 8);
  expect(afterSharedStateRender).toBeGreaterThanOrEqual(before - 8);
});
