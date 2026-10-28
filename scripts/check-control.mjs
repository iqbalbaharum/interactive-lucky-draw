import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3020';
  const page = await context.newPage();
  await page.goto(`${base}/control`);
  await page.getByLabel('Shared event password').fill(process.env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'SIGN IN' }).click();
  const start = page.locator('.control-start');
  const hit = page.locator('.control-hit');
  await start.waitFor();
  await start.getByText('SEND DUCKS FLYING').waitFor();
  assert.equal(await page.locator('.control-action').count(), 2);
  const rectangles = await page.locator('.control-action').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().toJSON()));
  assert.ok(rectangles.every(rect => rect.width >= 380 && rect.height >= 350), 'Both controls should fill the phone screen');
  assert.equal(await start.isEnabled(), true);
  assert.equal(await hit.isDisabled(), true);
  await page.screenshot({ path: '/tmp/duck-draw-control-mobile.png' });
  console.log('Mobile control checks passed: signed-in page, two full-width actions, Start ready and Hit gated.');
} finally { await browser.close(); }
