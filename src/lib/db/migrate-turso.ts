/**
 * Tursoデータベース用マイグレーションスクリプト
 * ローカルのSQLiteとは別に、Tursoデータベースにマイグレーションを適用
 */

import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';

// dotenvを使用して.envファイルから環境変数を読み込む
import { config } from 'dotenv';
config();

const dbUrl =
  process.env.newfan_finance_TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL;
const authToken =
  process.env.newfan_finance_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !authToken) {
  console.error('Turso database credentials are not set.');
  console.error('Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.');
  process.exit(1);
}

// TypeScriptの型チェックを通過させるため、型アサーションを使用
const dbUrlString: string = dbUrl;
const authTokenString: string = authToken;

async function runMigrations() {
  const turso = createClient({
    url: dbUrlString,
    authToken: authTokenString,
  });

  const migrationsFolder = path.join(process.cwd(), 'drizzle');

  // ran_migrationsテーブルを作成
  await turso.execute(`
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

  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsFolder, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    content = sanitizeSql(content);

    const migrationName = file.split('_')[0] || file;

    // 既に適用済みかチェック
    const result = await turso.execute({
      sql: 'SELECT 1 FROM ran_migrations WHERE name = ?',
      args: [migrationName],
    });

    if (result.rows.length > 0) {
      console.log(`Skipping already-applied migration: ${file}`);
      continue;
    }

    try {
      // 空のマイグレーションファイルをスキップ
      const trimmedContent = content.trim();
      if (!trimmedContent || trimmedContent === '/* Do nothing */') {
        console.log(`Skipping empty migration: ${file}`);
        // 空のマイグレーションも記録に残す
        await turso.execute({
          sql: 'INSERT OR IGNORE INTO ran_migrations (name) VALUES (?)',
          args: [migrationName],
        });
        continue;
      }

      // Tursoは複数のSQLステートメントを一度に実行できないため、分割して実行
      // コメント行を除外し、セミコロンで分割
      const statements = trimmedContent
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          return trimmed.length > 0 && !trimmed.startsWith('--') && !trimmed.startsWith('/*') && !trimmed.endsWith('*/');
        })
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (statements.length === 0) {
        console.log(`Skipping empty migration: ${file}`);
        await turso.execute({
          sql: 'INSERT OR IGNORE INTO ran_migrations (name) VALUES (?)',
          args: [migrationName],
        });
        continue;
      }

      for (const statement of statements) {
        if (statement.trim()) {
          await turso.execute(statement);
        }
      }

      if (migrationName === '0002') {
        console.log(`Applied migration: ${file} - Added sessionId column to chats table`);
      } else {
        console.log(`Applied migration: ${file}`);
      }

      // マイグレーション実行記録を保存
      await turso.execute({
        sql: 'INSERT OR IGNORE INTO ran_migrations (name) VALUES (?)',
        args: [migrationName],
      });
    } catch (err) {
      console.error(`Failed to apply migration ${file}:`, err);
      throw err;
    }
  }

  console.log('All migrations applied successfully to Turso database.');
  await turso.close();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
