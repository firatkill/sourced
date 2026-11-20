// T-90: the browser side of the setup APIs (T-89). Errors carry the server's message,
// which is written for people.
import type { SetupStatus } from '@/lib/setup/status';
import type { IngestProgress } from '@/lib/setup/ingest-job';
import type { UploadResult } from '@/lib/setup/documents';

export type Estimate = {
  documents: number;
  skipped: number;
  embeddingTokens: number;
  estimatedCostUsd: number | null;
  provider: string;
  model: string;
  rebuildRequired: boolean;
  confirmAboveUsd: number;
};

export class SetupApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    let message = 'Something went wrong. Try again.';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* Keep the generic message. */
    }
    throw new SetupApiError(message, response.status);
  }
  return (await response.json()) as T;
}
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const setupApi = {
  status: () => request<SetupStatus>('/api/setup/status', { cache: 'no-store' }),
  chooseData: (choice: 'example' | 'own') => request('/api/setup/data', json({ choice })),
  saveKey: (provider: string, key: string) =>
    request<{ provider: string; masked: string }>('/api/setup/key', json({ provider, key })),
  upload: (files: { file: File; name: string }[]) => {
    const form = new FormData();
    for (const { file, name } of files) form.append('files', file, name);
    return request<UploadResult>('/api/setup/files', { method: 'POST', body: form });
  },
  addUrl: (url: string) => request('/api/setup/url', json({ url })),
  estimate: (rebuild = false) => request<Estimate>('/api/setup/estimate', json({ rebuild })),
  startIngest: (rebuild = false) =>
    request<{ job: IngestProgress }>('/api/ingest', json({ confirm: true, rebuild })),
};

export type { IngestProgress, SetupStatus, UploadResult };
