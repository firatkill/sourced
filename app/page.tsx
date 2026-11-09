import { AskApp } from '@/components/ask/AskApp';
import { ASK_COPY } from '@/lib/copy';
import { getEnv } from '@/lib/env';
import { SUGGESTED } from '@/lib/suggested';

export default function Home() {
  const env = getEnv();
  return (
    <AskApp
      demoMode={env.DEMO_MODE}
      limits={{ ipDaily: env.RATE_LIMIT_IP_DAILY, globalDaily: env.RATE_LIMIT_GLOBAL_DAILY }}
      suggested={SUGGESTED}
      copy={ASK_COPY}
    />
  );
}
