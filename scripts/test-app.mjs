import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3021';
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error('ADMIN_PASSWORD is required for the app test.');
const suffix = `${Date.now()}`;
const people = [
  { fullName: `Test Draw One ${suffix}`, phone: `011${suffix.slice(-7)}`, icNumber: `900101${suffix.slice(-6)}` },
  { fullName: `Test Draw Two ${suffix}`, phone: `012${suffix.slice(-7)}`, icNumber: `900102${suffix.slice(-6)}` },
  { fullName: `Test Draw Three ${suffix}`, phone: `013${suffix.slice(-7)}`, icNumber: `900103${suffix.slice(-6)}` },
];
const request = (path, options = {}) => fetch(`${base}${path}`, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
let testDrawId = null;
try {
  const initial = await (await request('/api/status')).json();
  if (initial.activeDraw) throw new Error('Finish the current draw before running this flow check.');
  let response = await request('/api/register', { method: 'POST', body: JSON.stringify({ fullName: '', phone: 'bad', icNumber: '1' }) }); assert.equal(response.status, 422);
  for (const person of people.slice(0, 2)) { response = await request('/api/register', { method: 'POST', body: JSON.stringify(person) }); assert.equal(response.status, 201); }
  response = await request('/api/register', { method: 'POST', body: JSON.stringify(people[0]) }); assert.equal(response.status, 409);
  response = await request('/api/admin/dashboard'); assert.equal(response.status, 401);
  response = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) }); assert.equal(response.status, 401);
  response = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie').split(';')[0];
  response = await request('/api/admin/dashboard', { headers: { Cookie: cookie } }); assert.equal(response.status, 200); const before = await response.json(); assert.ok(before.eligibleCount >= 2);
  const starts = await Promise.all([request('/api/admin/draw/start', { method: 'POST', headers: { Cookie: cookie } }), request('/api/admin/draw/start', { method: 'POST', headers: { Cookie: cookie } })]); assert.equal(starts.filter(item => item.status === 201).length, 1); assert.equal(starts.filter(item => item.status === 409).length, 1);
  const successfulStart = starts.find(item => item.status === 201); const active = await successfulStart.json(); testDrawId = active.activeDraw.id;
  assert.equal(active.activeDraw.status, 'flocking'); assert.equal(active.activeDraw.winner, null);
  response = await request('/api/status'); const publicStatus = await response.json(); assert.equal(publicStatus.activeDraw.id, testDrawId); assert.equal(publicStatus.activeDraw.eligibleCount, before.eligibleCount); assert.equal(publicStatus.activeDraw.winner, null);
  response = await request('/api/register', { method: 'POST', body: JSON.stringify(people[2]) }); assert.equal(response.status, 201);
  const [late] = await db.query('SELECT id FROM participants WHERE phone = ?', [people[2].phone]);
  const [lateCandidates] = await db.query('SELECT participant_id FROM draw_candidates WHERE draw_id = ? AND participant_id = ?', [testDrawId, late[0].id]);
  assert.equal(lateCandidates.length, 0, 'Registration after Start belongs to the following draw');
  response = await request('/api/admin/draw/hit', { method: 'POST' }); assert.equal(response.status, 401);
  await new Promise(resolve => setTimeout(resolve, 2200));
  const hits = await Promise.all([request('/api/admin/draw/hit', { method: 'POST', headers: { Cookie: cookie } }), request('/api/admin/draw/hit', { method: 'POST', headers: { Cookie: cookie } })]);
  assert.equal(hits.filter(item => item.status === 200).length, 1); assert.equal(hits.filter(item => item.status === 409).length, 1);
  const selected = await hits.find(item => item.status === 200).json(); assert.equal(selected.activeDraw.status, 'reserved'); assert.ok(selected.activeDraw.winner.fullName);
  response = await request('/api/status'); const shotStatus = await response.json(); assert.equal(shotStatus.activeDraw.id, testDrawId); assert.equal(shotStatus.activeDraw.winner.fullName, selected.activeDraw.winner.fullName);
  response = await request(`/api/draws/${testDrawId}/complete`, { method: 'POST' }); assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
  response = await request('/api/admin/dashboard', { headers: { Cookie: cookie } }); const after = await response.json(); assert.ok(after.history.some(draw => draw.id === testDrawId));
  console.log('App flow checks passed: validation, auth, concurrent Start and Hit, late registration exclusion, live winner, completion, and history.');
} finally {
  if (testDrawId) {
    await db.query('UPDATE participants SET winner_draw_id = NULL WHERE winner_draw_id = ?', [testDrawId]);
    await db.query('DELETE FROM draws WHERE id = ?', [testDrawId]);
  }
  const names = people.map(person => person.fullName); const placeholders = names.map(() => '?').join(',');
  await db.query(`DELETE FROM participants WHERE full_name IN (${placeholders})`, names);
  await db.end();
}
