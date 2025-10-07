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
const db = drizzle(sqlite, {
  schema: schema,
});

export default db;
