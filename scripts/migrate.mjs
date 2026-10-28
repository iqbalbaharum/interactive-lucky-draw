import mysql from 'mysql2/promise';

const db = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
try {
  await db.query(`CREATE TABLE IF NOT EXISTS participants (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL, phone VARCHAR(20) NOT NULL UNIQUE, ic_number CHAR(12) NOT NULL UNIQUE, registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, winner_draw_id BIGINT UNSIGNED NULL, INDEX participants_eligible (winner_draw_id, id)) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS draws (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, participant_id BIGINT UNSIGNED NOT NULL, winner_name VARCHAR(120) NOT NULL, winner_phone VARCHAR(20) NOT NULL, eligible_count INT UNSIGNED NOT NULL, status ENUM('reserved','completed') NOT NULL DEFAULT 'reserved', started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL, INDEX draws_active (status, id), INDEX draws_history (completed_at, id)) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash CHAR(64) NOT NULL PRIMARY KEY, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX sessions_expiry (expires_at)) ENGINE=InnoDB`);
  await db.query('CREATE TABLE IF NOT EXISTS event_lock (id TINYINT NOT NULL PRIMARY KEY) ENGINE=InnoDB');
  await db.query('INSERT IGNORE INTO event_lock (id) VALUES (1)');
  const [columns] = await db.query("SHOW COLUMNS FROM draws LIKE 'invalidated_at'");
  if (!columns.length) {
    try { await db.query('ALTER TABLE draws ADD COLUMN invalidated_at DATETIME(3) NULL'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  console.log('Lucky Draw database schema is ready.');
} finally { await db.end(); }
