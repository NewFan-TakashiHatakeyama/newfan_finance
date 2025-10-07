import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.VERCEL
  ? '/tmp/db.sqlite'
  : path.join(process.cwd(), './data/db.sqlite');

if (!process.env.VERCEL) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

const sqlite = new Database(dbPath);

// Migration logic from migrate.ts
const migrationsFolder = path.join(process.cwd(), 'drizzle');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS ran_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    run_on DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function sanitizeSql(content: string) {
  return content
    .split(/\r?\n/)
    .filter(
      (l) => !l.trim().startsWith('-->') && !l.includes('statement-breakpoint'),
    )
    .join('\n');
}

if (fs.existsSync(migrationsFolder)) {
  fs.readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .forEach((file) => {
      const filePath = path.join(migrationsFolder, file);
      let content = fs.readFileSync(filePath, 'utf-8');
      content = sanitizeSql(content);

      const migrationName = file.split('_')[0] || file;

      const already = sqlite
        .prepare('SELECT 1 FROM ran_migrations WHERE name = ?')
        .get(migrationName);
      if (already) {
        return;
      }

      try {
        sqlite.exec(content);
        sqlite
          .prepare('INSERT OR IGNORE INTO ran_migrations (name) VALUES (?)')
          .run(migrationName);
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      }
    });
}

const db = drizzle(sqlite, {
  schema: schema,
});

export default db;
