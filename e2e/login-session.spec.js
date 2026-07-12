import { test, expect } from 'playwright/test';

test('expired session confirmation reloads the current protected URL', async ({ page }) => {
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
  await expect(page.getByText('로그인 세션이 끝났어요. 로그인 후 계속해 주세요.')).toBeVisible();
  await expect(page.locator('.workspace-tabs')).toHaveCount(0);

  const confirmButtons = page.locator('[data-auth-login]');
  await expect(confirmButtons).toHaveCount(1);
  await expect(confirmButtons).toHaveText('확인');

  const protectedUrl = page.url();
  const reloadedState = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.status() === 401);
  await confirmButtons.click();
  await reloadedState;
  await expect(page).toHaveURL(protectedUrl);
  await expect(page.locator('[data-auth-required]')).toBeVisible();
});
