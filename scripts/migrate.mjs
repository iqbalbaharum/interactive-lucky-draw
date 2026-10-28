import mysql from 'mysql2/promise';

const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
try {
  await db.query(`CREATE TABLE IF NOT EXISTS participants (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL, phone VARCHAR(20) NOT NULL UNIQUE, ic_number CHAR(12) NOT NULL UNIQUE, registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, winner_draw_id BIGINT UNSIGNED NULL, INDEX participants_eligible (winner_draw_id, id)) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS draws (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, participant_id BIGINT UNSIGNED NULL, winner_name VARCHAR(120) NULL, winner_phone VARCHAR(20) NULL, eligible_count INT UNSIGNED NOT NULL, status ENUM('flocking','reserved','completed') NOT NULL DEFAULT 'flocking', started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), shot_at DATETIME(3) NULL, completed_at DATETIME(3) NULL, INDEX draws_active (status, id), INDEX draws_history (completed_at, id)) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash CHAR(64) NOT NULL PRIMARY KEY, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX sessions_expiry (expires_at)) ENGINE=InnoDB`);
  await db.query('CREATE TABLE IF NOT EXISTS event_lock (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB');
  await db.query('INSERT IGNORE INTO event_lock (id) VALUES (1)');
  const [columns] = await db.query("SHOW COLUMNS FROM draws LIKE 'invalidated_at'");
  if (!columns.length) {
    try { await db.query('ALTER TABLE draws ADD COLUMN invalidated_at DATETIME(3) NULL'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  const [shotColumns] = await db.query("SHOW COLUMNS FROM draws LIKE 'shot_at'");
  if (!shotColumns.length) await db.query('ALTER TABLE draws ADD COLUMN shot_at DATETIME(3) NULL');
  const [drawColumns] = await db.query("SHOW COLUMNS FROM draws WHERE Field IN ('participant_id', 'winner_name', 'winner_phone', 'status')");
  for (const column of drawColumns) {
    if (column.Field === 'participant_id' && column.Null === 'NO') await db.query('ALTER TABLE draws MODIFY participant_id BIGINT UNSIGNED NULL');
    if (column.Field === 'winner_name' && column.Null === 'NO') await db.query('ALTER TABLE draws MODIFY winner_name VARCHAR(120) NULL');
    if (column.Field === 'winner_phone' && column.Null === 'NO') await db.query('ALTER TABLE draws MODIFY winner_phone VARCHAR(20) NULL');
    if (column.Field === 'status' && !column.Type.includes('flocking')) await db.query("ALTER TABLE draws MODIFY status ENUM('flocking','reserved','completed') NOT NULL DEFAULT 'flocking'");
  }
  await db.query(`CREATE TABLE IF NOT EXISTS draw_candidates (draw_id BIGINT UNSIGNED NOT NULL, participant_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (draw_id, participant_id), CONSTRAINT draw_candidates_draw FOREIGN KEY (draw_id) REFERENCES draws(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  console.log('Lucky Draw database schema is ready.');
} finally { await db.end(); }
