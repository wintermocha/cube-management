import { test, expect } from 'playwright/test';
import { installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage, waitForPut } from './helpers/mobile-audit.js';

test.describe('RED-02 SC5 settings, History, and auth lifecycle', () => {
  test('profile exact values persist across reload and a fresh context', async ({ page, browser }, testInfo) => {
    const observer = observePage(page);
    await installDeterministicRuntime(page);
    const fixture = await installSharedState(page);
    await page.goto('/');
    await page.locator('[data-settings-tab]').click();
    await page.locator('[name="display_name"]').fill('ULW 아기');
    await page.locator('[name="birth_date"]').fill('2026-01-02');
    await page.locator('[name="notes"]').fill('ULW 프로필 QA');
    await waitForPut(page, () => page.locator('[data-profile-save]').click());
    expect.soft(fixture.state.childProfile).toMatchObject({ display_name: 'ULW 아기', birth_date: '2026-01-02', notes: 'ULW 프로필 QA' });
    await page.reload();
    expect.soft(await page.locator('.top-app-title').innerText()).toContain('ULW 아기');
    await expect(page.locator('[data-profile-form]')).toBeVisible();
    expect.soft(await page.locator('[name="display_name"]').inputValue()).toBe('ULW 아기');

    const freshContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL });
    const fresh = await freshContext.newPage();
    await installDeterministicRuntime(fresh);
    await installSharedState(fresh, fixture.state);
    await fresh.goto('/');
    expect.soft(await fresh.locator('.top-app-title').innerText()).toContain('ULW 아기');
    await freshContext.close();

    const putsBeforePhoto = fixture.requests.filter((request) => request.method === 'PUT').length;
    await page.locator('[data-profile-photo]').click();
    const photoMessage = (await page.locator('#toast').textContent())?.trim();
    const putsAfterPhoto = fixture.requests.filter((request) => request.method === 'PUT').length;
    await page.locator('[data-action-tab="today"]').click();
    await page.locator('[data-tab="records"]').click();
    const history = await page.locator('#panel-records').innerText();
    await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC5-profile-history-before', actions: ['SC5 open Settings', 'fill ULW 아기/2026-01-02/ULW 프로필 QA', 'save PUT/reload/fresh page', 'click 사진 변경', 'open History'], observables: { photoMessage, putsBeforePhoto, putsAfterPhoto, profileEvent: fixture.state.events.some((event) => event.type === 'profile_update'), rawEmail: /@example\.com/.test(history), rawManual: /\bmanual\b/.test(history) } });
    expect.soft(photoMessage).toBe('사진 업로드는 아직 준비 중이에요. 이름과 메모는 바로 저장돼요.');
    expect.soft(putsAfterPhoto).toBe(putsBeforePhoto);
    expect.soft(fixture.state.events.some((event) => event.type === 'profile_update')).toBe(true);
    expect.soft(history).not.toMatch(/@example\.com|\bmanual\b|2026-\d\d-\d\dT/);
  });

  test('initial GET 401 gates all household content and Confirm reloads top-level', async ({ page }, testInfo) => {
    const observer = observePage(page);
    await installDeterministicRuntime(page);
    const fixture = await installSharedState(page);
    fixture.failGet(401);
    await page.route('**/cdn-cgi/access/login**', (route) => route.fulfill({ status: 200, body: 'intercepted access login' }));
    await page.goto('/');
    await expect(page.locator('[data-auth-required]')).toBeVisible();
    const appPanels = await page.locator('.workspace-tabs, .tab-panel').count();
    const beforeUrl = page.url();
    await page.locator('[data-auth-login]').click();
    await page.waitForLoadState('domcontentloaded');
    const afterUrl = page.url();
    await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC5-initial-401-before', actions: ['SC5 initial GET 401', 'inspect sole auth panel', 'click Confirm'], observables: { appPanels, beforeUrl, afterUrl } });
    expect.soft(appPanels).toBe(0);
    expect.soft(afterUrl, 'Confirm performs top-level reload').toBe(beforeUrl);
    expect.soft(afterUrl).not.toContain('/login');
  });

  test('save-time PUT 401 replaces app with one auth panel', async ({ page }, testInfo) => {
    const observer = observePage(page);
    await installDeterministicRuntime(page);
    const fixture = await installSharedState(page);
    fixture.queuePut(401);
    await page.goto('/');
    await page.locator('[data-settings-tab]').click();
    await page.locator('[name="display_name"]').fill('ULW 아기');
    const response = await waitForPut(page, () => page.locator('[data-profile-save]').click());
    await expect(page.locator('[data-auth-required]')).toBeVisible();
    const observables = { status: response.status(), authPanels: await page.locator('[data-auth-required]').count(), appPanels: await page.locator('.workspace-tabs, .tab-panel').count() };
    await captureEvidence({ page, testInfo, observer, criterion: 'RED-02', name: 'SC5-save-401-before', actions: ['SC5 load GET 200', 'open Settings', 'edit profile', 'save PUT 401', 'inspect auth gate'], observables });
    expect.soft(observables).toEqual({ status: 401, authPanels: 1, appPanels: 0 });
  });
});
