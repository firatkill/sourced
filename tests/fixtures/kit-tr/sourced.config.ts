import { fixtureCopy } from './copy';
import { defineConfig } from '../../../lib/kit/config-schema';

// Original, fictional product documentation. Tests override providers with LLM_MODE=mock.
export default defineConfig({
  schemaVersion: 1,
  corpus: {
    name: 'kit-tr',
    title: 'Cep Bahçesi kılavuzu',
    description: 'Cep Bahçesi ürününün dört Türkçe belgesi',
    language: 'tr',
    attribution: 'Bu hayalî ürünün belgeleri Sourced testleri için özgün olarak yazılmıştır.',
    linkLabel: 'Cep Bahçesi kaynağını oku',
  },
  sources: [{ id: 'kilavuz', type: 'folder', path: 'tests/fixtures/kit-tr/documents' }],
  profile: 'local',
  models: {
    chat: { provider: 'openai', model: 'gpt-5.4-nano' },
    embed: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  },
  copy: fixtureCopy,
});
