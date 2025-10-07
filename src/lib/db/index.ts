import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let db: LibSQLDatabase<typeof schema>;

const dbUrl =
  process.env.newfan_finance_TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL;
const authToken =
  process.env.newfan_finance_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

if (dbUrl && authToken) {
  const turso = createClient({
    url: dbUrl,
    authToken: authToken,
  });

  db = drizzle(turso, {
    schema: schema,
  });
  console.log('Connected to Turso database.');
} else {
  // Fallback to local SQLite for development
  const dbPath = path.join(process.cwd(), './data/db.sqlite');
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const sqlite = createClient({ url: `file:${dbPath}` });

  db = drizzle(sqlite, {
    schema: schema,
  });

  console.log(
    'Connected to local SQLite database. Use "npm run db:migrate" to apply migrations.',
  );
}

export default db;
