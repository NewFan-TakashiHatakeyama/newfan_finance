import { NextRequest, NextResponse } from 'next/server';
import {
  cacheInvalidate,
  cacheInvalidatePattern,
  cacheStats,
} from '@/lib/cache/cache-service';

/**
 * 管理用キャッシュ無効化 API
 *
 * POST /api/cache/invalidate
 *
 * リクエストボディ:
 *   { "key": "discover:finance:2026-02-09" }   - 特定キーの無効化
 *   { "pattern": "discover:*" }                 - パターン一致の一括無効化
 *
 * 認証:
 *   Authorization: Bearer {CACHE_ADMIN_TOKEN}
 */
export async function POST(request: NextRequest) {
  // 簡易認証
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CACHE_ADMIN_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { key, pattern } = body;

    if (pattern) {
      await cacheInvalidatePattern(pattern);
      return NextResponse.json({
        success: true,
        message: `Invalidated pattern: ${pattern}`,
      });
    }

    if (key) {
      await cacheInvalidate(key);
      return NextResponse.json({
        success: true,
        message: `Invalidated key: ${key}`,
      });
    }

    return NextResponse.json(
      { error: 'key or pattern is required' },
      { status: 400 },
    );
  } catch (error) {
    console.error('[Cache Invalidate API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * キャッシュ統計情報取得 API
 *
 * GET /api/cache/invalidate
 *
 * 認証:
 *   Authorization: Bearer {CACHE_ADMIN_TOKEN}
 */
export async function GET(request: NextRequest) {
  // 簡易認証
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CACHE_ADMIN_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await cacheStats();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error('[Cache Stats API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
