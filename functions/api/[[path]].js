import { summarizeInventory, calculateForecast, parseKoreanAddStock, dedupeKey, APPROVAL_ALLOWLIST } from '../../src/lib/domain.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const now = () => new Date().toISOString();

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const actor = getActorEmail(request);
    if (!actor) return json({ error: 'unauthorized' }, 401);
    const member = await env.DB.prepare('SELECT household_id,email,role FROM members WHERE lower(email)=lower(?) LIMIT 1').bind(actor).first();
    if (!member) return json({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '') || '/';
    const householdId = member.household_id;

    if (request.method === 'GET' && path === '/state') return json(await readState(env.DB, householdId));
    if (request.method === 'PUT' && path === '/state') return await handlePutState(env.DB, householdId, member.email, await readJson(request));
    if (request.method === 'GET' && path === '/child-profile') return json(await env.DB.prepare('SELECT id,display_name,birth_date,notes FROM child_profiles WHERE household_id=?').bind(householdId).first());
    if (request.method === 'PATCH' && path === '/child-profile') {
      const body = await request.json();
      await env.DB.prepare('UPDATE child_profiles SET display_name=COALESCE(?,display_name), birth_date=COALESCE(?,birth_date), notes=COALESCE(?,notes), updated_at=? WHERE household_id=?').bind(body.display_name ?? null, body.birth_date ?? null, body.notes ?? null, now(), householdId).run();
      const profile = await env.DB.prepare('SELECT id,display_name,birth_date,notes FROM child_profiles WHERE household_id=?').bind(householdId).first();
      const event_id = await event(env.DB, householdId, actor, 'manual', 'child_profile_update', body, null, profile);
      return json({ child_profile: profile, event_id });
    }
    if (request.method === 'GET' && path === '/ingredients') return json(await all(env.DB, 'SELECT id,name,category,status,notes FROM ingredients WHERE household_id=? ORDER BY name', householdId));
    if (request.method === 'POST' && path === '/ingredients') {
      const body = await request.json();
      if (!body.name || !['not_tried','planned','testing','tolerated','suspected_reaction'].includes(body.status)) return json({ error: 'validation_failed' }, 422);
      const ingredient = { id: id('ing'), household_id: householdId, name: body.name, category: body.category || null, status: body.status, notes: body.notes || null, created_at: now(), updated_at: now() };
      await env.DB.prepare('INSERT INTO ingredients VALUES (?,?,?,?,?,?,?,?)').bind(ingredient.id, ingredient.household_id, ingredient.name, ingredient.category, ingredient.status, ingredient.notes, ingredient.created_at, ingredient.updated_at).run();
      const event_id = await event(env.DB, householdId, actor, 'manual', 'ingredient_create', ingredient, null, ingredient);
      return json({ ingredient, event_id }, 201);
    }
    if (request.method === 'GET' && path === '/inventory') return json(await inventory(env.DB, householdId));
    if (request.method === 'POST' && path === '/cube-lots') {
      const body = await request.json();
      if (!body.ingredient_id || !Number.isInteger(body.initial_count) || body.initial_count < 1 || body.initial_count > 200) return json({ error: 'validation_failed' }, 422);
      const localIngredient = await env.DB.prepare('SELECT id FROM ingredients WHERE household_id=? AND id=? LIMIT 1').bind(householdId, body.ingredient_id).first();
      if (!localIngredient) return json({ error: 'validation_failed', reason: 'foreign_or_missing_reference' }, 422);
      const lot = { id: id('lot'), household_id: householdId, ingredient_id: body.ingredient_id, made_at: body.made_at || new Date().toISOString().slice(0,10), expires_at: body.expires_at || null, initial_count: body.initial_count, remaining_count: body.initial_count, grams_per_cube: body.grams_per_cube || null, storage_location: body.storage_location || null, created_at: now(), updated_at: now() };
      await env.DB.prepare('INSERT INTO cube_lots VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(lot.id, lot.household_id, lot.ingredient_id, lot.made_at, lot.expires_at, lot.initial_count, lot.remaining_count, lot.grams_per_cube, lot.storage_location, lot.created_at, lot.updated_at).run();
      const event_id = await event(env.DB, householdId, actor, 'manual', 'stock_add', { lot }, null, lot);
      return json({ lot, event_id }, 201);
    }
    if (request.method === 'GET' && path === '/forecast') return json(await forecast(env.DB, householdId, url.searchParams.get('week') || new Date().toISOString().slice(0,10)));
    if (request.method === 'GET' && path === '/events') return json((await all(env.DB, 'SELECT * FROM events WHERE household_id=? ORDER BY created_at DESC LIMIT 100', householdId)).map(parseEvent));
    if (request.method === 'GET' && path === '/approval-requests') return json((await all(env.DB, 'SELECT * FROM approval_requests WHERE household_id=? ORDER BY created_at DESC', householdId)).map(r => ({ ...r, payload: JSON.parse(r.payload_json) })));
    if (request.method === 'POST' && path === '/ai-commands') return handleAi(env.DB, householdId, actor, await request.json());
    return json({ error: 'not_found' }, 404);
  } catch {
    return json({ error: 'internal_error' }, 500);
  }
}

