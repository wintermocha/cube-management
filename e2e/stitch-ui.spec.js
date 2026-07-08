import { test, expect } from 'playwright/test';
import { seedData } from '../src/lib/seed.js';

test('Stitch mobile settings and meal builder controls stay reachable', async ({ page }) => {
  let sharedState = { ...seedData(), syncVersion: 1 };

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

  await expect(page.locator('.top-app-bar')).toBeVisible();
  await expect(page.locator('.workspace-tabs .tab-button')).toHaveCount(5);
  await expect(page.locator('[data-settings-tab]')).toBeVisible();

  await page.getByRole('button', { name: '설정' }).click();
  await expect(page.locator('#panel-settings')).toBeVisible();
  await expect(page.locator('#panel-settings')).toHaveAttribute('role', 'region');
  await expect(page.locator('#panel-settings')).toHaveAttribute('aria-labelledby', 'settingsTitle');
  await expect(page.locator('#settingsTitle')).toBeVisible();
  await expect(page.locator('.workspace-tabs')).toHaveCount(0);

  await page.getByRole('button', { name: '설정 닫기' }).click();
  await page.locator('[data-tab="meals"]').click();
  await expect(page.locator('#panel-meals')).toBeVisible();

  await page.locator('[data-add-combo-ingredient="ing-beef"]').click();
  await page.locator('[data-add-combo-ingredient="ing-broccoli"]').click();
  await page.fill('#comboBuilderForm input[name="name"]', 'QA 모바일 조합');

  const lateStage = page.locator('#comboBuilderForm input[name="stage"][value="후기"]');
  await lateStage.check();
  await expect(lateStage).toBeChecked();

  await page.fill('#comboBuilderForm input[name="cube_count_ing-beef"]', '2');
  await page.fill('#comboBuilderForm input[name="cube_count_ing-broccoli"]', '3');
  await page.locator('#comboBuilderForm button[type="submit"]').click();

  const comboCard = page.locator('#panel-meals .combo-box').filter({ hasText: 'QA 모바일 조합' });
  await expect(comboCard).toBeVisible();
  await expect(comboCard).toContainText('후기');
  await expect(comboCard).toContainText('소고기 2개');
  await expect(comboCard).toContainText('브로콜리 3개');
});
