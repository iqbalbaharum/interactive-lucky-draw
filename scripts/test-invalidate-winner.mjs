import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { chromium } from '@playwright/test';

const base = 'http://localhost:3020';
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
const participants = [], draws = [];
let browser;
const post = (path, cookie) => fetch(`${base}${path}`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {} });
async function count() { const response = await fetch(`${base}/api/status`); return (await response.json()).eligibleCount; }
async function winner(personId, name, phone) {
  const [result] = await db.execute("INSERT INTO draws (participant_id, winner_name, winner_phone, eligible_count, status, completed_at) VALUES (?, ?, ?, 1, 'completed', UTC_TIMESTAMP(3))", [personId, name, phone]);
  const id = result.insertId; draws.push(id);
  await db.execute('UPDATE participants SET winner_draw_id = ? WHERE id = ?', [id, personId]);
  return id;
}
try {
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
  const suffix = Date.now().toString().slice(-7);
  const fixtures = [];
  for (let i = 0; i < 2; i++) {
    const name = `Winner return test ${suffix}-${i}`, phone = `019${suffix}${i}`;
    const [created] = await db.execute('INSERT INTO participants (full_name, phone, ic_number) VALUES (?, ?, ?)', [name, phone, `9912${suffix}${i}`]);
    participants.push(created.insertId);
    fixtures.push({ id: created.insertId, name, phone, drawId: await winner(created.insertId, name, phone) });
  }
  assert.equal((await post(`/api/admin/draws/${fixtures[0].drawId}/invalidate`)).status, 401);
  assert.equal((await post('/api/admin/draws/bad/invalidate', cookie)).status, 400);
  assert.equal((await post('/api/admin/draws/999999999/invalidate', cookie)).status, 409);
  const before = await count();
  const results = await Promise.all([post(`/api/admin/draws/${fixtures[0].drawId}/invalidate`, cookie), post(`/api/admin/draws/${fixtures[0].drawId}/invalidate`, cookie)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(await count(), before + 1);
  const laterDraw = await winner(fixtures[0].id, fixtures[0].name, fixtures[0].phone);
  assert.equal((await post(`/api/admin/draws/${fixtures[0].drawId}/invalidate`, cookie)).status, 409);
  const [person] = await db.query('SELECT winner_draw_id FROM participants WHERE id = ?', [fixtures[0].id]);
  assert.equal(Number(person[0].winner_draw_id), laterDraw);
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  await page.goto(`${base}/admin`);
  await page.getByLabel('SHARED EVENT PASSWORD').fill(process.env.ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
  const entry = page.locator('.history-card li').filter({ has: page.getByText(fixtures[1].name, { exact: true }) });
  const button = entry.getByRole('button', { name: 'INVALIDATE & RETURN TO DRAW' });
  page.once('dialog', dialog => dialog.dismiss()); await button.click();
  assert.equal(await button.count(), 1);
  page.once('dialog', dialog => dialog.accept()); await button.click();
  await entry.getByText('INVALIDATED · RETURNED TO DRAW').waitFor();
  await page.screenshot({ path: '/tmp/duck-draw-return-winner.png' });
  const [returned] = await db.query('SELECT winner_draw_id FROM participants WHERE id = ?', [fixtures[1].id]);
  assert.equal(returned[0].winner_draw_id, null);
  console.log('Winner return checks passed: admin protection, validation, simultaneous requests, count update, later-win protection, confirmation cancel/accept, and invalidated history.');
} finally {
  if (browser) await browser.close();
  if (draws.length) await db.query(`DELETE FROM draws WHERE id IN (${draws.map(() => '?').join(',')})`, draws);
  if (participants.length) await db.query(`DELETE FROM participants WHERE id IN (${participants.map(() => '?').join(',')})`, participants);
  await db.end();
}
