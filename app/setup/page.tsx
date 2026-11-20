import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SetupWizard } from '@/components/setup/SetupWizard';
import { getSql } from '@/lib/db/client';
import { getSnapshotConfig, sourcedCommand } from '@/lib/kit/runtime-config';
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
  if (!validSetupCookie((await cookies()).get(SETUP_COOKIE)?.value)) {
    const expired = (await searchParams).link === 'expired';
    return (
      <main
        id="content"
        tabIndex={-1}
        className="flex min-h-dvh items-center justify-center bg-[var(--ground)] px-4 text-[var(--ink)]"
      >
        <div className="max-w-[560px] space-y-4">
          <h1>{expired ? 'This setup link has expired' : 'Open your setup link'}</h1>
          <p className="text-[var(--ink-2)]">
            Setup can save API keys and spend money, so it only opens from the link printed in your
            terminal. Run this for a new link:
          </p>
          <pre className="rounded-[var(--radius-md)] bg-[var(--code-bg)] p-3 text-[var(--code-ink)]">
            <code>
              {sourcedCommand() === 'pnpm sourced'
                ? 'pnpm sourced setup'
                : `${sourcedCommand()} setup`}
            </code>
          </pre>
        </div>
      </main>
    );
  }
  return <SetupWizard initial={await setupStatus(getSql())} />;
}
