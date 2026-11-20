import { deleteAllChats } from '@/lib/chats/store';
import { setupRoute } from '@/lib/setup/http';

export const runtime = 'nodejs';

/** T-92 / D-144: deletes every saved chat and project (`reset --chats` does the same). */
export function DELETE(request: Request): Promise<Response> {
  return setupRoute(request, async () => Response.json({ removedChats: await deleteAllChats() }));
}
