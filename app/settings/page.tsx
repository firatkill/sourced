import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentPage } from '@/components/layout/ContentPage';
import { ModelsAndKeys } from '@/components/settings/ModelsAndKeys';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { SetupLinkNeeded } from '@/components/setup/SetupLinkNeeded';
import { getSql } from '@/lib/db/client';
import { readConfig } from '@/lib/setup/config';
import { modelOptions } from '@/lib/setup/models';
import { settingsAccess } from '@/lib/setup/page-access';
import { setupStatus } from '@/lib/setup/status';

export const metadata: Metadata = { title: 'Models and keys · Sourced' };
export const dynamic = 'force-dynamic';

/** T-91: Settings › Models and keys (local profile; the hosted demo has Appearance only). */
export default async function ModelsAndKeysPage() {
  const access = await settingsAccess();
  if (access === 'none') redirect('/settings/appearance');
  return (
    <ContentPage>
      <SettingsNav />
      {access === 'link' ? (
        <SetupLinkNeeded />
      ) : (
        <ModelsAndKeys
          status={await setupStatus(getSql())}
          initialModels={modelOptions(readConfig())}
        />
      )}
    </ContentPage>
  );
}
