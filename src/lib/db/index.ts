import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';
import { migrate } from 'drizzle-orm/libsql/migrator';

let db: ReturnType<typeof drizzle>;

const dbUrl =
  process.env.newfan_finance_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL;
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

  // Run migrations
  migrate(db, { migrationsFolder: 'drizzle' })
    .then(() => console.log('Migrations completed successfully.'))
    .catch((err) => {
      console.error('Migrations failed:', err);
      // In a real application, you might want to handle this more gracefully
      process.exit(1);
    });
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

  // You might want a different migration strategy for local SQLite.
  // For simplicity, we reuse the Turso migrator logic, but this
  // requires `drizzle-kit` to generate SQL files compatible with SQLite.
  // The logic from the previous step is removed to avoid complexity.
  // It's assumed the local DB is managed via `drizzle-kit push:sqlite`.
  console.log(
    'Connected to local SQLite database. Ensure migrations are applied manually if needed.',
  );
}

export default db;
