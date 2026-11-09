import { ASK_COPY, formatAskCopy } from '@/lib/copy';

export function rateLimitCopy(
  scope: 'ip' | 'global',
  resetAt: string,
  limits: { ipDaily: number; globalDaily: number },
  now = Date.now(),
) {
  const reset = new Date(resetAt);
  const minutes = (reset.getTime() - now) / 60_000;
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
    Math.ceil(minutes < 60 ? minutes : minutes / 60),
    minutes < 60 ? 'minute' : 'hour',
  );
  return {
    heading: scope === 'ip' ? ASK_COPY.visitorLimitHeading : ASK_COPY.globalLimitHeading,
    body: formatAskCopy(scope === 'ip' ? ASK_COPY.visitorLimitBody : ASK_COPY.globalLimitBody, {
      limit: scope === 'ip' ? limits.ipDaily : limits.globalDaily,
      time: new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        reset,
      ),
      relative,
    }),
  };
}

export function RateLimited({
  heading,
  body,
  scope,
}: {
  heading: string;
  body: string;
  scope: 'ip' | 'global';
}) {
  return (
    <div className="space-y-4 rounded-md bg-[var(--warn-soft)] p-4 text-[var(--warn)]">
      <h2>{heading}</h2>
      <p>{body}</p>
      {scope === 'ip' && <p>{ASK_COPY.suggestedStillWork}</p>}
    </div>
  );
}
