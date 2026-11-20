import 'server-only';
// T-91: who may open a Settings section that changes keys, models or data.
import { cookies } from 'next/headers';
import { getSnapshotConfig } from '@/lib/kit/runtime-config';
import { SETUP_COOKIE, validSetupCookie } from './token';

export async function settingsAccess(): Promise<'local' | 'link' | 'none'> {
  let profile: string | undefined;
  try {
    profile = getSnapshotConfig().profile;
  } catch {
    profile = undefined;
  }
  if (profile !== 'local') return 'none';
  return validSetupCookie((await cookies()).get(SETUP_COOKIE)?.value) ? 'local' : 'link';
}
