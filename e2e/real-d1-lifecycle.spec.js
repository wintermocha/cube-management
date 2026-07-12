import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from 'playwright/test';
import { observePage, waitForPut } from './helpers/mobile-audit.js';

const ACTOR = 'caregiver-b@example.com';
const FOREIGN_ACTOR = 'foreign-caregiver@example.com';
const evidenceRoot = path.resolve('.omo/evidence/full-mobile-audit/runtime/wave3/real-d1');

function authHeaders(actor = ACTOR) {
  return { 'x-authenticated-user-email': actor, 'x-requested-with': 'XMLHttpRequest' };
}

async function getState(request, actor = ACTOR) {
  const response = await request.get('/api/state', { headers: authHeaders(actor) });
  expect(response.status()).toBe(200);
  return response.json();
}

async function putState(request, state, actor = ACTOR) {
  return request.put('/api/state', { headers: authHeaders(actor), data: state });
}

async function openAuthenticated(page) {
  await page.route('**/api/**', (route) => route.continue({
    headers: { ...route.request().headers(), 'x-authenticated-user-email': ACTOR },
  }));
  await page.clock.setFixedTime(new Date('2026-07-11T00:00:00.000Z'));
  await page.goto('/');
  await expect(page.locator('#main')).toBeVisible();
}

async function record(name, details) {
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, `${name}.json`), `${JSON.stringify({
    name,
    gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    baseUrl: process.env.PLAYWRIGHT_BASE_URL,
    actorCanonical: details.actorCanonical,
    ...details,
  }, null, 2)}\n`);
}

function applicationDiagnostics(entries) {
  return entries.filter((entry) => !(entry.type === 'requestfailed'
    && entry.failure === 'net::ERR_ABORTED'
    && entry.url.startsWith('https://fonts.gstatic.com/')));
}

