import mysql from 'mysql2/promise';

const target = 600;
const given = ['Alya','Aiman','Aina','Amir','Anis','Arif','Balqis','Danish','Dania','Farah','Faris','Hana','Haris','Irfan','Jasmine','Khadijah','Luqman','Maisarah','Nadia','Naufal','Nurul','Qistina','Rafiq','Sofea','Syafiq','Taufiq','Zara','Adrian','Brandon','Cheryl','Daniel','Evelyn','Jason','Kai','Mei Ling','Siti','Kumar','Priya','Arun','Kavitha'];
const middle = ['Amani','Hakim','Izzati','Haziq','Syahirah','Rizwan','Aqilah','Fateh','Nadiah','Firdaus','Sabrina','Rahman','Wei','Jun','Xin','Kok','Raj','Devi','Kaur','Anand'];
const family = ['Abdullah','Ismail','Rahman','Aziz','Hassan','Yusof','Hamid','Ibrahim','Zulkifli','Lim','Tan','Lee','Wong','Chong','Ng','Goh','Kumar','Subramaniam','Ramasamy','Singh'];
let state = 600600;
function pick(list) { state = (state * 1664525 + 1013904223) >>> 0; return list[state % list.length]; }
function name() { return `${pick(given)} ${pick(middle)} ${pick(family)}`; }

const pool = mysql.createPool({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
try {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM participants');
  const existing = Number(rows[0].total);
  if (existing > target) throw new Error(`Database already has ${existing} participants; refusing to remove anyone to reach ${target}.`);
  const needed = target - existing;
  if (!needed) { console.log(`Database already has ${target} participants.`); process.exit(0); }
  const values = Array.from({ length: needed }, (_, index) => {
    const serial = 7_000_000 + index;
    return [name(), `0119${serial}`, `990101${String(100000 + index)}`];
  });
  await pool.query('INSERT INTO participants (full_name, phone, ic_number) VALUES ?', [values]);
  const [result] = await pool.query('SELECT COUNT(*) AS total, SUM(winner_draw_id IS NULL) AS eligible FROM participants');
  console.log(`Added ${needed} demo participants. Total: ${result[0].total}; eligible: ${result[0].eligible}.`);
} finally { await pool.end(); }
