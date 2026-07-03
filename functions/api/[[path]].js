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
  } catch (error) {
    return json({ error: 'internal_error', detail: error.message }, 500);
  }
}

function getActorEmail(request) {
  return request.headers.get('cf-access-authenticated-user-email') || request.headers.get('x-authenticated-user-email');
}
async function all(db, sql, ...binds) { return (await db.prepare(sql).bind(...binds).all()).results || []; }
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
