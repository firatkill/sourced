import type { ReactNode } from 'react';
import { ASK_COPY } from '@/lib/copy';

export function Stopped({ children, onAnother }: { children: ReactNode; onAnother: () => void }) {
  return (
    <div className="space-y-4">
      <h2>{ASK_COPY.stoppedLabel}</h2>
      {children}
      <button type="button" className="min-h-6 underline underline-offset-4" onClick={onAnother}>
        {ASK_COPY.anotherQuestion}
      </button>
    </div>
  );
}
