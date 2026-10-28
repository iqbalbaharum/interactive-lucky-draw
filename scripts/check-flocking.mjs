import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let activeDraw = null;
  await page.route('**/api/status', route => route.fulfill({ json: {
    eligibleCount: 600, totalCount: 600, eligibleNames: Array.from({ length: 600 }, (_, index) => `Walker ${index + 1}`), activeDraw,
  } }));
  await page.goto('http://localhost:3020/draw');
  await page.locator('[data-flock-size="600"][data-phase="idle"]').waitFor();
  await page.waitForTimeout(150);
  assert.deepEqual(errors, [], 'Idle scene with registrations must render');
  activeDraw = { id: 42, startedAt: new Date().toISOString(), shotAt: null, status: 'flocking', eligibleCount: 600, winner: null };
  await page.locator('[data-phase="flight"]').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/duck-draw-flocking.png' });
  const averageFrame = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let last = performance.now();
    const sample = now => { samples.push(now - last); last = now; if (samples.length === 30) resolve(samples.reduce((a, b) => a + b, 0) / samples.length); else requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  }));
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('[data-phase="flight"]').count(), 1, 'Flight continues until Hit');
  activeDraw = { ...activeDraw, startedAt: new Date(Date.now() - 2800).toISOString() };
  await page.reload(); await page.locator('[data-phase="flight"]').waitFor();
  activeDraw = { ...activeDraw, status: 'reserved', shotAt: new Date().toISOString(), winner: { fullName: 'Animation Test', maskedPhone: '012 •• ••• 1234' } };
  await page.locator('[data-phase="shot"]').waitFor();
  await page.locator('[data-phase="retrieve"]').waitFor();
  await page.getByRole('dialog').waitFor();
  await page.getByText('Animation Test', { exact: true }).waitFor();
  await page.getByText('012 •• ••• 1234', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await page.reload(); await page.getByRole('dialog').waitFor();
  assert.deepEqual(errors, []);
  console.log(`Browser flock checks passed: 600-duck sustained flight, Hit-triggered shot/retrieval, and reload recovery. Mean frame interval: ${Number(averageFrame).toFixed(1)}ms.`);
} finally { await browser.close(); }
