import { CreateProjectBody, chatRoute, noStore } from '@/lib/chats/http';
import { createProject, listProjects } from '@/lib/chats/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/projects — projects by name, with their chat counts. */
export function GET(request: Request): Promise<Response> {
  return chatRoute(request, async () =>
    Response.json({ projects: await listProjects() }, { headers: noStore }),
  );
}

/** POST /api/projects { name, description? } */
export function POST(request: Request): Promise<Response> {
  return chatRoute(request, async (body) => {
    const input = CreateProjectBody.parse(body);
    const project = await createProject({
      name: input.name,
      description: input.description ?? null,
    });
    return Response.json({ project }, { status: 201, headers: noStore });
  });
}
