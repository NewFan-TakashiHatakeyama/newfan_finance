import db from '@/lib/db';
import { eq } from 'drizzle-orm';
import { chats } from '@/lib/db/schema';

export const GET = async (req: Request) => {
  try {
    // リクエストヘッダーからセッションIDを取得
    const sessionId = req.headers.get('x-session-id') || '';

    if (!sessionId) {
      // セッションIDが提供されていない場合は空の配列を返す
      return Response.json({ chats: [] }, { status: 200 });
    }

    // セッションIDに基づいてチャットをフィルタリング
    let userChats = await db.query.chats.findMany({
      where: eq(chats.sessionId, sessionId),
    });
    
    userChats = userChats.reverse();
    return Response.json({ chats: userChats }, { status: 200 });
  } catch (err) {
    console.error('Error in getting chats: ', err);
    // エラーが発生した場合でも、空の配列を返すことでフロントエンドのエラーを防ぐ
    return Response.json(
      { chats: [], message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
