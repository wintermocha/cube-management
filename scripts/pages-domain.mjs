#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const DEFAULT_PROJECT_NAME = 'baby-food-cube-management';
const COMMANDS = new Set(['list', 'get', 'add']);

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export async function runPagesDomainCommand({
  argv = process.argv.slice(2),
  env = process.env,
  fetch: fetchFn = globalThis.fetch,
  stdout = (line) => console.log(line),
  stderr = (line) => console.error(line),
} = {}) {
  try {
    const request = buildRequest(argv, env);
    const response = await fetchFn(request.url, request.init);
    const payload = await readJson(response);

    if (!response.ok || payload.success === false) {
      stderr(formatApiError(payload, response.status));
      return 1;
    }

    stdout(formatResult(request.command, payload.result));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      stderr(error.message);
      stderr(usage());
      return 2;
    }
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function buildRequest(argv, env) {
  const [command, rawDomain] = argv;
  if (!COMMANDS.has(command)) throw new UsageError('Expected command: list, get, or add.');

  const accountId = requiredEnv(env, 'CLOUDFLARE_ACCOUNT_ID');
  const token = requiredEnv(env, 'CLOUDFLARE_API_TOKEN');
  const projectName = env.PAGES_PROJECT_NAME || DEFAULT_PROJECT_NAME;
  const basePath = `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/domains`;

  if (command === 'list') {
    return { command, url: `${API_BASE}${basePath}`, init: apiInit(token, 'GET') };
  }

  const domain = normalizeDomain(rawDomain);
  if (command === 'get') {
    return { command, url: `${API_BASE}${basePath}/${encodeURIComponent(domain)}`, init: apiInit(token, 'GET') };
  }

  return {
    command,
    url: `${API_BASE}${basePath}`,
    init: apiInit(token, 'POST', { name: domain }),
  };
}

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) throw new UsageError(`Missing required environment variable: ${name}.`);
  return value;
}

function apiInit(token, method, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  return {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

function normalizeDomain(rawDomain) {
  const value = String(rawDomain || '').trim();
  if (!value) throw new UsageError('A domain name is required for this command.');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withScheme);
  if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new UsageError('Use a hostname only, for example: baby.example.com.');
  }

  const hostname = url.hostname.toLowerCase();
  const labels = hostname.split('.');
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (hostname.length > 253 || labels.length < 2 || labels.some((label) => !validLabel.test(label))) {
    throw new UsageError(`Invalid domain name: ${rawDomain}`);
  }
  return hostname;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`Cloudflare API returned non-JSON response with status ${response.status}.`);
  }
}

function formatApiError(payload, status) {
  const messages = [...(payload?.errors || []), ...(payload?.messages || [])].map((item) => item.message).filter(Boolean);
  return messages.length ? `Cloudflare API error (${status}): ${messages.join('; ')}` : `Cloudflare API error (${status}).`;
}

function formatResult(command, result) {
  if (command === 'list') {
    const domains = Array.isArray(result) ? result : [];
    if (domains.length === 0) return 'No custom domains are attached to this Pages project.';
    return domains.map(formatDomain).join('\n');
  }
  return formatDomain(result);
}

function formatDomain(domain) {
  if (!domain) return 'No domain data returned.';
  const parts = [`${domain.name}: ${domain.status || 'unknown'}`];
  if (domain.validation_data?.txt_name && domain.validation_data?.txt_value) {
    parts.push(`TXT ${domain.validation_data.txt_name}=${domain.validation_data.txt_value}`);
  }
  if (domain.verification_data?.error_message) parts.push(`verification: ${domain.verification_data.error_message}`);
  return parts.join('\n');
}

function usage() {
  return [
    'Usage:',
    '  CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token> npm run domain:list',
    '  CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token> npm run domain:get -- baby.example.com',
    '  CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token> npm run domain:add -- baby.example.com',
    '',
    `PAGES_PROJECT_NAME defaults to ${DEFAULT_PROJECT_NAME}.`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPagesDomainCommand();
}
