import { test, expect } from 'playwright/test';
import { deterministicState, installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureEvidence, observePage } from './helpers/mobile-audit.js';

test.describe('RED-04 browser persistence and auth failures', () => {
  test('delayed authoritative GET blocks immediate mutation', async ({ page }, testInfo) => {
    const observer = observePage(page);
    await installDeterministicRuntime(page);
    const fixture = await installSharedState(page);
    fixture.delayGet(800);
    const getResponse = page.waitForResponse((response) => response.request().method() === 'GET' && response.url().endsWith('/api/state'));
    await page.goto('/');
    const loading = await page.locator('#main[aria-busy="true"]').count();
    const mutationControls = await page.locator('.workspace-tabs, .tab-panel, form, [data-lot-increment], [data-delete-ingredient]').count();
    const putCountBeforeLoad = fixture.requests.filter((request) => request.method === 'PUT').length;
    await getResponse;
    const putCount = fixture.requests.filter((request) => request.method === 'PUT').length;
    await expect(page.locator('.workspace-tabs')).toBeVisible();
    await captureEvidence({ page, testInfo, observer, criterion: 'RED-04', name: 'delayed-get-before', actions: ['delay initial GET', 'inspect loading surface without waiting for absent controls', 'await authoritative GET'], observables: { loading, mutationControls, putCountBeforeLoad, putCount } });
    expect.soft(loading, 'loading surface is present').toBe(1);
    expect.soft(mutationControls, 'no mutation controls render before authoritative GET').toBe(0);
    expect.soft(putCountBeforeLoad, 'no pre-load PUT').toBe(0);
    expect.soft(putCount, 'no pre-load PUT').toBe(0);
  });

  test('GET 403 never exposes cached household content', async ({ page }, testInfo) => {
    const observer = observePage(page);
    await installDeterministicRuntime(page);
    await page.addInitScript((cached) => localStorage.setItem('baby-food-cube-cloudflare-mvp', JSON.stringify(cached)), deterministicState());
    const fixture = await installSharedState(page);
    fixture.failGet(403, 500);
    const response = page.waitForResponse((candidate) => candidate.url().endsWith('/api/state'));
    await page.goto('/');
    const leakedBeforeGate = await page.locator('.workspace-tabs').isVisible().catch(() => false);
    await response;
    const observables = { leakedBeforeGate, authPanels: await page.locator('[data-auth-required]').count(), householdPanels: await page.locator('.workspace-tabs, .tab-panel').count() };
    await captureEvidence({ page, testInfo, observer, criterion: 'RED-04', name: 'cached-403-before', actions: ['seed local cache', 'delay GET 403', 'inspect before response', 'inspect after response'], observables });
    expect.soft(observables).toEqual({ leakedBeforeGate: false, authPanels: 1, householdPanels: 0 });
  });

  for (const mode of ['getItem SecurityError', 'setItem QuotaExceededError']) {
    test(`storage ${mode} cannot block authenticated API render`, async ({ page }, testInfo) => {
      const observer = observePage(page);
      await installDeterministicRuntime(page);
      await page.addInitScript((failureMode) => {
        const method = failureMode.startsWith('getItem') ? 'getItem' : 'setItem';
        const errorName = failureMode.includes('Security') ? 'SecurityError' : 'QuotaExceededError';
        Storage.prototype[method] = () => { throw new DOMException('qa-storage-failure', errorName); };
      }, mode);
      const state = deterministicState();
      state.childProfile.display_name = 'API 아기';
      await installSharedState(page, state);
      await page.goto('/');
      const main = await page.locator('#main').count();
      const observables = { header: main ? await page.locator('.top-app-title').textContent() : '', main };
      await captureEvidence({ page, testInfo, observer, criterion: 'RED-04', name: `storage-${mode.split(' ')[0]}-before`, actions: [`inject ${mode}`, 'GET authenticated state', 'inspect render'], observables });
      expect.soft(observables.main).toBe(1);
      expect.soft(observables.header).toContain('API 아기');
      expect.soft(observer.entries.filter((entry) => entry.type === 'pageerror')).toEqual([]);
    });
  }

  for (const failure of ['offline', '404', '500', 'malformed']) {
    test(`GET ${failure} exposes a persistent error without uncaught exceptions`, async ({ page }, testInfo) => {
      const observer = observePage(page);
      await installDeterministicRuntime(page);
      const fixture = await installSharedState(page);
      if (failure === 'offline') fixture.abortGet();
      else if (failure === 'malformed') fixture.malformedGet();
      else fixture.failGet(Number(failure));
      await page.goto('/');
      await page.waitForLoadState('load');
      await page.locator('#toast').waitFor({ state: 'attached' });
      const alerts = await page.locator('[role="alert"]').count();
      await captureEvidence({ page, testInfo, observer, criterion: 'RED-04', name: `get-${failure}-before`, actions: [`initial GET ${failure}`, 'inspect persistent error'], observables: { alerts } });
      expect.soft(alerts).toBeGreaterThan(0);
      expect.soft(observer.entries.filter((entry) => entry.type === 'pageerror')).toEqual([]);
    });
  }

  for (const status of [401, 403, 409, 422, 500]) {
    test(`PUT ${status} rolls back and never shows false success`, async ({ page }, testInfo) => {
      const observer = observePage(page);
      await installDeterministicRuntime(page);
      const fixture = await installSharedState(page);
      fixture.queuePut(status);
      await page.goto('/');
      await page.locator('[data-tab="inventory"]').click();
      await page.locator('[data-stock-toggle="ing-beef"]').click();
      const response = page.waitForResponse((candidate) => candidate.request().method() === 'PUT' && candidate.url().endsWith('/api/state'));
      await page.locator('[data-lot-increment="lot-beef-1"]').click();
      await response;
      const serverCount = fixture.state.cubeLots.find((lot) => lot.id === 'lot-beef-1').remaining_count;
      const lotBox = page.locator('.lot-box').filter({ has: page.locator('[data-lot-increment="lot-beef-1"]') });
      const visibleCount = await lotBox.count() ? await lotBox.textContent() : 'auth-gate';
      const observables = { status, serverCount, visibleCount, alerts: await page.locator('[role="alert"]').count(), success: await page.locator('#toast[data-tone="success"]').count(), forbidden: await page.locator('[data-forbidden]').count(), householdPanels: await page.locator('.workspace-tabs, .tab-panel').count() };
      await captureEvidence({ page, testInfo, observer, criterion: 'RED-04', name: `put-${status}-before`, actions: ['load acknowledged state', 'expand beef', `increment with PUT ${status}`, 'inspect rollback and alert'], observables });
      expect.soft(observables.success).toBe(0);
      expect.soft(observables.alerts).toBeGreaterThan(0);
      if (status === 403) {
        expect.soft(observables.forbidden).toBe(1);
        expect.soft(observables.householdPanels).toBe(0);
      } else if (status !== 401) {
        expect.soft(visibleCount).toContain(`${serverCount}개`);
      }
    });
  }

  test('requests carry credentials/header and two-context conflict keeps server winner', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL || process.env.PLAYWRIGHT_BASE_URL });
    const fixture = await installSharedState(context);
    const winner = await context.newPage();
    const loser = await context.newPage();
    for (const page of [winner, loser]) {
      await page.addInitScript(() => {
        const originalFetch = window.fetch.bind(window);
        window.__qaFetchOptions = [];
        window.fetch = (input, init = {}) => {
          window.__qaFetchOptions.push({ credentials: init.credentials || null, headers: Object.fromEntries(new Headers(init.headers).entries()) });
          return originalFetch(input, init);
        };
      });
    }
    await Promise.all([winner.goto('/'), loser.goto('/')]);
    fixture.queuePut(200);
    fixture.queuePut(409);
    for (const page of [winner, loser]) {
      await page.locator('[data-tab="inventory"]').click();
      await page.locator('[data-stock-toggle="ing-beef"]').click();
    }
    const first = winner.waitForResponse((response) => response.request().method() === 'PUT');
    await winner.locator('[data-lot-increment="lot-beef-1"]').click();
    await first;
    const second = loser.waitForResponse((response) => response.request().method() === 'PUT');
    await loser.locator('[data-lot-decrement="lot-beef-1"]').click();
    await second;
    const stateRequests = fixture.requests.filter((request) => request.url.endsWith('/api/state'));
    const headerContract = stateRequests.every((request) => request.headers['x-requested-with'] === 'XMLHttpRequest');
    const fetchOptions = await Promise.all([winner, loser].map((page) => page.evaluate(() => window.__qaFetchOptions)));
    const credentialContract = fetchOptions.flat().every((options) => options.credentials === 'include');
    const loserAlert = await loser.locator('[role="alert"]').count();
    expect.soft(headerContract).toBe(true);
    expect.soft(credentialContract, 'state requests execute in the credentialed page context').toBe(true);
    expect.soft(loserAlert, 'loser retains a persistent conflict alert').toBeGreaterThan(0);
    expect.soft(fixture.state.cubeLots.find((lot) => lot.id === 'lot-beef-1').remaining_count).toBe(6);
    await context.close();
  });
});
