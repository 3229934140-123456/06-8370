import 'reflect-metadata';
import * as sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('检查数据库...');

db.serialize(() => {
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user'", (err, table) => {
    if (err) { console.error(err); db.close(); return; }

    if (!table) {
      console.log('user表不存在，无需迁移');
      db.close();
      return;
    }

    console.log('--- 检查user表结构 ---');
    db.all("PRAGMA table_info(user)", (err, columns) => {
      if (err) { console.error(err); db.close(); return; }
      console.log('列:', columns.map((c: any) => `${c.name}:${c.type}`).join(', '));
    });

    console.log('--- 检查现有索引 ---');
    db.all("PRAGMA index_list(user)", (err, indexes) => {
      if (err) { console.error(err); db.close(); return; }
      console.log('现有索引:', indexes.map((i: any) => i.name).join(', ') || '无');
    });

    console.log('--- 检查重复邮箱 ---');
    db.all("SELECT email, COUNT(*) as cnt FROM user WHERE email IS NOT NULL GROUP BY email HAVING cnt > 1", (err, rows) => {
      if (err) { console.error(err); db.close(); return; }
      if (rows.length > 0) {
        console.log('发现重复邮箱:', rows);
      } else {
        console.log('无重复邮箱 ✓');
      }
    });

    console.log('--- 检查重复手机号 ---');
    db.all("SELECT phone, COUNT(*) as cnt FROM user WHERE phone IS NOT NULL GROUP BY phone HAVING cnt > 1", (err, rows) => {
      if (err) { console.error(err); db.close(); return; }
      if (rows.length > 0) {
        console.log('发现重复手机号:', rows);
      } else {
        console.log('无重复手机号 ✓');
      }
    });

    console.log('--- 统计数据 ---');
    db.get("SELECT COUNT(*) as total FROM user", (err, row) => {
      if (err) { console.error(err); db.close(); return; }
      console.log('总用户数:', (row as any).total);
    });

    db.get("SELECT COUNT(*) as total FROM oauth_account", (err, row) => {
      if (err) { console.error(err); db.close(); return; }
      console.log('总三方绑定数:', (row as any).total);
      db.close();
    });
  });
});
