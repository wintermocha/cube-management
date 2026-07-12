import { test, expect } from 'playwright/test';
import { deterministicState, installDeterministicRuntime, installSharedState } from './fixtures/shared-state.js';
import { captureCanonicalEvidence, observePage } from './helpers/mobile-audit.js';

const PANELS_WITH_INTENTIONAL_X_SCROLL = ['meals'];

async function openPage(page) {
  const observer = observePage(page);
  const state = deterministicState();
  state.childProfile.display_name = 'QA 아기';
  state.childProfile.notes = '';
  state.members = state.members.map((member, index) => ({ ...member, email: `qa-caregiver-${index + 1}@example.invalid` }));
  state.events = state.events.map((event) => ({ ...event, actor_email: 'qa-caregiver-1@example.invalid' }));
  await installDeterministicRuntime(page);
  await installSharedState(page, state);
  await page.goto('/');
  await expect(page.locator('[data-tab="today"]')).toBeVisible();
  return observer;
}

async function activate(page, tab) {
  await page.locator(`[data-tab="${tab}"]`).click();
  await expect(page.locator(`#panel-${tab}`)).toBeVisible();
}

async function panelScroll(page, target) {
  const panel = page.locator('.tab-panel:not([hidden])');
  await panel.evaluate((element, value) => {
    element.scrollTop = value === 'max' ? element.scrollHeight : Number(value);
  }, target);
  await page.waitForFunction(() => {
    const active = document.querySelector('.tab-panel:not([hidden])');
    return active && Number.isFinite(active.scrollTop);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function geometry(page) {
  return page.evaluate((intentionalXScroll) => {
    const panel = document.querySelector('.tab-panel:not([hidden])');
    const panelRect = panel.getBoundingClientRect();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
        && element.getAttribute('aria-hidden') !== 'true' && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    };
    const clipped = Array.from(panel.querySelectorAll('*')).filter((element) => {
      if (!visible(element) || element.closest('.meal-calendar')) return false;
      const rect = element.getBoundingClientRect();
      return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1;
    }).map((element) => element.id || element.getAttribute('data-tab') || element.className || element.tagName);
    const interactive = Array.from(document.querySelectorAll('button,a[href],input:not([type="radio"]):not([type="hidden"]),select,textarea')).filter(visible);
    const undersized = interactive.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width < 48 || rect.height < 48;
    }).map((element) => element.getAttribute('aria-label') || element.id || element.textContent.trim());
    const dock = document.querySelector('.bottom-tabs');
    const dockRect = dock && visible(dock) ? dock.getBoundingClientRect() : null;
    const activeTab = document.querySelector('[data-tab][aria-selected="true"]')?.getAttribute('data-tab') || null;
    const activeFilter = document.querySelector('[data-ingredient-filter][aria-pressed="true"]')?.getAttribute('data-ingredient-filter') || null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollY },
      panel: {
        id: panel.id, clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth,
        clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight,
        scrollTop: panel.scrollTop, maxScroll: Math.max(0, panel.scrollHeight - panel.clientHeight),
      },
      dock: dockRect ? { left: dockRect.left, right: dockRect.right, top: dockRect.top, bottom: dockRect.bottom } : null,
      activeTab, activeFilter,
      expandedStock: document.querySelector('[data-stock-toggle][aria-expanded="true"]')?.getAttribute('data-stock-toggle') || null,
      expandedIngredient: document.querySelector('[data-ingredient-toggle][aria-expanded="true"]')?.getAttribute('data-ingredient-toggle') || null,
      focused: document.activeElement?.id || document.activeElement?.getAttribute?.('data-tab') || document.activeElement?.tagName || null,
      clipped,
      undersized,
      intentionalPanelOverflow: intentionalXScroll.includes(activeTab),
    };
  }, PANELS_WITH_INTENTIONAL_X_SCROLL);
}

async function capture(page, testInfo, observer, name, actions) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const metrics = await geometry(page);
  await captureCanonicalEvidence({ page, testInfo, observer, name, actions, observables: metrics });
  expect(metrics.document.scrollWidth, `${name}: document containment`).toBe(metrics.document.clientWidth);
  if (!metrics.intentionalPanelOverflow) expect(metrics.panel.scrollWidth, `${name}: panel containment`).toBe(metrics.panel.clientWidth);
  expect(metrics.document.scrollY, `${name}: body stays fixed`).toBe(0);
  expect(metrics.clipped, `${name}: descendant bounds`).toEqual([]);
  expect(metrics.undersized, `${name}: 48px targets`).toEqual([]);
  expect(observer.entries, `${name}: diagnostics`).toEqual([]);
}

async function expandOnly(page, kind, id) {
  const selector = kind === 'stock' ? '[data-stock-toggle]' : '[data-ingredient-toggle]';
  const attribute = kind === 'stock' ? 'data-stock-toggle' : 'data-ingredient-toggle';
  const current = page.locator(`${selector}[aria-expanded="true"]`);
  if (await current.count()) await current.click();
  await page.locator(`${selector}[${attribute}="${id}"]`).click();
}

