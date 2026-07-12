import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { getActorEmail, normalizeStateForD1, onRequest } from '../functions/api/[[path]].js';

test('state payload normalization omits client-only deleted rows', () => {
  const input = seedData();
  input.syncVersion = 1;
  input.ingredients.push({ ...input.ingredients[0], id: 'ing-deleted', name: '삭제됨', status: 'cancelled', deleted_at: '2026-07-04T00:00:00.000Z' });
  input.cubeLots.push({ ...input.cubeLots[0], id: 'lot-deleted', ingredient_id: 'ing-deleted', deleted_at: '2026-07-04T00:00:00.000Z' });

  const result = normalizeStateForD1(input, 'home', 'owner@example.com');

  assert.equal(result.ok, true);
  assert.equal(result.state.ingredients.some((item) => item.id === 'ing-deleted'), false);
  assert.equal(result.state.cubeLots.some((item) => item.id === 'lot-deleted'), false);
  assert.equal(result.state.ingredients.every((item) => item.household_id === 'home'), true);
});

test('state payload normalization maps lot description to D1 storage field', () => {
  const input = { ...seedData(), syncVersion: 7 };
  input.cubeLots[0] = { ...input.cubeLots[0], description: 'A칸 앞쪽', storage_location: '' };

  const result = normalizeStateForD1(input, 'home', 'owner@example.com');

  assert.equal(result.ok, true);
  assert.equal(result.syncVersion, 7);
  assert.equal(result.state.cubeLots[0].storage_location, 'A칸 앞쪽');
});

test('state payload normalization preserves profile edits and derives household ownership', () => {
  const input = { ...seedData(), syncVersion: 3 };
  input.childProfile = { ...input.childProfile, household_id: 'foreign', display_name: '주원', birth_date: '2026-01-02', notes: '입자감 천천히' };

  const result = normalizeStateForD1(input, 'home', 'owner@example.com');

  assert.equal(result.ok, true);
  assert.equal(result.state.childProfile.household_id, 'home');
  assert.equal(result.state.childProfile.display_name, '주원');
  assert.equal(result.state.childProfile.birth_date, '2026-01-02');
  assert.equal(result.state.childProfile.notes, '입자감 천천히');
});

test('state normalization canonicalizes every incoming event actor', () => {
  const input = { ...seedData(), syncVersion: 2 };
  input.events = [{
    id: 'evt-new', household_id: 'foreign', actor_email: 'forged@example.com', source: 'manual',
    type: 'ingredient_create', payload_json: '{}', before_json: null, after_json: '{}',
    created_at: '2026-07-11T00:00:00.000Z', undo_event_id: null,
  }];

  const result = normalizeStateForD1(input, 'home', 'Canonical.Member@Example.com');

  assert.equal(result.ok, true);
  assert.equal(result.state.events[0].household_id, 'home');
  assert.equal(result.state.events[0].actor_email, 'Canonical.Member@Example.com');
});

test('state payload normalization rejects invalid bodies and missing versions', () => {
  assert.equal(normalizeStateForD1({ household: { id: 'home' } }, 'home', 'owner@example.com').ok, false);
  assert.equal(normalizeStateForD1(seedData(), 'home', 'owner@example.com').ok, false);
});

test('malformed array rows return validation failure instead of throwing', () => {
  const input = { ...seedData(), syncVersion: 1, ingredients: [null], cubeLots: [null] };

  assert.doesNotThrow(() => normalizeStateForD1(input, 'home', 'owner@example.com'));
  assert.equal(normalizeStateForD1(input, 'home', 'owner@example.com').ok, false);
});

test('request error boundary awaits state handlers and redacts internal details', async () => {
  const env = {
    DB: {
      prepare: (sql) => ({
        bind: () => ({
          first: async () => {
            if (sql.includes('FROM members')) return { household_id: 'home', email: 'owner@example.com', role: 'owner' };
            throw new Error('secret schema detail');
          },
        }),
      }),
    },
  };
  const request = new Request('http://127.0.0.1:8788/api/state', {
    method: 'PUT',
    headers: { 'x-authenticated-user-email': 'owner@example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ ...seedData(), syncVersion: 1 }),
  });

  const response = await onRequest({ request, env });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'internal_error' });
});

test('actor email trusts Cloudflare Access in production and dev header only locally', () => {
  const productionSpoof = new Request('https://cube.example.com/api/state', { headers: { 'x-authenticated-user-email': 'spoof@example.com' } });
  const productionAccess = new Request('https://cube.example.com/api/state', { headers: { 'cf-access-authenticated-user-email': 'caregiver@example.com' } });
  const localDev = new Request('http://127.0.0.1:8788/api/state', { headers: { 'x-authenticated-user-email': 'local@example.com' } });

  assert.equal(getActorEmail(productionSpoof), null);
  assert.equal(getActorEmail(productionAccess), 'caregiver@example.com');
  assert.equal(getActorEmail(localDev), 'local@example.com');
});