test.describe.serial('real D1 SC2-SC5 lifecycle and ownership boundaries', () => {
  test('SC2 stock save, reload, fresh GET, and confirmed delete', async ({ page, request }) => {
    const observer = observePage(page);
    await openAuthenticated(page);
    await page.locator('[data-tab="inventory"]').click();
    await page.locator('#lotMadeAt').fill('2026-07-11');
    await page.locator('#lotIngredient').selectOption('ing-beef');
    await page.locator('#lotCount').fill('3');
    await page.locator('#lotGramsPerCube').fill('15');
    await page.locator('#lotDescription').fill('ULW 재고 QA');
    const createdResponse = await waitForPut(page, () => page.locator('#lotForm button[type="submit"]').click());
    expect(createdResponse.status()).toBe(200);
    const createdState = await createdResponse.json();
    const lot = createdState.cubeLots.find((item) => item.description === 'ULW 재고 QA');
    expect(lot).toMatchObject({ ingredient_id: 'ing-beef', made_at: '2026-07-11', initial_count: 3, remaining_count: 3, grams_per_cube: 15 });

    await page.reload();
    await page.locator('[data-tab="inventory"]').click();
    await page.locator('[data-stock-toggle="ing-beef"]').click();
    await expect(page.locator('.stock-description p').filter({ hasText: 'ULW 재고 QA' })).toBeVisible();
    const fresh = await getState(request);
    expect(fresh.cubeLots.find((item) => item.id === lot.id)).toMatchObject({ remaining_count: 3, description: 'ULW 재고 QA' });
    expect(fresh.events.find((event) => event.type === 'stock_add' && event.after_json?.includes(lot.id))?.actor_email).toBe(ACTOR);

    await page.locator(`[data-delete-lot="${lot.id}"]`).click();
    const deletedResponse = await waitForPut(page, () => page.getByRole('dialog').getByRole('button', { name: /확인|삭제/ }).click());
    expect(deletedResponse.status()).toBe(200);
    await page.reload();
    const afterDelete = await getState(request);
    expect(afterDelete.cubeLots.some((item) => item.id === lot.id)).toBe(false);
    expect(afterDelete.events.some((event) => event.type === 'cube_lot_delete' && event.actor_email === ACTOR)).toBe(true);
    expect(applicationDiagnostics(observer.entries)).toEqual([]);
    await record('sc2-stock', { createdVersion: fresh.syncVersion, deletedVersion: afterDelete.syncVersion, actorCanonical: true, hardReload: true, freshGet: true });
  });

  test('SC3 unreferenced ingredient save, reload, fresh GET, and delete', async ({ page, request }) => {
    const observer = observePage(page);
    await openAuthenticated(page);
    await page.locator('[data-tab="items"]').click();
    await page.locator('#ingredientName').fill('ULW 테스트 재료');
    await page.locator('#ingredientCategory').selectOption('과일');
    const createdResponse = await waitForPut(page, () => page.locator('#ingredientForm button[type="submit"]').click());
    expect(createdResponse.status()).toBe(200);
    const createdState = await createdResponse.json();
    const ingredient = createdState.ingredients.find((item) => item.name === 'ULW 테스트 재료');
    expect(ingredient?.category).toBe('과일');

    await page.reload();
    await page.locator('[data-tab="items"]').click();
    await expect(page.locator(`#panel-items [data-delete-id="${ingredient.id}"] b`)).toHaveText('ULW 테스트 재료');
    await page.locator(`[data-ingredient-toggle="${ingredient.id}"]`).click();
    expect((await waitForPut(page, () => page.locator(`[data-ingredient-status="${ingredient.id}"]`).selectOption('testing'))).status()).toBe(200);
    expect((await waitForPut(page, () => page.locator(`[data-ingredient-category="${ingredient.id}"]`).selectOption('채소'))).status()).toBe(200);
    await page.reload();
    const fresh = await getState(request);
    expect(fresh.ingredients.find((item) => item.id === ingredient.id)).toMatchObject({ status: 'testing', category: '채소' });

    await page.locator('[data-tab="items"]').click();
    await page.locator(`[data-request-delete-ingredient="${ingredient.id}"]`).click();
    const deletedResponse = await waitForPut(page, () => page.getByRole('dialog').getByRole('button', { name: /확인|삭제/ }).click());
    expect(deletedResponse.status()).toBe(200);
    await page.reload();
    const afterDelete = await getState(request);
    expect(afterDelete.ingredients.some((item) => item.id === ingredient.id)).toBe(false);
    expect(afterDelete.events.some((event) => event.type === 'ingredient_delete' && event.actor_email === ACTOR)).toBe(true);
    expect(applicationDiagnostics(observer.entries)).toEqual([]);
    await record('sc3-ingredient', { savedVersion: fresh.syncVersion, deletedVersion: afterDelete.syncVersion, actorCanonical: true, hardReload: true, freshGet: true });
  });

  test('C19 rejects foreign graph and referenced deletion without version changes', async ({ request }) => {
    const [localBefore, foreignBefore] = await Promise.all([getState(request), getState(request, FOREIGN_ACTOR)]);
    const malicious = structuredClone(localBefore);
    malicious.combinationItems.push({ combination_id: 'combo-foreign', ingredient_id: 'ing-foreign', cube_count: 9 });
    const graphResponse = await putState(request, malicious);
    expect(graphResponse.status()).toBe(422);
    expect(await graphResponse.json()).toEqual({ error: 'validation_failed', reason: 'foreign_or_missing_reference' });
    expect(await getState(request, FOREIGN_ACTOR)).toEqual(foreignBefore);
    expect((await getState(request)).syncVersion).toBe(localBefore.syncVersion);

    const referencedDelete = structuredClone(localBefore);
    referencedDelete.ingredients = referencedDelete.ingredients.filter((item) => item.id !== 'ing-broccoli');
    referencedDelete.cubeLots = referencedDelete.cubeLots.filter((item) => item.ingredient_id !== 'ing-broccoli');
    referencedDelete.combinationItems = referencedDelete.combinationItems.filter((item) => item.ingredient_id !== 'ing-broccoli');
    const deleteResponse = await putState(request, referencedDelete);
    expect(deleteResponse.status()).toBe(409);
    expect(await deleteResponse.json()).toMatchObject({ error: 'ingredient_referenced', ingredient_ids: ['ing-broccoli'], combination_count: 1, slot_count: 4 });
    expect(await getState(request)).toEqual(localBefore);
    await record('c19-boundaries', { graphStatus: 422, foreignUnchanged: true, referencedDeleteStatus: 409, versionUnchanged: true, actorCanonical: true });
  });

  test('C19 rejects foreign lot and meal-slot references before real D1 writes', async ({ request }) => {
    const [localBefore, foreignBefore] = await Promise.all([getState(request), getState(request, FOREIGN_ACTOR)]);
    const timestamp = '2026-07-11T00:00:00.000Z';
    const invalidStates = [
      { label: 'cube-lot ingredient', mutate: (state) => state.cubeLots.push({ id: 'lot-foreign-ref', ingredient_id: 'ing-foreign', made_at: '2026-07-11', expires_at: null, initial_count: 2, remaining_count: 2, grams_per_cube: 10, storage_location: null, created_at: timestamp, updated_at: timestamp }) },
      { label: 'combination meal slot', mutate: (state) => state.mealPlanSlots.push({ id: 'slot-foreign-combo', date: '2026-07-11', meal_type: '점심', target_type: 'combination', combination_id: 'combo-foreign', ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }) },
      { label: 'ingredient meal slot', mutate: (state) => state.mealPlanSlots.push({ id: 'slot-foreign-ingredient', date: '2026-07-11', meal_type: '점심', target_type: 'ingredient', combination_id: null, ingredient_id: 'ing-foreign', cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }) },
      { label: 'ambiguous meal slot', mutate: (state) => state.mealPlanSlots.push({ id: 'slot-ambiguous', date: '2026-07-11', meal_type: '점심', target_type: 'combination', combination_id: state.combinations[0].id, ingredient_id: state.ingredients[0].id, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }) },
    ];
    const statuses = {};
    for (const { label, mutate } of invalidStates) {
      const state = structuredClone(localBefore);
      mutate(state);
      const response = await putState(request, state);
      statuses[label] = response.status();
      expect(response.status()).toBe(422);
      expect(await response.json()).toEqual({ error: 'validation_failed', reason: 'foreign_or_missing_reference' });
      expect(await getState(request)).toEqual(localBefore);
      expect(await getState(request, FOREIGN_ACTOR)).toEqual(foreignBefore);
    }
    const directResponse = await request.post('/api/cube-lots', { headers: authHeaders(), data: { ingredient_id: 'ing-foreign', initial_count: 2 } });
    expect(directResponse.status()).toBe(422);
    expect(await directResponse.json()).toEqual({ error: 'validation_failed', reason: 'foreign_or_missing_reference' });
    expect(await getState(request)).toEqual(localBefore);
    expect(await getState(request, FOREIGN_ACTOR)).toEqual(foreignBefore);
    await record('c19-expanded-graph-boundaries', { statuses, directCubeLotStatus: directResponse.status(), foreignUnchanged: true, versionUnchanged: true, actorCanonical: true });
  });

  test('SC4 combination and meal slot survive reload and fresh GET', async ({ page, request }) => {
    const observer = observePage(page);
    await openAuthenticated(page);
    await page.locator('[data-tab="meals"]').click();
    await page.locator('#weekStart').fill('2026-07-11');
    await page.locator('#weekStart').dispatchEvent('change');
    await page.locator('#comboBuilderForm input[name="name"]').fill('ULW 조합');
    await page.locator('#comboBuilderForm input[name="stage"][value="후기"]').check();
    await page.locator('[data-add-combo-ingredient="ing-beef"]').click();
    await page.locator('[data-add-combo-ingredient="ing-broccoli"]').click();
    await page.locator('[name="cube_count_ing-beef"]').fill('2');
    await page.locator('[name="cube_count_ing-broccoli"]').fill('3');
    const comboResponse = await waitForPut(page, () => page.locator('#comboBuilderForm button[type="submit"]').click());
    expect(comboResponse.status()).toBe(200);
    const comboState = await comboResponse.json();
    const combination = comboState.combinations.find((item) => item.name === 'ULW 조합');
    expect(combination?.stage).toBe('후기');

    await page.reload();
    await page.locator('[data-tab="meals"]').click();
    const card = page.locator('[data-drag-combo]').filter({ hasText: 'ULW 조합' });
    await expect(card).toBeVisible();
    const slotResponse = await waitForPut(page, () => card.getByRole('button', { name: /식단에 추가/ }).click());
    expect(slotResponse.status()).toBe(200);
    await page.reload();
    await page.locator('[data-tab="meals"]').click();
    await expect(page.locator('#panel-meals')).toContainText('ULW 조합');
    const fresh = await getState(request);
    expect(fresh.combinationItems.filter((item) => item.combination_id === combination.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient_id: 'ing-beef', cube_count: 2 }),
      expect.objectContaining({ ingredient_id: 'ing-broccoli', cube_count: 3 }),
    ]));
    expect(fresh.mealPlanSlots.some((slot) => slot.combination_id === combination.id)).toBe(true);
    expect(fresh.events.filter((event) => ['combo_create', 'meal_slot_create'].includes(event.type)).every((event) => event.actor_email === ACTOR)).toBe(true);
    expect(applicationDiagnostics(observer.entries)).toEqual([]);
    await record('sc4-plan', { savedVersion: fresh.syncVersion, comboPersisted: true, slotPersisted: true, actorCanonical: true, hardReload: true, freshGet: true });
  });

  test('SC5 profile and localized History survive reload and fresh GET', async ({ page, request }) => {
    const observer = observePage(page);
    await openAuthenticated(page);
    await page.locator('[data-settings-tab]').click();
    await page.locator('[name="display_name"]').fill('ULW 아기');
    await page.locator('[name="birth_date"]').fill('2026-01-02');
    await page.locator('[name="notes"]').fill('ULW 프로필 QA');
    const response = await waitForPut(page, () => page.locator('[data-profile-save]').click());
    expect(response.status()).toBe(200);
    await page.reload();
    await expect(page.locator('.top-app-title')).toContainText('ULW 아기');
    const fresh = await getState(request);
    expect(fresh.childProfile).toMatchObject({ display_name: 'ULW 아기', birth_date: '2026-01-02', notes: 'ULW 프로필 QA' });
    const profileEvent = fresh.events.find((event) => event.type === 'profile_update');
    expect(profileEvent?.actor_email).toBe(ACTOR);
    await page.locator('[data-action-tab="today"]').click();
    await page.locator('[data-tab="records"]').click();
    const history = await page.locator('#panel-records').innerText();
    expect(history).not.toMatch(/@example\.com|\bmanual\b|2026-\d\d-\d\dT/);
    expect(applicationDiagnostics(observer.entries)).toEqual([]);
    await record('sc5-profile-history', { savedVersion: fresh.syncVersion, profilePersisted: true, historyLocalized: true, actorCanonical: true, hardReload: true, freshGet: true });
  });
});