export function getActorEmail(request) {
  const accessEmail = request.headers.get('cf-access-authenticated-user-email');
  if (accessEmail) return accessEmail;
  const host = new URL(request.url).hostname;
  if (host === '127.0.0.1' || host === 'localhost') return request.headers.get('x-authenticated-user-email');
  return null;
}
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
async function all(db, sql, ...binds) { return (await db.prepare(sql).bind(...binds).all()).results || []; }
async function readState(db, householdId) {
  const version = await stateVersion(db, householdId);
  return {
    syncVersion: version,
    household: await db.prepare('SELECT * FROM households WHERE id=?').bind(householdId).first(),
    members: await all(db, 'SELECT * FROM members WHERE household_id=? ORDER BY email', householdId),
    childProfile: await db.prepare('SELECT * FROM child_profiles WHERE household_id=?').bind(householdId).first(),
    ingredients: await all(db, 'SELECT * FROM ingredients WHERE household_id=? ORDER BY created_at,name', householdId),
    cubeLots: (await all(db, 'SELECT * FROM cube_lots WHERE household_id=? ORDER BY created_at,id', householdId)).map((lot) => ({ ...lot, description: lot.storage_location || '' })),
    combinations: await all(db, 'SELECT * FROM combinations WHERE household_id=? ORDER BY created_at,name', householdId),
    combinationItems: await all(db, 'SELECT ci.* FROM combination_items ci JOIN combinations c ON c.id=ci.combination_id WHERE c.household_id=? ORDER BY ci.combination_id,ci.ingredient_id', householdId),
    mealPlanSlots: await all(db, 'SELECT * FROM meal_plan_slots WHERE household_id=? ORDER BY date,meal_type,id', householdId),
    events: await all(db, 'SELECT * FROM events WHERE household_id=? ORDER BY created_at DESC', householdId),
    aiCommands: await all(db, 'SELECT * FROM ai_commands WHERE household_id=? ORDER BY created_at DESC', householdId),
    approvalRequests: await all(db, 'SELECT * FROM approval_requests WHERE household_id=? ORDER BY created_at DESC', householdId),
  };
}
export async function handlePutState(db, householdId, actor, body) {
  const parsed = normalizeStateForD1(body, householdId, actor);
  if (!parsed.ok) return json({ error: 'validation_failed' }, 422);
  if (!hasValidStateGraph(parsed.state)) return json({ error: 'validation_failed', reason: 'foreign_or_missing_reference' }, 422);
  const currentVersion = await stateVersion(db, householdId);
  if (parsed.syncVersion !== currentVersion) return json({ error: 'version_conflict', state: await readState(db, householdId) }, 409);
  const referencedDeletion = await referencedIngredientDeletion(db, householdId, parsed.state);
  if (referencedDeletion) return json({ error: 'ingredient_referenced', ...referencedDeletion }, 409);
  try {
    await db.batch(buildReplaceStateStatements(db, householdId, parsed.state, currentVersion, currentVersion + 1));
  } catch (error) {
    if (await stateVersion(db, householdId) !== currentVersion) return json({ error: 'version_conflict', state: await readState(db, householdId) }, 409);
    throw error;
  }
  return json(await readState(db, householdId));
}
export function normalizeStateForD1(body, householdId, actor) {
  if (!isObject(body)) return { ok: false };
  const syncVersion = Number(body.syncVersion);
  if (!Number.isInteger(syncVersion) || syncVersion < 1) return { ok: false };
  const names = ['ingredients','cubeLots','combinations','combinationItems','mealPlanSlots','events'];
  if (!names.every((name) => Array.isArray(body[name]))) return { ok: false };
  const state = {
    childProfile: normalizeChildProfile(body.childProfile, householdId),
    ingredients: rows(body.ingredients.filter((row) => isObject(row) && !row.deleted_at && row.status !== 'cancelled'), ['id','name','category','status','notes','created_at','updated_at']).map((row) => ({ ...row, household_id: householdId })),
    cubeLots: rows(body.cubeLots.filter((row) => isObject(row) && !row.deleted_at), ['id','ingredient_id','made_at','expires_at','initial_count','remaining_count','grams_per_cube','storage_location','description','created_at','updated_at']).map((row) => ({ ...row, household_id: householdId, storage_location: row.description || row.storage_location || null })),
    combinations: rows(body.combinations, ['id','name','stage','texture','notes','created_at','updated_at']).map((row) => ({ ...row, household_id: householdId })),
    combinationItems: rows(body.combinationItems, ['combination_id','ingredient_id','cube_count']),
    mealPlanSlots: rows(body.mealPlanSlots, ['id','date','meal_type','target_type','combination_id','ingredient_id','cube_count','status','created_at','updated_at']).map((row) => ({ ...row, household_id: householdId })),
    events: rows(body.events, ['id','actor_email','source','type','payload_json','before_json','after_json','created_at','undo_event_id']).map((row) => ({ ...row, household_id: householdId, actor_email: actor })),
  };
  if (!state.childProfile?.id || !state.childProfile.display_name) return { ok: false };
  if (!state.ingredients.length || !state.combinations.length) return { ok: false };
  if (state.ingredients.some((row) => !row.id || !row.name || !['not_tried','planned','testing','tolerated','suspected_reaction'].includes(row.status))) return { ok: false };
  return { ok: true, syncVersion, state };
}
function hasValidStateGraph(state) {
  const ingredientIds = new Set(state.ingredients.map((ingredient) => ingredient.id));
  const combinationIds = new Set(state.combinations.map((combination) => combination.id));
  const validCombinationItems = state.combinationItems.every((item) => combinationIds.has(item.combination_id) && ingredientIds.has(item.ingredient_id));
  const validCubeLots = state.cubeLots.every((lot) => ingredientIds.has(lot.ingredient_id));
  const validMealSlots = state.mealPlanSlots.every((slot) => {
    if (slot.target_type === 'combination') return combinationIds.has(slot.combination_id) && slot.ingredient_id == null;
    if (slot.target_type === 'ingredient') return ingredientIds.has(slot.ingredient_id) && slot.combination_id == null;
    return false;
  });
  return validCombinationItems && validCubeLots && validMealSlots;
}
async function referencedIngredientDeletion(db, householdId, state) {
  const incomingIngredientIds = new Set(state.ingredients.map((ingredient) => ingredient.id));
  const currentIngredients = await all(db, 'SELECT id FROM ingredients WHERE household_id=?', householdId);
  const removedIngredientIds = new Set(currentIngredients.map((ingredient) => ingredient.id).filter((ingredientId) => !incomingIngredientIds.has(ingredientId)));
  if (!removedIngredientIds.size) return null;

  const combinationReferences = await all(db, 'SELECT ci.ingredient_id,ci.combination_id FROM combination_items ci JOIN combinations c ON c.id=ci.combination_id WHERE c.household_id=?', householdId);
  const removedCombinationReferences = combinationReferences.filter((reference) => removedIngredientIds.has(reference.ingredient_id));
  const referencedCombinationIds = new Set(removedCombinationReferences.map((reference) => reference.combination_id));
  const referencedIngredientIds = new Set(removedCombinationReferences.map((reference) => reference.ingredient_id));
  const activeSlots = await all(db, "SELECT id,target_type,combination_id,ingredient_id FROM meal_plan_slots WHERE household_id=? AND status<>'cancelled'", householdId);
  const referencedSlotIds = new Set();
  for (const slot of activeSlots) {
    if (slot.target_type === 'ingredient' && removedIngredientIds.has(slot.ingredient_id)) {
      referencedIngredientIds.add(slot.ingredient_id);
      referencedSlotIds.add(slot.id);
    } else if (slot.target_type === 'combination' && referencedCombinationIds.has(slot.combination_id)) {
      referencedSlotIds.add(slot.id);
    }
  }
  if (!referencedIngredientIds.size) return null;
  return {
    ingredient_ids: [...referencedIngredientIds].sort(),
    combination_count: referencedCombinationIds.size,
    slot_count: referencedSlotIds.size,
  };
}
function buildReplaceStateStatements(db, householdId, state, currentVersion, nextVersion) {
  const updatedAt = now();
  const statements = [
    db.prepare('INSERT INTO state_versions (household_id,version,updated_at) VALUES (?,?,?) ON CONFLICT(household_id) DO UPDATE SET version=CASE WHEN state_versions.version=? THEN excluded.version ELSE NULL END, updated_at=CASE WHEN state_versions.version=? THEN excluded.updated_at ELSE state_versions.updated_at END').bind(householdId, nextVersion, updatedAt, currentVersion, currentVersion),
    db.prepare('DELETE FROM meal_plan_slots WHERE household_id=?').bind(householdId),
    db.prepare('DELETE FROM combination_items WHERE combination_id IN (SELECT id FROM combinations WHERE household_id=?)').bind(householdId),
    db.prepare('DELETE FROM combinations WHERE household_id=?').bind(householdId),
    db.prepare('DELETE FROM cube_lots WHERE household_id=?').bind(householdId),
    db.prepare('DELETE FROM ingredients WHERE household_id=?').bind(householdId),
    db.prepare('DELETE FROM child_profiles WHERE household_id=?').bind(householdId),
  ];
  pushRows(statements, db, 'INSERT INTO child_profiles VALUES (?,?,?,?,?,?,?)', [state.childProfile], ['id','household_id','display_name','birth_date','notes','created_at','updated_at']);
  pushRows(statements, db, 'INSERT INTO ingredients VALUES (?,?,?,?,?,?,?,?)', state.ingredients, ['id','household_id','name','category','status','notes','created_at','updated_at']);
  pushRows(statements, db, 'INSERT INTO cube_lots VALUES (?,?,?,?,?,?,?,?,?,?,?)', state.cubeLots, ['id','household_id','ingredient_id','made_at','expires_at','initial_count','remaining_count','grams_per_cube','storage_location','created_at','updated_at']);
  pushRows(statements, db, 'INSERT INTO combinations VALUES (?,?,?,?,?,?,?,?)', state.combinations, ['id','household_id','name','stage','texture','notes','created_at','updated_at']);
  pushRows(statements, db, 'INSERT INTO combination_items VALUES (?,?,?)', state.combinationItems, ['combination_id','ingredient_id','cube_count']);
  pushRows(statements, db, 'INSERT INTO meal_plan_slots VALUES (?,?,?,?,?,?,?,?,?,?,?)', state.mealPlanSlots, ['id','household_id','date','meal_type','target_type','combination_id','ingredient_id','cube_count','status','created_at','updated_at']);
  pushRows(statements, db, 'INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?)', state.events, ['id','household_id','actor_email','source','type','payload_json','before_json','after_json','created_at','undo_event_id']);
  return statements;
}
function pushRows(statements, db, sql, rowsToInsert, fields) {
  for (const row of rowsToInsert) statements.push(db.prepare(sql).bind(...fields.map((field) => row[field] ?? null)));
}
function rows(items, fields) {
  return items.filter(isObject).map((item) => pick(item, fields));
}
function normalizeChildProfile(profile, householdId) {
  if (!isObject(profile)) return null;
  const timestamp = now();
  const row = pick(profile, ['id','display_name','birth_date','notes','created_at','updated_at']);
  return {
    ...row,
    id: row.id || `child-${householdId}`,
    household_id: householdId,
    display_name: String(row.display_name || '').trim(),
    birth_date: row.birth_date || null,
    notes: row.notes || '',
    created_at: row.created_at || timestamp,
    updated_at: row.updated_at || timestamp,
  };
}
function pick(item, fields) {
  return Object.fromEntries(fields.map((field) => [field, item[field] ?? null]));
}
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
async function stateVersion(db, householdId) {
  const row = await db.prepare('SELECT version FROM state_versions WHERE household_id=?').bind(householdId).first();
  return Number(row?.version || 1);
}
async function inventory(db, householdId) {
  const ingredients = await all(db, 'SELECT * FROM ingredients WHERE household_id=? ORDER BY name', householdId);
  const lots = await all(db, 'SELECT * FROM cube_lots WHERE household_id=? ORDER BY expires_at,made_at', householdId);
  return summarizeInventory(ingredients, lots);
}
async function forecast(db, householdId, week) {
  return calculateForecast({ ingredients: await all(db, 'SELECT * FROM ingredients WHERE household_id=?', householdId), lots: await all(db, 'SELECT * FROM cube_lots WHERE household_id=?', householdId), combinations: await all(db, 'SELECT * FROM combinations WHERE household_id=?', householdId), combinationItems: await all(db, 'SELECT ci.* FROM combination_items ci JOIN combinations c ON c.id=ci.combination_id WHERE c.household_id=?', householdId), mealPlanSlots: await all(db, 'SELECT * FROM meal_plan_slots WHERE household_id=?', householdId), startDate: week });
}
async function event(db, householdId, actor, source, type, payload, before, after) {
  const eventId = id('evt');
  await db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)').bind(eventId, householdId, actor, source, type, JSON.stringify(payload), before && JSON.stringify(before), after && JSON.stringify(after), now(), null).run();
  return eventId;
}
async function handleAi(db, householdId, actor, body) {
  const ingredients = await all(db, 'SELECT * FROM ingredients WHERE household_id=?', householdId);
  const intent = parseKoreanAddStock(body.raw_text, ingredients);
  const commandId = id('cmd');
  if (intent.type === 'add_stock') {
    const key = dedupeKey({ household_id: householdId, actor_email: actor, intent });
    const dup = await db.prepare("SELECT id FROM ai_commands WHERE household_id=? AND dedupe_key=? AND created_at > datetime('now','-60 seconds') LIMIT 1").bind(householdId, key).first();
    if (dup) return json({ status: 'rejected', command_id: commandId, reason: 'duplicate_within_60s' }, 409);
    const lot = { id: id('lot'), household_id: householdId, ingredient_id: intent.ingredient_id, made_at: new Date().toISOString().slice(0,10), expires_at: null, initial_count: intent.quantity, remaining_count: intent.quantity, grams_per_cube: null, storage_location: null, created_at: now(), updated_at: now() };
    await db.prepare('INSERT INTO cube_lots VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(lot.id, lot.household_id, lot.ingredient_id, lot.made_at, lot.expires_at, lot.initial_count, lot.remaining_count, lot.grams_per_cube, lot.storage_location, lot.created_at, lot.updated_at).run();
    const eventId = await event(db, householdId, actor, 'ai', 'stock_add', { lot, raw_text: body.raw_text, parsed_intent: intent }, null, lot);
    await db.prepare('INSERT INTO ai_commands VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(commandId, householdId, actor, body.raw_text, JSON.stringify(intent), JSON.stringify({ ok: true }), 'auto_applied', eventId, key, 'local-rule-parser', now()).run();
    return json({ status: 'auto_applied', command_id: commandId, event_id: eventId, undo_expires_at: new Date(Date.now()+3000).toISOString(), inventory_delta: { ingredient_id: intent.ingredient_id, quantity: intent.quantity } });
  }
  if (intent.type === 'approval' && APPROVAL_ALLOWLIST.includes(intent.request_type)) {
    const approvalId = id('apr');
    await db.prepare('INSERT INTO approval_requests VALUES (?,?,?,?,?,?,?,?,?)').bind(approvalId, householdId, actor, intent.request_type, JSON.stringify({ raw_text: body.raw_text, intent }), 'pending', null, now(), null).run();
    await db.prepare('INSERT INTO ai_commands VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(commandId, householdId, actor, body.raw_text, JSON.stringify(intent), JSON.stringify({ reason: intent.reason }), 'pending_approval', null, null, 'local-rule-parser', now()).run();
    return json({ status: 'pending_approval', command_id: commandId, approval_request_id: approvalId, reason: intent.reason });
  }
  await db.prepare('INSERT INTO ai_commands VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(commandId, householdId, actor, body.raw_text, JSON.stringify(intent), JSON.stringify({ reason: intent.reason }), 'rejected', null, null, 'local-rule-parser', now()).run();
  return json({ status: 'rejected', command_id: commandId, reason: intent.reason }, 422);
}
function parseEvent(e) { return { ...e, payload: JSON.parse(e.payload_json), before: e.before_json && JSON.parse(e.before_json), after: e.after_json && JSON.parse(e.after_json) }; }
