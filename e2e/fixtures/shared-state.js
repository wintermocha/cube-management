import { seedData } from '../../src/lib/seed.js';

export function deterministicState() {
  const state = seedData();
  state.events = [{
    id: 'evt-audit-1', household_id: 'home', actor_email: 'caregiver-a@example.com',
    source: 'manual', type: 'stock_add', payload_json: '{}', before_json: null,
    after_json: '{}', created_at: '2026-07-03T00:00:00.000Z', undo_event_id: null,
  }];
  return { ...state, syncVersion: 1 };
}

export async function installDeterministicRuntime(page) {
  await page.clock.setFixedTime(new Date('2026-07-11T00:00:00.000Z'));
  await page.addInitScript(() => {
    let sequence = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
  });
}

export async function installSharedState(page, initial = deterministicState()) {
  let state = structuredClone(initial);
  let getPlan = { status: 200, delay: 0, mode: 'json' };
  const putPlans = [];
  const requests = [];

  await page.route('**/api/state', async (route) => {
    const request = route.request();
    const method = request.method();
    requests.push({ method, url: request.url(), headers: request.headers() });
    if (method === 'GET') {
      if (getPlan.delay) await new Promise((resolve) => setTimeout(resolve, getPlan.delay));
      if (getPlan.mode === 'abort') { await route.abort('failed'); return; }
      const body = getPlan.mode === 'malformed' ? '{qa-malformed' : getPlan.status === 200 ? JSON.stringify(state) : JSON.stringify({ error: 'qa-get-failure' });
      await route.fulfill({ status: getPlan.status, contentType: 'application/json', body });
      return;
    }
    if (method === 'PUT') {
      const plan = putPlans.shift() || { status: 200, delay: 0 };
      if (plan.delay) await new Promise((resolve) => setTimeout(resolve, plan.delay));
      if (plan.status === 'abort') { await route.abort('failed'); return; }
      if (plan.status !== 200) {
        await route.fulfill({ status: plan.status, contentType: 'application/json', body: JSON.stringify(plan.status === 409 ? { error: 'qa-conflict', state } : { error: 'qa-put-failure' }) });
        return;
      }
      state = { ...JSON.parse(request.postData() || '{}'), syncVersion: state.syncVersion + 1 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
      return;
    }
    await route.fallback();
  });

  return {
    get state() { return structuredClone(state); },
    get requests() { return structuredClone(requests); },
    failGet(status, delay = 0) { getPlan = { status, delay, mode: 'json' }; },
    delayGet(delay) { getPlan = { status: 200, delay, mode: 'json' }; },
    malformedGet() { getPlan = { status: 200, delay: 0, mode: 'malformed' }; },
    abortGet() { getPlan = { status: 200, delay: 0, mode: 'abort' }; },
    queuePut(status, delay = 0) { putPlans.push({ status, delay }); },
  };
}
