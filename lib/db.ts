import mysql, { type PoolConnection } from 'mysql2/promise';
import { randomInt } from 'node:crypto';
import type { ActiveDraw, DrawRow, ParticipantRow, PublicStatus } from './types';
import { maskPhone } from './validation';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  waitForConnections: true, connectionLimit: 8, timezone: 'Z', dateStrings: true,
});

let schemaReady: Promise<void> | undefined;
export function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS participants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL,
      phone VARCHAR(20) NOT NULL UNIQUE, ic_number CHAR(12) NOT NULL UNIQUE,
      registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, winner_draw_id BIGINT UNSIGNED NULL,
      INDEX participants_eligible (winner_draw_id, id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS draws (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, participant_id BIGINT UNSIGNED NOT NULL,
      winner_name VARCHAR(120) NOT NULL, winner_phone VARCHAR(20) NOT NULL, eligible_count INT UNSIGNED NOT NULL,
      status ENUM('reserved','completed') NOT NULL DEFAULT 'reserved',
      started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL,
      INDEX draws_active (status, id), INDEX draws_history (completed_at, id)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX sessions_expiry (expires_at)
    ) ENGINE=InnoDB`);
    const [invalidationColumns] = await pool.query<any[]>("SHOW COLUMNS FROM draws LIKE 'invalidated_at'");
    if (!invalidationColumns.length) {
      try { await pool.query('ALTER TABLE draws ADD COLUMN invalidated_at DATETIME(3) NULL'); }
      catch (error: any) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS event_lock (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB`);
    await pool.query('INSERT IGNORE INTO event_lock (id) VALUES (1)');
  })();
  return schemaReady;
}

async function withDb<T>(fn: () => Promise<T>) { await ensureSchema(); return fn(); }

