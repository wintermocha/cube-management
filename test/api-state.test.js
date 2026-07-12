import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedStateSync, fetchSharedState, persistSharedState } from '../src/lib/api-state.js';
import { seedData } from '../src/lib/seed.js';
import { safeStorage } from '../src/lib/safe-storage.js';

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'location', { value: originalLocation, configurable: true });
});

function setLocation(hostname = 'jw-cube.taewooo.kim') {
  Object.defineProperty(globalThis, 'location', { value: { hostname }, configurable: true });
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function canonicalState(syncVersion = 1, overrides = {}) {
  return { ...seedData(), syncVersion, ...overrides };
}

async function loadedSync(saveFetch) {
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'GET') return response(canonicalState());
    return saveFetch(_url, init);
  };
  const sync = createSharedStateSync();
  assert.equal((await sync.load()).status, 'authenticated');
  return sync;
}

test('state GET and PUT include Access credentials and requested-with header', async () => {
  setLocation();
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(init);
    return response(canonicalState(requests.length));
  };

  await fetchSharedState();
  await persistSharedState({ syncVersion: 1 });

  assert.deepEqual(requests.map((request) => request.credentials), ['include', 'include']);
  assert.deepEqual(requests.map((request) => request.headers['X-Requested-With']), ['XMLHttpRequest', 'XMLHttpRequest']);
  assert.equal(requests[1].headers['content-type'], 'application/json');
});

test('local state requests additionally include only the development identity header', async () => {
  setLocation('localhost');
  let headers;
  globalThis.fetch = async (_url, init) => {
    headers = init.headers;
    return response(canonicalState());
  };

  await fetchSharedState();

  assert.equal(headers['x-authenticated-user-email'], 'caregiver-a@example.com');
  assert.equal(headers['X-Requested-With'], 'XMLHttpRequest');
});

test('load returns authoritative authenticated state without rendering or caching domain data', async () => {
  setLocation();
  const state = canonicalState(4, { ingredients: [{ ...seedData().ingredients[0], id: 'ing-server' }] });
  globalThis.fetch = async () => response(state);
  let rendered = 0;
  let assigned = 0;
  const sync = createSharedStateSync({
    cacheKey: 'must-not-be-used',
    render: () => { rendered += 1; },
    setState: () => { assigned += 1; },
  });

  const result = await sync.load();

  assert.deepEqual(result, { status: 'authenticated', state });
  assert.equal(rendered, 0);
  assert.equal(assigned, 0);
});

test('load distinguishes auth-required, forbidden, and generic failures', async (t) => {
  const cases = [
    { name: '401', fetch: async () => response({ error: 'unauthorized' }, 401), expected: 'auth-required', code: 'unauthorized' },
    { name: '403', fetch: async () => response({ error: 'forbidden' }, 403), expected: 'forbidden', code: 'forbidden' },
    { name: '404', fetch: async () => response({ error: 'not_found' }, 404), expected: 'error', code: 'not_found' },
    { name: '500', fetch: async () => response({ error: 'internal_error' }, 500), expected: 'error', code: 'internal_error' },
    { name: 'malformed', fetch: async () => new Response('{bad', { status: 200 }), expected: 'error', code: 'invalid_response' },
    { name: 'offline', fetch: async () => { throw new TypeError('offline'); }, expected: 'error', code: 'network_error' },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      setLocation();
      globalThis.fetch = entry.fetch;
      const result = await createSharedStateSync().load();
      assert.equal(result.status, entry.expected);
      assert.equal(result.state, null);
      assert.equal(result.error.code, entry.code);
    });
  }
});

test('save acknowledges only the canonical 2xx response and never renders', async () => {
  setLocation();
  const canonical = canonicalState(8, { ingredients: [{ ...seedData().ingredients[0], id: 'server' }] });
  let rendered = 0;
  const sync = await loadedSync(async () => response(canonical));

  const saving = sync.save({ syncVersion: 7, ingredients: [{ id: 'client' }] });
  assert.equal(sync.isSaving(), true);
  const result = await saving;

  assert.deepEqual(result, { status: 'acknowledged', state: canonical });
  assert.equal(sync.isSaving(), false);
  assert.equal(rendered, 0);
});

