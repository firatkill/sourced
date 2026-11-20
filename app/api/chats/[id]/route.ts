import { UpdateChatBody, chatRoute, noStore } from '@/lib/chats/http';
import { deleteChat, getChat, updateChat } from '@/lib/chats/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** GET /api/chats/:id — the chat with its saved turns. */
export function GET(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async () => {
    const chat = await getChat((await params).id);
    return Response.json({ chat }, { headers: noStore });
  });
}

/** PATCH /api/chats/:id { title?, projectId?, pinned? } — rename, move or pin. */
export function PATCH(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async (body) => {
    const input = UpdateChatBody.parse(body);
    const chat = await updateChat((await params).id, {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
    });
    return Response.json({ chat }, { headers: noStore });
  });
}

/** DELETE /api/chats/:id — removes the chat and its turns. */
export function DELETE(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async () => {
    await deleteChat((await params).id);
    return new Response(null, { status: 204, headers: noStore });
  });
}
