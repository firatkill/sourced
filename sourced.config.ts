import { defineConfig } from './lib/kit/config-schema';
import { EMBEDDING, GENERATION } from './lib/config';
import { SUGGESTED } from './lib/suggested';
import manifest from './corpus/manifest.json';

export default defineConfig({
  schemaVersion: 1,
  corpus: {
    name: 'postgres-17',
    title: 'PostgreSQL docs',
    description: '35 pages of the PostgreSQL 17 documentation',
    language: 'en',
    attribution: manifest.attribution,
    linkLabel: 'Read in the PostgreSQL docs',
  },
  sources: [
    {
      id: 'pg17',
      type: 'urls',
      commitRaw: true,
      html: {
        preset: 'postgres-docbook',
        contentSelector: manifest.contentSelector,
        removeSelectors: manifest.removeSelectors,
      },
      urls: manifest.pages.map((page) => manifest.baseUrl + page.slug),
    },
  ],
  models: {
    chat: { provider: 'openai', model: 'gpt-6-luna' },
    judge: { provider: 'openai', model: 'gpt-5.4' },
    embed: { provider: 'openai', model: EMBEDDING.MODEL, dimensions: EMBEDDING.DIMENSIONS },
  },
  pricing: {
    'openai:gpt-6-luna': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
    'openai:gpt-5.4': { inputPerMTok: 2.5, outputPerMTok: 15 },
    [`openai:${EMBEDDING.MODEL}`]: { inputPerMTok: 0.02 },
  },
  profile: 'public-demo',
  copy: {
    hero: 'Ask the PostgreSQL docs. Every claim shows its source.',
    lead: 'Answers come only from 35 pages of the PostgreSQL 17 documentation. Each citation is checked against the passage it points to before you see it.',
    notFound: GENERATION.NOT_FOUND_SENTENCE,
    suggested: SUGGESTED.map((s) => ({ id: s.id, text: s.question })),
  },
  overrides: { contextualEmbedding: false },
});
