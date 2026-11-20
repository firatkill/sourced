import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ContentPage } from '@/components/layout/ContentPage';
import { ChatsData } from '@/components/settings/ChatsData';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { SetupLinkNeeded } from '@/components/setup/SetupLinkNeeded';
import { listChats } from '@/lib/chats/store';
import { settingsAccess } from '@/lib/setup/page-access';

export const metadata: Metadata = { title: 'Chats and data · Sourced' };
export const dynamic = 'force-dynamic';

export default async function ChatsDataPage() {
  const access = await settingsAccess();
  if (access === 'none') redirect('/settings/appearance');
  return (
    <ContentPage>
      <SettingsNav />
      {access === 'link' ? (
        <SetupLinkNeeded />
      ) : (
        <ChatsData
          chats={(await listChats()).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))}
        />
      )}
    </ContentPage>
  );
}
