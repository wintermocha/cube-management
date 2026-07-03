import test from 'node:test';
import assert from 'node:assert/strict';
import { runPagesDomainCommand } from '../scripts/pages-domain.mjs';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Pages domain add posts the requested custom domain to Cloudflare', async () => {
  const calls = [];
  const stdout = [];
  const exitCode = await runPagesDomainCommand({
    argv: ['add', 'https://Baby.Example.com/'],
    env: {
      CLOUDFLARE_ACCOUNT_ID: 'account_123',
      CLOUDFLARE_API_TOKEN: 'token_123',
      PAGES_PROJECT_NAME: 'baby-food-cube-management',
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        success: true,
        result: { name: 'baby.example.com', status: 'pending' },
      });
    },
    stdout: (line) => stdout.push(line),
    stderr: () => {},
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/account_123/pages/projects/baby-food-cube-management/domains');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token_123');
  assert.equal(calls[0].init.body, JSON.stringify({ name: 'baby.example.com' }));
  assert.match(stdout.join('\n'), /baby\.example\.com/);
  assert.match(stdout.join('\n'), /pending/);
});

test('Pages domain command fails before network access when credentials are missing', async () => {
  let fetched = false;
  const stderr = [];
  const exitCode = await runPagesDomainCommand({
    argv: ['add', 'baby.example.com'],
    env: {},
    fetch: async () => {
      fetched = true;
      return jsonResponse({ success: true });
    },
    stdout: () => {},
    stderr: (line) => stderr.push(line),
  });

  assert.equal(exitCode, 2);
  assert.equal(fetched, false);
  assert.match(stderr.join('\n'), /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(stderr.join('\n'), /CLOUDFLARE_API_TOKEN/);
});
