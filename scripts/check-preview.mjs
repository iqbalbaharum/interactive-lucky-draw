import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://localhost:3020';
const password = process.env.ADMIN_PASSWORD;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/draw`); await page.locator('.draw-app').waitFor(); await page.screenshot({ path: '/tmp/duck-draw-stage.png' });
  assert.equal(await page.locator('[data-flock-size]').getAttribute('data-flock-size'), '0'); assert.equal(await page.getByRole('button', { name: 'Toggle fullscreen' }).count(), 1);
  await page.goto(`${base}/register`); await page.getByRole('button', { name: 'JOIN THE DRAW' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'JOIN THE DRAW' }).isDisabled(), true); await page.screenshot({ path: '/tmp/duck-draw-register.png' });
  await page.goto(`${base}/admin`); await page.getByRole('heading', { name: 'Admin sign in' }).waitFor(); await page.getByLabel('SHARED EVENT PASSWORD').fill(password); await page.getByRole('button', { name: 'SIGN IN' }).click(); await page.getByRole('heading', { name: 'Lucky Draw' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'START DRAW' }).isDisabled(), true); await page.screenshot({ path: '/tmp/duck-draw-admin.png' });
  assert.deepEqual(errors, []); console.log('UI checks passed: game-only stage, fullscreen, registration form, and protected admin dashboard.');
} finally { await browser.close(); }
