const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

(async () => {
  const src = path.join(process.env.APPDATA, 'cloudvault-backup', 'cloudvault.db');
  const snapshot = path.join(os.tmpdir(), 'aurasync-db-snapshot.db');
  fs.copyFileSync(src, snapshot);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(snapshot));

  const run = (sql) => { try { return db.exec(sql); } catch (e) { console.log('ERR:', e.message); return null; } };

  console.log('=== FOLDERS (id, name, path, paused, projects, reverse) ===');
  const f = run('SELECT id, name, path, is_paused, clean_mirror, reverse_sync, provider FROM folders');
  if (f && f.length) for (const r of f[0].values) console.log(r);

  console.log('\n=== FILE STATUS COUNTS ===');
  const s = run("SELECT status, COUNT(*) as n FROM files GROUP BY status ORDER BY n DESC");
  if (s && s.length) for (const r of s[0].values) console.log(r[0], '=', r[1]);

  console.log('\n=== SAME FILE NAME IN MULTIPLE FOLDERS (duplicates across folders) ===');
  const d = run("SELECT relative_path, COUNT(DISTINCT folder_id) as folders FROM files GROUP BY relative_path HAVING folders > 1 LIMIT 30");
  if (d && d.length && d[0].values.length) for (const r of d[0].values) console.log(r[0], '->', r[1], 'folders');
  else console.log('(none)');

  console.log('\n=== FILES UNDER wallpaper + minecraft sample ===');
  const w = run("SELECT id, folder_id, relative_path, status, drive_file_id FROM files WHERE relative_path LIKE 'wallapaper%' OR relative_path LIKE 'minecraft%' LIMIT 12");
  if (w && w.length) for (const r of w[0].values) console.log(r);

  console.log('\n=== settings rows ===');
  const st = run('SELECT key, value FROM settings');
  if (st && st.length) for (const r of st[0].values) console.log(r[0], '=', String(r[1]).slice(0, 60));

  db.close();
  try { fs.unlinkSync(snapshot); } catch (_) {}
})().catch((e) => { console.error(e); process.exit(1); });
