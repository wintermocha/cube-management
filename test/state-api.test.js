import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/lib/seed.js';
import { getActorEmail, normalizeStateForD1 } from '../functions/api/[[path]].js';

test('state payload normalization omits client-only deleted rows', () => {
  const input = seedData();
  input.syncVersion = 1;
  input.ingredients.push({ ...input.ingredients[0], id: 'ing-deleted', name: '삭제됨', status: 'cancelled', deleted_at: '2026-07-04T00:00:00.000Z' });
  input.cubeLots.push({ ...input.cubeLots[0], id: 'lot-deleted', ingredient_id: 'ing-deleted', deleted_at: '2026-07-04T00:00:00.000Z' });

  const result = normalizeStateForD1(input, 'home');

  assert.equal(result.ok, true);
  assert.equal(result.state.ingredients.some((item) => item.id === 'ing-deleted'), false);
  assert.equal(result.state.cubeLots.some((item) => item.id === 'lot-deleted'), false);
  assert.equal(result.state.ingredients.every((item) => item.household_id === 'home'), true);
});

test('state payload normalization maps lot description to D1 storage field', () => {
  const input = seedData();
  input.syncVersion = 7;
  input.cubeLots[0] = { ...input.cubeLots[0], description: 'A칸 앞쪽', storage_location: '' };

  const result = normalizeStateForD1(input, 'home');

  assert.equal(result.ok, true);
  assert.equal(result.syncVersion, 7);
  assert.equal(result.state.cubeLots[0].storage_location, 'A칸 앞쪽');
});

test('state payload normalization preserves child profile edits', () => {
  const input = seedData();
  input.syncVersion = 3;
  input.childProfile = { ...input.childProfile, display_name: '주원', birth_date: '2026-01-02', notes: '입자감 천천히' };

  const result = normalizeStateForD1(input, 'home');

  assert.equal(result.ok, true);
  assert.equal(result.state.childProfile.household_id, 'home');
  assert.equal(result.state.childProfile.display_name, '주원');
  assert.equal(result.state.childProfile.birth_date, '2026-01-02');
  assert.equal(result.state.childProfile.notes, '입자감 천천히');
});

test('state payload normalization rejects invalid payloads', () => {
  const input = { household: { id: 'home' } };

  const result = normalizeStateForD1(input, 'home');

  assert.equal(result.ok, false);
});

test('state payload normalization requires optimistic concurrency version', () => {
  const input = seedData();

  const result = normalizeStateForD1(input, 'home');

  assert.equal(result.ok, false);
});

test('actor email trusts Cloudflare Access in production and dev header only locally', () => {
  const productionSpoof = new Request('https://cube.example.com/api/state', { headers: { 'x-authenticated-user-email': 'spoof@example.com' } });
  const productionAccess = new Request('https://cube.example.com/api/state', { headers: { 'cf-access-authenticated-user-email': 'caregiver@example.com' } });
  const localDev = new Request('http://127.0.0.1:8788/api/state', { headers: { 'x-authenticated-user-email': 'local@example.com' } });

  assert.equal(getActorEmail(productionSpoof), null);
  assert.equal(getActorEmail(productionAccess), 'caregiver@example.com');
  assert.equal(getActorEmail(localDev), 'local@example.com');
});
