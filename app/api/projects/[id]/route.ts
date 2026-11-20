import { UpdateProjectBody, chatRoute, noStore } from '@/lib/chats/http';
import { deleteProject, getProject, updateProject } from '@/lib/chats/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async () =>
    Response.json({ project: await getProject((await params).id) }, { headers: noStore }),
  );
}

/** PATCH /api/projects/:id { name?, description?, sourceIds? } — `sourceIds: null` searches everything. */
export function PATCH(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async (body) => {
    const input = UpdateProjectBody.parse(body);
    const project = await updateProject((await params).id, {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.sourceIds === undefined ? {} : { sourceIds: input.sourceIds }),
    });
    return Response.json({ project }, { headers: noStore });
  });
}

/** DELETE /api/projects/:id — its chats stay and move back to the general list. */
export function DELETE(request: Request, { params }: Context): Promise<Response> {
  return chatRoute(request, async () => {
    await deleteProject((await params).id);
    return new Response(null, { status: 204, headers: noStore });
  });
}
