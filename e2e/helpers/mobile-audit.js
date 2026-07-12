import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRODUCT_FILES = [
  'DESIGN.md', 'functions/api/[[path]].js', 'public/styles.css', 'src/app.js',
  'src/lib/api-state.js', 'src/lib/auth-navigation.js', 'src/lib/bindings.js',
  'src/lib/domain.js', 'src/lib/meal-table-view.js', 'src/lib/safe-storage.js', 'src/lib/view.js',
];

function redact(value) {
  return String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(access[_ -]?token|authorization|cookie|notes?)[=: ]+[^\s,;]+/gi, '$1=[redacted]')
    .replace(/([?&](?:token|code|session)=)[^&]+/gi, '$1[redacted]');
}

function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return redact(raw);
  }
}

export function observePage(page) {
  const entries = [];
  page.on('console', (message) => {
    if (['error', 'warning', 'warn'].includes(message.type())) entries.push({ type: `console:${message.type()}`, text: redact(message.text()) });
  });
  page.on('pageerror', (error) => entries.push({ type: 'pageerror', text: redact(error.message) }));
  page.on('requestfailed', (request) => entries.push({ type: 'requestfailed', method: request.method(), url: safeUrl(request.url()), failure: redact(request.failure()?.errorText || '') }));
  page.on('response', (response) => {
    if (response.status() >= 400) entries.push({ type: 'http', status: response.status(), method: response.request().method(), url: safeUrl(response.url()) });
  });
  return { entries };
}

export async function runtimeProbe(page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight },
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
  }));
}

export async function geometryProbe(page) {
  return page.evaluate(() => {
    const selectors = ['#main', '.top-app-bar', '.workspace-tabs', '.tab-panel:not([hidden])', 'form', 'button[type="submit"]'];
    return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((element) => {
      const rect = element.getBoundingClientRect();
      return { selector, id: element.id || null, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    }));
  });
}

async function productFingerprint() {
  const productRoot = path.resolve(process.env.EVIDENCE_PRODUCT_ROOT || process.cwd());
  return Promise.all(PRODUCT_FILES.map(async (file) => {
    const absolute = path.join(productRoot, file);
    let contents; let details;
    try { [contents, details] = await Promise.all([readFile(absolute), stat(absolute)]); }
    catch (error) {
      if (error.code === 'ENOENT') return { file, missing: true };
      throw error;
    }
    return { file, sha256: createHash('sha256').update(contents).digest('hex'), mtime: details.mtime.toISOString() };
  }));
}

async function evidenceManifest({ page, testInfo, criterion, phase, screenshotPath, actions, observables, observer }) {
  return {
    criterion,
    phase,
    project: testInfo.project.name,
    gitSha: execFileSync('git', ['-C', path.resolve(process.env.EVIDENCE_PRODUCT_ROOT || process.cwd()), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: { name: testInfo.project.use.browserName || 'chromium', version: await page.context().browser().version() },
    runtime: await runtimeProbe(page),
    fixtureVersion: 'deterministic-shared-state-v1',
    actions,
    observables,
    geometry: await geometryProbe(page),
    diagnostics: observer.entries,
    assets: await imageReadinessProbe(page),
    productSources: await productFingerprint(),
    screenshot: path.relative(process.cwd(), screenshotPath),
  };
}

async function imageReadinessProbe(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
        && rect.width > 0 && rect.height > 0;
    };
    const localImages = Array.from(document.images).filter((image) => {
      try { return new URL(image.currentSrc || image.src, location.href).origin === location.origin; } catch { return false; }
    });
    const visibleLocalImages = localImages.filter(visible);
    const rows = visibleLocalImages.map((image) => ({
      src: new URL(image.currentSrc || image.src, location.href).pathname,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: image.getBoundingClientRect().width,
      renderedHeight: image.getBoundingClientRect().height,
    }));
    const avatars = rows.filter((row) => row.src.endsWith('/profile-avatar.svg'));
    return {
      visibleLocalImageCount: rows.length,
      allDecoded: rows.every((row) => row.complete && row.naturalWidth > 0 && row.naturalHeight > 0),
      avatarRendered: avatars.length === 0 || avatars.every((row) => row.naturalWidth > 0 && row.naturalHeight > 0 && row.renderedWidth > 0 && row.renderedHeight > 0),
      images: rows,
    };
  });
}

export async function settlePageImages(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const localImages = Array.from(document.images).filter((image) => {
      try { return new URL(image.currentSrc || image.src, location.href).origin === location.origin; } catch { return false; }
    });
    await Promise.all(localImages.map(async (image) => {
      if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Timed out loading ${image.src}`)), 5_000);
          image.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
          image.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`Failed to load ${image.src}`)); }, { once: true });
        });
      }
      if (typeof image.decode === 'function') await image.decode();
      if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) throw new Error(`Image did not decode: ${image.src}`);
    }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const readiness = await imageReadinessProbe(page);
  if (!readiness.allDecoded || !readiness.avatarRendered) throw new Error(`Image readiness failed: ${JSON.stringify(readiness)}`);
  return readiness;
}

export async function captureEvidence({ page, testInfo, criterion, name, actions, observables, observer }) {
  const phase = process.env.EVIDENCE_PHASE || 'before';
  const root = path.resolve(process.env.EVIDENCE_DIR || `.omo/evidence/full-mobile-audit/${phase}`);
  const directory = path.join(root, criterion, testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${name}.png`);
  await settlePageImages(page);
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  const manifest = await evidenceManifest({ page, testInfo, criterion, phase, screenshotPath, actions, observables, observer });
  await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function captureFinalEvidence({ page, testInfo, name, actions, observables, observer }) {
  const directory = path.resolve('.omo/evidence/full-mobile-audit/final', testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${name}.png`);
  await settlePageImages(page);
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
  const manifest = await evidenceManifest({ page, testInfo, criterion: 'SC6', phase: 'final', screenshotPath, actions, observables, observer });
  await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function captureCanonicalEvidence({ page, testInfo, name, actions, observables, observer }) {
  const directory = path.resolve('.omo/evidence/full-mobile-audit/final/canonical-35', testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${name}.png`);
  await settlePageImages(page);
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
  const manifest = await evidenceManifest({ page, testInfo, criterion: 'SC6-CANONICAL-35', phase: 'final', screenshotPath, actions, observables, observer });
  await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function captureTouchEvidence({ page, testInfo, name, actions, observables, observer }) {
  const directory = path.resolve('.omo/evidence/full-mobile-audit/final/touch', testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const screenshotPath = path.join(directory, `${name}.png`);
  await settlePageImages(page);
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
  const manifest = await evidenceManifest({ page, testInfo, criterion: 'SC6-PIXEL-TAP', phase: 'final', screenshotPath, actions, observables, observer });
  await writeFile(path.join(directory, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function waitForPut(page, action) {
  const response = page.waitForResponse((candidate) => candidate.url().endsWith('/api/state') && candidate.request().method() === 'PUT');
  await action();
  return response;
}
