import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { deterministicState } from '../fixtures/shared-state.js';
import { settlePageImages } from './mobile-audit.js';

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
if (!baseURL || new URL(baseURL).port === '8788') throw new Error('PLAYWRIGHT_BASE_URL must point to a fresh non-8788 isolated server');

const outputRoot = path.resolve('.omo/evidence/full-mobile-audit/final/zoom');
const spacingCss = `*:not(svg):not(path){line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}`;
const viewports = [
  { nominalWidth: 375, nominalHeight: 812, cssWidth: 188, cssHeight: 406 },
  { nominalWidth: 768, nominalHeight: 1024, cssWidth: 384, cssHeight: 512 },
];
const screens = [
  ['today', '[data-tab="today"]'], ['inventory', '[data-tab="inventory"]'],
  ['meals', '[data-tab="meals"]'], ['items', '[data-tab="items"]'],
  ['records', '[data-tab="records"]'], ['settings', '[data-settings-tab]'],
];
const productFiles = ['DESIGN.md', 'functions/api/[[path]].js', 'public/styles.css', 'src/app.js', 'src/lib/api-state.js', 'src/lib/view.js'];

async function fingerprints() {
  return Promise.all(productFiles.map(async (file) => {
    const [bytes, details] = await Promise.all([readFile(file), stat(file)]);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex'), mtime: details.mtime.toISOString() };
  }));
}

async function routeState(context) {
  let state = deterministicState();
  state.childProfile.display_name = 'QA 아기';
  state.childProfile.notes = '';
  state.members = state.members.map((member, index) => ({ ...member, email: `qa-caregiver-${index + 1}@example.invalid` }));
  state.events = state.events.map((event) => ({ ...event, actor_email: 'qa-caregiver-1@example.invalid' }));
  await context.route('**/api/state', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
    if (route.request().method() === 'PUT') {
      state = { ...JSON.parse(route.request().postData() || '{}'), syncVersion: state.syncVersion + 1 };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) });
    }
    return route.fallback();
  });
}

async function capturePhysical(page, target, viewport) {
  const raw = viewport.nominalWidth === 375 ? `${target}.raw.png` : target;
  await settlePageImages(page);
  await page.screenshot({ path: raw, fullPage: false, animations: 'disabled' });
  if (raw !== target) {
    await sharp(raw).extract({ left: 0, top: 0, width: 375, height: 812 }).toFile(target);
    await import('node:fs/promises').then(({ unlink }) => unlink(raw));
  }
  const metadata = await sharp(target).metadata();
  if (metadata.width !== viewport.nominalWidth || metadata.height !== viewport.nominalHeight) throw new Error(`Unexpected zoom image size for ${target}: ${metadata.width}x${metadata.height}`);
}