export const database = {
  async counts() { return withDb(async () => { const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS totalCount, SUM(winner_draw_id IS NULL) AS eligibleCount FROM participants'); return { totalCount: Number(rows[0].totalCount || 0), eligibleCount: Number(rows[0].eligibleCount || 0) }; }); },
  async eligibleNames() { return withDb(async () => { const [rows] = await pool.query<ParticipantRow[]>('SELECT full_name FROM participants WHERE winner_draw_id IS NULL ORDER BY id'); return rows.map(row => row.full_name); }); },
  async duplicate(phone: string, icNumber: string) { return withDb(async () => { const [rows] = await pool.query<any[]>('SELECT phone, ic_number FROM participants WHERE phone = ? OR ic_number = ?', [phone, icNumber]); return { phone: rows.some(r => r.phone === phone), icNumber: rows.some(r => r.ic_number === icNumber) }; }); },
  async register(fullName: string, phone: string, icNumber: string) { return withDb(async () => { const [result] = await pool.execute<any>('INSERT INTO participants (full_name, phone, ic_number) VALUES (?, ?, ?)', [fullName, phone, icNumber]); return Number(result.insertId); }); },
  async activeDraw(): Promise<ActiveDraw | null> { return withDb(async () => { const [rows] = await pool.query<DrawRow[]>('SELECT * FROM draws WHERE status = \'reserved\' ORDER BY id DESC LIMIT 1'); const draw = rows[0]; if (!draw) return null; const timestamp = `${String(draw.started_at).replace(' ', 'T')}Z`; return { id: Number(draw.id), startedAt: new Date(timestamp).toISOString(), eligibleCount: Number(draw.eligible_count), winner: { fullName: draw.winner_name, maskedPhone: maskPhone(draw.winner_phone) } }; }); },
  async publicStatus(): Promise<PublicStatus> { const [counts, eligibleNames, activeDraw] = await Promise.all([this.counts(), this.eligibleNames(), this.activeDraw()]); return { ...counts, eligibleNames, activeDraw }; },
  async startDraw(): Promise<ActiveDraw> { return withDb(async () => {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); await connection.query('SELECT id FROM event_lock WHERE id = 1 FOR UPDATE');
      const [active] = await connection.query<DrawRow[]>('SELECT * FROM draws WHERE status = \'reserved\' LIMIT 1 FOR UPDATE');
      if (active[0]) throw new Error('A draw is already in progress.');
      const [countRows] = await connection.query<any[]>('SELECT COUNT(*) AS count FROM participants WHERE winner_draw_id IS NULL'); const count = Number(countRows[0].count);
      if (!count) throw new Error('There are no eligible participants.');
      const offset = randomInt(count); const [people] = await connection.query<ParticipantRow[]>('SELECT * FROM participants WHERE winner_draw_id IS NULL ORDER BY id LIMIT ?, 1 FOR UPDATE', [offset]); const person = people[0];
      const [created] = await connection.execute<any>('INSERT INTO draws (participant_id, winner_name, winner_phone, eligible_count) VALUES (?, ?, ?, ?)', [person.id, person.full_name, person.phone, count]); const id = Number(created.insertId);
      await connection.execute('UPDATE participants SET winner_draw_id = ? WHERE id = ? AND winner_draw_id IS NULL', [id, person.id]);
      await connection.commit(); const [drawRows] = await connection.query<DrawRow[]>('SELECT * FROM draws WHERE id = ?', [id]); const draw = drawRows[0];
      return { id, startedAt: new Date(draw.started_at).toISOString(), eligibleCount: count, winner: { fullName: person.full_name, maskedPhone: maskPhone(person.phone) } };
    } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }); },
  async completeDraw(id: number) { return withDb(async () => { const [result] = await pool.execute<any>('UPDATE draws SET status = \'completed\', completed_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = \'reserved\'', [id]); return result.affectedRows === 1; }); },
  async invalidateWinner(id: number) {
    return transactional(async connection => {
      // Serialize eligibility changes with selection of the next winner.
      await connection.query('SELECT id FROM event_lock WHERE id = 1 FOR UPDATE');
      const [draws] = await connection.query<DrawRow[]>('SELECT * FROM draws WHERE id = ? FOR UPDATE', [id]);
      const draw = draws[0];
      if (!draw || draw.status !== 'completed') throw new Error('Only a completed winner can be returned to the draw.');
      if (draw.invalidated_at) throw new Error('This winner has already been returned to the draw.');
      const [people] = await connection.query<ParticipantRow[]>('SELECT * FROM participants WHERE id = ? FOR UPDATE', [draw.participant_id]);
      if (!people[0] || Number(people[0].winner_draw_id) !== id) throw new Error('This participant is no longer assigned to that winning draw.');
      await connection.execute('UPDATE participants SET winner_draw_id = NULL WHERE id = ? AND winner_draw_id = ?', [draw.participant_id, id]);
      await connection.execute('UPDATE draws SET invalidated_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
      return { fullName: draw.winner_name };
    });
  },
  async participants(search: string) { return withDb(async () => { const needle = `%${search.replace(/[\\%_]/g, '\\$&')}%`; const [rows] = await pool.query<ParticipantRow[]>(`SELECT * FROM participants WHERE full_name LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\' OR ic_number LIKE ? ESCAPE '\\\\' ORDER BY registered_at DESC, id DESC LIMIT 250`, [needle, needle, needle]); return rows.map(p => ({ id: Number(p.id), fullName: p.full_name, phone: p.phone, icNumber: p.ic_number, registeredAt: p.registered_at, hasWon: Boolean(p.winner_draw_id) })); }); },
  async history() { return withDb(async () => { const [rows] = await pool.query<DrawRow[]>('SELECT * FROM draws WHERE status = \'completed\' ORDER BY completed_at DESC, id DESC LIMIT 100'); return rows.map(d => ({ id: Number(d.id), fullName: d.winner_name, phone: d.winner_phone, eligibleCount: Number(d.eligible_count), completedAt: d.completed_at, invalidatedAt: d.invalidated_at })); }); },
  async saveSession(tokenHash: string, expiresAt: Date) { return withDb(async () => { await pool.query('DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP()'); await pool.execute('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)', [tokenHash, expiresAt]); }); },
  async validSession(tokenHash: string) { return withDb(async () => { const [rows] = await pool.query<any[]>('SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [tokenHash]); return rows.length > 0; }); },
  async deleteSession(tokenHash: string) { return withDb(async () => { await pool.execute('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash]); }); },
};

export async function transactional<T>(fn: (connection: PoolConnection) => Promise<T>) { await ensureSchema(); const connection = await pool.getConnection(); try { await connection.beginTransaction(); const value = await fn(connection); await connection.commit(); return value; } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); } }