test('save permits exactly one in-flight mutation and never queues or retries a second', async () => {
  setLocation();
  let release;
  let calls = 0;
  const sync = await loadedSync(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return response(canonicalState(2));
  });

  const first = sync.save({ syncVersion: 1, value: 'first' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await sync.save({ syncVersion: 1, value: 'second' });

  assert.deepEqual(second, { status: 'busy', state: null, error: { code: 'save_in_progress' } });
  assert.equal(calls, 1);
  release();
  assert.equal((await first).status, 'acknowledged');
  assert.equal(calls, 1);
});

test('version conflict returns the server winner and metadata without stale retry', async () => {
  setLocation();
  const winner = canonicalState(3, { marker: 'server-winner' });
  let calls = 0;
  const sync = await loadedSync(async () => {
    calls += 1;
    return response({ error: 'version_conflict', state: winner }, 409);
  });

  const result = await sync.save(canonicalState(2, { marker: 'stale-client' }));

  assert.deepEqual(result, {
    status: 'conflict',
    state: winner,
    conflict: { type: 'version_conflict' },
  });
  assert.equal(calls, 1);
});

test('referenced ingredient conflict keeps structured safe metadata', async () => {
  setLocation();
  const sync = await loadedSync(async () => response({
    error: 'ingredient_referenced',
    ingredient_ids: ['ing-broccoli'],
    combination_count: 1,
    slot_count: 4,
  }, 409));

  const result = await sync.save(canonicalState(2));

  assert.deepEqual(result, {
    status: 'conflict',
    state: null,
    conflict: {
      type: 'ingredient_referenced',
      ingredient_ids: ['ing-broccoli'],
      combination_count: 1,
      slot_count: 4,
    },
  });
});

test('save distinguishes auth and generic failures without false acknowledgement', async (t) => {
  const cases = [
    { name: '401', fetch: async () => response({ error: 'unauthorized' }, 401), status: 'auth-required', code: 'unauthorized' },
    { name: '403', fetch: async () => response({ error: 'forbidden' }, 403), status: 'forbidden', code: 'forbidden' },
    { name: '422', fetch: async () => response({ error: 'validation_failed' }, 422), status: 'error', code: 'validation_failed' },
    { name: '500', fetch: async () => response({ error: 'internal_error' }, 500), status: 'error', code: 'internal_error' },
    { name: 'offline', fetch: async () => { throw new TypeError('offline'); }, status: 'error', code: 'network_error' },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      setLocation();
      const sync = await loadedSync(entry.fetch);
      const result = await sync.save(canonicalState());
      assert.equal(result.status, entry.status);
      assert.equal(result.state, null);
      assert.equal(result.error.code, entry.code);
    });
  }
});

test('save is gated until authoritative load completes and sends no early PUT', async () => {
  setLocation();
  let releaseLoad;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(init.method);
    if (init.method === 'PUT') return response({ error: 'validation_failed' }, 422);
    await new Promise((resolve) => { releaseLoad = resolve; });
    return response(canonicalState(7));
  };
  const sync = createSharedStateSync();

  const loading = sync.load();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlySave = await sync.save(canonicalState(1, { marker: 'too-early' }));

  assert.deepEqual(earlySave, { status: 'busy', state: null, error: { code: 'state_not_loaded' } });
  assert.deepEqual(requests, ['GET']);
  releaseLoad();
  assert.equal((await loading).status, 'authenticated');
  assert.equal(sync.isReady(), true);
});

test('unknown, malformed, or incomplete conflict responses are errors, not version conflicts', async (t) => {
  const cases = [
    { name: 'unknown', reply: () => response({ error: 'future_conflict' }, 409), code: 'future_conflict' },
    { name: 'malformed', reply: () => new Response('{bad', { status: 409 }), code: 'invalid_response' },
    { name: 'missing winner', reply: () => response({ error: 'version_conflict' }, 409), code: 'invalid_conflict_response' },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      setLocation();
      const sync = await loadedSync(async () => entry.reply());
      const result = await sync.save(canonicalState());
      assert.equal(result.status, 'error');
      assert.equal(result.error.code, entry.code);
    });
  }
});

test('parseable 2xx bodies without canonical state shape are rejected', async (t) => {
  for (const body of [null, {}, { syncVersion: 2 }]) {
    await t.test(JSON.stringify(body), async () => {
      setLocation();
      globalThis.fetch = async () => response(body);
      const result = await createSharedStateSync().load();
      assert.equal(result.status, 'error');
      assert.equal(result.error.code, 'invalid_state_response');
    });
  }
});

test('safe UI preference storage returns typed results and contains storage exceptions', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  assert.deepEqual(safeStorage.set(storage, 'week', '2026-07-11'), { ok: true, value: '2026-07-11' });
  assert.deepEqual(safeStorage.get(storage, 'week'), { ok: true, value: '2026-07-11' });
  assert.deepEqual(safeStorage.remove(storage, 'week'), { ok: true, value: null });
  assert.deepEqual(safeStorage.get(storage, 'week'), { ok: true, value: null });

  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const broken = { [method]: () => { throw new DOMException('blocked', method === 'setItem' ? 'QuotaExceededError' : 'SecurityError'); } };
    const result = method === 'getItem'
      ? safeStorage.get(broken, 'key')
      : method === 'setItem'
        ? safeStorage.set(broken, 'key', 'value')
        : safeStorage.remove(broken, 'key');
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
    assert.equal(result.error.code, 'storage_unavailable');
    assert.match(result.error.name, /SecurityError|QuotaExceededError/);
  }
});

test('state failure copy avoids narrow-mobile login and retry predicate orphans', async (t) => {
  const cases = [
    { name: 'auth', fetch: async () => response({ error: 'unauthorized' }, 401) },
    { name: 'server', fetch: async () => response({ error: 'internal_error' }, 500) },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      setLocation();
      globalThis.fetch = entry.fetch;
      const result = await createSharedStateSync().load();
      assert.doesNotMatch(result.error.message, /다시 로그인해 주세요|시도해 주세요/);
    });
  }
});
