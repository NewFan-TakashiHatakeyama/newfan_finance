/**
 * TursoデータベースのsessionIdカラムの存在確認と追加スクリプト
 */

import { createClient } from '@libsql/client';
import { config } from 'dotenv';
config();

const dbUrl =
  process.env.newfan_finance_TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL;
const authToken =
  process.env.newfan_finance_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !authToken) {
  console.error('Turso database credentials are not set.');
  process.exit(1);
}

// TypeScriptの型チェックを通過させるため、型アサーションを使用
const dbUrlString: string = dbUrl;
const authTokenString: string = authToken;

async function checkAndAddColumn() {
  const turso = createClient({
    url: dbUrlString,
    authToken: authTokenString,
  });

  try {
    // sessionIdカラムが存在するかチェック（エラーハンドリングで確認）
    let hasSessionId = false;
    
    try {
      // sessionIdカラムを使用するSELECT文を試行
      await turso.execute("SELECT sessionId FROM chats LIMIT 1");
      hasSessionId = true;
      console.log('✓ sessionId column already exists in chats table.');
    } catch (err: any) {
      // カラムが存在しない場合のエラー
      if (err?.message?.includes('no such column: sessionId') || 
          err?.code === 'SQL_INPUT_ERROR') {
        hasSessionId = false;
        console.log('✗ sessionId column does not exist. Adding it now...');
        
        // sessionIdカラムを追加
        await turso.execute("ALTER TABLE chats ADD COLUMN sessionId TEXT DEFAULT '' NOT NULL");
        
        console.log('✓ sessionId column added successfully.');
      } else {
        // その他のエラーは再スロー
        throw err;
      }
    }
  } catch (err) {
    console.error('Error:', err);
    throw err;
  } finally {
    await turso.close();
  }
}

checkAndAddColumn().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
