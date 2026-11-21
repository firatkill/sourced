// T-90: the browser side of the setup APIs (T-89). Errors carry the server's message,
// which is written for people.
import type { SetupStatus } from '@/lib/setup/status';
import type { IngestProgress } from '@/lib/setup/ingest-job';
import type { UploadResult } from '@/lib/setup/documents';
import type { modelOptions } from '@/lib/setup/models';
import type { DoclingInfo } from '@/lib/setup/docling';

export type ModelOptions = ReturnType<typeof modelOptions>;

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
  /** D-153: `library` keeps chats and projects; `everything` removes them too. */
  resetData: (scope: 'library' | 'everything') =>
    request<{ removedSources: number; removedDocuments: number; removedChats: number }>(
      '/api/setup/reset',
      json({ scope }),
    ),
  saveKey: (provider: string, key: string) =>
    request<{ provider: string; masked: string }>('/api/setup/key', json({ provider, key })),
  upload: (files: { file: File; name: string }[]) => {
    const form = new FormData();
    for (const { file, name } of files) form.append('files', file, name);
    return request<UploadResult>('/api/setup/files', { method: 'POST', body: form });
  },
  addUrl: (url: string) => request('/api/setup/url', json({ url })),
  docling: () => request<DoclingInfo>('/api/setup/docling', { cache: 'no-store' }),
  setDocling: (engine: DoclingInfo['engine']) =>
    request<DoclingInfo>('/api/setup/docling', json({ engine })),
  estimate: (rebuild = false) => request<Estimate>('/api/setup/estimate', json({ rebuild })),
  startIngest: (rebuild = false) =>
    request<{ job: IngestProgress }>('/api/ingest', json({ confirm: true, rebuild })),
  removeKey: (provider: string) =>
    request<{ provider: string; masked: null }>(
      `/api/setup/key?provider=${encodeURIComponent(provider)}`,
      { method: 'DELETE' },
    ),
  setupModels: (change: { chat?: string; judge?: string; embed?: string }) =>
    request<ModelOptions>('/api/setup/models', json(change)),
  // T-91: Settings › Models and keys
  models: () => request<ModelOptions>('/api/settings/models', { cache: 'no-store' }),
  saveModels: (change: { chat?: string; judge?: string }) =>
    request<ModelOptions>('/api/settings/models', { ...json(change), method: 'PATCH' }),
  estimateEmbedding: (embed: string) =>
    request<Estimate>('/api/settings/embedding/estimate', json({ embed })),
  changeEmbedding: (embed: string) =>
    request<{ job: IngestProgress }>('/api/settings/embedding', json({ embed, confirm: true })),
  ollama: () =>
    request<{ baseUrl: string; running: boolean; models: string[] }>('/api/settings/ollama', {
      cache: 'no-store',
    }),
};

export type { IngestProgress, SetupStatus, UploadResult };

export const settingsApi = {
  removeSource: (id: string) =>
    request<{ removedDocuments: number }>(`/api/settings/sources?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  deleteAllChats: () =>
    request<{ removedChats: number }>('/api/settings/chats', { method: 'DELETE' }),
};
