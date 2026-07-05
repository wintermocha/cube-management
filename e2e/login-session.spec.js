import { test, expect } from 'playwright/test';

test('expired session confirmation navigates to the login route', async ({ page }) => {
  await page.route('**/api/state', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });

  await page.goto('/');

  const authPanel = page.locator('[data-auth-required]');
  await expect(authPanel).toBeVisible();
  await expect(page.getByRole('heading', { name: '로그인이 필요해요' })).toBeVisible();
  await expect(page.getByText('로그인 세션을 확인하지 못했어요. 다시 로그인해 주세요.')).toBeVisible();
  await expect(page.locator('.workspace-tabs')).toHaveCount(0);

  const confirmButtons = page.locator('[data-auth-login]');
  await expect(confirmButtons).toHaveCount(1);
  await expect(confirmButtons).toHaveText('확인');

  await confirmButtons.click();

  await expect(page).toHaveURL(/\/login$/);
  expect(new URL(page.url()).pathname).toBe('/login');
});
