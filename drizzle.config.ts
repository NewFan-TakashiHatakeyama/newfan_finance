import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'turso',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.newfan_finance_TURSO_DATABASE_URL ||
      process.env.TURSO_DATABASE_URL ||
      '',
    authToken:
      process.env.newfan_finance_TURSO_AUTH_TOKEN ||
      process.env.TURSO_AUTH_TOKEN ||
      '',
  },
});