test('canonical 35-state responsive inventory is settled and contained', async ({ page }, testInfo) => {
  const observer = await openPage(page);

  await activate(page, 'inventory');
  await panelScroll(page, 0); await capture(page, testInfo, observer, '01-cubes-top', ['activate Cubes', 'scroll top']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '02-cubes-bottom', ['Cubes collapsed', 'scroll max']);
  await expandOnly(page, 'stock', 'ing-broccoli'); await panelScroll(page, 346); await capture(page, testInfo, observer, '03-cubes-broccoli-expanded', ['expand broccoli', 'scroll middle']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '04-cubes-broccoli-expanded-bottom', ['broccoli expanded', 'scroll max']);
  await expandOnly(page, 'stock', 'ing-beef'); await panelScroll(page, 374); await capture(page, testInfo, observer, '05-cubes-beef-expanded', ['expand beef', 'scroll middle']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '06-cubes-beef-expanded-bottom', ['beef expanded', 'scroll max']);
  await expandOnly(page, 'stock', 'ing-rice'); await panelScroll(page, 374); await capture(page, testInfo, observer, '07-cubes-rice-expanded', ['expand rice', 'scroll middle']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '08-cubes-rice-expanded-bottom', ['rice expanded', 'scroll max']);

  await activate(page, 'today');
  await panelScroll(page, 0); await capture(page, testInfo, observer, '09-today-top', ['activate Today', 'scroll top']);
  await panelScroll(page, 520); await capture(page, testInfo, observer, '10-today-mid-1', ['Today', 'scroll 520']);
  await panelScroll(page, 1040); await capture(page, testInfo, observer, '11-today-mid-2', ['Today', 'scroll 1040']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '12-today-bottom', ['Today', 'scroll max']);

  await activate(page, 'meals');
  await panelScroll(page, 0); await capture(page, testInfo, observer, '13-plan-top', ['activate Plan', 'scroll top']);
  await panelScroll(page, 680); await capture(page, testInfo, observer, '14-plan-mid-recommendations', ['Plan', 'scroll 680']);
  await panelScroll(page, 1360); await capture(page, testInfo, observer, '15-plan-mid-calendar', ['Plan', 'scroll 1360']);
  await panelScroll(page, 2040); await capture(page, testInfo, observer, '16-plan-lower-empty-form', ['Plan', 'scroll 2040']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '17-plan-bottom', ['Plan', 'scroll max']);

  await activate(page, 'items');
  await panelScroll(page, 0); await capture(page, testInfo, observer, '18-ingredients-top', ['activate Ingredients', 'All filter', 'scroll top']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '19-ingredients-bottom', ['Ingredients All', 'scroll max']);
  await expandOnly(page, 'ingredient', 'ing-broccoli'); await panelScroll(page, 190); await capture(page, testInfo, observer, '20-ingredients-broccoli-expanded', ['expand broccoli status', 'scroll middle']);
  await expandOnly(page, 'ingredient', 'ing-beef'); await panelScroll(page, 190); await capture(page, testInfo, observer, '21-ingredients-beef-expanded', ['expand beef status', 'scroll middle']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '22-ingredients-beef-expanded-bottom', ['beef status expanded', 'scroll max']);
  await expandOnly(page, 'ingredient', 'ing-rice'); await panelScroll(page, 190); await capture(page, testInfo, observer, '23-ingredients-rice-expanded', ['expand rice status', 'scroll middle']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '24-ingredients-rice-expanded-bottom', ['rice status expanded', 'scroll max']);
  for (const [filter, name, bottom] of [
    ['not_tried', '25-ingredients-filter-untried-empty', false], ['planned', '26-ingredients-filter-planned-empty', false],
    ['testing', '27-ingredients-filter-testing', false], ['tolerated', '28-ingredients-filter-tolerated', false],
    ['tolerated', '29-ingredients-filter-tolerated-bottom', true], ['suspected_reaction', '30-ingredients-filter-suspected-empty', false],
  ]) {
    if ((await page.locator(`[data-ingredient-filter="${filter}"]`).getAttribute('aria-pressed')) !== 'true') await page.locator(`[data-ingredient-filter="${filter}"]`).click();
    await panelScroll(page, bottom ? 'max' : 0);
    await capture(page, testInfo, observer, name, [`select ${filter} filter`, bottom ? 'scroll max' : 'scroll top']);
  }

  await activate(page, 'records');
  await panelScroll(page, 0); await capture(page, testInfo, observer, '31-history-top', ['activate History', 'scroll top']);
  await panelScroll(page, 650); await capture(page, testInfo, observer, '32-history-mid', ['History', 'scroll 650']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '33-history-bottom', ['History', 'scroll max']);

  await page.locator('[data-settings-tab]').click();
  await expect(page.locator('#panel-settings')).toBeVisible();
  await panelScroll(page, 0); await capture(page, testInfo, observer, '34-settings-top', ['open Settings', 'scroll top']);
  await panelScroll(page, 'max'); await capture(page, testInfo, observer, '35-settings-bottom', ['Settings', 'scroll max']);
});
