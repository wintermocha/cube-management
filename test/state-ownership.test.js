import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handlePutState, onRequest } from '../functions/api/[[path]].js';

class D1Statement {
  constructor(owner, sql, bindings = []) {
    this.owner = owner;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new D1Statement(this.owner, this.sql, bindings);
  }

  async first() {
    return this.owner.database.prepare(this.sql).get(...this.bindings) ?? null;
  }

  async all() {
    return { results: this.owner.database.prepare(this.sql).all(...this.bindings) };
  }

  async run() {
    this.owner.database.prepare(this.sql).run(...this.bindings);
    return { success: true };
  }
}

class TestD1 {
  constructor(database) {
    this.database = database;
    this.batchCalls = 0;
    this.batchTail = Promise.resolve();
  }

  prepare(sql) {
    return new D1Statement(this, sql);
  }

  async batch(statements) {
    this.batchCalls += 1;
    const execute = async () => {
      this.database.exec('BEGIN');
      try {
        for (const statement of statements) await statement.run();
        this.database.exec('COMMIT');
      } catch (error) {
        this.database.exec('ROLLBACK');
        throw error;
      }
    };
    const result = this.batchTail.then(execute);
    this.batchTail = result.catch(() => {});
    return result;
  }
}

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../migrations/0004_state_versions.sql', import.meta.url), 'utf8'));
  const insert = (sql, ...bindings) => database.prepare(sql).run(...bindings);
  insert('INSERT INTO households VALUES (?,?,?)', 'household-a', 'A', '2026-07-03T00:00:00.000Z');
  insert('INSERT INTO households VALUES (?,?,?)', 'household-b', 'B', '2026-07-03T00:00:00.000Z');
  insert('INSERT INTO members VALUES (?,?,?,?)', 'household-a', 'owner-a@example.com', 'owner', '2026-07-03T00:00:00.000Z');
  insert('INSERT INTO members VALUES (?,?,?,?)', 'household-b', 'owner-b@example.com', 'owner', '2026-07-03T00:00:00.000Z');
  insert('INSERT INTO child_profiles VALUES (?,?,?,?,?,?,?)', 'child-a', 'household-a', 'A child', null, '', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');
  insert('INSERT INTO child_profiles VALUES (?,?,?,?,?,?,?)', 'child-b', 'household-b', 'B child', null, '', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');
  for (const [id, household, name] of [['ing-a', 'household-a', 'A ingredient'], ['ing-a-free', 'household-a', 'A free'], ['ing-b', 'household-b', 'B ingredient']]) {
    insert('INSERT INTO ingredients VALUES (?,?,?,?,?,?,?,?)', id, household, name, '채소', 'planned', '', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');
  }
  for (const [id, household, name] of [['combo-a', 'household-a', 'A combo'], ['combo-b', 'household-b', 'B combo']]) {
    insert('INSERT INTO combinations VALUES (?,?,?,?,?,?,?,?)', id, household, name, '중기', '', '', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');
  }
  insert('INSERT INTO combination_items VALUES (?,?,?)', 'combo-a', 'ing-a', 1);
  insert('INSERT INTO combination_items VALUES (?,?,?)', 'combo-b', 'ing-b', 1);
  insert('INSERT INTO meal_plan_slots VALUES (?,?,?,?,?,?,?,?,?,?,?)', 'slot-a', 'household-a', '2026-07-11', '점심', 'combination', 'combo-a', null, 1, 'planned', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z');
  insert("INSERT INTO state_versions VALUES (?,?,?) ON CONFLICT(household_id) DO UPDATE SET version=excluded.version", 'household-a', 1, '2026-07-03T00:00:00.000Z');
  insert("INSERT INTO state_versions VALUES (?,?,?) ON CONFLICT(household_id) DO UPDATE SET version=excluded.version", 'household-b', 1, '2026-07-03T00:00:00.000Z');
  return new TestD1(database);
}

function stateForA(overrides = {}) {
  const timestamp = '2026-07-03T00:00:00.000Z';
  return {
    syncVersion: 1,
    childProfile: { id: 'child-a', household_id: 'household-a', display_name: 'A child', birth_date: null, notes: '', created_at: timestamp, updated_at: timestamp },
    ingredients: [
      { id: 'ing-a', household_id: 'household-a', name: 'A ingredient', category: '채소', status: 'planned', notes: '', created_at: timestamp, updated_at: timestamp },
      { id: 'ing-a-free', household_id: 'household-a', name: 'A free', category: '채소', status: 'planned', notes: '', created_at: timestamp, updated_at: timestamp },
    ],
    cubeLots: [],
    combinations: [{ id: 'combo-a', household_id: 'household-a', name: 'A combo', stage: '중기', texture: '', notes: '', created_at: timestamp, updated_at: timestamp }],
    combinationItems: [{ combination_id: 'combo-a', ingredient_id: 'ing-a', cube_count: 1 }],
    mealPlanSlots: [{ id: 'slot-a', household_id: 'household-a', date: '2026-07-11', meal_type: '점심', target_type: 'combination', combination_id: 'combo-a', ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }],
    events: [],
    ...overrides,
  };
}

function snapshot(database, householdId) {
  return {
    ingredients: database.prepare('SELECT id,name FROM ingredients WHERE household_id=? ORDER BY id').all(householdId),
    lots: database.prepare('SELECT id,ingredient_id,remaining_count FROM cube_lots WHERE household_id=? ORDER BY id').all(householdId),
    combinations: database.prepare('SELECT id,name FROM combinations WHERE household_id=? ORDER BY id').all(householdId),
    items: database.prepare('SELECT ci.combination_id,ci.ingredient_id,ci.cube_count FROM combination_items ci JOIN combinations c ON c.id=ci.combination_id WHERE c.household_id=? ORDER BY ci.combination_id,ci.ingredient_id').all(householdId),
    slots: database.prepare('SELECT id,combination_id,ingredient_id,status FROM meal_plan_slots WHERE household_id=? ORDER BY id').all(householdId),
  };
}

test('foreign or missing combination graph references return 422 before any batch', async () => {
  const db = createDatabase();
  const beforeA = snapshot(db.database, 'household-a');
  const beforeB = snapshot(db.database, 'household-b');
  const body = stateForA({ combinationItems: [{ combination_id: 'combo-b', ingredient_id: 'ing-b', cube_count: 9 }] });

  const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'validation_failed', reason: 'foreign_or_missing_reference' });
  assert.equal(db.batchCalls, 0);
  assert.deepEqual(snapshot(db.database, 'household-a'), beforeA);
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('foreign or malformed lot and meal-slot references return 422 before any batch', async () => {
  const timestamp = '2026-07-03T00:00:00.000Z';
  const invalidStates = [
    stateForA({ cubeLots: [{ id: 'lot-a', ingredient_id: 'ing-b', made_at: '2026-07-03', expires_at: null, initial_count: 2, remaining_count: 2, grams_per_cube: 10, storage_location: null, created_at: timestamp, updated_at: timestamp }] }),
    stateForA({ mealPlanSlots: [{ id: 'slot-a', date: '2026-07-11', meal_type: '점심', target_type: 'combination', combination_id: 'combo-b', ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }] }),
    stateForA({ mealPlanSlots: [{ id: 'slot-a', date: '2026-07-11', meal_type: '점심', target_type: 'ingredient', combination_id: null, ingredient_id: 'ing-b', cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }] }),
    stateForA({ mealPlanSlots: [{ id: 'slot-a', date: '2026-07-11', meal_type: '점심', target_type: 'combination', combination_id: 'combo-a', ingredient_id: 'ing-a', cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }] }),
    stateForA({ mealPlanSlots: [{ id: 'slot-a', date: '2026-07-11', meal_type: '점심', target_type: 'unknown', combination_id: null, ingredient_id: null, cube_count: 1, status: 'planned', created_at: timestamp, updated_at: timestamp }] }),
  ];

  for (const body of invalidStates) {
    const db = createDatabase();
    const beforeA = snapshot(db.database, 'household-a');
    const beforeB = snapshot(db.database, 'household-b');

    const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: 'validation_failed', reason: 'foreign_or_missing_reference' });
    assert.equal(db.batchCalls, 0);
    assert.deepEqual(snapshot(db.database, 'household-a'), beforeA);
    assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
  }
});

test('local direct ingredient meal-slot reference remains allowed', async () => {
  const db = createDatabase();
  const beforeB = snapshot(db.database, 'household-b');
  const body = stateForA({
    mealPlanSlots: [{ ...stateForA().mealPlanSlots[0], target_type: 'ingredient', combination_id: null, ingredient_id: 'ing-a' }],
  });

  const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

  assert.equal(response.status, 200);
  assert.equal(db.batchCalls, 1);
  assert.equal(db.database.prepare('SELECT ingredient_id FROM meal_plan_slots WHERE id=?').get('slot-a').ingredient_id, 'ing-a');
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('direct cube-lot creation rejects foreign ingredient references', async () => {
  const db = createDatabase();
  const beforeA = snapshot(db.database, 'household-a');
  const beforeB = snapshot(db.database, 'household-b');
  const request = new Request('http://127.0.0.1:8788/api/cube-lots', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-authenticated-user-email': 'owner-a@example.com' },
    body: JSON.stringify({ ingredient_id: 'ing-b', initial_count: 2 }),
  });

  const response = await onRequest({ request, env: { DB: db } });

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'validation_failed', reason: 'foreign_or_missing_reference' });
  assert.deepEqual(snapshot(db.database, 'household-a'), beforeA);
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('referenced ingredient deletion returns household-local counts and performs no writes', async () => {
  const db = createDatabase();
  const beforeA = snapshot(db.database, 'household-a');
  const beforeB = snapshot(db.database, 'household-b');
  const body = stateForA({
    ingredients: stateForA().ingredients.filter((ingredient) => ingredient.id !== 'ing-a'),
    combinationItems: [],
  });

  const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: 'ingredient_referenced',
    ingredient_ids: ['ing-a'],
    combination_count: 1,
    slot_count: 1,
  });
  assert.equal(db.batchCalls, 0);
  assert.deepEqual(snapshot(db.database, 'household-a'), beforeA);
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('unreferenced household ingredient deletion remains allowed', async () => {
  const db = createDatabase();
  const beforeB = snapshot(db.database, 'household-b');
  const body = stateForA({ ingredients: stateForA().ingredients.filter((ingredient) => ingredient.id !== 'ing-a-free') });

  const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

  assert.equal(response.status, 200);
  assert.equal(db.batchCalls, 1);
  assert.equal(db.database.prepare('SELECT count(*) AS count FROM ingredients WHERE id=?').get('ing-a-free').count, 0);
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('foreign household references never block a local unreferenced deletion', async () => {
  const db = createDatabase();
  db.database.prepare('INSERT INTO combination_items VALUES (?,?,?)').run('combo-b', 'ing-a-free', 2);
  const beforeB = snapshot(db.database, 'household-b');
  const body = stateForA({ ingredients: stateForA().ingredients.filter((ingredient) => ingredient.id !== 'ing-a-free') });

  const response = await handlePutState(db, 'household-a', 'owner-a@example.com', body);

  assert.equal(response.status, 200);
  assert.equal(db.batchCalls, 1);
  assert.equal(db.database.prepare('SELECT count(*) AS count FROM ingredients WHERE id=?').get('ing-a-free').count, 0);
  assert.deepEqual(snapshot(db.database, 'household-b'), beforeB);
});

test('two concurrent same-version replacements produce one winner and one 409', async () => {
  const db = createDatabase();
  const firstBody = stateForA({ childProfile: { ...stateForA().childProfile, display_name: 'first winner' } });
  const secondBody = stateForA({ childProfile: { ...stateForA().childProfile, display_name: 'second winner' } });

  const responses = await Promise.all([
    handlePutState(db, 'household-a', 'owner-a@example.com', firstBody),
    handlePutState(db, 'household-a', 'owner-a@example.com', secondBody),
  ]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(db.database.prepare('SELECT version FROM state_versions WHERE household_id=?').get('household-a').version, 2);
  const displayName = db.database.prepare('SELECT display_name FROM child_profiles WHERE household_id=?').get('household-a').display_name;
  assert.ok(['first winner', 'second winner'].includes(displayName));
});
