import mysql from 'mysql2/promise';
const db = await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.MYSQL_PORT || 3307),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
try {
  await db.execute('CREATE TABLE IF NOT EXISTS _deployment_check (id INT PRIMARY KEY, token VARCHAR(64) NOT NULL)');
  if (process.argv.includes('--cleanup')) { await db.execute('DROP TABLE _deployment_check'); console.log('Verification table removed.'); }
  else if (process.argv.includes('--read')) { const [rows] = await db.execute('SELECT token FROM _deployment_check WHERE id = 1'); if (rows[0]?.token !== 'persistent-volume-ok') throw new Error('Persistence check failed'); console.log('Persistence verified: saved record survived container recreation.'); }
  else { await db.execute("INSERT INTO _deployment_check VALUES (1, 'persistent-volume-ok') ON DUPLICATE KEY UPDATE token = VALUES(token)"); console.log('MySQL connection and application-user write verified.'); }
} finally { await db.end(); }
