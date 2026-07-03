import { seedData } from './lib/seed.js';
import { summarizeInventory, calculateForecast, parseKoreanAddStock, dedupeKey } from './lib/domain.js';

const STORAGE_KEY = 'baby-food-cube-cloudflare-mvp';
let state = loadState();
let undoTimer = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : seedData();
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function actor() { return 'caregiver-a@example.com'; }
function logEvent(type, payload, before = null, after = null, source = 'manual') {
  const event = { id: id('evt'), household_id: 'home', actor_email: actor(), source, type, payload_json: JSON.stringify(payload), before_json: before && JSON.stringify(before), after_json: after && JSON.stringify(after), created_at: now(), undo_event_id: null };
  state.events.unshift(event);
  return event;
}

function render() {
  const weekStart = document.querySelector('#weekStart')?.value || '2026-07-03';
  const inventory = summarizeInventory(state.ingredients, state.cubeLots);
  const forecast = calculateForecast({ ingredients: state.ingredients, lots: state.cubeLots, combinations: state.combinations, combinationItems: state.combinationItems, mealPlanSlots: state.mealPlanSlots, startDate: weekStart });
  document.querySelector('#app').innerHTML = `
    <header><div><strong>이유식 큐브</strong><span>Cloudflare-first MVP</span></div><button id="reset">샘플 초기화</button></header>
    <main>
      <section class="hero"><h1>오늘</h1><p>${state.childProfile.display_name}의 현재 재고 경고와 7일 식단 부족 예정을 분리해서 보여줍니다.</p></section>
      <section class="grid alerts">
        ${panel('error 재고', inventory.filter(i=>i.severity==='error').map(stockCard).join('') || '<p>없음</p>')}
        ${panel('warn 재고', inventory.filter(i=>i.severity==='warn').map(stockCard).join('') || '<p>없음</p>')}
        ${panel('부족 예정', forecast.filter(f=>f.shortage>0).map(f=>`<article class="card shortage"><b>${f.ingredient_name}</b><span>${f.needed}개 필요 / ${f.available}개 보유</span><em>부족 예정 ${f.shortage}개</em></article>`).join('') || '<p>없음</p>')}
      </section>
      <section class="panel"><h2>AI 재고 추가</h2><form id="aiForm"><input name="raw" placeholder="예: 소고기 큐브 6개 만들었어"/><button>반영</button></form><p class="hint">자동 반영은 재고 추가(1-30개)만 허용하고, 삭제/권한/진단 요청은 승인 대기 또는 거부됩니다.</p><div id="toast"></div></section>
      <section class="panel"><h2>큐브</h2><div class="cards">${inventory.map(stockCard).join('')}</div><form id="lotForm" class="inline"><select name="ingredient_id">${state.ingredients.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</select><input name="initial_count" type="number" min="1" max="200" value="1"/><button>수동 재고 추가</button></form></section>
      <section class="panel"><h2>식단표</h2><label>시작일 <input id="weekStart" value="${weekStart}" type="date"/></label><div class="cards">${state.mealPlanSlots.map(slotCard).join('')}</div></section>
      <section class="panel"><h2>재료</h2><form id="ingredientForm" class="inline"><input name="name" placeholder="새 재료"/><select name="status"><option>not_tried</option><option>planned</option><option>testing</option><option>tolerated</option><option>suspected_reaction</option></select><button>등록</button></form><div class="cards">${state.ingredients.map(i=>`<article class="card"><b>${i.name}</b><span>${i.category || '카테고리 없음'}</span><em>${i.status}</em>${i.status==='suspected_reaction'?'<small>진단이 아닌 기록 상태입니다.</small>':''}</article>`).join('')}</div></section>
      <section class="panel"><h2>조합</h2><div class="cards">${state.combinations.map(comboCard).join('')}</div></section>
      <section class="panel"><h2>기록 / 승인 대기</h2><h3>승인 대기</h3><div class="cards">${state.approvalRequests.map(r=>`<article class="card"><b>${r.request_type}</b><span>${r.status}</span><small>${JSON.stringify(JSON.parse(r.payload_json))}</small></article>`).join('') || '<p>없음</p>'}</div><h3>최근 이벤트</h3><div class="cards">${state.events.slice(0,10).map(e=>`<article class="card"><b>${e.type}</b><span>${e.actor_email} · ${e.source}</span><small>${e.created_at}</small></article>`).join('') || '<p>없음</p>'}</div></section>
    </main>`;
  bind();
}
function panel(title, body) { return `<section class="panel"><h2>${title}</h2>${body}</section>`; }
function stockCard(item) { return `<article class="card ${item.severity}"><b>${item.ingredient_name}</b><span>${item.current_count}개 ${item.empty_label || ''}</span><em>${item.severity}</em></article>`; }
function slotCard(s) { const combo = state.combinations.find(c=>c.id===s.combination_id); const ing = state.ingredients.find(i=>i.id===s.ingredient_id); return `<article class="card"><b>${s.date} ${s.meal_type}</b><span>${combo?.name || ing?.name || '비어 있음'}</span><em>${s.status}</em></article>`; }
function comboCard(c) { const items = state.combinationItems.filter(i=>i.combination_id===c.id).map(i=>`${state.ingredients.find(x=>x.id===i.ingredient_id)?.name} ${i.cube_count}개`).join(', '); return `<article class="card"><b>${c.name}</b><span>${c.stage || ''} ${c.texture || ''}</span><small>${items}</small></article>`; }
function bind() {
  document.querySelector('#reset').onclick = () => { state = seedData(); saveState(); };
  document.querySelector('#weekStart').onchange = render;
  document.querySelector('#lotForm').onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); addLot(fd.get('ingredient_id'), Number(fd.get('initial_count')), 'manual'); };
  document.querySelector('#ingredientForm').onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); const ingredient = { id: id('ing'), household_id: 'home', name: fd.get('name'), category: '', status: fd.get('status'), notes: '', created_at: now(), updated_at: now() }; state.ingredients.push(ingredient); logEvent('ingredient_create', ingredient); saveState(); };
  document.querySelector('#aiForm').onsubmit = handleAi;
}
function addLot(ingredient_id, quantity, source='manual') {
  const lot = { id: id('lot'), household_id: 'home', ingredient_id, made_at: new Date().toISOString().slice(0,10), expires_at: '', initial_count: quantity, remaining_count: quantity, grams_per_cube: null, storage_location: '', created_at: now(), updated_at: now() };
  state.cubeLots.push(lot);
  const event = logEvent('stock_add', { lot }, null, lot, source);
  return event;
}
function handleAi(e) {
  e.preventDefault();
  const raw_text = new FormData(e.target).get('raw');
  const intent = parseKoreanAddStock(raw_text, state.ingredients);
  const command = { id: id('cmd'), household_id: 'home', actor_email: actor(), raw_text, parsed_intent_json: JSON.stringify(intent), validation_result_json: '{}', status: 'rejected', event_id: null, dedupe_key: null, model_name: 'local-rule-parser', created_at: now() };
  if (intent.type === 'add_stock') {
    command.dedupe_key = dedupeKey({ household_id: 'home', actor_email: actor(), intent });
    const duplicate = state.aiCommands.find(c => c.dedupe_key === command.dedupe_key && Date.now() - Date.parse(c.created_at) < 60000);
    if (duplicate) { command.status = 'rejected'; command.validation_result_json = JSON.stringify({ reason: 'duplicate_within_60s' }); state.aiCommands.unshift(command); flash('60초 안에 같은 요청이 이미 처리되었습니다.'); saveState(); return; }
    const event = addLot(intent.ingredient_id, intent.quantity, 'ai');
    command.status = 'auto_applied'; command.event_id = event.id;
    state.aiCommands.unshift(command); saveState(); showUndo(command, event);
  } else if (intent.type === 'approval') {
    const req = { id: id('apr'), household_id: 'home', actor_email: actor(), request_type: intent.request_type, payload_json: JSON.stringify({ raw_text, intent }), status: 'pending', reviewer_email: null, created_at: now(), reviewed_at: null };
    state.approvalRequests.unshift(req); command.status = 'pending_approval'; state.aiCommands.unshift(command); flash(intent.reason); saveState();
  } else { state.aiCommands.unshift(command); flash(intent.reason); saveState(); }
}
function showUndo(command, event) { flash(`자동 반영됨. <button id="undoAi">3초 undo</button>`); clearTimeout(undoTimer); document.querySelector('#undoAi').onclick = () => rollbackAi(command, event); undoTimer = setTimeout(()=>{ const t=document.querySelector('#toast'); if(t) t.innerHTML=''; }, 3000); }
function rollbackAi(command, event) { const payload = JSON.parse(event.payload_json); const lot = state.cubeLots.find(l=>l.id===payload.lot.id); if (lot) lot.remaining_count = 0; event.undo_event_id = 'rolled-back'; command.status = 'rolled_back'; logEvent('stock_add_rollback', { original_event_id: event.id }, payload.lot, null, 'ai'); saveState(); flash('rollback 완료'); }
function flash(html) { const toast = document.querySelector('#toast'); if (toast) toast.innerHTML = html; }
render();
