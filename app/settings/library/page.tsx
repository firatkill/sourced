import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentPage } from '@/components/layout/ContentPage';
import { LibraryManager } from '@/components/settings/LibraryManager';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { SetupLinkNeeded } from '@/components/setup/SetupLinkNeeded';
import { getSql } from '@/lib/db/client';
import { settingsAccess } from '@/lib/setup/page-access';
import { setupStatus } from '@/lib/setup/status';

export const metadata: Metadata = { title: 'Library · Sourced' };
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const access = await settingsAccess();
  if (access === 'none') redirect('/settings/appearance');
  return (
    <ContentPage>
      <SettingsNav />
      {access === 'link' ? (
        <SetupLinkNeeded />
      ) : (
        <LibraryManager initial={await setupStatus(getSql())} />
      )}
    </ContentPage>
  );
}
