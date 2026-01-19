import db from '@/lib/db';
import { chats, messages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export const GET = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    
    // リクエストヘッダーからセッションIDを取得
    const sessionId = req.headers.get('x-session-id') || '';

    if (!sessionId) {
      return Response.json({ message: 'Session ID is required' }, { status: 400 });
    }

    const chatExists = await db.query.chats.findFirst({
      where: and(eq(chats.id, id), eq(chats.sessionId, sessionId)),
    });

    if (!chatExists) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    const chatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, id),
    });

    return Response.json(
      {
        chat: chatExists,
        messages: chatMessages,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error('Error in getting chat by id: ', err);
    
    // TursoデータベースにsessionIdカラムが存在しない場合のエラーハンドリング
    if (err?.code === 'SQL_INPUT_ERROR' && err?.message?.includes('no such column: chats.sessionId')) {
      console.error('Turso database migration required. Please run: npm run db:migrate:turso');
      return Response.json(
        { 
          message: 'Database migration required. Please contact administrator.',
          chat: null,
          messages: []
        },
        { status: 500 },
      );
    }
    
    return Response.json(
      { 
        message: 'An error has occurred.',
        chat: null,
        messages: []
      },
      { status: 500 },
    );
  }
};

export const DELETE = async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    
    // リクエストヘッダーからセッションIDを取得
    const sessionId = req.headers.get('x-session-id') || '';

    if (!sessionId) {
      return Response.json({ message: 'Session ID is required' }, { status: 400 });
    }

    const chatExists = await db.query.chats.findFirst({
      where: and(eq(chats.id, id), eq(chats.sessionId, sessionId)),
    });

    if (!chatExists) {
      return Response.json({ message: 'Chat not found' }, { status: 404 });
    }

    await db.delete(chats).where(and(eq(chats.id, id), eq(chats.sessionId, sessionId))).execute();
    await db.delete(messages).where(eq(messages.chatId, id)).execute();

    return Response.json(
      { message: 'Chat deleted successfully' },
      { status: 200 },
    );
  } catch (err) {
    console.error('Error in deleting chat by id: ', err);
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
