import 'server-only';
import { sourcedCommand } from '@/lib/kit/runtime-config';

/** T-90/T-91: setup and Settings can save keys and spend money; they open from the printed link. */
export function SetupLinkNeeded({ expired = false }: { expired?: boolean }) {
  const command = sourcedCommand();
  return (
    <div className="max-w-[560px] space-y-4">
      <h1>{expired ? 'This setup link has expired' : 'Open your setup link'}</h1>
      <p className="text-[var(--ink-2)]">
        Setup and Settings can save API keys and spend money, so they only open from the link
        printed in your terminal. Run this for a new link:
      </p>
      <pre className="rounded-[var(--radius-md)] bg-[var(--code-bg)] p-3 text-[var(--code-ink)]">
        <code>{`${command} setup`}</code>
      </pre>
    </div>
  );
}
