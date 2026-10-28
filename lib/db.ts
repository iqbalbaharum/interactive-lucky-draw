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
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, participant_id BIGINT UNSIGNED NULL,
      winner_name VARCHAR(120) NULL, winner_phone VARCHAR(20) NULL, eligible_count INT UNSIGNED NOT NULL,
      status ENUM('flocking','reserved','completed') NOT NULL DEFAULT 'flocking',
      started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), shot_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
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
    const [shotColumns] = await pool.query<any[]>("SHOW COLUMNS FROM draws LIKE 'shot_at'");
    if (!shotColumns.length) await pool.query('ALTER TABLE draws ADD COLUMN shot_at DATETIME(3) NULL');
    const [drawColumns] = await pool.query<any[]>("SHOW COLUMNS FROM draws WHERE Field IN ('participant_id', 'winner_name', 'winner_phone', 'status')");
    for (const column of drawColumns) {
      if (column.Field === 'participant_id' && column.Null === 'NO') await pool.query('ALTER TABLE draws MODIFY participant_id BIGINT UNSIGNED NULL');
      if (column.Field === 'winner_name' && column.Null === 'NO') await pool.query('ALTER TABLE draws MODIFY winner_name VARCHAR(120) NULL');
      if (column.Field === 'winner_phone' && column.Null === 'NO') await pool.query('ALTER TABLE draws MODIFY winner_phone VARCHAR(20) NULL');
      if (column.Field === 'status' && !column.Type.includes('flocking')) await pool.query("ALTER TABLE draws MODIFY status ENUM('flocking','reserved','completed') NOT NULL DEFAULT 'flocking'");
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS draw_candidates (
      draw_id BIGINT UNSIGNED NOT NULL, participant_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (draw_id, participant_id),
      CONSTRAINT draw_candidates_draw FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS event_lock (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB`);
    await pool.query('INSERT IGNORE INTO event_lock (id) VALUES (1)');
  })();
  return schemaReady;
}

async function withDb<T>(fn: () => Promise<T>) { await ensureSchema(); return fn(); }
function asUtc(value: string | null) { return value ? new Date(`${String(value).replace(' ', 'T')}Z`).toISOString() : null; }
function activeDrawFromRow(draw: DrawRow): ActiveDraw {
  return {
    id: Number(draw.id), startedAt: asUtc(draw.started_at)!, shotAt: asUtc(draw.shot_at),
    eligibleCount: Number(draw.eligible_count), status: draw.status as ActiveDraw['status'],
    winner: draw.winner_name && draw.winner_phone ? { fullName: draw.winner_name, maskedPhone: maskPhone(draw.winner_phone) } : null,
  };
}

export const database = {
  async counts() { return withDb(async () => { const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS totalCount, SUM(winner_draw_id IS NULL) AS eligibleCount FROM participants'); return { totalCount: Number(rows[0].totalCount || 0), eligibleCount: Number(rows[0].eligibleCount || 0) }; }); },
  async eligibleNames() { return withDb(async () => { const [rows] = await pool.query<ParticipantRow[]>('SELECT full_name FROM participants WHERE winner_draw_id IS NULL ORDER BY id'); return rows.map(row => row.full_name); }); },
  async duplicate(phone: string, icNumber: string) { return withDb(async () => { const [rows] = await pool.query<any[]>('SELECT phone, ic_number FROM participants WHERE phone = ? OR ic_number = ?', [phone, icNumber]); return { phone: rows.some(r => r.phone === phone), icNumber: rows.some(r => r.ic_number === icNumber) }; }); },
  async register(fullName: string, phone: string, icNumber: string) { return withDb(async () => { const [result] = await pool.execute<any>('INSERT INTO participants (full_name, phone, ic_number) VALUES (?, ?, ?)', [fullName, phone, icNumber]); return Number(result.insertId); }); },
  async activeDraw(): Promise<ActiveDraw | null> { return withDb(async () => { const [rows] = await pool.query<DrawRow[]>("SELECT * FROM draws WHERE status IN ('flocking','reserved') ORDER BY id DESC LIMIT 1"); const draw = rows[0]; if (!draw) return null; return activeDrawFromRow(draw); }); },
  async publicStatus(): Promise<PublicStatus> { const [counts, eligibleNames, activeDraw] = await Promise.all([this.counts(), this.eligibleNames(), this.activeDraw()]); return { ...counts, eligibleNames, activeDraw }; },
  async startDraw(): Promise<ActiveDraw> { return transactional(async connection => {
    await connection.query('SELECT id FROM event_lock WHERE id = 1 FOR UPDATE');
    const [active] = await connection.query<DrawRow[]>("SELECT id FROM draws WHERE status IN ('flocking','reserved') LIMIT 1 FOR UPDATE");
    if (active[0]) throw new Error('A draw is already in progress.');
    const [created] = await connection.execute<any>("INSERT INTO draws (eligible_count, status, started_at) VALUES (0, 'flocking', UTC_TIMESTAMP(3))");
    const id = Number(created.insertId);
    const [snapshot] = await connection.execute<any>('INSERT INTO draw_candidates (draw_id, participant_id) SELECT ?, id FROM participants WHERE winner_draw_id IS NULL', [id]);
    const count = Number(snapshot.affectedRows);
    if (!count) throw new Error('There are no eligible participants.');
    await connection.execute('UPDATE draws SET eligible_count = ? WHERE id = ?', [count, id]);
    const [rows] = await connection.query<DrawRow[]>('SELECT * FROM draws WHERE id = ?', [id]);
    return activeDrawFromRow(rows[0]);
  }); },
  async hitDraw(): Promise<ActiveDraw> { return transactional(async connection => {
    await connection.query('SELECT id FROM event_lock WHERE id = 1 FOR UPDATE');
    const [active] = await connection.query<DrawRow[]>("SELECT * FROM draws WHERE status = 'flocking' LIMIT 1 FOR UPDATE");
    const draw = active[0];
    if (!draw) throw new Error('Start a draw before pressing Hit.');
    const [elapsed] = await connection.query<any[]>('SELECT TIMESTAMPDIFF(MICROSECOND, started_at, UTC_TIMESTAMP(3)) AS microseconds FROM draws WHERE id = ?', [draw.id]);
    if (Number(elapsed[0].microseconds) < 2_100_000) throw new Error('Let the dog finish sniffing before pressing Hit.');
    const [countRows] = await connection.query<any[]>('SELECT COUNT(*) AS count FROM draw_candidates WHERE draw_id = ?', [draw.id]);
    const count = Number(countRows[0].count);
    if (!count) throw new Error('This draw has no eligible participants.');
    const [people] = await connection.query<ParticipantRow[]>('SELECT p.* FROM draw_candidates c JOIN participants p ON p.id = c.participant_id WHERE c.draw_id = ? AND p.winner_draw_id IS NULL ORDER BY c.participant_id LIMIT ?, 1 FOR UPDATE', [draw.id, randomInt(count)]);
    const person = people[0];
    if (!person) throw new Error('The draw pool changed. Please try again.');
    await connection.execute('UPDATE participants SET winner_draw_id = ? WHERE id = ? AND winner_draw_id IS NULL', [draw.id, person.id]);
    await connection.execute("UPDATE draws SET participant_id = ?, winner_name = ?, winner_phone = ?, status = 'reserved', shot_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'flocking'", [person.id, person.full_name, person.phone, draw.id]);
    const [rows] = await connection.query<DrawRow[]>('SELECT * FROM draws WHERE id = ?', [draw.id]);
    return activeDrawFromRow(rows[0]);
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
