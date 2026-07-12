import test from 'node:test';
import assert from 'node:assert/strict';
import { loginHref } from '../src/lib/auth-navigation.js';

test('expired login confirmation reloads the current protected URL', () => {
  assert.equal(loginHref(new URL('http://127.0.0.1:8788/')), 'http://127.0.0.1:8788/');
  assert.equal(loginHref(new URL('https://jw-cube.taewooo.kim/items?tab=inventory#stock')), 'https://jw-cube.taewooo.kim/items?tab=inventory#stock');
});
