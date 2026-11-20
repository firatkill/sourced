import 'server-only';
// D-153: "Reset all data" from the app. The library reset is `sourced reset`; removing
// everything is `sourced reset --chats`. Files on disk are never touched.
import { runReset } from '@/lib/cli/commands/reset';
import { reloadKitConfig } from '@/lib/kit/runtime-config';
import { readConfig } from './config';

export async function resetData(options: { chats: boolean }, root = process.cwd()) {
  const result = await runReset({ config: readConfig(root), chats: options.chats });
  reloadKitConfig();
  return result;
}
