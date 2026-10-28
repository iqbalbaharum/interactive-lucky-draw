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
try {
  let response = await request('/api/register', { method: 'POST', body: JSON.stringify({ fullName: '', phone: 'bad', icNumber: '1' }) }); assert.equal(response.status, 422);
  for (const person of people.slice(0, 2)) { response = await request('/api/register', { method: 'POST', body: JSON.stringify(person) }); assert.equal(response.status, 201); }
  response = await request('/api/register', { method: 'POST', body: JSON.stringify(people[0]) }); assert.equal(response.status, 409);
  response = await request('/api/admin/dashboard'); assert.equal(response.status, 401);
  response = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong' }) }); assert.equal(response.status, 401);
  response = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie').split(';')[0];
  response = await request('/api/admin/dashboard', { headers: { Cookie: cookie } }); assert.equal(response.status, 200); const before = await response.json(); assert.ok(before.eligibleCount >= 2);
  const starts = await Promise.all([request('/api/admin/draw/start', { method: 'POST', headers: { Cookie: cookie } }), request('/api/admin/draw/start', { method: 'POST', headers: { Cookie: cookie } })]); assert.equal(starts.filter(item => item.status === 201).length, 1); assert.equal(starts.filter(item => item.status === 409).length, 1);
  const successfulStart = starts.find(item => item.status === 201); const active = await successfulStart.json();
  response = await request('/api/status'); const publicStatus = await response.json(); assert.equal(publicStatus.activeDraw.id, active.activeDraw.id); assert.equal(publicStatus.activeDraw.eligibleCount, before.eligibleCount);
  response = await request('/api/register', { method: 'POST', body: JSON.stringify(people[2]) }); assert.equal(response.status, 201);
  response = await request(`/api/draws/${active.activeDraw.id}/complete`, { method: 'POST' }); assert.equal(response.status, 401);
  response = await request(`/api/draws/${active.activeDraw.id}/complete`, { method: 'POST', headers: { Cookie: cookie } }); assert.equal(response.status, 200);
  response = await request('/api/admin/dashboard', { headers: { Cookie: cookie } }); const after = await response.json(); assert.ok(after.history.some(draw => draw.id === active.activeDraw.id));
  console.log('App flow checks passed: validation, duplicate rejection, admin auth, one active draw, live status, mid-draw registration, protected completion, and winner history.');
} finally {
  const names = people.map(person => person.fullName); const placeholders = names.map(() => '?').join(',');
  const [draws] = await db.query(`SELECT d.id FROM draws d JOIN participants p ON p.id = d.participant_id WHERE p.full_name IN (${placeholders})`, names);
  if (draws.length) await db.query(`DELETE FROM draws WHERE id IN (${draws.map(() => '?').join(',')})`, draws.map(row => row.id));
  await db.query(`DELETE FROM participants WHERE full_name IN (${placeholders})`, names);
  await db.end();
}
