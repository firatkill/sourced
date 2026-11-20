import { CreateChatBody, chatRoute, noStore } from '@/lib/chats/http';
import { createChat, listChats } from '@/lib/chats/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/chats?search=&projectId= — saved chats, pinned first, newest first. */
export function GET(request: Request): Promise<Response> {
  return chatRoute(request, async () => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const projectId = url.searchParams.get('projectId') ?? undefined;
    const chats = await listChats({
      ...(search ? { search } : {}),
      ...(projectId ? { projectId } : {}),
    });
    return Response.json({ chats }, { headers: noStore });
  });
}

/** POST /api/chats { question?, title?, projectId? } — a new, empty chat. */
export function POST(request: Request): Promise<Response> {
  return chatRoute(request, async (body) => {
    const input = CreateChatBody.parse(body);
    const chat = await createChat({
      ...(input.question === undefined ? {} : { question: input.question }),
      ...(input.title === undefined ? {} : { title: input.title }),
      projectId: input.projectId ?? null,
    });
    return Response.json({ chat }, { status: 201, headers: noStore });
  });
}
