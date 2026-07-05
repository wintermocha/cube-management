import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedStateSync, fetchSharedState } from '../src/lib/api-state.js';

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'location', { value: originalLocation, configurable: true });
});

test('shared state load explains when the API is missing from the current server', async () => {
  Object.defineProperty(globalThis, 'location', { value: { hostname: '127.0.0.1' }, configurable: true });
  globalThis.fetch = async () => new Response('not found', { status: 404 });
  const warnings = [];
  const sync = createSharedStateSync({
    getState: () => ({}),
    setState: () => {},
    cacheKey: 'test-shared-state',
    render: () => {},
    warn: (message) => warnings.push(message),
  });

  await sync.load();

  assert.deepEqual(warnings, ['공유 API를 찾지 못했어요. Cloudflare Pages dev 또는 배포 주소로 열어 주세요.']);
});

test('shared state load switches to auth-required handling when the session is expired', async () => {
  Object.defineProperty(globalThis, 'location', { value: { hostname: 'jw-cube.taewooo.kim' }, configurable: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  const warnings = [];
  const authMessages = [];
  const sync = createSharedStateSync({
    getState: () => ({}),
    setState: () => {},
    cacheKey: 'test-shared-state',
    render: () => {},
    warn: (message) => warnings.push(message),
    authRequired: (message) => authMessages.push(message),
  });

  await sync.load();

  assert.deepEqual(warnings, []);
  assert.deepEqual(authMessages, ['로그인 세션을 확인하지 못했어요. 다시 로그인해 주세요.']);
});

test('shared state load explains when the logged-in email is not a household member', async () => {
  Object.defineProperty(globalThis, 'location', { value: { hostname: 'jw-cube.taewooo.kim' }, configurable: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  const warnings = [];
  const sync = createSharedStateSync({
    getState: () => ({}),
    setState: () => {},
    cacheKey: 'test-shared-state',
    render: () => {},
    warn: (message) => warnings.push(message),
  });

  await sync.load();

  assert.deepEqual(warnings, ['로그인한 이메일이 이 공유 가정의 멤버로 등록되어 있지 않아요.']);
});

test('local shared state requests include the development identity header', async () => {
  Object.defineProperty(globalThis, 'location', { value: { hostname: 'localhost' }, configurable: true });
  let headers;
  globalThis.fetch = async (_url, init) => {
    headers = init.headers;
    return Response.json({ ok: true });
  };

  await fetchSharedState();

  assert.equal(headers['x-authenticated-user-email'], 'caregiver-a@example.com');
});