async function screenMetrics(page) {
  return page.evaluate(async () => {
    const panel = document.querySelector('.tab-panel:not([hidden])');
    const dock = document.querySelector('.bottom-tabs');
    const visible = (element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
        && element.getAttribute('aria-hidden') !== 'true' && rect.width > 0 && rect.height > 0;
    };
    const leaves = Array.from(panel.querySelectorAll('h1,h2,h3,p,span,b,strong,small,em,label,button,a,select')).filter((element) => visible(element) && !Array.from(element.children).some(visible));
    const clipped = leaves.filter((element) => {
      const style = getComputedStyle(element);
      const dimensionClipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
      return dimensionClipped && style.textOverflow !== 'ellipsis' && ['hidden', 'clip'].includes(style.overflowX);
    }).map((element) => ({ text: (element.textContent || '').trim().slice(0, 80), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    const particlePattern = /^(은|는|이|가|을|를|와|과|로|으로)$/;
    const cjkOrphans = [];
    for (const element of leaves) {
      const node = Array.from(element.childNodes).find((child) => child.nodeType === Node.TEXT_NODE && /[가-힣]/.test(child.textContent || ''));
      if (!node) continue;
      const lines = new Map();
      for (let index = 0; index < node.textContent.length; index += 1) {
        const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect(); if (!rect.width && !rect.height) continue;
        const key = Math.round(rect.top); lines.set(key, `${lines.get(key) || ''}${node.textContent[index]}`);
      }
      const lastLine = Array.from(lines.values()).at(-1)?.trim() || '';
      if (lines.size > 1 && particlePattern.test(lastLine)) cjkOrphans.push({ text: (element.textContent || '').trim().slice(0, 100), lastLine, lineCount: lines.size });
    }
    const focusFailures = [];
    const controls = Array.from(panel.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),a[href],input:not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled])')).filter(visible);
    for (const element of controls) {
      element.focus(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect(); const dockRect = dock && visible(dock) ? dock.getBoundingClientRect() : null;
      const visualBottom = visualViewport ? visualViewport.offsetTop + visualViewport.height : innerHeight;
      const safeBottom = dockRect ? Math.min(visualBottom, dockRect.top) : visualBottom;
      if (document.activeElement !== element || rect.top < (visualViewport?.offsetTop || 0) - 1 || rect.bottom > safeBottom + 1) {
        focusFailures.push({ id: element.id || element.getAttribute('aria-label') || element.textContent.trim(), top: rect.top, bottom: rect.bottom, safeBottom, active: document.activeElement === element });
      }
    }
    panel.scrollTop = 0; window.scrollTo(0, 0);
    return {
      effectiveCssViewport: { width: innerWidth, height: innerHeight }, devicePixelRatio,
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      panel: { clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth, clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight },
      clipping: { count: clipped.length, items: clipped }, cjk: { orphanParticleCount: cjkOrphans.length, items: cjkOrphans },
      focus: { checked: controls.length, failureCount: focusFailures.length, failures: focusFailures },
    };
  });
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.cssWidth, height: viewport.cssHeight }, deviceScaleFactor: 2, locale: 'ko-KR' });
    await routeState(context);
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.addStyleTag({ content: spacingCss });
    for (const [screen, selector] of screens) {
      await page.locator(selector).click();
      const panel = page.locator(`#panel-${screen}`); await panel.waitFor({ state: 'visible' });
      await panel.evaluate((element) => { element.scrollTop = 0; });
      const stem = `${viewport.nominalWidth}x${viewport.nominalHeight}-${screen}`;
      const top = path.join(outputRoot, `${stem}-top.png`); const bottom = path.join(outputRoot, `${stem}-bottom.png`);
      await capturePhysical(page, top, viewport);
      const metrics = await screenMetrics(page);
      await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await capturePhysical(page, bottom, viewport);
      results.push({ screen, nominalPhysicalViewport: { width: viewport.nominalWidth, height: viewport.nominalHeight }, screenshots: { top, bottom }, metrics });
    }
    await context.close();
  }
} finally { await browser.close(); }

const failures = results.flatMap((result) => [
  ...(result.metrics.document.scrollWidth === result.metrics.document.clientWidth ? [] : [`${result.screen}: document overflow`]),
  ...(result.metrics.clipping.count === 0 ? [] : [`${result.screen}: clipped text`]),
  ...(result.metrics.cjk.orphanParticleCount === 0 ? [] : [`${result.screen}: CJK orphan`]),
  ...(result.metrics.focus.failureCount === 0 ? [] : [`${result.screen}: focus obscuration`]),
]);
await writeFile(path.join(outputRoot, 'runtime-manifest.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(), baseURL, method: 'Half-sized CSS viewport at DPR 2; 188 CSS px renders 376 physical px and is cropped one right-edge pixel to exact 375x812',
  textSpacing: { lineHeight: 1.5, letterSpacing: '0.12em', wordSpacing: '0.16em', paragraphBottomMargin: '2em' },
  productSources: await fingerprints(), screenshotCount: results.length * 2, failures, results,
}, null, 2)}\n`);
if (failures.length) throw new Error(`Zoom/text-spacing audit failed: ${failures.join('; ')}`);
