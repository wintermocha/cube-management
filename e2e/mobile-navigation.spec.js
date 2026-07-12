import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, runtimeProbe } from './helpers/mobile-audit.js';

test('RED-01 Pixel 7 navigation follows the mobile accessibility contract', async ({ page }, testInfo) => {
  const observer = observePage(page);
  await installDeterministicRuntime(page);
  await installSharedState(page);

  // Given the application is opened in the true Pixel 7 emulation lane.
  await page.goto('/');
  const runtime = await runtimeProbe(page);
  expect(runtime.userAgent).toContain('Android');
  expect(runtime.devicePixelRatio).toBeGreaterThan(1);
  expect(runtime.maxTouchPoints).toBeGreaterThan(0);
  expect(runtime.coarsePointer).toBe(true);
  expect(runtime.screen.width).toBeLessThanOrEqual(500);

  // When keyboard navigation enters and moves through the bottom tablist.
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(5);
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  const focusedAfterArrow = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  const selectedAfterArrow = await tabs.evaluateAll((items) => items.find((item) => item.getAttribute('aria-selected') === 'true')?.id);

  // And tab activation rerenders the workspace.
  await page.locator('[data-tab="inventory"]').click();
  const focusedAfterActivation = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  await page.keyboard.press('Home');
  const selectedAfterHome = await tabs.evaluateAll((items) => items.find((item) => item.getAttribute('aria-selected') === 'true')?.id);

  // And the skip link is activated from the top of the page.
  const skipVisibleAtRest = await page.locator('.skip-link').evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && rect.bottom > 0;
  });
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  const focusedAfterSkip = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

  await captureEvidence({
    page, testInfo, criterion: 'RED-01', name: 'pixel7-navigation-before', observer,
    actions: ['focus first tab', 'ArrowRight', 'activate inventory tab', 'Home', 'focus skip link', 'Enter'],
    observables: { runtime, focusedAfterArrow, selectedAfterArrow, focusedAfterActivation, selectedAfterHome, focusedAfterSkip, skipVisibleAtRest },
  });

  // Then the APG tab and skip-link contracts should hold (currently expected RED).
  expect.soft(await tabs.evaluateAll((items) => items.filter((item) => item.tabIndex === 0).length), 'one tab stop').toBe(1);
  expect.soft(focusedAfterArrow, 'ArrowRight moves focus').toBe('tab-inventory');
  expect.soft(selectedAfterArrow, 'ArrowRight activates the next tab').toBe('tab-inventory');
  expect.soft(focusedAfterActivation, 'focus survives rerender').toBe('tab-inventory');
  expect.soft(selectedAfterHome, 'Home activates the first tab').toBe('tab-today');
  expect.soft(focusedAfterSkip, 'skip link focuses main').toBe('main');
  expect.soft(skipVisibleAtRest, 'skip link stays hidden until focus').toBe(false);
});
