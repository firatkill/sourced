import { chatRoute } from '@/lib/chats/http';
import { chatMarkdown, markdownFileName } from '@/lib/chats/markdown';
import { getChat } from '@/lib/chats/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** T-92: a saved chat as a Markdown download (same profiles and checks as /api/chats). */
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return chatRoute(request, async () => {
    const chat = await getChat((await context.params).id);
    return new Response(chatMarkdown(chat), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${markdownFileName(chat.title)}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
