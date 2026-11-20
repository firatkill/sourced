import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SetupWizard } from '@/components/setup/SetupWizard';
import { getSql } from '@/lib/db/client';
import { getSnapshotConfig } from '@/lib/kit/runtime-config';
import { SetupLinkNeeded } from '@/components/setup/SetupLinkNeeded';
import { setupStatus } from '@/lib/setup/status';
import { SETUP_COOKIE, validSetupCookie } from '@/lib/setup/token';

export const metadata: Metadata = { title: 'Set up · Sourced' };
export const dynamic = 'force-dynamic';

/** T-90 / R2 §6: setup exists only in the local profile and opens from the terminal's link. */
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  let profile: string | undefined;
  try {
    profile = getSnapshotConfig().profile;
  } catch {
    profile = undefined;
  }
  if (profile !== 'local') notFound();
  if (!validSetupCookie((await cookies()).get(SETUP_COOKIE)?.value))
    return (
      <main
        id="content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center bg-[var(--ground)] px-4 text-[var(--ink)]"
      >
        <SetupLinkNeeded expired={(await searchParams).link === 'expired'} />
      </main>
    );
  return <SetupWizard initial={await setupStatus(getSql())} />;
}
